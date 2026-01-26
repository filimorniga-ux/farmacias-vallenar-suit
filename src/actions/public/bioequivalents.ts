'use server';

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { query } from '@/lib/db';
import { ProductResult } from './search-products';
import { parseProductDetails } from '@/lib/product-parser';

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
    validity: string;
}

const ISP_FILENAME = 'isp_oficial.csv';

// Helper to find the file in Vercel's unpredictable environment
function getISPFilePath(): string | null {
    const candidates = [
        path.join(process.cwd(), 'public', 'data', ISP_FILENAME), // Standard Local / Vercel sometimes
        path.resolve('./public/data', ISP_FILENAME),              // Resolve relative
        path.join(process.cwd(), 'data', ISP_FILENAME),           // Some Vercel deployments flatten public
        path.join(__dirname, '..', 'public', 'data', ISP_FILENAME), // Dir relative
        path.join(process.cwd(), ISP_FILENAME)                    // Root fallback
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            console.log(`✅ [ISP] File found at: ${candidate}`);
            return candidate;
        }
    }

    // LIST DIRECTORY FOR DEBUGGING IF NOT FOUND
    console.error(`❌ [ISP] File NOT found. CWD: ${process.cwd()}`);
    try {
        const publicDir = path.join(process.cwd(), 'public');
        if (fs.existsSync(publicDir)) {
            console.log('📂 Public Dir Contents:', fs.readdirSync(publicDir));
            const dataDir = path.join(publicDir, 'data');
            if (fs.existsSync(dataDir)) {
                console.log('📂 Public/Data Dir Contents:', fs.readdirSync(dataDir));
            }
        } else {
            console.log('📂 Root Dir Contents:', fs.readdirSync(process.cwd()));
        }
    } catch (e) {
        console.error('Error listing dirs:', e);
    }

    return null;
}

/**
 * Searches for Bioequivalents in the ISP CSV file.
 * This reads the file on every request (simple approach) or caches it if memory allows.
 * effective for < 10MB files.
 */
export async function searchBioequivalentsAction(term: string, page: number = 1, limit: number = 50): Promise<BioequivalentResult[]> {
    try {
        const filePath = getISPFilePath();
        if (!filePath) throw new Error('ISP Database File not found in deployment');

        const fileContent = fs.readFileSync(filePath, 'latin1');

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter: ';',
            trim: true,
            relax_column_count: true,
            from_line: 4 // Skip the first 3 metadata lines
        });

        console.log(`📊 [ISP] Loaded ${records.length} records`);

        let filtered = records;

        // Only filter if there is a term
        if (term && term.trim() !== '') {
            const normalizedTerm = term.toLowerCase().trim();
            const isLetterFilter = normalizedTerm.length === 1 && /^[a-z]$/i.test(normalizedTerm);

            filtered = records.filter((record: any) => {
                // Flexible matching on keys due to potential encoding issues in headers
                // Based on 'head' output: "Producto " (with space) or just "Producto"
                const producto = String(record['Producto'] || record['Producto '] || '').trim();
                const principio = String(record['Principio Activo'] || '').trim();
                const registro = String(record['Registro'] || '').trim();

                if (!producto && !principio) return false;

                if (isLetterFilter) {
                    // Strict Starts With for A-Z Index Navigation
                    return producto.toLowerCase().startsWith(normalizedTerm);
                }

                // General Search (Includes)
                return (
                    producto.toLowerCase().includes(normalizedTerm) ||
                    principio.toLowerCase().includes(normalizedTerm) ||
                    registro.toLowerCase().includes(normalizedTerm)
                );
            });
        }

        // Pagination Logic
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        return filtered.slice(startIndex, endIndex).map((r: any) => ({
            registry_number: r['Registro'] || '',
            product_name: r['Producto'] || r['Producto '] || '',
            active_ingredient: r['Principio Activo'] || '',
            holder: r['Titular'] || '',
            status: r['Estado'] || '',
            usage: r['Uso / Tratamiento'] || '',
            validity: r['Vigencia'] || ''
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
/**
 * Finds products in the LOCAL INVENTORY that match a given Active Ingredient (DCI).
 * Searches in: (1) dci column, (2) name column, (3) inventory_batches name column.
 */
export async function findInventoryMatchesAction(dci: string, ispProductName: string = ''): Promise<ProductResult[]> {
    if (!dci && !ispProductName) return [];

    try {
        const cleanDci = dci ? dci.trim().replace(/[^\w\sáéíóúñ]/gi, '') : '';
        const cleanIspName = ispProductName ? ispProductName.trim().replace(/[^\w\sáéíóúñ]/gi, '') : '';

        // Extract first word of ISP name for brand matching (e.g., "ORALNE" from "ORALNE CÁPSULAS")
        const ispWords = cleanIspName.split(/\s+/).filter(w => w.length > 3);
        const brandWord = ispWords.length > 0 ? ispWords[0] : '';

        // Build the pattern for DCI search
        const dciPattern = cleanDci.length > 2 ? `%${cleanDci}%` : null;
        const brandPattern = brandWord.length > 2 ? `%${brandWord}%` : null;

        // Simple SQL: Search for DCI in dci column OR name column
        const sql = `
            WITH matches AS (
                -- 1. Master Products
                SELECT 
                    id::text,
                    name::text,
                    sku::text,
                    dci::text,
                    laboratory::text,
                    format::text,
                    isp_register::text,
                    price_sell_box as price,
                    stock_actual as stock,
                    units_per_box,
                    is_bioequivalent,
                    CASE 
                        WHEN $1::text IS NOT NULL AND dci ILIKE $1 THEN 1  -- Best: DCI column match
                        WHEN $1::text IS NOT NULL AND name ILIKE $1 THEN 2 -- Good: DCI in name
                        WHEN $2::text IS NOT NULL AND name ILIKE $2 THEN 3 -- Fallback: Brand name match
                        ELSE 4 
                    END as match_priority
                FROM products
                WHERE 
                    ($1::text IS NOT NULL AND (dci ILIKE $1 OR name ILIKE $1))
                    OR ($2::text IS NOT NULL AND name ILIKE $2)
                
                UNION ALL
                
                -- 2. Inventory Batches (Legacy/Active Stock) - only search by name
                SELECT 
                    id::text,
                    name::text,
                    sku::text,
                    NULL::text as dci,
                    NULL::text as laboratory,
                    NULL::text as format,
                    NULL::text as isp_register,
                    COALESCE(sale_price, 0) as price,
                    quantity_real as stock,
                    1 as units_per_box,
                    false as is_bioequivalent,
                    CASE 
                        WHEN $1::text IS NOT NULL AND name ILIKE $1 THEN 2 -- DCI in name
                        WHEN $2::text IS NOT NULL AND name ILIKE $2 THEN 3 -- Brand in name
                        ELSE 5
                    END as match_priority
                FROM inventory_batches
                WHERE 
                    quantity_real > 0 
                    AND (
                        ($1::text IS NOT NULL AND name ILIKE $1)
                        OR ($2::text IS NOT NULL AND name ILIKE $2)
                    )
            )
            SELECT DISTINCT ON (name) * FROM matches
            WHERE price > 50
            ORDER BY 
                name ASC,
                CASE WHEN stock > 0 THEN 0 ELSE 1 END ASC,
                match_priority ASC,
                price ASC
            LIMIT 50
        `;

        const result = await query(sql, [dciPattern, brandPattern]);

        console.log('Ejecutando query', { dciPattern, brandPattern, rows: result.rows.length });

        return result.rows.map(row => {
            const details = parseProductDetails(
                row.name,
                row.units_per_box,
                row.dci,
                row.laboratory,
                row.format
            );

            return {
                id: row.id,
                name: row.name,
                sku: row.sku || 'S/SKU',
                is_bioequivalent: row.is_bioequivalent || false,
                stock: Number(row.stock),
                price: Number(row.price),
                laboratory: details.lab || 'Generico', // Parsed or Original
                category: 'Farmacia',
                action: '',
                dci: details.dci || '',
                units_per_box: details.units,
                format: details.format || '',
                isp_register: row.isp_register || '',
                location_name: ''
            };
        });

    } catch (error) {
        console.error('❌ Error finding inventory matches:', error);
        return [];
    }
}

/**
 * Gets a unique list of Active Ingredients from the ISP CSV.
 * Sorted alphabetically and paginated.
 */
export async function getUniqueActiveIngredientsAction(term: string, page: number = 1, limit: number = 50): Promise<string[]> {
    try {
        const filePath = getISPFilePath();
        if (!filePath) throw new Error('ISP Database File not found');

        const fileContent = fs.readFileSync(filePath, 'latin1');

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter: ';',
            trim: true,
            relax_column_count: true,
            from_line: 4
        });

        // Extract unique active ingredients
        const uniqueIngredients = new Set<string>();

        console.log(`🔍 [ActiveIngredients] Reading file from: ${filePath}`);
        console.log(`🔍 [ActiveIngredients] Records parsed: ${records.length}`);
        if (records.length > 0) {
            console.log(`🔍 [ActiveIngredients] Sample Keys: ${Object.keys(records[0] as object).join(', ')}`);
        }

        records.forEach((r: any) => {
            const val = r['Principio Activo']; // Try exact match from script finding
            if (val && typeof val === 'string' && val.trim().length > 2) {
                uniqueIngredients.add(val.trim().toUpperCase());
            }
        });

        console.log(`🔍 [ActiveIngredients] Unique ingredients found: ${uniqueIngredients.size}`);

        let sortedList = Array.from(uniqueIngredients).sort();

        // Filter if term exists
        if (term && term.trim() !== '') {
            const normalizedTerm = term.toUpperCase().trim();
            // If term is a single letter, assume "Starts With" filter
            if (normalizedTerm.length === 1 && /^[A-Z]$/.test(normalizedTerm)) {
                sortedList = sortedList.filter(item => item.startsWith(normalizedTerm));
            } else {
                sortedList = sortedList.filter(item => item.includes(normalizedTerm));
            }
        }

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        return sortedList.slice(startIndex, endIndex);

    } catch (error) {
        console.error('❌ Error getting active ingredients:', error);
        return [];
    }
}
