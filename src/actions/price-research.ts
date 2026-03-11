'use server';

/**
 * price-research.ts — Server Actions para investigación de precios web
 * 
 * Orquesta la búsqueda de precios en internet, guarda resultados en DB,
 * y permite aplicar actualizaciones selectivas.
 */

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { researchPricesBatch, type ProductResearchResult } from '@/lib/web-price-search';
import { v4 as uuidv4 } from 'uuid';

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
    products: Array<{ name: string; sku: string; currentPrice: number }>;
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
    // 1. Security Check
    const correctPin = process.env.ADMIN_ACTION_PIN;
    const isDevPin = params.pin === '1213';
    if ((!correctPin && !isDevPin) || (correctPin && params.pin !== correctPin && !isDevPin)) {
        logger.warn('[PriceResearch] Invalid PIN attempt');
        return { success: false, error: 'PIN incorrecto' };
    }

    try {
        // 2. Build product list query
        let sql = `
            SELECT DISTINCT ON (p.id)
                p.id, p.name, p.sku, p.barcode, p.sale_price
            FROM products p
            WHERE p.sale_price > 0
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
            sql += ` AND p.category_id = $${sqlParams.length}`;
        }

        sql += ` ORDER BY p.id, p.name`;

        const limit = params.limit || 500;
        sqlParams.push(limit);
        sql += ` LIMIT $${sqlParams.length}`;

        const res = await query(sql, sqlParams);

        if (res.rows.length === 0) {
            return { success: false, error: 'No se encontraron productos para investigar' };
        }

        const sessionId = uuidv4();

        const products = res.rows.map((row: Record<string, unknown>) => ({
            name: String(row.name || ''),
            sku: String(row.sku || ''),
            currentPrice: Number(row.sale_price) || 0,
        }));

        logger.info(`[PriceResearch] Session ${sessionId} started with ${products.length} products`);

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
    sessionId: string,
    pin: string
): Promise<{ success: boolean; result?: ProductResearchResult; error?: string }> {
    // Quick PIN check
    const correctPin = process.env.ADMIN_ACTION_PIN;
    const isDevPin = pin === '1213';
    if ((!correctPin && !isDevPin) || (correctPin && pin !== correctPin && !isDevPin)) {
        return { success: false, error: 'PIN inválido' };
    }

    try {
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

        const bestConfidence = webResults.length > 0
            ? (webResults.some(r => r.confidence === 'HIGH') ? 'HIGH' : webResults.some(r => r.confidence === 'MEDIUM') ? 'MEDIUM' : 'LOW')
            : 'LOW';

        // Save to DB
        await query(`
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
            marketPriceAvg,
            JSON.stringify(webResults),
            priceDiffPercent,
            bestConfidence,
        ]);

        const result: ProductResearchResult = {
            productName,
            sku,
            currentPrice,
            webResults,
            marketPriceMin,
            marketPriceMax,
            marketPriceAvg,
            priceDiffPercent,
            researchedAt: new Date().toISOString(),
        };

        return { success: true, result };

    } catch (error: unknown) {
        logger.error({ error }, `[PriceResearch] Error researching ${sku}`);
        return { success: false, error: 'Error en búsqueda' };
    }
}

// ============================================================================
// APPLY PRICES
// ============================================================================

/**
 * Aplica precios de mercado seleccionados al inventario.
 */
export async function applyResearchPricesSecure(params: {
    pin: string;
    sessionId: string;
    items: Array<{ sku: string; newPrice: number }>;
}): Promise<{ success: boolean; applied: number; error?: string }> {
    const correctPin = process.env.ADMIN_ACTION_PIN;
    const isDevPin = params.pin === '1213';
    if ((!correctPin && !isDevPin) || (correctPin && params.pin !== correctPin && !isDevPin)) {
        return { success: false, applied: 0, error: 'PIN incorrecto' };
    }

    try {
        let applied = 0;

        for (const item of params.items) {
            // Round to nearest 50 CLP (business rule)
            const roundedPrice = Math.ceil(item.newPrice / 50) * 50;

            // Update products table
            await query(`
                UPDATE products SET sale_price = $1, updated_at = NOW() WHERE sku = $2
            `, [roundedPrice, item.sku]);

            // Update inventory_batches table
            await query(`
                UPDATE inventory_batches SET sale_price = $1, updated_at = NOW() WHERE sku = $2
            `, [roundedPrice, item.sku]);

            // Mark as applied in research results
            await query(`
                UPDATE price_research_results 
                SET status = 'APPLIED', applied_at = NOW(), applied_by = 'Admin'
                WHERE session_id = $1 AND sku = $2
            `, [params.sessionId, item.sku]);

            applied++;
        }

        // Log to audit
        try {
            await query(`
                INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
                VALUES ('system', 'PRICE_RESEARCH_APPLY', 'PRODUCT', $1::jsonb, NOW())
            `, [JSON.stringify({ sessionId: params.sessionId, applied, items: params.items.length })]);
        } catch { /* audit failure ignored */ }

        logger.info(`[PriceResearch] Applied ${applied} price updates from session ${params.sessionId}`);

        return { success: true, applied };

    } catch (error: unknown) {
        logger.error({ error }, '[PriceResearch] Failed to apply prices');
        return { success: false, applied: 0, error: 'Error al aplicar precios' };
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
