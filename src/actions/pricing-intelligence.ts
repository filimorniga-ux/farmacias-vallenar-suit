'use server';

import { pool } from '@/lib/db';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { PRICING_GLOBAL_ROLES, PRICING_WRITE_ROLES, requireScopedActor } from '@/actions/admin-scope';

// ============================================================================
// PRICING INTELLIGENCE — Comparación entre Proveedores + Motor de Recomendaciones
// ============================================================================

const logger = {
    info: (data: Record<string, unknown>, msg: string) => {
        if (process.env.NODE_ENV === 'development') console.info(`[PRICING-INTEL] ${msg}`, data);
    },
    error: (data: Record<string, unknown>, msg: string) => {
        Sentry.captureMessage(msg, { level: 'error', extra: data });
    },
};

const UUIDSchema = z.string().uuid('ID inválido');

// --- Types ---
export interface SupplierPrice {
    id: string;
    product_id: string;
    supplier_id: string;
    supplier_name: string;
    unit_cost: number;
    last_seen_at: string;
    is_current: boolean;
    delta_vs_current: number; // % diferencia vs costo actual del producto
}

export interface PriceRecommendation {
    id: string;
    product_id: string;
    product_name?: string;
    sku?: string;
    recommendation_type: string;
    reason: string;
    current_cost: number;
    suggested_cost: number;
    current_price: number;
    suggested_price: number;
    margin_current: number;
    margin_suggested: number;
    cheaper_supplier_id?: string;
    cheaper_supplier_name?: string;
    savings_per_unit: number;
    status: string;
    resolved_by?: string;
    resolved_at?: string;
    triggered_by?: string;
    created_at: string;
}

// ============================================================================
// 1. Upsert Supplier Price — Registrar precio de proveedor
// ============================================================================
const UpsertSupplierPriceSchema = z.object({
    productId: UUIDSchema,
    supplierId: UUIDSchema,
    unitCost: z.number().int().min(0),
    orderId: UUIDSchema.optional(),
});

export async function upsertSupplierPrice(params: {
    productId: string;
    supplierId: string;
    unitCost: number;
    orderId?: string;
    client?: import('pg').PoolClient;
}): Promise<void> {
    const validated = UpsertSupplierPriceSchema.safeParse(params);
    if (!validated.success) return;

    const { productId, supplierId, unitCost, orderId } = validated.data;
    const executor = params.client || pool;

    // Marcar precios anteriores de este proveedor+producto como no-actuales
    await executor.query(`
        UPDATE supplier_product_prices
        SET is_current = false
        WHERE product_id::text = $1::text AND supplier_id::text = $2::text AND is_current = true
    `, [productId, supplierId]);

    // Insertar o actualizar (ON CONFLICT en caso de mismo precio exacto)
    await executor.query(`
        INSERT INTO supplier_product_prices (product_id, supplier_id, unit_cost, last_order_id, last_seen_at, is_current)
        VALUES ($1::uuid, $2::uuid, $3, $4, NOW(), true)
        ON CONFLICT (product_id, supplier_id, unit_cost)
        DO UPDATE SET last_seen_at = NOW(), last_order_id = COALESCE($4, supplier_product_prices.last_order_id), is_current = true
    `, [productId, supplierId, unitCost, orderId || null]);

    logger.info({ productId, supplierId, unitCost }, 'Supplier price upserted');
}

// ============================================================================
// 2. Comparación de precios por proveedor para un producto
// ============================================================================
const GetSupplierComparisonSchema = z.object({
    productId: UUIDSchema,
});

export async function getSupplierPriceComparison(productId: string): Promise<{
    success: boolean;
    data?: SupplierPrice[];
    currentCost?: number;
    cheapestSupplierId?: string;
    error?: string;
}> {
    try {
        const actorResult = await requireScopedActor(PRICING_GLOBAL_ROLES);
        if (!actorResult.success) {
            return { success: false, error: actorResult.error };
        }

        const validated = GetSupplierComparisonSchema.safeParse({ productId });
        if (!validated.success) return { success: false, error: 'ID de producto inválido' };

        // Obtener costo actual del producto
        const productRes = await pool.query(`
            SELECT COALESCE(cost_net, cost_price, 0) as current_cost
            FROM products WHERE id::text = $1::text
        `, [productId]);

        const currentCost = Number(productRes.rows[0]?.current_cost ?? 0);

        // Obtener precios actuales por proveedor
        const res = await pool.query(`
            SELECT spp.*, s.fantasy_name as supplier_name, s.business_name
            FROM supplier_product_prices spp
            JOIN suppliers s ON s.id::text = spp.supplier_id::text
            WHERE spp.product_id::text = $1::text AND spp.is_current = true
            ORDER BY spp.unit_cost ASC
        `, [productId]);

        const data: SupplierPrice[] = res.rows.map(row => ({
            id: row.id,
            product_id: row.product_id,
            supplier_id: row.supplier_id,
            supplier_name: row.supplier_name || row.business_name || 'Sin nombre',
            unit_cost: Number(row.unit_cost),
            last_seen_at: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : row.last_seen_at,
            is_current: row.is_current,
            delta_vs_current: currentCost > 0
                ? Number((((Number(row.unit_cost) - currentCost) / currentCost) * 100).toFixed(2))
                : 0,
        }));

        const cheapestSupplierId = data.length > 0 ? data[0].supplier_id : undefined;

        return { success: true, data, currentCost, cheapestSupplierId };
    } catch (error) {
        logger.error({ error }, 'getSupplierPriceComparison error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al comparar precios' };
    }
}

// ============================================================================
// 3. Motor de Recomendaciones — genera recomendaciones automáticas
// ============================================================================

const MIN_MARGIN_THRESHOLD = 15; // si margen cae < 15%, recomendar subir precio
const COMFORT_MARGIN = 25;       // margen >25% = cómodo, mantener precio

const GenerateRecommendationsSchema = z.object({
    productId: UUIDSchema,
    incomingCost: z.number().min(0),
    previousCost: z.number().min(0),
    supplierId: UUIDSchema,
    orderId: UUIDSchema.optional(),
});

export async function generatePriceRecommendations(params: {
    productId: string;
    incomingCost: number;
    previousCost: number;
    supplierId: string;
    orderId?: string;
    client?: import('pg').PoolClient;
}): Promise<PriceRecommendation[]> {
    const recommendations: PriceRecommendation[] = [];

    const validated = GenerateRecommendationsSchema.safeParse(params);
    if (!validated.success) {
        logger.error({ error: validated.error }, 'Invalid params in generatePriceRecommendations');
        return recommendations;
    }

    const executor = params.client || pool;

    try {
        // Obtener datos del producto
        const productRes = await executor.query(`
            SELECT id, name, sku,
                   COALESCE(sale_price, 0) as sale_price,
                   COALESCE(cost_net, cost_price, 0) as current_cost
            FROM products WHERE id::text = $1::text
        `, [params.productId]);

        if (productRes.rows.length === 0) return recommendations;

        const product = productRes.rows[0];
        const salePrice = Number(product.sale_price);
        const costDelta = params.incomingCost - params.previousCost;
        const costDirection = costDelta > 0 ? 'UP' : 'DOWN';

        // Calcular márgenes
        const marginCurrent = salePrice > 0 ? ((salePrice - params.previousCost) / salePrice) * 100 : 0;
        const marginNew = salePrice > 0 ? ((salePrice - params.incomingCost) / salePrice) * 100 : 0;

        // --- Regla 1: Costo subió y margen queda bajo ---
        if (costDirection === 'UP' && marginNew < MIN_MARGIN_THRESHOLD && salePrice > 0) {
            const suggestedPrice = Math.round(params.incomingCost / (1 - COMFORT_MARGIN / 100));
            await insertRecommendation(executor, {
                productId: params.productId,
                type: 'RAISE_PRICE',
                reason: `El costo subió de $${params.previousCost} a $${params.incomingCost} (+${((costDelta / params.previousCost) * 100).toFixed(1)}%). El margen cayó a ${marginNew.toFixed(1)}% (mínimo recomendado: ${MIN_MARGIN_THRESHOLD}%). Se sugiere ajustar el precio de venta.`,
                currentCost: params.previousCost,
                suggestedCost: params.incomingCost,
                currentPrice: salePrice,
                suggestedPrice,
                marginCurrent,
                marginSuggested: COMFORT_MARGIN,
                triggeredBy: params.orderId ? `OC-${params.orderId.slice(0, 8)}` : 'AUTO',
                referenceId: params.orderId,
            });
        }

        // --- Regla 2: Costo subió pero margen sigue cómodo → mantener ---
        if (costDirection === 'UP' && marginNew >= COMFORT_MARGIN && salePrice > 0) {
            await insertRecommendation(executor, {
                productId: params.productId,
                type: 'KEEP_PRICE',
                reason: `El costo subió de $${params.previousCost} a $${params.incomingCost}, pero el margen sigue en ${marginNew.toFixed(1)}% (>= ${COMFORT_MARGIN}%). Se recomienda mantener el precio actual.`,
                currentCost: params.previousCost,
                suggestedCost: params.incomingCost,
                currentPrice: salePrice,
                suggestedPrice: salePrice,
                marginCurrent,
                marginSuggested: marginNew,
                triggeredBy: params.orderId ? `OC-${params.orderId.slice(0, 8)}` : 'AUTO',
                referenceId: params.orderId,
            });
        }

        // --- Regla 3: Costo bajó → posibilidad de bajar precio o mantener ---
        if (costDirection === 'DOWN' && salePrice > 0) {
            await insertRecommendation(executor, {
                productId: params.productId,
                type: 'KEEP_PRICE',
                reason: `El costo bajó de $${params.previousCost} a $${params.incomingCost}. El margen mejoró a ${marginNew.toFixed(1)}%. Puede mantener el precio actual (más ganancia) o bajar el precio para competitividad.`,
                currentCost: params.previousCost,
                suggestedCost: params.incomingCost,
                currentPrice: salePrice,
                suggestedPrice: salePrice,
                marginCurrent,
                marginSuggested: marginNew,
                savingsPerUnit: Math.abs(costDelta),
                triggeredBy: params.orderId ? `OC-${params.orderId.slice(0, 8)}` : 'AUTO',
                referenceId: params.orderId,
            });
        }

        // --- Regla 4: Verificar si hay lotes con precios diferentes → nivelar ---
        const batchesRes = await executor.query(`
            SELECT sale_price, unit_cost, quantity_real
            FROM inventory_batches
            WHERE product_id::text = $1::text AND quantity_real > 0
        `, [params.productId]);

        const uniquePrices = new Set(batchesRes.rows.map((b: { sale_price: number }) => Number(b.sale_price)));
        if (uniquePrices.size > 1) {
            await insertRecommendation(executor, {
                productId: params.productId,
                type: 'LEVEL_PRICE',
                reason: `Existen ${uniquePrices.size} precios diferentes entre ${batchesRes.rows.length} lotes activos. Se recomienda nivelar para evitar confusión en punto de venta.`,
                currentCost: params.previousCost,
                suggestedCost: params.incomingCost,
                currentPrice: salePrice,
                suggestedPrice: salePrice,
                marginCurrent,
                marginSuggested: marginNew,
                triggeredBy: params.orderId ? `OC-${params.orderId.slice(0, 8)}` : 'AUTO',
                referenceId: params.orderId,
            });
        }

        // --- Regla 5: Verificar si otro proveedor tiene mejor precio ---
        const cheaperRes = await executor.query(`
            SELECT spp.supplier_id, spp.unit_cost, s.fantasy_name as supplier_name
            FROM supplier_product_prices spp
            JOIN suppliers s ON s.id::text = spp.supplier_id::text
            WHERE spp.product_id::text = $1::text
              AND spp.is_current = true
              AND spp.unit_cost < $2
              AND spp.supplier_id::text != $3::text
            ORDER BY spp.unit_cost ASC
            LIMIT 1
        `, [params.productId, params.incomingCost, params.supplierId]);

        if (cheaperRes.rows.length > 0) {
            const cheaper = cheaperRes.rows[0];
            const savings = params.incomingCost - Number(cheaper.unit_cost);
            await insertRecommendation(executor, {
                productId: params.productId,
                type: 'SWITCH_SUPPLIER',
                reason: `${cheaper.supplier_name} ofrece este producto a $${cheaper.unit_cost} (ahorro de $${savings}/unidad vs $${params.incomingCost} del proveedor actual).`,
                currentCost: params.incomingCost,
                suggestedCost: Number(cheaper.unit_cost),
                currentPrice: salePrice,
                suggestedPrice: salePrice,
                marginCurrent: marginNew,
                marginSuggested: salePrice > 0 ? ((salePrice - Number(cheaper.unit_cost)) / salePrice) * 100 : 0,
                cheaperSupplierId: cheaper.supplier_id,
                savingsPerUnit: savings,
                triggeredBy: params.orderId ? `OC-${params.orderId.slice(0, 8)}` : 'AUTO',
                referenceId: params.orderId,
            });
        }

        // --- Regla 6: Hay lotes antiguos → terminar antes de cambiar precio ---
        const oldBatchesRes = await executor.query(`
            SELECT COUNT(*) as old_batches, SUM(quantity_real) as old_qty
            FROM inventory_batches
            WHERE product_id::text = $1::text
              AND quantity_real > 0
              AND unit_cost != $2
        `, [params.productId, params.incomingCost]);

        const oldBatches = Number(oldBatchesRes.rows[0]?.old_batches ?? 0);
        const oldQty = Number(oldBatchesRes.rows[0]?.old_qty ?? 0);

        if (oldBatches > 0 && oldQty > 10) {
            await insertRecommendation(executor, {
                productId: params.productId,
                type: 'FINISH_OLD_STOCK',
                reason: `Hay ${oldBatches} lote(s) antiguo(s) con ${oldQty} unidades a un costo diferente ($${params.previousCost}). Se recomienda vender el stock existente antes de aplicar el nuevo precio basado en $${params.incomingCost}.`,
                currentCost: params.previousCost,
                suggestedCost: params.incomingCost,
                currentPrice: salePrice,
                suggestedPrice: salePrice,
                marginCurrent,
                marginSuggested: marginNew,
                triggeredBy: params.orderId ? `OC-${params.orderId.slice(0, 8)}` : 'AUTO',
                referenceId: params.orderId,
            });
        }

    } catch (error) {
        logger.error({ error }, 'generatePriceRecommendations error');
        Sentry.captureException(error);
    }

    return recommendations;
}

// Helper para insertar recomendación
async function insertRecommendation(executor: import('pg').Pool | import('pg').PoolClient, params: {
    productId: string;
    type: string;
    reason: string;
    currentCost: number;
    suggestedCost: number;
    currentPrice: number;
    suggestedPrice: number;
    marginCurrent: number;
    marginSuggested: number;
    cheaperSupplierId?: string;
    savingsPerUnit?: number;
    triggeredBy?: string;
    referenceId?: string;
}): Promise<void> {
    // Inserción atómica que ignora conflictos basándose en el índice parcial (solo 1 PENDING por producto y tipo)
    await executor.query(`
        INSERT INTO price_recommendations (
            product_id, recommendation_type, reason,
            current_cost, suggested_cost, current_price, suggested_price,
            margin_current, margin_suggested,
            cheaper_supplier_id, savings_per_unit,
            triggered_by, reference_id
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (product_id, recommendation_type) WHERE status = 'PENDING' DO NOTHING
    `, [
        params.productId,
        params.type,
        params.reason,
        Math.round(params.currentCost),
        Math.round(params.suggestedCost),
        Math.round(params.currentPrice),
        Math.round(params.suggestedPrice),
        Number(params.marginCurrent.toFixed(2)),
        Number(params.marginSuggested.toFixed(2)),
        params.cheaperSupplierId || null,
        params.savingsPerUnit || 0,
        params.triggeredBy || null,
        params.referenceId || null,
    ]);
}

// ============================================================================
// 4. Resolver recomendación — Aceptar/Rechazar
// ============================================================================
const ResolveRecommendationSchema = z.object({
    recommendationId: UUIDSchema,
    action: z.enum(['ACCEPTED', 'REJECTED']),
});

export async function resolveRecommendation(
    recommendationId: string,
    action: 'ACCEPTED' | 'REJECTED'
): Promise<{ success: boolean; error?: string }> {
    try {
        const validated = ResolveRecommendationSchema.safeParse({ recommendationId, action });
        if (!validated.success) return { success: false, error: 'Parámetros inválidos' };

        const actorResult = await requireScopedActor(PRICING_WRITE_ROLES);
        if (!actorResult.success) return { success: false, error: actorResult.error };
        const userId = actorResult.actor.userId;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const res = await client.query(`
                SELECT * FROM price_recommendations
                WHERE id::text = $1::text AND status = 'PENDING'
                FOR UPDATE
            `, [recommendationId]);

            if (res.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Recomendación no encontrada o ya resuelta' };
            }

            const rec = res.rows[0];

            // Si se acepta y es RAISE_PRICE o LOWER_PRICE → aplicar cambio de precio
            if (action === 'ACCEPTED' && ['RAISE_PRICE', 'LOWER_PRICE'].includes(rec.recommendation_type)) {
                const suggestedPrice = Number(rec.suggested_price);
                if (suggestedPrice > 0) {
                    await client.query(`
                        UPDATE products SET sale_price = $1 WHERE id::text = $2::text
                    `, [suggestedPrice, rec.product_id]);

                    await client.query(`
                        UPDATE inventory_batches SET sale_price = $1, updated_at = NOW()
                        WHERE product_id::text = $2::text AND quantity_real > 0
                    `, [suggestedPrice, rec.product_id]);
                }
            }

            // Si se acepta LEVEL_PRICE → llamar a la nivelación existente
            if (action === 'ACCEPTED' && rec.recommendation_type === 'LEVEL_PRICE') {
                const { levelPrices } = await import('./pricing-v2');
                await levelPrices(rec.product_id, userId);
            }

            // Marcar como resuelta
            await client.query(`
                UPDATE price_recommendations
                SET status = $1, resolved_by = $2::uuid, resolved_at = NOW()
                WHERE id::text = $3::text
            `, [action, userId, recommendationId]);

            await client.query('COMMIT');
            return { success: true };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error({ error }, 'resolveRecommendation error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al resolver recomendación' };
    }
}

const LimitSchema = z.number().int().min(1).max(100).default(50);

const serializeRecommendation = (row: any): PriceRecommendation => ({
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    resolved_at: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
});

// ============================================================================
// 5. Obtener recomendaciones pendientes
// ============================================================================
export async function getPendingRecommendations(limit = 50): Promise<{
    success: boolean;
    data?: PriceRecommendation[];
    error?: string;
}> {
    try {
        const actorResult = await requireScopedActor(PRICING_GLOBAL_ROLES);
        if (!actorResult.success) {
            return { success: false, error: actorResult.error };
        }

        const validatedLimit = LimitSchema.safeParse(limit);
        const safeLimit = validatedLimit.success ? validatedLimit.data : 50;

        const res = await pool.query(`
            SELECT pr.*,
                   p.name as product_name, p.sku,
                   s.fantasy_name as cheaper_supplier_name
            FROM price_recommendations pr
            JOIN products p ON p.id::text = pr.product_id::text
            LEFT JOIN suppliers s ON s.id::text = pr.cheaper_supplier_id::text
            WHERE pr.status = 'PENDING'
            ORDER BY
                CASE pr.recommendation_type
                    WHEN 'RAISE_PRICE' THEN 1
                    WHEN 'SWITCH_SUPPLIER' THEN 2
                    WHEN 'LEVEL_PRICE' THEN 3
                    WHEN 'FINISH_OLD_STOCK' THEN 4
                    WHEN 'KEEP_PRICE' THEN 5
                    WHEN 'LOWER_PRICE' THEN 6
                END,
                pr.created_at DESC
            LIMIT $1
        `, [safeLimit]);

        return { success: true, data: res.rows.map(serializeRecommendation) };
    } catch (error) {
        logger.error({ error }, 'getPendingRecommendations error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al obtener recomendaciones' };
    }
}

// ============================================================================
// 6. Historial de recomendaciones resueltas
// ============================================================================
export async function getRecommendationHistory(limit = 50): Promise<{
    success: boolean;
    data?: PriceRecommendation[];
    error?: string;
}> {
    try {
        const actorResult = await requireScopedActor(PRICING_GLOBAL_ROLES);
        if (!actorResult.success) {
            return { success: false, error: actorResult.error };
        }

        const validatedLimit = LimitSchema.safeParse(limit);
        const safeLimit = validatedLimit.success ? validatedLimit.data : 50;

        const res = await pool.query(`
            SELECT pr.*,
                   p.name as product_name, p.sku,
                   s.fantasy_name as cheaper_supplier_name
            FROM price_recommendations pr
            JOIN products p ON p.id::text = pr.product_id::text
            LEFT JOIN suppliers s ON s.id::text = pr.cheaper_supplier_id::text
            WHERE pr.status IN ('ACCEPTED', 'REJECTED')
            ORDER BY pr.resolved_at DESC
            LIMIT $1
        `, [safeLimit]);

        return { success: true, data: res.rows.map(serializeRecommendation) };
    } catch (error) {
        logger.error({ error }, 'getRecommendationHistory error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al obtener historial' };
    }
}

// ============================================================================
// 7. Comparativa global de proveedores (top productos con diferencia de precio)
// ============================================================================
export async function getSupplierPriceOverview(limit = 30): Promise<{
    success: boolean;
    data?: Array<{
        product_id: string;
        product_name: string;
        sku: string;
        current_cost: number;
        cheapest_cost: number;
        cheapest_supplier: string;
        most_expensive_cost: number;
        most_expensive_supplier: string;
        price_spread: number;
        supplier_count: number;
    }>;
    error?: string;
}> {
    try {
        const actorResult = await requireScopedActor(PRICING_GLOBAL_ROLES);
        if (!actorResult.success) {
            return { success: false, error: actorResult.error };
        }

        const validatedLimit = LimitSchema.safeParse(limit);
        const safeLimit = validatedLimit.success ? validatedLimit.data : 30;

        const res = await pool.query(`
            WITH supplier_prices AS (
                SELECT
                    spp.product_id,
                    p.name as product_name,
                    p.sku,
                    COALESCE(p.cost_net, p.cost_price, 0) as current_cost,
                    MIN(spp.unit_cost) as cheapest_cost,
                    MAX(spp.unit_cost) as most_expensive_cost,
                    COUNT(DISTINCT spp.supplier_id) as supplier_count
                FROM supplier_product_prices spp
                JOIN products p ON p.id::text = spp.product_id::text
                WHERE spp.is_current = true
                GROUP BY spp.product_id, p.name, p.sku, p.cost_net, p.cost_price
                HAVING COUNT(DISTINCT spp.supplier_id) >= 2
            )
            SELECT sp.*,
                (SELECT s.fantasy_name FROM supplier_product_prices spp2
                 JOIN suppliers s ON s.id::text = spp2.supplier_id::text
                 WHERE spp2.product_id::text = sp.product_id::text
                   AND spp2.is_current = true
                 ORDER BY spp2.unit_cost ASC LIMIT 1) as cheapest_supplier,
                (SELECT s.fantasy_name FROM supplier_product_prices spp2
                 JOIN suppliers s ON s.id::text = spp2.supplier_id::text
                 WHERE spp2.product_id::text = sp.product_id::text
                   AND spp2.is_current = true
                 ORDER BY spp2.unit_cost DESC LIMIT 1) as most_expensive_supplier,
                (sp.most_expensive_cost - sp.cheapest_cost) as price_spread
            FROM supplier_prices sp
            ORDER BY (sp.most_expensive_cost - sp.cheapest_cost) DESC
            LIMIT $1
        `, [safeLimit]);

        return { success: true, data: res.rows };
    } catch (error) {
        logger.error({ error }, 'getSupplierPriceOverview error');
        Sentry.captureException(error);
        return { success: false, error: 'Error al obtener comparativa' };
    }
}
