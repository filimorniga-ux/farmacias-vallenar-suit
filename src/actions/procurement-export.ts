'use server';

/**
 * ============================================================================
 * PROCUREMENT-EXPORT: Exportación de Pedidos Sugeridos
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { z } from 'zod';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateCL } from '@/lib/timezone';
import { getSessionSecure } from './auth-v2';
import { generateRestockSuggestionSecure } from './procurement-v2';

// SCHEMAS
const UUIDSchema = z.string().uuid('ID inválido');

const ExportProcurementSchema = z.object({
    supplierId: z.string().uuid().optional(),
    daysToCover: z.number().int().min(1).max(365).default(15),
    analysisWindow: z.number().int().min(7).max(365).default(30),
    locationId: UUIDSchema.optional(),
    stockThreshold: z.number().optional(),
    searchQuery: z.string().optional(),
    limit: z.number().int().min(1).max(5000).default(500),
});

// ROLES
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// HELPERS
async function auditExport(userId: string, params: any): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'EXPORT', 'PROCUREMENT_SUGGESTIONS', $2::jsonb, NOW())
        `, [userId, JSON.stringify(params)]);
    } catch { }
}

/**
 * 📈 Exportar Sugerencias de Pedido (MANAGER+)
 */
export async function exportSuggestedOrdersSecure(
    params: z.infer<typeof ExportProcurementSchema>
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    const validated = ExportProcurementSchema.safeParse(params);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    try {
        const { supplierId, daysToCover, analysisWindow, locationId, stockThreshold, searchQuery, limit } = validated.data;

        // Run the actual analysis logic
        const result = await generateRestockSuggestionSecure(
            supplierId,
            daysToCover,
            analysisWindow,
            locationId,
            stockThreshold,
            searchQuery,
            limit
        );

        if (!result.success || !result.data) {
            return { success: false, error: result.error || 'No se encontraron sugerencias con los filtros aplicados' };
        }

        const data = result.data.map((item: any) => ({
            sku: item.product_sku,
            product: item.product_name,
            stock: Number(item.total_stock || 0),
            safety_stock: Number(item.safety_stock || 0),
            suggested: Number(item.suggested_order || 0),
            avg_daily_sales: Number(item.ideal_daily_sales || 0).toFixed(2),
            unit_cost: Number(item.internal_cost || 0),
            total_investment: Number(item.suggested_order || 0) * Number(item.internal_cost || 0),
            preferred_supplier: item.suppliers_data?.[0]?.name || 'No definido',
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Análisis de Reposición Sugerida - Farmacias Vallenar',
            subtitle: `Análisis para ${daysToCover} días | Ventana: ${analysisWindow}d | Fecha: ${formatDateCL(new Date())}`,
            sheetName: 'Sugerencias Pedido',
            creator: session.userName,
            columns: [
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Descripción Producto', key: 'product', width: 40 },
                { header: 'Stock Actual', key: 'stock', width: 15 },
                { header: 'Nivel Seguridad', key: 'safety_stock', width: 15 },
                { header: 'Sugerencia de Pedido (U)', key: 'suggested', width: 22 },
                { header: 'Rotación Diaria (Prom)', key: 'avg_daily_sales', width: 22 },
                { header: 'Costo Reposición ($)', key: 'unit_cost', width: 20 },
                { header: 'Inversión Total ($)', key: 'total_investment', width: 22 },
                { header: 'Proveedor Recomendado', key: 'preferred_supplier', width: 30 },
            ],
            data,
        });

        await auditExport(session.userId, { ...validated.data, rows: data.length });
        return {
            success: true,
            data: buffer.toString('base64'),
            filename: `Pedido_Sugerido_${new Date().toISOString().split('T')[0]}.xlsx`,
        };

    } catch (error: any) {
        logger.error({ error }, '[Export] Suggested orders error');
        return { success: false, error: 'Error exportando análisis de compras' };
    }
}
