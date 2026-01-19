'use server';

import { query, getClient } from '../lib/db';
import { createNotificationSecure } from '@/actions/notifications-v2';
import * as Sentry from "@sentry/nextjs";

// ============================================================================
// TYPES
// ============================================================================

export interface PriceAuditBatch {
    id: number;
    batch_number: number;
    month_year: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED';
    total_products: number;
    processed_products: number;
    last_processed_offset: number;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
}

export interface PriceAuditResult {
    id: number;
    batch_id: number;
    product_id: string;
    sku: string;
    product_name: string;
    current_price: number;
    cost_price: number;
    competitor_min: number | null;
    competitor_max: number | null;
    competitor_avg: number | null;
    suggested_price: number | null;
    margin_percent: number | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_VIABLE';
    rejection_reason: string | null;
    sources_found: number;
    raw_search_data: any;
    created_at: string;
}

export interface ProductForAudit {
    id: string;
    sku: string;
    name: string;
    price_sell_box: number;
    cost_net: number;
    stock_actual: number;
    category: string;
}

// ============================================================================
// HELPER - Get session
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string } | null> {
    try {
        const { getSessionSecure } = await import('@/actions/auth-v2');
        return await getSessionSecure();
    } catch {
        return null;
    }
}

// ============================================================================
// INITIALIZATION - Create tables if not exist
// ============================================================================

async function ensureTablesExist() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS price_audit_batches (
                id SERIAL PRIMARY KEY,
                batch_number INT NOT NULL,
                month_year VARCHAR(7) NOT NULL,
                status VARCHAR(20) DEFAULT 'PENDING',
                total_products INT DEFAULT 0,
                processed_products INT DEFAULT 0,
                last_processed_offset INT DEFAULT 0,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(batch_number, month_year)
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS price_audit_results (
                id SERIAL PRIMARY KEY,
                batch_id INT REFERENCES price_audit_batches(id) ON DELETE CASCADE,
                product_id UUID NOT NULL,
                sku VARCHAR(100),
                product_name VARCHAR(500),
                current_price DECIMAL(12,2),
                cost_price DECIMAL(12,2),
                competitor_min DECIMAL(12,2),
                competitor_max DECIMAL(12,2),
                competitor_avg DECIMAL(12,2),
                suggested_price DECIMAL(12,2),
                margin_percent DECIMAL(5,2),
                status VARCHAR(20) DEFAULT 'PENDING',
                rejection_reason TEXT,
                sources_found INT DEFAULT 0,
                raw_search_data JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        await query(`
            CREATE INDEX IF NOT EXISTS idx_price_audit_results_status 
            ON price_audit_results(status)
        `);
    } catch (error) {
        console.error('[PriceAudit] Table creation error:', error);
    }
}

// ============================================================================
// BATCH MANAGEMENT
// ============================================================================

/**
 * Initialize or get batches for current month
 */
export async function initializeMonthlyBatches(): Promise<{ success: boolean; batches?: PriceAuditBatch[]; error?: string }> {
    const session = await getSession();
    if (!session?.userId) {
        return { success: false, error: 'No autorizado' };
    }

    await ensureTablesExist();

    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    try {
        // Check if batches already exist for this month
        const existing = await query(
            `SELECT * FROM price_audit_batches WHERE month_year = $1 ORDER BY batch_number`,
            [monthYear]
        );

        if (existing.rows.length > 0) {
            return { success: true, batches: existing.rows };
        }

        // Get total products with stock > 0
        const countResult = await query(`SELECT COUNT(*) as count FROM products WHERE stock_actual > 0`);
        const totalProducts = parseInt(countResult.rows[0]?.count || '0');
        const productsPerBatch = Math.ceil(totalProducts / 7);

        // Create 7 batches
        const batches: PriceAuditBatch[] = [];
        for (let i = 1; i <= 7; i++) {
            const batchProducts = i < 7 ? productsPerBatch : Math.max(0, totalProducts - (productsPerBatch * 6));
            const result = await query(
                `INSERT INTO price_audit_batches (batch_number, month_year, total_products)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [i, monthYear, batchProducts]
            );
            if (result.rows[0]) batches.push(result.rows[0]);
        }

        return { success: true, batches };
    } catch (error) {
        console.error('[PriceAudit] initializeMonthlyBatches error:', error);
        Sentry.captureException(error);
        return { success: false, error: 'Error al inicializar lotes' };
    }
}

/**
 * Get products for a specific batch
 */
export async function getProductsForBatch(
    batchNumber: number,
    limit: number = 100,
    offset: number = 0
): Promise<{ success: boolean; products?: ProductForAudit[]; total?: number; error?: string }> {
    const session = await getSession();
    if (!session?.userId) {
        return { success: false, error: 'No autorizado' };
    }

    try {
        // Calculate global offset based on batch number
        const countResult = await query(`SELECT COUNT(*) as count FROM products WHERE stock_actual > 0`);
        const totalProducts = parseInt(countResult.rows[0]?.count || '0');
        const productsPerBatch = Math.ceil(totalProducts / 7);
        const batchOffset = (batchNumber - 1) * productsPerBatch;

        const products = await query(
            `SELECT id, sku, name, price_sell_box, cost_net, stock_actual, category
             FROM products
             WHERE stock_actual > 0
             ORDER BY id
             LIMIT $1 OFFSET $2`,
            [limit, batchOffset + offset]
        );

        return {
            success: true,
            products: products.rows,
            total: Math.min(productsPerBatch, totalProducts - batchOffset)
        };
    } catch (error) {
        console.error('[PriceAudit] getProductsForBatch error:', error);
        Sentry.captureException(error);
        return { success: false, error: 'Error al obtener productos' };
    }
}

/**
 * Update batch progress
 */
export async function updateBatchProgress(
    batchId: number,
    processedProducts: number,
    lastOffset: number,
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED'
): Promise<{ success: boolean; error?: string }> {
    try {
        if (status === 'COMPLETED') {
            await query(
                `UPDATE price_audit_batches 
                 SET processed_products = $1, last_processed_offset = $2, status = $3, completed_at = NOW()
                 WHERE id = $4`,
                [processedProducts, lastOffset, status, batchId]
            );

            // 🔔 Price Audit Complete Notification
            try {
                // Count suggestions found in this batch
                const suggestionsRes = await query(
                    `SELECT COUNT(*) as count FROM price_audit_results WHERE batch_id = $1 AND status = 'PENDING'`,
                    [batchId]
                );
                const suggestionsCount = parseInt(suggestionsRes.rows[0]?.count || '0');

                const severity = suggestionsCount > 0 ? 'WARNING' : 'SUCCESS';
                const title = `Auditoría de Precios Finalizada (Lote #${batchId})`;
                const message = suggestionsCount > 0
                    ? `Se analizaron ${processedProducts} productos. Se encontraron ${suggestionsCount} sugerencias de cambio de precio.`
                    : `Se analizaron ${processedProducts} productos sin discrepancias.`;

                await createNotificationSecure({
                    type: 'SYSTEM', // SYSTEM or INVENTORY fits well
                    severity,
                    title,
                    message,
                    metadata: {
                        batchId,
                        processedProducts,
                        suggestionsCount,
                        actionUrl: '/admin/pricing'
                    },
                    // Global system notification (no specific location or user, unless we want to target admins only? 
                    // createNotificationSecure without user/loc defaults to global if schema allows, which strictly speaking we made nullable now)
                });
            } catch (notifError) {
                console.error('[PriceAudit] Failed to send completion notification', notifError);
            }

        } else if (status) {
            await query(
                `UPDATE price_audit_batches 
                 SET processed_products = $1, last_processed_offset = $2, status = $3, started_at = COALESCE(started_at, NOW())
                 WHERE id = $4`,
                [processedProducts, lastOffset, status, batchId]
            );
        } else {
            await query(
                `UPDATE price_audit_batches SET processed_products = $1, last_processed_offset = $2 WHERE id = $3`,
                [processedProducts, lastOffset, batchId]
            );
        }
        return { success: true };
    } catch (error) {
        console.error('[PriceAudit] updateBatchProgress error:', error);
        Sentry.captureException(error);
        throw error;
    }
}

// ============================================================================
// PRICE PROPOSALS
// ============================================================================

/**
 * Save a price proposal from audit
 */
export async function savePriceProposal(proposal: {
    batch_id: number;
    product_id: string;
    sku: string;
    product_name: string;
    current_price: number;
    cost_price: number;
    competitor_min?: number;
    competitor_max?: number;
    competitor_avg?: number;
    suggested_price?: number;
    margin_percent?: number;
    status?: 'PENDING' | 'NOT_VIABLE';
    rejection_reason?: string;
    sources_found?: number;
    raw_search_data?: any;
}): Promise<{ success: boolean; id?: number; error?: string }> {
    try {
        const result = await query(
            `INSERT INTO price_audit_results (
                batch_id, product_id, sku, product_name,
                current_price, cost_price,
                competitor_min, competitor_max, competitor_avg,
                suggested_price, margin_percent,
                status, rejection_reason, sources_found, raw_search_data
            ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id`,
            [
                proposal.batch_id,
                proposal.product_id,
                proposal.sku,
                proposal.product_name,
                proposal.current_price,
                proposal.cost_price,
                proposal.competitor_min || null,
                proposal.competitor_max || null,
                proposal.competitor_avg || null,
                proposal.suggested_price || null,
                proposal.margin_percent || null,
                proposal.status || 'PENDING',
                proposal.rejection_reason || null,
                proposal.sources_found || 0,
                proposal.raw_search_data ? JSON.stringify(proposal.raw_search_data) : null
            ]
        );

        return { success: true, id: result.rows[0]?.id };
    } catch (error) {
        console.error('[PriceAudit] savePriceProposal error:', error);
        Sentry.captureException(error);
        return { success: false, error: 'Error al guardar propuesta' };
    }
}

/**
 * Get pending proposals for review
 */
export async function getPendingProposals(
    limit: number = 100,
    offset: number = 0
): Promise<{ success: boolean; proposals?: PriceAuditResult[]; total?: number; error?: string }> {
    const session = await getSession();
    if (!session?.userId) {
        return { success: false, error: 'No autorizado' };
    }

    try {
        const countResult = await query(`SELECT COUNT(*) as count FROM price_audit_results WHERE status = 'PENDING'`);
        const total = parseInt(countResult.rows[0]?.count || '0');

        const proposals = await query(
            `SELECT * FROM price_audit_results
             WHERE status = 'PENDING'
             ORDER BY 
                CASE WHEN suggested_price < current_price THEN 0 ELSE 1 END,
                (current_price - suggested_price) DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        return { success: true, proposals: proposals.rows, total };
    } catch (error) {
        console.error('[PriceAudit] getPendingProposals error:', error);
        return { success: false, error: 'Error al obtener propuestas' };
    }
}

/**
 * Approve selected proposals and update product prices
 */
export async function approveProposals(
    proposalIds: number[]
): Promise<{ success: boolean; updated?: number; error?: string }> {
    const session = await getSession();
    if (!session?.userId) {
        return { success: false, error: 'No autorizado' };
    }

    if (!proposalIds.length) {
        return { success: false, error: 'No hay propuestas seleccionadas' };
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');
        let updatedCount = 0;

        for (const id of proposalIds) {
            const proposal = await client.query(
                `SELECT * FROM price_audit_results WHERE id = $1 AND status = 'PENDING'`,
                [id]
            );

            if (!proposal.rows[0]) continue;
            const p = proposal.rows[0];
            if (!p.suggested_price) continue;

            // Update product price
            await client.query(
                `UPDATE products SET price_sell_box = $1 WHERE id = $2::uuid`,
                [p.suggested_price, p.product_id]
            );

            // Mark proposal as approved
            await client.query(
                `UPDATE price_audit_results SET status = 'APPROVED' WHERE id = $1`,
                [id]
            );

            updatedCount++;
        }

        await client.query('COMMIT');
        return { success: true, updated: updatedCount };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[PriceAudit] approveProposals error:', error);
        Sentry.captureException(error);
        return { success: false, error: 'Error al aprobar propuestas' };
    } finally {
        client.release();
    }
}

/**
 * Get audit statistics
 */
export async function getAuditStats(): Promise<{
    success: boolean;
    stats?: {
        pending: number;
        approved: number;
        rejected: number;
        not_viable: number;
        avg_savings_percent: number;
    };
    error?: string;
}> {
    const session = await getSession();
    if (!session?.userId) {
        return { success: false, error: 'No autorizado' };
    }

    try {
        const stats = await query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
                COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
                COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected,
                COUNT(*) FILTER (WHERE status = 'NOT_VIABLE') as not_viable,
                COALESCE(AVG(
                    CASE WHEN suggested_price < current_price AND suggested_price IS NOT NULL
                    THEN ((current_price - suggested_price) / NULLIF(current_price, 0) * 100)
                    ELSE 0 END
                ), 0) as avg_savings
            FROM price_audit_results
        `);

        const row = stats.rows[0];
        return {
            success: true,
            stats: {
                pending: parseInt(row?.pending || '0'),
                approved: parseInt(row?.approved || '0'),
                rejected: parseInt(row?.rejected || '0'),
                not_viable: parseInt(row?.not_viable || '0'),
                avg_savings_percent: parseFloat(row?.avg_savings || '0')
            }
        };
    } catch (error) {
        console.error('[PriceAudit] getAuditStats error:', error);
        return { success: false, error: 'Error al obtener estadísticas' };
    }
}
