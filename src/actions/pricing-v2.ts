'use server';

import { pool } from '@/lib/db';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

// ============================================================================
// PRICING V2 — Monitoreo de Costos, Precios e Historial
// ============================================================================

const logger = {
    info: (data: Record<string, unknown>, msg: string) => {
        if (process.env.NODE_ENV === 'development') console.info(`[PRICING-V2] ${msg}`, data);
    },
    error: (data: Record<string, unknown>, msg: string) => {
        Sentry.captureMessage(msg, { level: 'error', extra: data });
    },
};

// --- Types ---
export interface CostAlert {
    sku: string;
    productName: string;
    productId: string;
    oldCost: number;
    newCost: number;
    changePercent: number;
    direction: 'UP' | 'DOWN' | 'NEW';
    supplierId?: string;
}

export interface PriceCostHistoryEntry {
    id: string;
    product_id: string;
    change_type: string;
    field_changed: string;
    old_value: number;
    new_value: number;
    change_percent: number;
    source: string;
    created_at: string;
    product_name?: string;
    sku?: string;
}

export interface PriceDashboardSummary {
    totalChanges: number;
    costIncreases: number;
    costDecreases: number;
    priceChanges: number;
    levelings: number;
    avgChangePercent: number;
    topIncreases: PriceCostHistoryEntry[];
    topDecreases: PriceCostHistoryEntry[];
}

// --- Schemas ---
const PeriodSchema = z.enum(['today', '7d', '15d', '30d', '90d', '180d']);
type Period = z.infer<typeof PeriodSchema>;

const periodToInterval: Record<Period, string> = {
    'today': '1 day',
    '7d': '7 days',
    '15d': '15 days',
    '30d': '30 days',
    '90d': '90 days',
    '180d': '180 days',
};

// ============================================================================
// 1. Registrar cambio de costo (usado internamente por receivePurchaseOrderSecure)
// ============================================================================
export async function recordCostChange(params: {
    productId: string;
    batchId?: string;
    changeType: 'COST_CHANGE' | 'PRICE_CHANGE' | 'PRICE_LEVELING' | 'COST_GENERATED';
    fieldChanged: string;
    oldValue: number;
    newValue: number;
    source: 'RECEPTION' | 'MANUAL' | 'AUTO_MARGIN' | 'LEVELING' | 'BULK_GENERATE';
    referenceId?: string;
    supplierId?: string;
    locationId?: string;
    userId?: string;
    notes?: string;
    client?: import('pg').PoolClient;
}): Promise<void> {
    const changePercent = params.oldValue > 0
        ? Number((((params.newValue - params.oldValue) / params.oldValue) * 100).toFixed(2))
        : (params.newValue > 0 ? 100 : 0);

    const query = `
        INSERT INTO price_cost_history (
            product_id, batch_id, change_type, field_changed,
            old_value, new_value, change_percent, source,
            reference_id, supplier_id, location_id, user_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;

    const values = [
        params.productId,
        params.batchId || null,
        params.changeType,
        params.fieldChanged,
        Math.round(params.oldValue),
        Math.round(params.newValue),
        changePercent,
        params.source,
        params.referenceId || null,
        params.supplierId || null,
        params.locationId || null,
        params.userId || null,
        params.notes || null,
    ];

    if (params.client) {
        await params.client.query(query, values);
    } else {
        await pool.query(query, values);
    }

    logger.info({
        productId: params.productId,
        changeType: params.changeType,
        oldValue: params.oldValue,
        newValue: params.newValue,
        changePercent,
    }, 'Price/cost change recorded');
}

// ============================================================================
// 2. Crear notificación de cambio de costo
// ============================================================================
export async function createCostChangeNotification(params: {
    alerts: CostAlert[];
    orderId: string;
    userId?: string;
    client?: import('pg').PoolClient;
}): Promise<void> {
    if (params.alerts.length === 0) return;

    const increases = params.alerts.filter(a => a.direction === 'UP');
    const decreases = params.alerts.filter(a => a.direction === 'DOWN');

    let message = `📊 Cambios de costo en OC ${params.orderId.slice(0, 8)}: `;
    if (increases.length > 0) message += `🔴 ${increases.length} subieron`;
    if (increases.length > 0 && decreases.length > 0) message += ', ';
    if (decreases.length > 0) message += `🟢 ${decreases.length} bajaron`;

    const details = params.alerts.map(a =>
        `${a.productName}: $${a.oldCost} → $${a.newCost} (${a.changePercent > 0 ? '+' : ''}${a.changePercent.toFixed(1)}%)`
    ).join('\n');

    const query = `
        INSERT INTO notifications (id, type, title, message, metadata, created_at)
        VALUES (gen_random_uuid(), 'COST_ALERT', $1, $2, $3, NOW())
    `;

    const executor = params.client || pool;
    await executor.query(query, [
        message,
        details,
        JSON.stringify({
            orderId: params.orderId,
            alerts: params.alerts,
            totalAlerts: params.alerts.length,
        }),
    ]);
}

// ============================================================================
// 3. Dashboard de Monitoreo de Costos y Precios
// ============================================================================
export async function getPriceCostDashboard(period: string, locationId?: string): Promise<{
    success: boolean;
    data?: PriceDashboardSummary;
    error?: string;
}> {
    try {
        const validPeriod = PeriodSchema.safeParse(period);
        const interval = validPeriod.success ? periodToInterval[validPeriod.data] : '30 days';

        const locationFilter = locationId ? 'AND pch.location_id::text = $2::text' : '';
        const params: (string | number)[] = [interval];
        if (locationId) params.push(locationId);

        const res = await pool.query(`
            SELECT
                COUNT(*) as total_changes,
                COUNT(*) FILTER (WHERE change_type = 'COST_CHANGE' AND new_value > old_value) as cost_increases,
                COUNT(*) FILTER (WHERE change_type = 'COST_CHANGE' AND new_value < old_value) as cost_decreases,
                COUNT(*) FILTER (WHERE change_type = 'PRICE_CHANGE') as price_changes,
                COUNT(*) FILTER (WHERE change_type = 'PRICE_LEVELING') as levelings,
                COALESCE(AVG(ABS(change_percent)) FILTER (WHERE change_percent != 0), 0) as avg_change_percent
            FROM price_cost_history pch
            WHERE pch.created_at >= NOW() - $1::interval
            ${locationFilter}
        `, params);

        const summary = res.rows[0];

        // Top increases
        const topUpRes = await pool.query(`
            SELECT pch.*, p.name as product_name, p.sku
            FROM price_cost_history pch
            JOIN products p ON p.id::text = pch.product_id::text
            WHERE pch.created_at >= NOW() - $1::interval
              AND pch.change_type = 'COST_CHANGE' AND pch.new_value > pch.old_value
            ${locationFilter}
            ORDER BY pch.change_percent DESC
            LIMIT 10
        `, params);

        // Top decreases
        const topDownRes = await pool.query(`
            SELECT pch.*, p.name as product_name, p.sku
            FROM price_cost_history pch
            JOIN products p ON p.id::text = pch.product_id::text
            WHERE pch.created_at >= NOW() - $1::interval
              AND pch.change_type = 'COST_CHANGE' AND pch.new_value < pch.old_value
            ${locationFilter}
            ORDER BY pch.change_percent ASC
            LIMIT 10
        `, params);

        return {
            success: true,
            data: {
                totalChanges: Number(summary.total_changes),
                costIncreases: Number(summary.cost_increases),
                costDecreases: Number(summary.cost_decreases),
                priceChanges: Number(summary.price_changes),
                levelings: Number(summary.levelings),
                avgChangePercent: Number(Number(summary.avg_change_percent).toFixed(2)),
                topIncreases: topUpRes.rows,
                topDecreases: topDownRes.rows,
            },
        };
    } catch (error) {
        logger.error({ error }, 'getPriceCostDashboard error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al cargar dashboard de precios' };
    }
}

// ============================================================================
// 4. Historial de cambios por producto
// ============================================================================
export async function getPriceCostHistory(
    productId?: string,
    period?: string,
    limit = 50
): Promise<{ success: boolean; data?: PriceCostHistoryEntry[]; error?: string }> {
    try {
        const validPeriod = PeriodSchema.safeParse(period);
        const interval = validPeriod.success ? periodToInterval[validPeriod.data] : '30 days';

        const conditions: string[] = [`pch.created_at >= NOW() - '${interval}'::interval`];
        const params: string[] = [];

        if (productId) {
            params.push(productId);
            conditions.push(`pch.product_id::text = $${params.length}::text`);
        }

        params.push(String(Math.min(limit, 200)));
        const limitParam = `$${params.length}::int`;

        const res = await pool.query(`
            SELECT pch.*, p.name as product_name, p.sku
            FROM price_cost_history pch
            JOIN products p ON p.id::text = pch.product_id::text
            WHERE ${conditions.join(' AND ')}
            ORDER BY pch.created_at DESC
            LIMIT ${limitParam}
        `, params);

        return { success: true, data: res.rows };
    } catch (error) {
        logger.error({ error }, 'getPriceCostHistory error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al cargar historial' };
    }
}

// ============================================================================
// 5. Nivelar precios entre lotes de un mismo producto
// ============================================================================
export async function levelPrices(
    productId: string,
    userId: string
): Promise<{ success: boolean; newPrice?: number; error?: string }> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Obtener todos los lotes activos del producto con diferentes precios
        const batchesRes = await client.query(`
            SELECT id, sale_price, unit_cost, quantity_real
            FROM inventory_batches
            WHERE product_id::text = $1::text AND quantity_real > 0
            ORDER BY created_at DESC
        `, [productId]);

        if (batchesRes.rows.length < 2) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Se necesitan al menos 2 lotes para nivelar' };
        }

        // Calcular precio promedio ponderado por cantidad
        let totalQty = 0;
        let weightedPrice = 0;
        let weightedCost = 0;

        for (const batch of batchesRes.rows) {
            const qty = Number(batch.quantity_real);
            totalQty += qty;
            weightedPrice += Number(batch.sale_price || 0) * qty;
            weightedCost += Number(batch.unit_cost || 0) * qty;
        }

        const avgPrice = totalQty > 0 ? Math.round(weightedPrice / totalQty) : 0;
        const avgCost = totalQty > 0 ? Math.round(weightedCost / totalQty) : 0;

        // Actualizar todos los lotes
        for (const batch of batchesRes.rows) {
            const oldPrice = Number(batch.sale_price || 0);
            if (oldPrice !== avgPrice) {
                await recordCostChange({
                    productId,
                    batchId: batch.id,
                    changeType: 'PRICE_LEVELING',
                    fieldChanged: 'sale_price',
                    oldValue: oldPrice,
                    newValue: avgPrice,
                    source: 'LEVELING',
                    userId,
                    client,
                });
            }
        }

        await client.query(`
            UPDATE inventory_batches
            SET sale_price = $1, unit_cost = $2, updated_at = NOW()
            WHERE product_id::text = $3::text AND quantity_real > 0
        `, [avgPrice, avgCost, productId]);

        // También actualizar el precio maestro del producto
        await client.query(`
            UPDATE products
            SET sale_price = $1, cost_net = $2, cost_price = $2
            WHERE id::text = $3::text
        `, [avgPrice, avgCost, productId]);

        await client.query('COMMIT');

        logger.info({ productId, avgPrice, avgCost, batches: batchesRes.rows.length }, 'Prices leveled');

        return { success: true, newPrice: avgPrice };
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ error }, 'levelPrices error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al nivelar precios' };
    } finally {
        client.release();
    }
}

// ============================================================================
// 6. Generar costos faltantes (margen 30%)
// ============================================================================
export async function generateMissingCosts(
    margin: number = 0.30,
    dryRun: boolean = true,
    userId?: string
): Promise<{
    success: boolean;
    data?: { productId: string; name: string; sku: string; salePrice: number; estimatedCost: number }[];
    totalUpdated?: number;
    error?: string;
}> {
    try {
        // Buscar productos sin costo pero con precio de venta
        const res = await pool.query(`
            SELECT id::text as product_id, name, sku,
                   COALESCE(NULLIF(sale_price, 0), NULLIF(price_sell_box, 0), NULLIF(price, 0), 0) as sale_price
            FROM products
            WHERE (cost_net IS NULL OR cost_net = 0) AND (cost_price IS NULL OR cost_price = 0)
              AND COALESCE(NULLIF(sale_price, 0), NULLIF(price_sell_box, 0), NULLIF(price, 0), 0) > 0
            ORDER BY name
        `);

        const results = res.rows.map(row => ({
            productId: row.product_id,
            name: row.name,
            sku: row.sku,
            salePrice: Number(row.sale_price),
            estimatedCost: Math.round(Number(row.sale_price) / (1 + margin)),
        }));

        if (dryRun) {
            return { success: true, data: results, totalUpdated: 0 };
        }

        // Aplicar
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const item of results) {
                await client.query(`
                    UPDATE products
                    SET cost_net = $1, cost_price = $1
                    WHERE id::text = $2::text
                `, [item.estimatedCost, item.productId]);

                await recordCostChange({
                    productId: item.productId,
                    changeType: 'COST_GENERATED',
                    fieldChanged: 'cost_net',
                    oldValue: 0,
                    newValue: item.estimatedCost,
                    source: 'BULK_GENERATE',
                    userId,
                    notes: `Auto-generado con margen ${(margin * 100).toFixed(0)}% sobre precio venta $${item.salePrice}`,
                    client,
                });
            }

            await client.query('COMMIT');

            logger.info({ total: results.length, margin }, 'Bulk cost generation completed');
            return { success: true, data: results, totalUpdated: results.length };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error({ error }, 'generateMissingCosts error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al generar costos' };
    }
}

// ============================================================================
// 7. Obtener resumen de cambios recientes (para widget de notificaciones)
// ============================================================================
export async function getRecentCostAlerts(limit = 10): Promise<{
    success: boolean;
    data?: PriceCostHistoryEntry[];
}> {
    try {
        const res = await pool.query(`
            SELECT pch.*, p.name as product_name, p.sku
            FROM price_cost_history pch
            JOIN products p ON p.id::text = pch.product_id::text
            WHERE pch.created_at >= NOW() - INTERVAL '7 days'
              AND pch.change_type IN ('COST_CHANGE', 'PRICE_CHANGE')
            ORDER BY ABS(pch.change_percent) DESC
            LIMIT $1
        `, [limit]);

        return { success: true, data: res.rows };
    } catch (error) {
        logger.error({ error }, 'getRecentCostAlerts error');
        return { success: true, data: [] };
    }
}
