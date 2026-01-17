'use server';

/**
 * ============================================================================
 * INVENTORY-DIAGNOSTICS-V2: Diagnóstico de Inventario Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Queries parametrizados (no concatenación de SQL)
 * - RBAC: Solo MANAGER+ puede ver diagnósticos
 * - Filtrado por ubicación del usuario
 * - Auditoría de análisis
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const DuplicateParamsSchema = z.object({
    sku: z.boolean().default(true),
    lot: z.boolean().default(false),
    expiry: z.boolean().default(false),
    price: z.boolean().default(false),
    locationId: UUIDSchema.optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined };
    } catch {
        return null;
    }
}

// ============================================================================
// FIND DUPLICATE BATCHES
// ============================================================================

/**
 * 🔍 Encontrar Lotes Duplicados (queries parametrizados)
 */
export async function findDuplicateBatchesSecure(
    params: z.infer<typeof DuplicateParamsSchema>
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden ver diagnósticos' };
    }

    const validated = DuplicateParamsSchema.safeParse(params);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { sku, lot, expiry, price, locationId } = validated.data;

    // Determinar ubicación a filtrar
    const filterLocationId = locationId || session.locationId;

    try {
        // Construir query de forma segura (sin concatenación de strings del usuario)
        const groups: string[] = [];
        const selects: string[] = ['sku', 'MAX(name) as name', 'COUNT(*) as count', 'SUM(stock_actual) as total_stock'];

        // Estas son columnas fijas, no inputs del usuario
        if (sku) groups.push('sku');
        if (lot) {
            groups.push('lot_number');
            selects.push('lot_number');
        }
        if (expiry) {
            groups.push('expiry_date');
            selects.push('expiry_date');
        }
        if (price) {
            groups.push('sale_price');
            selects.push('sale_price');
        }

        if (groups.length === 0) {
            return { success: false, error: 'Debe seleccionar al menos un criterio' };
        }

        let sql = `
            SELECT ${selects.join(', ')}
            FROM inventory_batches
        `;

        const queryParams: any[] = [];
        if (filterLocationId) {
            sql += ' WHERE location_id = $1';
            queryParams.push(filterLocationId);
        }

        sql += ` GROUP BY ${groups.join(', ')}
                 HAVING COUNT(*) > 1
                 ORDER BY count DESC
                 LIMIT 50`;

        const res = await query(sql, queryParams);

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'INVENTORY_DIAGNOSTIC', 'INVENTORY', $2::jsonb, NOW())
        `, [session.userId, JSON.stringify({
            type: 'duplicates',
            criteria: { sku, lot, expiry, price },
            location_id: filterLocationId,
            results_count: res.rows.length,
        })]);

        logger.info({ userId: session.userId, resultsCount: res.rows.length }, '🔍 [Diagnostics] Duplicates found');
        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Diagnostics] Find duplicates error');
        return { success: false, error: 'Error buscando duplicados' };
    }
}

// ============================================================================
// FIND DUPLICATE BARCODES (Products Table)
// ============================================================================

/**
 * 🔍 Encontrar Productos con Código de Barras Duplicado
 * Busca en la tabla products, donde realmente se almacenan los barcodes
 */
export async function findDuplicateBarcodesSecure(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden ver diagnósticos' };
    }

    try {
        // Buscar productos que compartan el mismo barcode (no vacío)
        const res = await query(`
            SELECT 
                barcode,
                COUNT(*) as count,
                array_agg(id) as product_ids,
                array_agg(sku) as skus,
                array_agg(name) as names
            FROM products
            WHERE barcode IS NOT NULL 
              AND barcode != ''
              AND TRIM(barcode) != ''
            GROUP BY barcode
            HAVING COUNT(*) > 1
            ORDER BY count DESC
            LIMIT 100
        `, []);

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'INVENTORY_DIAGNOSTIC', 'PRODUCTS', $2::jsonb, NOW())
        `, [session.userId, JSON.stringify({
            type: 'duplicate_barcodes',
            results_count: res.rows.length,
        })]);

        logger.info({ userId: session.userId, resultsCount: res.rows.length }, '🔍 [Diagnostics] Duplicate barcodes found');
        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Diagnostics] Find duplicate barcodes error');
        return { success: false, error: 'Error buscando barcodes duplicados' };
    }
}
// FIND EXPIRED BATCHES
// ============================================================================

/**
 * ⏰ Encontrar Lotes Vencidos
 */
export async function findExpiredBatchesSecure(
    locationId?: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden ver diagnósticos' };
    }

    const filterLocationId = locationId || session.locationId;

    try {
        let sql = `
            SELECT id, sku, name, lot_number, expiry_date, stock_actual, location_id
            FROM inventory_batches
            WHERE expiry_date < CURRENT_DATE
              AND stock_actual > 0
        `;
        const params: any[] = [];

        if (filterLocationId) {
            sql += ' AND location_id = $1';
            params.push(filterLocationId);
        }

        sql += ' ORDER BY expiry_date ASC LIMIT 100';

        const res = await query(sql, params);

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'INVENTORY_DIAGNOSTIC', 'INVENTORY', $2::jsonb, NOW())
        `, [session.userId, JSON.stringify({
            type: 'expired',
            location_id: filterLocationId,
            results_count: res.rows.length,
        })]);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Diagnostics] Find expired error');
        return { success: false, error: 'Error buscando vencidos' };
    }
}

// ============================================================================
// FIND LOW STOCK
// ============================================================================

/**
 * 📉 Encontrar Stock Bajo
 */
export async function findLowStockItemsSecure(
    locationId?: string,
    threshold: number = 10
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden ver diagnósticos' };
    }

    const filterLocationId = locationId || session.locationId;

    try {
        let sql = `
            SELECT sku, MAX(name) as name, SUM(stock_actual) as total_stock, location_id
            FROM inventory_batches
            WHERE stock_actual > 0
        `;
        const params: any[] = [];
        let paramIdx = 1;

        if (filterLocationId) {
            sql += ` AND location_id = $${paramIdx++}`;
            params.push(filterLocationId);
        }

        sql += ` GROUP BY sku, location_id
                 HAVING SUM(stock_actual) <= $${paramIdx}
                 ORDER BY total_stock ASC
                 LIMIT 100`;
        params.push(threshold);

        const res = await query(sql, params);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Diagnostics] Find low stock error');
        return { success: false, error: 'Error buscando stock bajo' };
    }
}

// ============================================================================
// INVENTORY HEALTH REPORT
// ============================================================================

/**
 * 📊 Reporte de Salud del Inventario
 */
export async function getInventoryHealthReportSecure(
    locationId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden ver diagnósticos' };
    }

    const filterLocationId = locationId || session.locationId;

    try {
        const params: any[] = filterLocationId ? [filterLocationId] : [];
        const locationFilter = filterLocationId ? 'WHERE location_id = $1' : '';

        // Total items
        const totalRes = await query(`
            SELECT COUNT(DISTINCT sku) as total_skus, SUM(stock_actual) as total_units
            FROM inventory_batches ${locationFilter}
        `, params);

        // Expired
        const expiredRes = await query(`
            SELECT COUNT(*) as expired_count
            FROM inventory_batches
            ${filterLocationId ? 'WHERE location_id = $1 AND' : 'WHERE'} expiry_date < CURRENT_DATE AND stock_actual > 0
        `, params);

        // Expiring soon (30 days)
        const expiringSoonRes = await query(`
            SELECT COUNT(*) as expiring_soon
            FROM inventory_batches
            ${filterLocationId ? 'WHERE location_id = $1 AND' : 'WHERE'} 
            expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
            AND stock_actual > 0
        `, params);

        // Zero stock
        const zeroStockRes = await query(`
            SELECT COUNT(DISTINCT sku) as zero_stock
            FROM inventory_batches
            ${locationFilter}
            ${filterLocationId ? 'AND' : 'WHERE'} stock_actual <= 0
        `, params);

        const report = {
            total_skus: parseInt(totalRes.rows[0]?.total_skus || '0'),
            total_units: parseInt(totalRes.rows[0]?.total_units || '0'),
            expired_batches: parseInt(expiredRes.rows[0]?.expired_count || '0'),
            expiring_soon: parseInt(expiringSoonRes.rows[0]?.expiring_soon || '0'),
            zero_stock_skus: parseInt(zeroStockRes.rows[0]?.zero_stock || '0'),
            health_score: 0,
        };

        // Calcular score de salud (0-100)
        const expiredPenalty = Math.min(report.expired_batches * 5, 30);
        const expiringSoonPenalty = Math.min(report.expiring_soon * 2, 20);
        const zeroStockPenalty = Math.min(report.zero_stock_skus, 20);
        report.health_score = Math.max(0, 100 - expiredPenalty - expiringSoonPenalty - zeroStockPenalty);

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'INVENTORY_HEALTH_REPORT', 'INVENTORY', $2::jsonb, NOW())
        `, [session.userId, JSON.stringify({ location_id: filterLocationId, ...report })]);

        logger.info({ userId: session.userId, healthScore: report.health_score }, '📊 [Diagnostics] Health report');
        return { success: true, data: report };

    } catch (error: any) {
        logger.error({ error }, '[Diagnostics] Health report error');
        return { success: false, error: 'Error generando reporte' };
    }
}
