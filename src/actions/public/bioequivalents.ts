'use server';

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { query } from '@/lib/db';
import { ProductResult } from './search-products';

// Interface for ISP CSV Record
interface ISPRecord {
    'N': string; // Note: Encoding might make this key weird, handle with index if needed
    'Principio Activo': string;
    'Producto ': string; // Note the trailing space in header based on user sample
    'Registro': string;
    'Titular': string;
    'Estado': string;
    'Vigencia': string;
    'Uso / Tratamiento': string;
}

export interface BioequivalentResult {
    registry_number: string;
    product_name: string;
    active_ingredient: string;
    holder: string;
    status: string;
    usage: string;
}

const ISP_FILE_PATH = path.join(process.cwd(), 'data_imports', 'isp_oficial.csv');

/**
 * Searches for Bioequivalents in the ISP CSV file.
 * This reads the file on every request (simple approach) or caches it if memory allows.
 * effective for < 10MB files.
 */
export async function searchBioequivalentsAction(term: string): Promise<BioequivalentResult[]> {
    if (!term || term.length < 3) return [];

    try {
        const fileContent = fs.readFileSync(ISP_FILE_PATH, 'latin1'); // Usually these gov CSVs are latin1/windows-1252

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter: ';',
            trim: true,
            relax_column_count: true
        });

        const normalizedTerm = term.toLowerCase().trim();

        const filtered = records.filter((record: any) => {
            // Flexible matching on keys due to potential encoding issues in headers
            const producto = record['Producto'] || record['Producto '];
            const principio = record['Principio Activo'];

            if (!producto && !principio) return false;

            return (
                (producto && String(producto).toLowerCase().includes(normalizedTerm)) ||
                (principio && String(principio).toLowerCase().includes(normalizedTerm))
            );
        });

        return filtered.slice(0, 50).map((r: any) => ({
            registry_number: r['Registro'] || '',
            product_name: r['Producto'] || r['Producto '] || '',
            active_ingredient: r['Principio Activo'] || '',
            holder: r['Titular'] || '',
            status: r['Estado'] || '',
            usage: r['Uso / Tratamiento'] || ''
        }));

    } catch (error) {
        console.error('❌ Error searching ISP CSV:', error);
        return [];
    }
}

/**
 * Finds products in the LOCAL INVENTORY that match a given Active Ingredient or Name.
 * Used when user clicks on a bioequivalent result.
 */
export async function findInventoryMatchesAction(dciOrName: string): Promise<ProductResult[]> {
    if (!dciOrName) return [];

    try {
        const searchTerm = `%${dciOrName.trim()}%`;

        // Search in Products (Preferred) and Batches
        // Specific logic: Match DCI strongly, then Name
        const sql = `
            WITH matches AS (
                SELECT 
                    id::text,
                    name::text,
                    sku::text,
                    dci::text,
                    laboratory::text,
                    price_sell_box as price,
                    stock_actual as stock,
                    units_per_box,
                    is_bioequivalent,
                    CASE 
                        WHEN dci ILIKE $1 THEN 1 
                        WHEN name ILIKE $1 THEN 2
                        ELSE 3 
                    END as priority
                FROM products
                WHERE stock_actual > 0
                AND (dci ILIKE $1 OR name ILIKE $1)
            )
            SELECT * FROM matches
            ORDER BY priority ASC, price ASC
            LIMIT 20
        `;

        const result = await query(sql, [searchTerm]);

        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            sku: row.sku || 'S/SKU',
            is_bioequivalent: row.is_bioequivalent || false,
            stock: Number(row.stock),
            price: Number(row.price),
            laboratory: row.laboratory || 'Generico',
            category: 'Farmacia',
            action: '',
            dci: row.dci,
            units_per_box: row.units_per_box || 1,
            location_name: ''
        }));

    } catch (error) {
        console.error('❌ Error finding inventory matches:', error);
        return [];
    }
}
