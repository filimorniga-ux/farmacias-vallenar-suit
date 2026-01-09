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
    } catch {
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

        // 2. Delete from products table
        await client.query(
            'DELETE FROM products WHERE id = $1',
            [productId]
        );

        // 3. Delete from inventory_batches table (cascade)
        await client.query(
            'DELETE FROM inventory_batches WHERE product_id = $1 OR id = $1',
            [productId]
        );

        // 4. Audit Log
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'PRODUCT_DELETE', 'PRODUCT', $2, $3::jsonb, NOW())
        `, [pinCheck.user?.id || userId, productId, JSON.stringify({
            deleted_by: pinCheck.user?.name,
            authorized_by_role: 'GERENTE_GENERAL'
        })]);

        await client.query('COMMIT');

        revalidatePath('/inventory');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[DELETE_PRODUCT] Error:', error);
        return {
            success: false,
            error: error.message || 'Error al eliminar producto'
        };
    } finally {
        client.release();
    }
}
