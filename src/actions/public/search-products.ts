'use server';

import { query } from '@/lib/db';

export interface ProductResult {
    id: string;
    name: string;
    sku: string;
    is_bioequivalent: boolean;
    stock: number;
    price: number;
    location_name?: string;
    description?: string;
    format?: string;
    laboratory?: string;
    dci?: string;
}

// Enhanced Search with Filters and Normalized Data
export async function searchProductsAction(
    term: string,
    filters?: { categoryId?: number, labId?: number, actionId?: number }
) {
    // If no term and no filters, return empty (prevent full scan unless needed)
    if ((!term || term.length < 3) && (!filters || Object.keys(filters).length === 0)) return [];

    try {
        const params: any[] = [];
        let whereClauses: string[] = [];

        // 1. Text Search Filter
        if (term) {
            params.push(`%${term}%`);
            whereClauses.push(`(
                i.processed_title ILIKE $${params.length} 
                OR i.raw_title ILIKE $${params.length} 
                OR i.raw_sku ILIKE $${params.length}
                OR i.raw_active_principle ILIKE $${params.length}
                OR i.raw_barcodes ILIKE $${params.length}
            )`);
        }

        // 2. Metadata Filters
        if (filters?.categoryId) {
            params.push(filters.categoryId);
            whereClauses.push(`i.normalized_category_id = $${params.length}`);
        }
        if (filters?.labId) {
            params.push(filters.labId);
            whereClauses.push(`i.normalized_lab_id = $${params.length}`);
        }
        if (filters?.actionId) {
            params.push(filters.actionId);
            whereClauses.push(`i.normalized_action_id = $${params.length}`);
        }

        const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        const sql = `
            SELECT 
                MIN(i.id::text) as id,
                COALESCE(MAX(i.processed_title), MAX(i.raw_title)) as name,
                MAX(i.raw_sku) as sku,
                MAX(i.raw_active_principle) as dci,
                MAX(l.name) as laboratory,  -- Use Normalized Lab Name
                MAX(c.name) as category,    -- Normalized Category
                MAX(a.name) as action,      -- Normalized Action
                MAX(i.raw_misc->>'formato') as format,
                -- Check bioequivalence
                BOOL_OR(
                    (i.raw_misc->>'bioequivalente') IS NOT NULL 
                    OR (i.raw_misc->>'bioequivalencia') IS NOT NULL 
                    OR i.raw_title ILIKE '%BIOEQUIVALENTE%'
                ) as is_bioequivalent,
                SUM(i.raw_stock) as stock,
                MAX(i.raw_price) as price
            FROM inventory_imports i
            LEFT JOIN categories c ON i.normalized_category_id = c.id
            LEFT JOIN laboratories l ON i.normalized_lab_id = l.id
            LEFT JOIN therapeutic_actions a ON i.normalized_action_id = a.id
            ${whereSQL}
            GROUP BY COALESCE(i.processed_title, i.raw_title), i.raw_active_principle, l.name, c.name, a.name
            ORDER BY (SUM(i.raw_stock) > 0) DESC, price ASC
            LIMIT 50
        `;

        const result = await query(sql, params);

        console.log(`✅ [Search AI] Encontrados ${result.rows.length} productos con filtros.`);

        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            sku: row.sku || 'S/SKU',
            is_bioequivalent: row.is_bioequivalent || false,
            stock: Number(row.stock),
            price: Number(row.price),
            laboratory: row.laboratory || 'Generico',
            category: row.category || 'Sin Categoría',
            action: row.action || '',
            dci: row.dci || '',
            format: row.format || '',
            location_name: 'Global'
        }));

    } catch (error) {
        console.error('❌ [Search Action] Error:', error);
        return [];
    }
}
