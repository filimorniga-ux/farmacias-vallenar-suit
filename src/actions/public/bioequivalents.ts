'use server';

import ispData from '@/data/isp-data.json';

// Type definition based on the JSON structure
interface ISPJsonRecord {
    registry: string;
    product: string;
    active_ingredient: string;
    holder: string;
    status: string;
    usage: string;
    validity: string;
}

const records: ISPJsonRecord[] = ispData as ISPJsonRecord[];

/**
 * Searches for Bioequivalents in the BUNDLED JSON data.
 * No file reading required at runtime.
 */
export async function searchBioequivalentsAction(term: string, page: number = 1, limit: number = 50): Promise<BioequivalentResult[]> {
    try {
        console.log(`📊 [ISP] Searching in ${records.length} bundled records`);

        let filtered = records;

        // Only filter if there is a term
        if (term && term.trim() !== '') {
            const normalizedTerm = term.toLowerCase().trim();
            const isLetterFilter = normalizedTerm.length === 1 && /^[a-z]$/i.test(normalizedTerm);

            filtered = records.filter((record) => {
                const producto = record.product;
                const principio = record.active_ingredient;
                const registro = record.registry;

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

        return filtered.slice(startIndex, endIndex).map((r) => ({
            registry_number: r.registry,
            product_name: r.product,
            active_ingredient: r.active_ingredient,
            holder: r.holder,
            status: r.status,
            usage: r.usage,
            validity: r.validity
        }));

    } catch (error) {
        console.error('❌ Error searching ISP Data:', error);
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
 * Gets a unique list of Active Ingredients from the BUNDLED JSON data.
 * Sorted alphabetically and paginated.
 */
export async function getUniqueActiveIngredientsAction(term: string, page: number = 1, limit: number = 50): Promise<string[]> {
    try {
        // Extract unique active ingredients
        const uniqueIngredients = new Set<string>();

        records.forEach((r) => {
            const val = r.active_ingredient;
            if (val && val.length > 2) {
                uniqueIngredients.add(val.toUpperCase());
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
