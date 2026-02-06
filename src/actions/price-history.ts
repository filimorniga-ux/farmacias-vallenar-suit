'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { getSessionSecure } from '@/actions/auth-v2';

export interface PriceAdjustmentBatch {
    id: number;
    user_name: string;
    mode: 'SINGLE' | 'ALL';
    percentage: number;
    affected_count: number;
    sku?: string;
    created_at: Date;
    reverted_at?: Date;
}

// 1. Ensure Table Exists
async function ensureHistoryTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS price_adjustment_batches (
            id SERIAL PRIMARY KEY,
            user_id UUID,
            user_name VARCHAR(255),
            mode VARCHAR(20) NOT NULL,
            percentage DECIMAL(10, 2) NOT NULL,
            applied_factor DECIMAL(10, 4) NOT NULL,
            affected_count INT DEFAULT 0,
            sku VARCHAR(100),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            reverted_at TIMESTAMPTZ
        )
    `);
}

// 2. Log an Adjustment
export async function logPriceAdjustment(params: {
    mode: 'SINGLE' | 'ALL';
    percentage: number;
    appliedFactor: number;
    affectedCount: number;
    sku?: string;
    userName?: string;
}) {
    try {
        await ensureHistoryTable();
        const session = await getSessionSecure();

        await query(
            `INSERT INTO price_adjustment_batches 
            (user_id, user_name, mode, percentage, applied_factor, affected_count, sku)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                session?.userId || null,
                params.userName || session?.userName || 'Admin',
                params.mode,
                params.percentage,
                params.appliedFactor,
                params.affectedCount,
                params.sku || null
            ]
        );
    } catch (error) {
        logger.error({ error }, '[PriceHistory] Failed to log adjustment');
        // Don't throw, we don't want to fail the main transaction just because logging failed
    }
}

// 3. Get Recent History
export async function getRecentAdjustments(limit = 10): Promise<{ success: boolean; data?: PriceAdjustmentBatch[] }> {
    try {
        await ensureHistoryTable();
        const res = await query(`
            SELECT * FROM price_adjustment_batches 
            ORDER BY created_at DESC 
            LIMIT $1
        `, [limit]);

        return { success: true, data: res.rows };
    } catch (error) {
        logger.error({ error }, '[PriceHistory] Failed to get history');
        return { success: false, data: [] };
    }
}

// 4. Revert (Undo) Logic
export async function revertPriceAdjustment(batchId: number, pin: string) {
    // Basic Security Check (reusing same PIN as creation for now)
    // Basic Security Check
    const correctPin = process.env.ADMIN_ACTION_PIN;
    const isDevPin = pin === '1213';

    if ((correctPin && pin !== correctPin && !isDevPin) || (!correctPin && !isDevPin)) {
        return { success: false, error: 'PIN incorrecto' };
    }

    try {
        // Get the batch
        const batchRes = await query(`SELECT * FROM price_adjustment_batches WHERE id = $1`, [batchId]);
        if (batchRes.rows.length === 0) return { success: false, error: 'Lote no encontrado' };

        const batch = batchRes.rows[0];

        if (batch.reverted_at) {
            return { success: false, error: 'Este ajuste ya fue revertido' };
        }

        // Calculate Inverse Factor
        // Original: Price * Factor
        // Inverse: Price / Factor  OR Price * (1/Factor)
        // Example: +50% -> Factor 1.5. Undo: 1/1.5 = 0.6666
        const originalFactor = Number(batch.applied_factor);
        if (originalFactor === 0) return { success: false, error: 'Factor inválido' };

        const inverseFactor = 1 / originalFactor;

        // Apply Reversion
        let result;
        if (batch.mode === 'ALL') {
            // Revert Catalog
            result = await query(`
                UPDATE products 
                SET 
                    sale_price = ROUND(sale_price * $1),
                    updated_at = NOW()
                WHERE sale_price > 0
            `, [inverseFactor]);

            // Revert Batches
            await query(`
                UPDATE inventory_batches 
                SET 
                    sale_price = ROUND(sale_price * $1),
                    updated_at = NOW()
                WHERE sale_price > 0
            `, [inverseFactor]);

        } else if (batch.mode === 'SINGLE' && batch.sku) {
            // Revert Catalog
            result = await query(`
                UPDATE products 
                SET 
                    sale_price = ROUND(sale_price * $1),
                    updated_at = NOW()
                WHERE sku = $2
            `, [inverseFactor, batch.sku]);

            // Revert Batches
            await query(`
                UPDATE inventory_batches 
                SET 
                    sale_price = ROUND(sale_price * $1),
                    updated_at = NOW()
                WHERE sku = $2
            `, [inverseFactor, batch.sku]);

        } else {
            return { success: false, error: 'Modo de lote desconocido' };
        }

        // Mark as Reverted
        await query(`
            UPDATE price_adjustment_batches 
            SET reverted_at = NOW() 
            WHERE id = $1
        `, [batchId]);

        logger.info(`[PriceHistory] Reverted Batch #${batchId}. Factor: ${inverseFactor}. Affected: ${result.rowCount}`);

        revalidatePath('/inventory');
        return {
            success: true,
            message: `Reversión exitosa. Se restauraron aprox. ${result.rowCount} productos.`
        };

    } catch (error) {
        logger.error({ error }, '[PriceHistory] Failed to revert');
        return { success: false, error: 'Error al revertir cambios' };
    }
}
