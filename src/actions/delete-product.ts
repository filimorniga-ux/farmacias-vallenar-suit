'use server';

/**
 * Delete Product Server Action
 * Deletes a product from both products and inventory_batches tables
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';

const DeleteProductSchema = z.object({
    productId: z.string().uuid('ID de producto inválido'),
    userId: z.string().uuid('ID de usuario inválido'),
    managerPin: z.string().min(4, 'PIN requerido'),
});

const MANAGER_ROLES = ['GERENTE_GENERAL', 'ADMIN'];

async function validatePin(
    client: any,
    pin: string,
    allowedRoles: string[]
): Promise<{ valid: boolean; user?: { id: string; name: string } }> {
    try {
        const usersRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [allowedRoles]);

        for (const user of usersRes.rows) {
            if (user.access_pin_hash) {
                const valid = await bcrypt.compare(pin, user.access_pin_hash);
                if (valid) return { valid: true, user: { id: user.id, name: user.name } };
            } else if (user.access_pin === pin) {
                return { valid: true, user: { id: user.id, name: user.name } };
            }
        }
        return { valid: false };
    } catch (e) {
        return { valid: false };
    }
}

export async function deleteProductSecure(
    productId: string,
    userId: string,
    managerPin: string
): Promise<{ success: boolean; error?: string }> {

    // Validate inputs
    const validated = DeleteProductSchema.safeParse({ productId, userId, managerPin });
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0].message
        };
    }

    // Get DB Client for transaction
    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    let authorizedUser: { id: string; name: string } | undefined;

    try {
        await client.query('BEGIN');

        // 1. Validate Manager PIN
        const pinCheck = await validatePin(client, managerPin, MANAGER_ROLES);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return {
                success: false,
                error: 'PIN de Gerente o Administrador incorrecto'
            };
        }
        authorizedUser = pinCheck.user;

        // 2. CHECK DEPENDENCIES (Check-First Strategy)
        // Check if any batch of this product has sales
        const dependenciesCheck = await client.query(`
            SELECT 1 
            FROM sale_items si
            JOIN inventory_batches ib ON si.batch_id = ib.id
            WHERE ib.product_id = $1
            LIMIT 1
        `, [productId]);

        const hasSales = (dependenciesCheck.rowCount || 0) > 0;

        if (hasSales) {
            // STRATEGY: SOFT DELETE
            // Product has history, cannot hard delete.
            console.log(`[DELETE_PRODUCT] Product ${productId} has sales. Performing Soft Delete.`);

            await client.query(`
                UPDATE products 
                SET is_active = false,
                    deactivated_at = NOW(),
                    deactivation_reason = 'Archivado por usuario (tiene ventas históricas)',
                    updated_at = NOW()
                WHERE id = $1
            `, [productId]);

            // Optional: Deactivate batches too if needed, but product inactive is usually enough.
            // For completeness, we mark batches as inactive to prevent appearing in searches if query doesn't join product.
            await client.query(`
                UPDATE inventory_batches
                SET is_active = false, 
                    updated_at = NOW()
                WHERE product_id = $1
            `, [productId]);

            await client.query(`
                INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
                VALUES ($1, 'PRODUCT_ARCHIVED', 'PRODUCT', $2, $3::jsonb, NOW())
            `, [authorizedUser?.id || userId, productId, JSON.stringify({
                reason: 'Has Sales History',
                authorized_by: authorizedUser?.name,
                role: 'GERENTE_GENERAL'
            })]);

        } else {
            // STRATEGY: HARD DELETE
            // Safe to delete physically
            console.log(`[DELETE_PRODUCT] Product ${productId} is clean. Performing Hard Delete.`);

            // Delete batches first (if cascade is not set/reliable)
            await client.query(
                'DELETE FROM inventory_batches WHERE product_id = $1',
                [productId]
            );

            // Delete product
            await client.query(
                'DELETE FROM products WHERE id = $1',
                [productId]
            );

            await client.query(`
                INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
                VALUES ($1, 'PRODUCT_DELETE', 'PRODUCT', $2, $3::jsonb, NOW())
            `, [authorizedUser?.id || userId, productId, JSON.stringify({
                authorized_by: authorizedUser?.name,
                role: 'GERENTE_GENERAL'
            })]);
        }

        await client.query('COMMIT');

        revalidatePath('/inventory');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[DELETE_PRODUCT] Error:', error);

        return {
            success: false,
            error: error.message || 'Error al procesar la eliminación del producto'
        };
    } finally {
        client.release();
    }
}
