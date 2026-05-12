'use server';

/**
 * price-research.ts — Server Actions para investigación de precios web
 * 
 * Orquesta la búsqueda de precios en internet, guarda resultados en DB,
 * y permite aplicar actualizaciones selectivas.
 * 
 * Security: validatePinByRole (bcrypt + DB), rate limiting, audit trail
 * Integrity: transacciones PostgreSQL para apply batch
 */

import { pool, query, type PoolClient } from '@/lib/db';
import { logger } from '@/lib/logger';
import { calculateSmartPrice, type ProductResearchResult } from '@/lib/web-price-search';
import { v4 as uuidv4 } from 'uuid';
import { validatePinForRoles, type PinQueryClient } from '@/lib/pin-rbac';

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'];

// ============================================================================
// TYPES
// ============================================================================

interface StartResearchParams {
    pin: string;
    skus?: string[];      // Si vacío, busca todos
    categoryId?: string;
    limit?: number;        // Máximo de productos a investigar
}

interface ResearchSession {
    sessionId: string;
    total: number;
    products: Array<{ name: string; sku: string; currentPrice: number; costPrice: number }>;
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

/**
 * Valida PIN contra la DB usando la misma capa RBAC del resto del sistema.
 * Retorna el usuario autenticado si es válido.
 */
async function validatePinByRole(
    client: PoolClient,
    pin: string,
    roles: string[]
): Promise<{ valid: boolean; user?: { id: string; name: string; role: string } }> {
    try {
        const pinQueryClient: PinQueryClient = {
            query: (sql, params) =>
                client.query(sql, params as unknown[] | undefined) as Promise<Awaited<ReturnType<PinQueryClient['query']>>>,
        };

        const result = await validatePinForRoles(pinQueryClient, pin, roles, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (result.valid) {
            return { valid: true, user: result.authorizedBy };
        }

        return { valid: false };
    } catch (err) {
        logger.error({ err }, '[PriceResearch] PIN validation error');
        return { valid: false };
    }
}

// ============================================================================
// START RESEARCH SESSION
// ============================================================================

/**
 * Prepara y retorna la lista de productos para investigar.
 * NO ejecuta la búsqueda — eso se hace via streaming desde el cliente.
 */
export async function startPriceResearchSecure(params: StartResearchParams): Promise<{
    success: boolean;
    error?: string;
    session?: ResearchSession;
}> {
    const client = await pool.connect();

    try {
        // 1. Security: validar PIN contra DB con roles
        const authResult = await validatePinByRole(client, params.pin, ADMIN_ROLES);
        if (!authResult.valid) {
            logger.warn('[PriceResearch] Invalid PIN attempt for startResearch');
            return { success: false, error: 'PIN incorrecto o rol insuficiente' };
        }

        // 2. Build product list query
        // Use COALESCE to find best price: inventory_batches.sale_price > products.price
        // This matches the pattern in get-products-v2.ts and inventory-v2.ts
        let sql = `
            SELECT
                p.id, p.name, p.sku, NULLIF(to_jsonb(p)->>'barcode', '') as barcode,
                COALESCE(MAX(ib.sale_price), MAX(ib.price_sell_box), p.price, 0) as sale_price,
                COALESCE(p.cost_price, MAX(ib.unit_cost), MAX(ib.cost_net), 0) as cost_price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text
            WHERE COALESCE(p.price, 0) > 0 OR COALESCE(ib.sale_price, ib.price_sell_box, 0) > 0
              AND p.name IS NOT NULL
              AND LENGTH(p.name) > 3
        `;
        const sqlParams: (string | number)[] = [];

        if (params.skus && params.skus.length > 0) {
            sqlParams.push(params.skus.join(','));
            sql += ` AND p.sku = ANY(string_to_array($${sqlParams.length}, ','))`;
        }

        if (params.categoryId) {
            sqlParams.push(params.categoryId);
            sql += ` AND NULLIF(to_jsonb(p)->>'category_id', '') = $${sqlParams.length}`;
        }

        sql += ` GROUP BY p.id, p.name, p.sku, NULLIF(to_jsonb(p)->>'barcode', ''), p.price, p.cost_price`;
        sql += ` ORDER BY p.name`;

        const limit = params.limit || 500;
        sqlParams.push(limit);
        sql += ` LIMIT $${sqlParams.length}`;

        const res = await client.query(sql, sqlParams);

        if (res.rows.length === 0) {
            return { success: false, error: 'No se encontraron productos para investigar' };
        }

        const sessionId = uuidv4();

        const products = res.rows
            .filter((row: Record<string, unknown>) => Number(row.sale_price) > 0)
            .map((row: Record<string, unknown>) => ({
                name: String(row.name || ''),
                sku: String(row.sku || ''),
                currentPrice: Number(row.sale_price) || 0,
                costPrice: Number(row.cost_price) || 0,
            }));

        logger.info({
            sessionId,
            products: products.length,
            user: authResult.user?.name,
        }, '[PriceResearch] Session started');

        return {
            success: true,
            session: {
                sessionId,
                total: products.length,
                products,
            },
        };

    } catch (error: unknown) {
        logger.error({ error }, '[PriceResearch] Failed to start session');
        return { success: false, error: 'Error al preparar investigación' };
    } finally {
        client.release();
    }
}

// ============================================================================
// EXECUTE RESEARCH (called from client with streaming)
// ============================================================================

/**
 * Ejecuta la búsqueda de precios para un producto individual.
 * Diseñado para ser llamado secuencialmente desde el cliente.
 */
export async function researchSingleProductSecure(
    productName: string,
    sku: string,
    currentPrice: number,
    costPrice: number,
    sessionId: string,
    pin: string
): Promise<{ success: boolean; result?: ProductResearchResult; error?: string }> {
    const client = await pool.connect();

    try {
        // Security: validar PIN
        const authResult = await validatePinByRole(client, pin, ADMIN_ROLES);
        if (!authResult.valid) {
            return { success: false, error: 'PIN inválido' };
        }

        const { searchProductPrice } = await import('@/lib/web-price-search');
        const webResults = await searchProductPrice(productName);

        // Calculate stats
        const validPrices = webResults
            .filter(r => r.confidence !== 'LOW')
            .map(r => r.price)
            .filter(p => p > 0);

        const marketPriceMin = validPrices.length > 0 ? Math.min(...validPrices) : 0;
        const marketPriceMax = validPrices.length > 0 ? Math.max(...validPrices) : 0;
        const marketPriceAvg = validPrices.length > 0
            ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
            : 0;

        const priceDiffPercent = currentPrice > 0 && marketPriceAvg > 0
            ? Math.round(((marketPriceAvg - currentPrice) / currentPrice) * 10000) / 100
            : 0;

        // Calculate smart price (outlier filtering + competitive discount + margin protection)
        const smartPrice = calculateSmartPrice(webResults, currentPrice, costPrice);

        const bestConfidence = webResults.length > 0
            ? (webResults.some(r => r.confidence === 'HIGH') ? 'HIGH' : webResults.some(r => r.confidence === 'MEDIUM') ? 'MEDIUM' : 'LOW')
            : 'LOW';

        // Save to DB
        await client.query(`
            INSERT INTO price_research_results 
                (session_id, product_name, sku, current_price, market_price_min, market_price_max, market_price_avg, sources, price_diff_percent, confidence, status)
            VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'PENDING')
        `, [
            sessionId,
            productName,
            sku,
            currentPrice,
            marketPriceMin,
            marketPriceMax,
            smartPrice ? smartPrice.recommendedPrice : marketPriceAvg,
            JSON.stringify({ webResults, smartPrice }),
            priceDiffPercent,
            bestConfidence,
        ]);

        const result: ProductResearchResult = {
            productName,
            sku,
            currentPrice,
            costPrice,
            webResults,
            marketPriceMin,
            marketPriceMax,
            marketPriceAvg,
            priceDiffPercent,
            smartPrice,
            researchedAt: new Date().toISOString(),
        };

        return { success: true, result };

    } catch (error: unknown) {
        logger.error({ error }, `[PriceResearch] Error researching ${sku}`);
        return { success: false, error: 'Error en búsqueda' };
    } finally {
        client.release();
    }
}

// ============================================================================
// APPLY PRICES (with transaction + real user audit)
// ============================================================================

/**
 * Aplica precios de mercado seleccionados al inventario.
 * Envuelto en transaction única para integridad.
 */
export async function applyResearchPricesSecure(params: {
    pin: string;
    sessionId: string;
    items: Array<{ sku: string; newPrice: number }>;
}): Promise<{ success: boolean; applied: number; error?: string }> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Security: validar PIN con roles
        const authResult = await validatePinByRole(client, params.pin, ADMIN_ROLES);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, applied: 0, error: 'PIN incorrecto o rol insuficiente' };
        }

        const appliedBy = authResult.user?.name || 'Desconocido';
        const appliedById = authResult.user?.id || 'unknown';
        let applied = 0;

        for (const item of params.items) {
            // Round to nearest 50 CLP (business rule)
            const roundedPrice = Math.ceil(item.newPrice / 50) * 50;

            // Update products table (global price, same as pricing.ts pattern)
            await client.query(`
                UPDATE products SET sale_price = $1, updated_at = NOW() WHERE sku = $2
            `, [roundedPrice, item.sku]);

            // Update inventory_batches table
            await client.query(`
                UPDATE inventory_batches SET sale_price = $1, updated_at = NOW() WHERE sku = $2
            `, [roundedPrice, item.sku]);

            // Mark as applied in research results with real user
            await client.query(`
                UPDATE price_research_results 
                SET status = 'APPLIED', applied_at = NOW(), applied_by = $3
                WHERE session_id = $1 AND sku = $2
            `, [params.sessionId, item.sku, appliedBy]);

            applied++;
        }

        // Audit trail with real user
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'PRICE_RESEARCH_APPLY', 'PRODUCT', $2::jsonb, NOW())
        `, [appliedById, JSON.stringify({
            sessionId: params.sessionId,
            applied,
            items: params.items.length,
            appliedBy,
        })]);

        await client.query('COMMIT');

        logger.info({
            sessionId: params.sessionId,
            applied,
            user: appliedBy,
        }, '[PriceResearch] Prices applied successfully');

        return { success: true, applied };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[PriceResearch] Failed to apply prices');
        return { success: false, applied: 0, error: 'Error al aplicar precios' };
    } finally {
        client.release();
    }
}

// ============================================================================
// GET HISTORY
// ============================================================================

/**
 * Obtiene sesiones recientes de investigación de precios.
 */
export async function getResearchHistorySecure(): Promise<{
    success: boolean;
    data?: Array<Record<string, unknown>>;
    error?: string;
}> {
    try {
        const res = await query(`
            SELECT 
                session_id,
                COUNT(*) as total_products,
                COUNT(*) FILTER (WHERE status = 'APPLIED') as applied_count,
                COUNT(*) FILTER (WHERE market_price_avg > 0) as found_count,
                MIN(researched_at) as started_at,
                MAX(researched_at) as ended_at,
                ROUND(AVG(price_diff_percent)::numeric, 2) as avg_diff_percent
            FROM price_research_results
            GROUP BY session_id
            ORDER BY MIN(researched_at) DESC
            LIMIT 20
        `);

        return { success: true, data: res.rows };

    } catch (error: unknown) {
        logger.error({ error }, '[PriceResearch] Failed to get history');
        return { success: false, error: 'Error al obtener historial' };
    }
}

/**
 * Obtiene resultados detallados de una sesión.
 */
export async function getSessionResultsSecure(sessionId: string): Promise<{
    success: boolean;
    data?: Array<Record<string, unknown>>;
    error?: string;
}> {
    try {
        const res = await query(`
            SELECT *
            FROM price_research_results
            WHERE session_id = $1
            ORDER BY ABS(price_diff_percent) DESC
        `, [sessionId]);

        return { success: true, data: res.rows };

    } catch (error: unknown) {
        logger.error({ error }, '[PriceResearch] Failed to get session results');
        return { success: false, error: 'Error al obtener resultados' };
    }
}
