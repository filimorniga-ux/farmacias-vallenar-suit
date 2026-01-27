import { query } from '../lib/db';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


export interface DailyFinancials {
    date: string; // YYYY-MM-DD
    revenue: number;
    expenses: number;
}

export interface TreasuryForecast {
    date: string;
    projectedRevenue: number;
    projectedExpenses: number;
    netBalance: number; // accumulated or daily
}

export interface TreasuryInsight {
    severity: 'HIGH' | 'MEDIUM' | 'SAFE';
    message: string;
}

export class TreasuryService {
    /**
     * Get historical financials (Last 90 days)
     */
    static async getHistory(): Promise<DailyFinancials[]> {
        try {
            // Aggregate Sales (Revenue)
            const salesRes = await query(`
                SELECT DATE(created_at) as date, SUM(total) as total
                FROM sales_headers
                WHERE created_at >= NOW() - INTERVAL '90 days'
                GROUP BY DATE(created_at)
                ORDER BY date ASC
            `);

            // Aggregate Invoices (Expenses)
            // Assuming invoice_history has created_at or we trust 'processed_data' but we need a date column.
            // Check invoice_history schema: invoice_number, supplier_rut, total_amount, processed_data, created_at
            const expensesRes = await query(`
                SELECT DATE(created_at) as date, SUM(total_amount) as total
                FROM invoice_history
                WHERE created_at >= NOW() - INTERVAL '90 days'
                GROUP BY DATE(created_at)
                ORDER BY date ASC
            `);

            // Merge
            const dailyMap = new Map<string, DailyFinancials>();

            salesRes.rows.forEach(r => {
                const d = r.date.toISOString().split('T')[0];
                if (!dailyMap.has(d)) dailyMap.set(d, { date: d, revenue: 0, expenses: 0 });
                dailyMap.get(d)!.revenue = Number(r.total);
            });

            expensesRes.rows.forEach(r => {
                const d = r.date.toISOString().split('T')[0];
                if (!dailyMap.has(d)) dailyMap.set(d, { date: d, revenue: 0, expenses: 0 });
                dailyMap.get(d)!.expenses = Number(r.total);
            });

            // Convert to array and sort
            return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        } catch (error) {
            console.error("Treasury history error:", error);
            return [];
        }
    }

    /**
     * Generate Forecast using OpenAI
     */
    static async generateForecast(history: DailyFinancials[]): Promise<{ forecast: TreasuryForecast[], insights: TreasuryInsight[] }> {
        // Prepare CSV-like context for AI
        const context = history.map(d => `${d.date}: Rev=${d.revenue}, Exp=${d.expenses}`).join('\n');

        try {
            const prompt = `
                Act as a CFO AI for a pharmacy chain.
                
                Input (Last 90 days financials):
                ${context}

                Task:
                1. Forecast the NEXT 30 DAYS (Daily Revenue and Daily Expenses).
                   - Consider weekly seasonality (e.g. Saturdays might be higher/lower).
                   - Assume Expenses follow a pattern based on history (e.g. restocking every Tuesday).
                2. Provide liquidity insights.

                Return JSON:
                {
                    "forecast": [
                        { "date": "YYYY-MM-DD", "projectedRevenue": number, "projectedExpenses": number, "netBalance": number }
                    ],
                    "insights": [
                        { "severity": "HIGH"|"MEDIUM"|"SAFE", "message": "short insight" }
                    ]
                }
            `;

            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a financial forecasting engine. Output JSON only." },
                    { role: "user", content: prompt }
                ],
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                temperature: 0.2, // Low temp for stability
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("No content from AI");

            return JSON.parse(content);

        } catch (error) {
            console.error("Treasury Forecast Error:", error);
            // Fallback: simple average
            return { forecast: [], insights: [{ severity: 'SAFE', message: 'Forecast unavailable, AI error.' }] };
        }
    }
}
