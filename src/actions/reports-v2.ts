'use server';

import { query } from '@/lib/db';
import { z } from 'zod';
import { startOfDay, endOfDay, startOfWeek, startOfMonth, formatISO } from 'date-fns';

// --- SCHEMA & TYPES ---

const ReportFilterSchema = z.object({
    period: z.enum(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM']).optional().default('TODAY'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    locationId: z.string().optional(), // "ALL" or UUID
    terminalId: z.string().optional(), // "ALL" or UUID
    employeeId: z.string().optional(), // "ALL" or UUID
    searchQuery: z.string().optional(), // Product name or SKU
});

export type ReportParams = z.infer<typeof ReportFilterSchema>;

const UuidSchema = z.string().uuid();

function normalizeUuidFilter(value?: string): string | undefined {
    if (!value || value === 'ALL') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return UuidSchema.safeParse(trimmed).success ? trimmed : undefined;
}

export interface ProductSalesRow {
    product_id: string;
    sku: string;
    product_name: string;
    category: string;
    units_sold: number;
    total_amount: number;
    avg_price: number;
    transaction_count: number;
}

export interface ReportSummary {
    totalUnits: number;
    totalAmount: number;
    transactionCount: number;
}

// --- HELPER: DATE RANGE ---

function getDateRange(period: string, startStr?: string, endStr?: string) {
    const now = new Date();

    // Default fallback
    let start = startOfDay(now);
    let end = endOfDay(now);

    try {
        switch (period) {
            case 'TODAY':
                start = startOfDay(now);
                end = endOfDay(now);
                break;
            case 'THIS_WEEK':
                start = startOfWeek(now, { weekStartsOn: 1 });
                end = endOfDay(now);
                break;
            case 'THIS_MONTH':
                start = startOfMonth(now);
                end = endOfDay(now);
                break;
            case 'CUSTOM':
                if (startStr) start = new Date(startStr);
                if (endStr) end = new Date(endStr);
                // Ensure end covers the full day if user picks same date
                end = endOfDay(end);
                break;
        }
    } catch (e) {
        console.error('Date parsing error', e);
    }

    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}

// --- ACTION ---

export async function getProductSalesReportSecure(params: ReportParams) {
    try {
        // 1. Parse & Prepare Filters
        const filters = ReportFilterSchema.parse(params);
        const { start, end } = getDateRange(filters.period, filters.startDate, filters.endDate);
        const locationFilter = normalizeUuidFilter(filters.locationId);
        const terminalFilter = normalizeUuidFilter(filters.terminalId);

        const queryParams: any[] = [start, end];
        let paramIndex = 3;

        // 2. Build Query
        // Note: s.timestamp is used for filtering date range
        let sql = `
            SELECT 
                p.id as product_id,
                MAX(p.sku) as sku,
                MAX(p.name) as product_name,
                MAX(p.category) as category,
                SUM(si.quantity) as units_sold,
                SUM(si.total_price) as total_amount,
                ROUND(AVG(si.unit_price), 0) as avg_price,
                COUNT(DISTINCT s.id) as transaction_count
            FROM sale_items si
            JOIN inventory_batches ib ON si.batch_id = ib.id
            JOIN products p ON ib.product_id::text = p.id::text
            JOIN sales s ON si.sale_id = s.id
            WHERE 
                s.timestamp >= $1 AND s.timestamp <= $2
        `;

        // Filter: Location
        if (locationFilter) {
            sql += ` AND s.location_id::text = $${paramIndex}::text`;
            queryParams.push(locationFilter);
            paramIndex++;
        }

        // Filter: Terminal
        if (terminalFilter) {
            sql += ` AND s.terminal_id::text = $${paramIndex}::text`;
            queryParams.push(terminalFilter);
            paramIndex++;
        }

        // Filter: Employee
        if (filters.employeeId && filters.employeeId !== 'ALL') {
            sql += ` AND s.user_id::text = $${paramIndex}::text`;
            queryParams.push(filters.employeeId);
            paramIndex++;
        }

        // Filter: Search (SKU or Name)
        if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
            const term = `%${filters.searchQuery.trim()}%`;
            sql += ` AND (p.name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`;
            queryParams.push(term);
            paramIndex++;
        }

        // Grouping & Ordering
        sql += `
            GROUP BY p.id
            ORDER BY units_sold DESC
            LIMIT 100
        `;

        // 3. Execute
        const result = await query(sql, queryParams);

        // 4. Calculate Summary
        const summary: ReportSummary = result.rows.reduce((acc, row) => ({
            totalUnits: acc.totalUnits + Number(row.units_sold),
            totalAmount: acc.totalAmount + Number(row.total_amount),
            transactionCount: acc.transactionCount + Number(row.transaction_count)
        }), { totalUnits: 0, totalAmount: 0, transactionCount: 0 });

        return {
            success: true,
            data: {
                rows: result.rows as ProductSalesRow[],
                summary
            }
        };

    } catch (error) {
        console.error('Error fetching sales report:', error);
        return { success: false, error: 'Error generando reporte' };
    }
}
