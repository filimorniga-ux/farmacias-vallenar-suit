'use server';

import { Client } from 'pg';

const getClient = () => new Client({ connectionString: process.env.DATABASE_URL });

export interface InventorySearchResult {
    id: string;
    source: string;
    title: string;
    price: number;
    stock: number;
    sku: string;
    branch: string;
    ispCode: string;
}

export async function searchUnifiedInventory(query: string): Promise<InventorySearchResult[]> {
    if (!query || query.trim().length < 2) return [];

    const client = getClient();
    await client.connect();

    try {
        const cleanQuery = `%${query.trim()}%`;

        const sql = `
      SELECT 
        id,
        source_file as source,
        raw_title as title,
        raw_price as price,
        raw_stock as stock,
        raw_sku as sku,
        raw_branch as branch,
        raw_isp_code as isp_code
      FROM inventory_imports
      WHERE 
        raw_title ILIKE $1 
        OR raw_barcodes ILIKE $1 
        OR raw_sku ILIKE $1
      ORDER BY raw_price ASC
      LIMIT 50
    `;

        const res = await client.query(sql, [cleanQuery]);

        return res.rows.map(row => ({
            id: row.id,
            source: row.source,
            title: row.title,
            price: Number(row.price),
            stock: Number(row.stock),
            sku: row.sku || '',
            branch: row.branch || '',
            ispCode: row.isp_code || ''
        }));

    } catch (error) {
        console.error('Error searching inventory:', error);
        return [];
    } finally {
        await client.end();
    }
}
