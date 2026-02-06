'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';

interface AdjustPricesPayload {
    mode: 'SINGLE' | 'ALL';
    percentage: number;
    pin: string;
    sku?: string;
}

export async function adjustPrices(payload: AdjustPricesPayload) {
    const { mode, percentage, pin, sku } = payload;

    // 1. Security Check
    // 1. Security Check
    const correctPin = process.env.ADMIN_ACTION_PIN;
    const isDevPin = pin === '1213';

    // Allow if matches ENV or if it's the dev/fallback pin 1213
    if ((!correctPin && !isDevPin) || (correctPin && pin !== correctPin && !isDevPin)) {
        logger.warn('[Pricing] Invalid PIN attempt');
        return { success: false, error: 'PIN incorrecto' };
    }

    // 2. Validate Input
    if (percentage === 0) {
        return { success: false, error: 'El porcentaje no puede ser 0' };
    }

    if (mode === 'SINGLE' && !sku) {
        return { success: false, error: 'SKU es requerido para ajuste individual' };
    }

    // 3. Calculate Factor
    const factor = 1 + (percentage / 100);

    try {
        let result;

        if (mode === 'ALL') {
            // Update ALL products in Catalog
            result = await query(`
                UPDATE products 
                SET 
                    sale_price = ROUND(sale_price * $1),
                    updated_at = NOW()
                WHERE sale_price > 0
            `, [factor]);

            // Update ALL inventory batches
            await query(`
                UPDATE inventory_batches 
                SET 
                    sale_price = ROUND(sale_price * $1),
                    updated_at = NOW()
                WHERE sale_price > 0
            `, [factor]);

        } else {
            // Update SINGLE product in Catalog
            result = await query(`
                UPDATE products 
                SET 
                    sale_price = ROUND(sale_price * $1),
                    updated_at = NOW()
                WHERE sku = $2
            `, [factor, sku]);

            // Update SINGLE product batches
            await query(`
                UPDATE inventory_batches 
                SET 
                    sale_price = ROUND(sale_price * $1),
                    updated_at = NOW()
                WHERE sku = $2
            `, [factor, sku]);
        }

        logger.info(`[Pricing] Updated prices. Mode: ${mode}, Factor: ${factor}, Affected: ${result.rowCount}`);

        // 4. Log History
        const { logPriceAdjustment } = await import('@/actions/price-history');
        await logPriceAdjustment({
            mode,
            percentage,
            appliedFactor: factor,
            affectedCount: result.rowCount || 0,
            sku,
            userName: 'Admin' // In strict env, get from session
        });

        // 5. Revalidate
        revalidatePath('/inventory');

        return {
            success: true,
            message: `Precios actualizados correctamente (${result.rowCount} productos afectados)`
        };

    } catch (error: any) {
        logger.error({ error }, '[Pricing] Failed to update prices');
        return { success: false, error: 'Error al actualizar precios' };
    }
}
