'use server';

/**
 * Delete Product Server Action
 * Deletes a product from both products and inventory_batches tables
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const DeleteProductSchema = z.object({
    productId: z.string().uuid('ID de producto inválido'),
    userId: z.string().uuid('ID de usuario inválido'),
});

export async function deleteProductSecure(
    productId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {

    // Validate inputs
    const validated = DeleteProductSchema.safeParse({ productId, userId });
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0].message
        };
    }

    try {
        // Delete from products table (new products)
        await query(
            'DELETE FROM products WHERE id = $1',
            [productId]
        );

        // Delete from inventory_batches table (cascade delete batches)
        await query(
            'DELETE FROM inventory_batches WHERE product_id = $1 OR id = $1',
            [productId]
        );

        // TODO: Add audit log entry
        // await logAuditAction({
        //     userId,
        //     actionCode: 'PRODUCT_DELETE',
        //     entityType: 'PRODUCT',
        //     entityId: productId,
        // });

        revalidatePath('/inventory');
        return { success: true };

    } catch (error: any) {
        console.error('[DELETE_PRODUCT] Error:', error);
        return {
            success: false,
            error: error.message || 'Error al eliminar producto'
        };
    }
}
