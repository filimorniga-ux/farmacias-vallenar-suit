'use server';

import { query } from '@/lib/db';

export interface PublicProduct {
    id: number;
    name: string;
    dci: string | null;
    status: 'Disponible' | 'Agotado';
}

export async function searchPublicProducts(term: string): Promise<PublicProduct[]> {
    if (!term || term.length < 3) {
        return [];
    }

    try {
        // Query database for products matching the term
        // We select stock to calculate status, but we DO NOT return it to the client
        const sql = `
            SELECT id, name, dci, stock
            FROM products
            WHERE name ILIKE $1 OR dci ILIKE $1
            LIMIT 20
        `;

        const result = await query(sql, [`%${term}%`]);

        // Transform result to hide sensitive data
        const products: PublicProduct[] = result.rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            dci: row.dci || '',
            status: row.stock > 0 ? 'Disponible' : 'Agotado'
        }));

        return products;
    } catch (error) {
        console.error('Error searching public products:', error);
        return [];
    }
}
