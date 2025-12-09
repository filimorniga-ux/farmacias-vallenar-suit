'use server';

import { query } from '@/lib/db';

interface Params {
    sku: boolean;
    lot: boolean;
    expiry: boolean;
    price: boolean;
}

export async function findDuplicateBatches(params: Params) {
    try {
        // Dynamic GROUP BY clause construction
        const groups = [];
        const selects = ['sku', 'MAX(name) as name', 'COUNT(*) as count'];

        if (params.sku) groups.push('sku');
        if (params.lot) {
            groups.push('lot_number');
            selects.push('lot_number');
        }
        if (params.expiry) {
            groups.push('expiry_date');
            selects.push('expiry_date');
        }
        if (params.price) {
            groups.push('sale_price');
            selects.push('sale_price');
        }

        // We need at least one group criteria
        if (groups.length === 0) return { success: false, error: 'No criteria selected' };

        const groupByClause = groups.join(', ');
        const selectClause = selects.join(', ');

        const sql = `
            SELECT ${selectClause}
            FROM inventory_batches
            GROUP BY ${groupByClause}
            HAVING COUNT(*) > 1
            ORDER BY count DESC
            LIMIT 50
        `;

        const res = await query(sql);

        return { success: true, data: res.rows };
    } catch (e) {
        console.error('Error finding duplicates:', e);
        return { success: false, error: 'DB Error' };
    }
}
