'use server';

import { Client } from 'pg';

export interface CartItem {
    id: string; // SKU or Internal ID
    productName: string;
    sku: string;
    unitPrice: number;
    quantity: number;
}

export type SalesResult =
    | { success: true; saleId: string; message: string }
    | { success: false; message: string; errorDetail?: any };

const getClient = () => new Client({ connectionString: process.env.DATABASE_URL });

export async function processSale(cart: CartItem[], branch: string): Promise<SalesResult> {
    if (!cart || cart.length === 0) {
        return { success: false, message: 'El carrito está vacío.' };
    }

    const client = getClient();
    await client.connect();

    try {
        await client.query('BEGIN');

        // 1. Calculate Total
        const totalAmount = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

        // 2. Create Header
        const headerRes = await client.query(`
            INSERT INTO sales_headers (branch_source, total_amount, status)
            VALUES ($1, $2, 'COMPLETED')
            RETURNING id
        `, [branch, totalAmount]);

        const saleId = headerRes.rows[0].id;

        // 3. Process Items & Deduct Stock
        for (const item of cart) {
            // Find Product in specific branch file to deduct stock
            // We assume item.id is the inventory_imports.id OR we assume we match by SKU/Name within branch
            // The prompt says "Using SKU or Barcode". 
            // However, the best practice is using the ID we found during search.

            // Let's rely on item.id being the inventory_imports.id as per our search logic
            const stockRes = await client.query(`
                SELECT raw_stock, raw_title FROM inventory_imports WHERE id = $1 FOR UPDATE
            `, [item.id]);

            if (stockRes.rows.length === 0) {
                // If ID lookup fails (maybe cart persisted?), try backup lookup?? No, fail safe.
                throw new Error(`Producto no encontrado ID: ${item.id}`);
            }

            const currentStock = Number(stockRes.rows[0].raw_stock);

            if (currentStock < item.quantity) {
                throw new Error(`Stock insuficiente para ${item.productName}. Disp: ${currentStock}`);
            }

            // Deduct Stock
            await client.query(`
                UPDATE inventory_imports 
                SET raw_stock = raw_stock - $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [item.quantity, item.id]);

            // Insert Item
            await client.query(`
                INSERT INTO sales_items (sale_id, product_name, sku, quantity, unit_price, subtotal)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [saleId, item.productName, item.sku || 'S/SKU', item.quantity, item.unitPrice, item.quantity * item.unitPrice]);
        }

        await client.query('COMMIT');
        return { success: true, saleId, message: 'Venta registrada con éxito' };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('POS Transaction Failed:', error);
        return { success: false, message: error.message || 'Error al procesar venta' };
    } finally {
        await client.end();
    }
}

export async function searchProductForPOS(query: string, branch: string) {
    if (!query || query.length < 2) return [];

    const client = getClient();
    await client.connect();

    try {
        const cleanQuery = `%${query.trim()}%`;

        let branchFilter = '';
        if (branch === 'SANTIAGO') {
            branchFilter = `AND (source_file ILIKE '%SANTIAGO%' OR raw_branch = 'SANTIAGO')`;
        } else if (branch === 'COLCHAGUA') {
            branchFilter = `AND (source_file ILIKE '%COLCHAGUA%' OR raw_branch = 'COLCHAGUA')`;
        }

        const sql = `
            SELECT 
                id,
                raw_title as name,
                raw_sku as sku,
                raw_price as price,
                raw_stock as stock,
                raw_isp_code as isp_code,
                raw_barcodes as barcodes
            FROM inventory_imports
            WHERE 
                (raw_title ILIKE $1 OR raw_barcodes ILIKE $1 OR raw_sku ILIKE $1)
                ${branchFilter}
                AND raw_stock > 0
            LIMIT 20
        `;

        const res = await client.query(sql, [cleanQuery]);

        return res.rows.map(row => ({
            id: row.id,
            name: row.name,
            sku: row.sku,
            price: Number(row.price),
            stock: Number(row.stock),
            ispCode: row.isp_code,
            barcodes: row.barcodes
        }));

    } catch (error) {
        console.error("POS Search Error:", error);
        return [];
    } finally {
        await client.end();
    }
}
