'use server';

import { z } from 'zod';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateCL, formatDateTimeCL } from '@/lib/timezone';
import { getSessionSecure } from './auth-v2';

const UUIDSchema = z.string().uuid('ID inválido');

const ExportTransferSchema = z.object({
    transferId: UUIDSchema,
});

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

export async function exportTransferDetailSecure(
    params: z.infer<typeof ExportTransferSchema>
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    const validated = ExportTransferSchema.safeParse(params);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    try {
        const { transferId } = validated.data;

        // Fetch transfer details using an aggregated query to avoid Cartesian products
        // (Collapsing multi-batch movements of the same SKU)
        const result = await query(`
            WITH aggregated_out AS (
                SELECT 
                    reference_id,
                    sku,
                    MAX(product_name) as product_name,
                    MAX(location_id::text) as from_location_id,
                    SUM(ABS(quantity)) as total_quantity,
                    MAX(timestamp) as timestamp,
                    MAX(user_id::text) as user_id,
                    MAX(notes) as reason
                FROM stock_movements
                WHERE reference_id = $1 
                AND movement_type = 'TRANSFER_OUT'
                AND reference_type = 'LOCATION_TRANSFER'
                GROUP BY reference_id, sku
            ),
            aggregated_in AS (
                SELECT 
                    reference_id,
                    sku,
                    MAX(location_id::text) as to_location_id
                FROM stock_movements
                WHERE reference_id = $1 
                AND movement_type = 'TRANSFER_IN'
                AND reference_type = 'LOCATION_TRANSFER'
                GROUP BY reference_id, sku
            )
            SELECT 
                aout.timestamp AT TIME ZONE 'America/Santiago' as executed_at,
                aout.sku,
                aout.product_name,
                aout.total_quantity as quantity_total,
                aout.reason,
                l_src.name as from_location,
                l_dst.name as to_location,
                u.name as executed_by
            FROM aggregated_out aout
            JOIN aggregated_in ain ON aout.reference_id = ain.reference_id AND aout.sku = ain.sku
            LEFT JOIN locations l_src ON aout.from_location_id = l_src.id::text
            LEFT JOIN locations l_dst ON ain.to_location_id = l_dst.id::text
            LEFT JOIN users u ON aout.user_id = u.id::text
            ORDER BY aout.product_name ASC
        `, [transferId]);

        if (result.rows.length === 0) {
            return { success: false, error: 'No se encontraron detalles para este traspaso' };
        }

        const firstRow = result.rows[0];
        const executedAt = new Date(firstRow.executed_at);

        // Format Date for filename: YYYY-MM-DD_HHMM
        const year = executedAt.getFullYear();
        const month = String(executedAt.getMonth() + 1).padStart(2, '0');
        const day = String(executedAt.getDate()).padStart(2, '0');
        const hours = String(executedAt.getHours()).padStart(2, '0');
        const minutes = String(executedAt.getMinutes()).padStart(2, '0');
        const fileDate = `${year}-${month}-${day}_${hours}${minutes}`;

        const data = result.rows.map(row => ({
            sku: row.sku,
            product: row.product_name,
            qty: Math.abs(Number(row.quantity_total)),
            source: row.from_location,
            destination: row.to_location,
            reason: row.reason || 'S/M'
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: `PLANILLA DE TRASPASO: ${firstRow.from_location} → ${firstRow.to_location}`,
            subtitle: `ID: ${transferId} | Ejecutado: ${formatDateTimeCL(executedAt)} | Por: ${firstRow.executed_by || 'Sistema'}`,
            sheetName: 'Detalle Traspaso',
            creator: session.userName,
            columns: [
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Producto', key: 'product', width: 45 },
                { header: 'Cantidad', key: 'qty', width: 12 },
                { header: 'Origen', key: 'source', width: 25 },
                { header: 'Destino', key: 'destination', width: 25 },
                { header: 'Motivo / Nota', key: 'reason', width: 30 },
            ],
            data,
        });

        // Ensure we handle the buffer correctly for base64 conversion
        const base64Data = Buffer.from(buffer).toString('base64');

        return {
            success: true,
            data: base64Data,
            filename: `${fileDate}_Traspaso_${firstRow.from_location}_a_${firstRow.to_location}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error, message: error.message, stack: error.stack }, '[Export] Transfer detail error');
        return { success: false, error: `Error exportando detalle: ${error.message || 'Error desconocido'}` };
    }
}
