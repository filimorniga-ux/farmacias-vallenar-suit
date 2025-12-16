'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';

export interface ProductSupplier {
    id: string;
    product_id: string;
    supplier_id: string;
    supplier_sku?: string;
    last_cost: number;
    is_preferred: boolean;
    delivery_days: number;
    supplier_name?: string; // Nested from join
}

// --- Data Fetching ---

export async function getProductDetails(productId: string) {
    try {
        // 1. Fetch Basic Product Info
        const productRes = await query('SELECT * FROM products WHERE id = $1', [productId]);
        if ((productRes.rowCount ?? 0) === 0) return { success: false, error: 'Product not found' };
        const product = productRes.rows[0];

        // 2. Fetch Linked Suppliers
        await ensureProductSuppliersTable();
        const suppliersRes = await query(`
            SELECT ps.*, s.name as supplier_name 
            FROM product_suppliers ps
            JOIN suppliers s ON ps.supplier_id = s.id
            WHERE ps.product_id = $1
            ORDER BY ps.is_preferred DESC, ps.last_cost ASC
        `, [productId]);

        return {
            success: true,
            product,
            suppliers: suppliersRes.rows as ProductSupplier[]
        };

    } catch (error) {
        console.error('Error fetching product details:', error);
        return { success: false, error: 'Failed to fetch details' };
    }
}

export async function getSuppliersForProduct(productId: string) {
    try {
        await ensureProductSuppliersTable();
        const res = await query(`
            SELECT ps.*, s.name as supplier_name
            FROM product_suppliers ps
            JOIN suppliers s ON ps.supplier_id = s.id
            WHERE ps.product_id = $1
        `, [productId]);
        return { success: true, data: res.rows };
    } catch (error) {
        return { success: false, error: 'Failed to fetch suppliers' };
    }
}

// --- Actions ---

export async function linkProductToSupplier(
    productId: string,
    supplierId: string,
    cost: number,
    sku?: string,
    deliveryDays: number = 1
) {
    try {
        await ensureProductSuppliersTable();

        // Check if exists
        const existing = await query(
            'SELECT id FROM product_suppliers WHERE product_id = $1 AND supplier_id = $2',
            [productId, supplierId]
        );

        if ((existing.rowCount ?? 0) > 0) {
            // Update
            await query(`
                UPDATE product_suppliers 
                SET last_cost = $1, supplier_sku = $2, delivery_days = $3, created_at = NOW()
                WHERE product_id = $4 AND supplier_id = $5
            `, [cost, sku, deliveryDays, productId, supplierId]);
        } else {
            // Insert
            const id = uuidv4();
            await query(`
                INSERT INTO product_suppliers (
                    id, product_id, supplier_id, last_cost, supplier_sku, delivery_days, is_preferred
                ) VALUES ($1, $2, $3, $4, $5, $6, false)
            `, [id, productId, supplierId, cost, sku, deliveryDays]);
        }

        revalidatePath('/inventory');
        revalidatePath(`/inventory/products/${productId}`);
        return { success: true };

    } catch (error) {
        console.error('Error linking supplier:', error);
        return { success: false, error: 'Failed to link supplier' };
    }
}

export async function setPreferredSupplier(productId: string, supplierId: string) {
    const client = await import('@/lib/db').then(mod => mod.pool.connect());
    try {
        await client.query('BEGIN');
        // Reset all for this product
        await client.query('UPDATE product_suppliers SET is_preferred = false WHERE product_id = $1', [productId]);
        // Set new preferred
        await client.query('UPDATE product_suppliers SET is_preferred = true WHERE product_id = $1 AND supplier_id = $2', [productId, supplierId]);
        await client.query('COMMIT');

        revalidatePath(`/inventory/products/${productId}`);
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Failed to set preference' };
    } finally {
        client.release();
    }
}

// --- Migrations ---

async function ensureProductSuppliersTable() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS product_suppliers (
                id UUID PRIMARY KEY,
                product_id UUID NOT NULL, -- REFERENCES products(id) inferred
                supplier_id UUID NOT NULL, -- REFERENCES suppliers(id) inferred
                supplier_sku VARCHAR(100),
                last_cost DECIMAL(10, 2) DEFAULT 0,
                is_preferred BOOLEAN DEFAULT FALSE,
                delivery_days INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(product_id, supplier_id)
            );
        `);
        // Index
        await query(`CREATE INDEX IF NOT EXISTS idx_ps_product ON product_suppliers(product_id);`);
    } catch (e) {
        console.error('Migration failed:', e);
    }
}
