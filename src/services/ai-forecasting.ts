
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface SalesHistoryPoint {
    date: string; // YYYY-MM or YYYY-MM-DD
    quantity: number;
}

export interface ForecastInput {
    productName: string;
    currentStock: number;
    salesHistory: SalesHistoryPoint[]; // Last 3-6 months
    branchName: string;
    context?: string; // e.g., "Season: Winter"
}

export interface ForecastResult {
    predictedDemand: number;
    suggestedOrderQty: number;
    reasoning: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class AIForecastingService {

    /**
     * Generates a demand forecast using OpenAI based on sales history and context.
     */
    static async predictDemand(input: ForecastInput & {
        globalStock?: number;
        supplierName?: string;
        weeklySales?: unknown[];
    }): Promise<ForecastResult> {
        try {
            // Simplify history for prompt
            const historyStr = input.weeklySales
                ? JSON.stringify(input.weeklySales.slice(-8)) // Last 8 weeks
                : input.salesHistory.map(h => `${h.date}: ${h.quantity}`).join(', ');

            const prompt = `
                Act as an expert supply chain analyst for "Farmacias Vallenar".
                
                context: {
                    product: "${input.productName}",
                    branch: "${input.branchName}",
                    current_local_stock: ${input.currentStock},
                    stock_in_other_warehouses: ${input.globalStock || 0},
                    primary_supplier: "${input.supplierName || 'Unknown'}",
                    sales_history_timeseries: ${historyStr},
                    season_context: "${input.context || 'Standard Operation'}"
                }

                Task: 
                Analyze the sales trend and local/global stock to suggest the OPTIMAL PROCUREMENT ACTION.
                
                Objectives:
                1. Prevent Stockouts (High Priority).
                2. Minimize Overstock.
                3. Suggest "TRANSFER" from other warehouses if global stock is high (> 2x needed).
                4. Suggest "PURCHASE" if global stock is low.
                
                Output JSON ONLY:
                {
                    "predictedDemand": number (next 30 days),
                    "suggestedAction": "PURCHASE" | "TRANSFER" | "NONE",
                    "suggestedOrderQty": number,
                    "reasoning": "string (max 20 words, concise)",
                    "confidence": "HIGH" | "MEDIUM" | "LOW"
                }
            `;

            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a JSON-speaking supply chain expert. Be conservative but safe." },
                    { role: "user", content: prompt }
                ],
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                temperature: 0.2,
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("Empty response from AI");

            const result = JSON.parse(content);
            return {
                predictedDemand: result.predictedDemand,
                suggestedOrderQty: result.suggestedOrderQty,
                reasoning: result.reasoning,
                confidence: result.confidence
            };

        } catch (error) {
            console.error("AI Forecasting Error:", error);
            // Fallback: Simple Average if AI fails
            const baseAvg = input.currentStock * 0.1; // Dummy fallback
            return {
                predictedDemand: baseAvg,
                suggestedOrderQty: 0,
                reasoning: "AI Service Unavailable - Using Standard Forecast",
                confidence: "LOW"
            };
        }
    }
}
