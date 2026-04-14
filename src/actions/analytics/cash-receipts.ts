'use server';

import { query } from '@/lib/db';
import { startOfDay, endOfDay } from 'date-fns';
import {
    RECEIPT_REPORT_ROLES,
    ensureSaleInLocation,
    requireReportActor,
    resolveEffectiveLocation,
} from '../report-scope';

export interface CashReceipt {
    id: string;
    timestamp: string; // Changed to string for serialization safety
    total_amount: number;
    user_name: string;
    items_summary: string;
    items_count: number;
    status: string;
    dte_folio: string | null;
}

export interface CashReceiptsFilter {
    startDate: Date;
    endDate?: Date;
    minAmount?: number;
    maxAmount?: number;
}

export async function getCashReceipts(filter: CashReceiptsFilter): Promise<{ success: boolean; data?: CashReceipt[]; error?: string }> {
    const actorResult = await requireReportActor(RECEIPT_REPORT_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    const effectiveLocationResult = resolveEffectiveLocation(actorResult.actor);
    if (!effectiveLocationResult.success) {
        return { success: false, error: effectiveLocationResult.error };
    }

    const effectiveLocationId = effectiveLocationResult.locationId;

    try {
        const { startDate, endDate = new Date(), minAmount, maxAmount } = filter;

        // Ensure valid date range
        const start = startOfDay(new Date(startDate));
        const end = endOfDay(new Date(endDate));

        let queryStr = `
            SELECT 
                s.id,
                s.timestamp,
                s.total_amount,
                u.name as user_name,
                COUNT(si.id) as items_count,
                STRING_AGG(si.product_name, ', ' ORDER BY si.product_name) as items_summary,
                s.status,
                s.dte_folio
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN sale_items si ON s.id = si.sale_id
            WHERE (s.dte_type = 'RECIBO' OR s.dte_folio IS NULL)
            AND s.timestamp BETWEEN $1 AND $2
        `;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params: any[] = [start.toISOString(), end.toISOString()];
        let paramIndex = 3;

        if (effectiveLocationId) {
            queryStr += ` AND s.location_id::text = $${paramIndex}::text`;
            params.push(effectiveLocationId);
            paramIndex++;
        }

        if (minAmount !== undefined) {
            queryStr += ` AND s.total_amount >= $${paramIndex}`;
            params.push(minAmount);
            paramIndex++;
        }

        if (maxAmount !== undefined) {
            queryStr += ` AND s.total_amount <= $${paramIndex}`;
            params.push(maxAmount);
            paramIndex++;
        }

        queryStr += `
            GROUP BY s.id, s.timestamp, s.total_amount, u.name, s.status, s.dte_folio
            ORDER BY s.timestamp DESC
        `;

        const res = await query(queryStr, params);

        return {
            success: true,
            data: res.rows.map(row => ({
                id: row.id,
                timestamp: new Date(row.timestamp).toISOString(), // Explicit serialization
                total_amount: Number(row.total_amount),
                user_name: row.user_name || 'Desconocido',
                items_count: Number(row.items_count),
                items_summary: row.items_summary ? (String(row.items_summary).length > 50 ? String(row.items_summary).substring(0, 50) + '...' : String(row.items_summary)) : '',
                status: row.status,
                dte_folio: row.dte_folio ? String(row.dte_folio) : null
            }))
        };

    } catch (error: unknown) {
        console.error('[CashReceipts] Error fetching data:', error);
        return { success: false, error: 'Error al obtener recibos: ' + (error as Error).message };
    }
}

export interface ReceiptDetailItem {
    name: string;
    quantity: number;
    price: number;
    total: number;
}

export async function getReceiptDetails(id: string): Promise<{ success: boolean; data?: ReceiptDetailItem[]; error?: string }> {
    const actorResult = await requireReportActor(RECEIPT_REPORT_ROLES);
    if (!actorResult.success) {
        return { success: false, error: actorResult.error };
    }

    const effectiveLocationResult = resolveEffectiveLocation(actorResult.actor);
    if (!effectiveLocationResult.success) {
        return { success: false, error: effectiveLocationResult.error };
    }

    const effectiveLocationId = effectiveLocationResult.locationId;

    try {
        if (effectiveLocationId) {
            const saleAllowed = await ensureSaleInLocation(id, effectiveLocationId);
            if (!saleAllowed) {
                return { success: false, error: 'Acceso denegado' };
            }
        }

        const queryStr = `
            SELECT 
                si.product_name as name,
                si.quantity,
                si.unit_price as price,
                si.total_price as total
            FROM sale_items si
            WHERE si.sale_id = $1
            ORDER BY si.product_name
        `;

        const res = await query(queryStr, [id]);

        return {
            success: true,
            data: res.rows.map(row => ({
                name: row.name,
                quantity: Number(row.quantity),
                price: Number(row.price),
                total: Number(row.total)
            }))
        };
    } catch (error: unknown) {
        console.error('Error fetching receipt details:', error);
        return { success: false, error: 'Error al obtener detalles' };
    }
}
