'use server';

import { query } from '@/lib/db';

export interface ShiftMetricsDetailed {
    sales_breakdown: {
        method: string;
        total: number;
        count: number;
        transactions: {
            id: string;
            amount: number;
            timestamp: number;
            date: string;
            user_name?: string;
        }[];
    }[];
    manual_movements: {
        total_in: number;
        total_out: number;
        details: any[]; // CashMovement[]
    };
    opening_amount: number;
    cash_sales: number; // Helper for easy access
    expected_cash: number;
}

export async function getShiftMetrics(terminalId: string): Promise<{ success: boolean; data?: ShiftMetricsDetailed; error?: string }> {
    // Guard Clause: Validate terminalId before DB access
    // Prevents race conditions where terminalId might be undefined/null during session resume
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!terminalId || !uuidRegex.test(terminalId)) {
        console.warn(`getShiftMetrics called with invalid ID: "${terminalId}". Returning safe empty structure.`);
        return {
            success: true,
            data: {
                sales_breakdown: [],
                manual_movements: {
                    total_in: 0,
                    total_out: 0,
                    details: []
                },
                opening_amount: 0,
                cash_sales: 0,
                expected_cash: 0
            } as any
        };
    }

    try {
        // 1. Get Current Active Session
        const sessionRes = await query(`
            SELECT id, opening_amount, opened_at 
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL
        `, [terminalId]);

        if (sessionRes.rowCount === 0) {
            return { success: false, error: 'No active shift found' };
        }

        const session = sessionRes.rows[0];
        const openingAmount = Number(session.opening_amount);
        const startTime = new Date(session.opened_at).getTime();

        // 2. Get Sales Breakdown by Method
        const salesRes = await query(`
            SELECT s.id, s.payment_method, s.total, s.timestamp, s.user_id, s.dte_code, s.dte_folio, u.name as user_name
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.terminal_id = $1::uuid 
            AND s.timestamp >= $2
            ORDER BY s.timestamp DESC
        `, [terminalId, startTime]);

        // Dynamic grouping
        const breakdownMap = new Map<string, { method: string, total: number, count: number, transactions: any[] }>();
        const validMethods = ['CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'CHECK']; // Known methods to normalize

        // Defense: Ensure rows exists
        const salesRows = salesRes.rows || [];

        salesRows.forEach(row => {
            const amount = Number(row.total || 0); // Defense against null total
            let method = row.payment_method ? row.payment_method.toUpperCase() : 'OTHER';

            // Normalize known methods if needed (e.g., specific variations), currently just strict check or OTHER
            if (!validMethods.includes(method) && method !== 'OTHER') {
                // You might want to keep original method name if it's new
            }

            if (!breakdownMap.has(method)) {
                breakdownMap.set(method, {
                    method: method,
                    total: 0,
                    count: 0,
                    transactions: []
                });
            }

            const group = breakdownMap.get(method)!;
            group.total += amount;
            group.count += 1;
            group.transactions.push({
                id: row.id,
                amount: amount,
                timestamp: Number(row.timestamp), // Ensure number
                date: new Date(Number(row.timestamp)).toISOString(), // Helpful formatting
                user_name: row.user_name || 'N/A'
            });
        });

        // Convert Map to Array
        const salesBreakdown = Array.from(breakdownMap.values());

        // Calculate Totals
        const totalSales = salesBreakdown.reduce((sum, item) => sum + item.total, 0);
        const cashSalesGroup = salesBreakdown.find(b => b.method === 'CASH');
        const cashSalesTotal = cashSalesGroup ? cashSalesGroup.total : 0;

        // 3. Get Cash Movements (Manual)
        // CRITICAL FIX: The 'location_id' column in cash_movements holds the SHIFT ID (session.id) based on legacy insertion logic.
        // We filter primarily by this linkage.
        const movementsRes = await query(`
            SELECT * FROM cash_movements
            WHERE 
                location_id = $1::uuid -- location_id holds session_id
                AND type != 'OPENING'
                AND is_cash = true
            ORDER BY timestamp DESC
        `, [session.id]);

        const manualDetails = movementsRes.rows.map(row => ({
            id: row.id,
            type: row.type === 'OPENING' ? 'IN' : (['WITHDRAWAL', 'EXPENSE'].includes(row.type) ? 'OUT' : (row.type === 'EXTRA_INCOME' ? 'IN' : 'OUT')),
            amount: Number(row.amount),
            reason: row.reason,
            description: row.reason, // Or split description
            timestamp: new Date(row.timestamp).getTime()
        }));

        const totalIn = manualDetails
            .filter(m => m.type === 'IN')
            .reduce((sum, m) => sum + m.amount, 0);

        const totalOut = manualDetails
            .filter(m => m.type === 'OUT')
            .reduce((sum, m) => sum + m.amount, 0);

        // 4. Calculate Expected Cash
        // Formula: Opening + Cash Sales + Manual IN - Manual OUT
        const expectedCash = openingAmount + cashSalesTotal + totalIn - totalOut;

        return {
            success: true,
            data: {
                // New dynamic breakdown
                sales_breakdown: salesBreakdown,

                // Legacy support or Simplified Totals for easy access
                // We can construct the old `totals_by_method` from the breakdown if frontend still relies on it strictly,
                // but we are changing the frontend too.
                // Let's keep a simplified map for easier lookup if needed, or just rely on the array.
                // The interface changes, so we must be careful. 
                // I'll update the interface to match this new return.

                manual_movements: {
                    total_in: totalIn,
                    total_out: totalOut,
                    details: manualDetails
                },
                opening_amount: openingAmount,
                cash_sales: cashSalesTotal,
                expected_cash: expectedCash
            } as any // Temporary cast until interface is updated
        };

    } catch (e: any) {
        console.error('getShiftMetrics Error:', e);
        return { success: false, error: e.message };
    }
}
