'use server';

import { getClient, query } from '@/lib/db';

export interface CartItem {
    id: string; // SKU or Internal ID
    name: string;
    sku: string;
    price: number;
    quantity: number;
}

export type SalesResult =
    | { success: true; saleId: string; message: string }
    | { success: false; message: string; errorDetail?: any };


export async function processSale(cart: CartItem[], branch: string): Promise<SalesResult> {
    if (!cart || cart.length === 0) {
        return { success: false, message: 'El carrito está vacío.' };
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');
        const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const headerRes = await client.query(`
            INSERT INTO sales_headers (branch_source, total_amount, status)
            VALUES ($1, $2, 'COMPLETED')
            RETURNING id
        `, [branch, totalAmount]);
        const saleId = headerRes.rows[0].id;
        for (const item of cart) {
            const stockRes = await client.query(`
                SELECT raw_stock, raw_title FROM inventory_imports WHERE id = $1 FOR UPDATE
            `, [item.id]);
            if (stockRes.rows.length === 0) {
                throw new Error(`Producto no encontrado ID: ${item.id}`);
            }
            const currentStock = Number(stockRes.rows[0].raw_stock);
            if (currentStock < item.quantity) {
                throw new Error(`Stock insuficiente para ${item.name}. Disp: ${currentStock}`);
            }
            await client.query(`
                UPDATE inventory_imports 
                SET raw_stock = raw_stock - $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [item.quantity, item.id]);
            await client.query(`
                INSERT INTO sales_items (sale_id, product_name, sku, quantity, unit_price, subtotal)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [saleId, item.name, item.sku || 'S/SKU', item.quantity, item.price, item.quantity * item.price]);
        }
        await client.query('COMMIT');
        return { success: true, saleId, message: 'Venta registrada con éxito' };
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('POS Transaction Failed:', error);
        return { success: false, message: error.message || 'Error al procesar venta' };
    } finally {
        client.release();
    }
}

export async function searchProductForPOS(queryTerm: string, branch: string) {
    if (!queryTerm || queryTerm.length < 2) return [];

    try {
        const cleanQuery = `%${queryTerm.trim()}%`;
        let branchFilter = '';
        if (branch === 'SANTIAGO') {
            branchFilter = `AND (source_file ILIKE '%SANTIAGO%' OR raw_branch = 'SANTIAGO')`;
        } else if (branch === 'COLCHAGUA') {
            branchFilter = `AND (source_file ILIKE '%COLCHAGUA%' OR raw_branch = 'COLCHAGUA')`;
        }

        const sql = `
            SELECT id, raw_title as name, raw_sku as sku, raw_price as price,
                   raw_stock as stock, raw_isp_code as isp_code, raw_barcodes as barcodes
            FROM inventory_imports
            WHERE (raw_title ILIKE $1 OR raw_barcodes ILIKE $1 OR raw_sku ILIKE $1)
            ${branchFilter} AND raw_stock > 0
            LIMIT 20
        `;

        const res = await query(sql, [cleanQuery]);
        return res.rows.map((row: any) => ({
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
    }
}
