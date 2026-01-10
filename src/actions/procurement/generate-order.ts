'use server';

import { Client } from 'pg';

export interface ReplenishmentSuggestion {
    id: string; // ID of the branch product
    productName: string;
    sku: string;
    currentStock: number;
    suggestedProvider: 'GOLAN' | 'COTIZAR';
    providerPrice: number;
    providerStock: number;
    suggestedQty: number;
    savingPotential: number; // Placeholder for now
}

const getClient = () => new Client({ connectionString: process.env.DATABASE_URL });

export async function getReplenishmentSuggestions(branch: string): Promise<ReplenishmentSuggestion[]> {
    if (!['SANTIAGO', 'COLCHAGUA'].includes(branch)) return [];

    const client = getClient();
    await client.connect();

    try {
        // 1. Get Critical Stock Items from Branch
        // We look for items in the branch file that have low stock (<= 5)
        let branchFilter = '';
        if (branch === 'SANTIAGO') {
            branchFilter = `(source_file ILIKE '%SANTIAGO%' OR raw_branch = 'SANTIAGO')`;
        } else {
            branchFilter = `(source_file ILIKE '%COLCHAGUA%' OR raw_branch = 'COLCHAGUA')`;
        }

        const criticalItemsSql = `
            SELECT id, raw_title, raw_sku, raw_stock, raw_barcodes, raw_price
            FROM inventory_imports
            WHERE ${branchFilter}
            AND (raw_stock <= 5 OR raw_stock IS NULL)
            ORDER BY raw_stock ASC NULLS FIRST
            LIMIT 50
        `;

        const criticalRes = await client.query(criticalItemsSql);
        const suggestions: ReplenishmentSuggestion[] = [];

        // 2. For each critical item, find a Provider Match (GOLAN)
        // We prepare a statement to find matches. 
        // We prioritize Barcode match. If fails, we try Name match.

        for (const item of criticalRes.rows) {
            const barcodes = item.raw_barcodes ? item.raw_barcodes.split(',').map((b: string) => b.trim()).filter((b: string) => b.length > 0) : [];
            let providerMatch = null;

            // Strategy A: Barcode Match
            if (barcodes.length > 0) {
                // Build OR clause for barcodes
                const barcodeConditions = barcodes.map((_, i) => `raw_barcodes LIKE $${i + 1}`).join(' OR ');

                // Providers: GOLAN family + ENRICHED
                const providerFilter = `(source_file ILIKE '%GOLAN%' OR source_file ILIKE '%ENRICHED%')`;

                const barcodeSql = `
                    SELECT raw_price, raw_stock, source_file 
                    FROM inventory_imports 
                    WHERE ${providerFilter}
                    AND (${barcodeConditions})
                    AND raw_stock > 0
                    ORDER BY raw_price ASC
                    LIMIT 1
                `;

                const barcodeParams = barcodes.map((b: string) => `%${b}%`);

                const matchRes = await client.query(barcodeSql, barcodeParams);
                if (matchRes.rows.length > 0) {
                    providerMatch = matchRes.rows[0];
                }
            }

            // Strategy B: Name Match (Fuzzy) if no barcode match
            if (!providerMatch && item.raw_title) {
                // Simplify title for search: take first 2 words + 3 chars of 3rd?
                // Or simply ILIKE
                const cleanTitle = item.raw_title.replace(/[^\w\s]/gi, '').split(' ').slice(0, 2).join(' ');
                if (cleanTitle.length > 3) {
                    const nameSql = `
                        SELECT raw_price, raw_stock, raw_title 
                        FROM inventory_imports 
                        WHERE (source_file ILIKE '%GOLAN%' OR source_file ILIKE '%ENRICHED%')
                        AND raw_title ILIKE $1
                        AND raw_stock > 0
                        ORDER BY raw_price ASC
                        LIMIT 1
                    `;
                    const matchRes = await client.query(nameSql, [`%${cleanTitle}%`]);
                    if (matchRes.rows.length > 0) {
                        providerMatch = matchRes.rows[0];
                    }
                }
            }

            // 3. Logic for COTIZAR vs GOLAN
            const currentStock = Number(item.raw_stock) || 0;
            // Suggest replenish up to 10
            const suggestedQty = Math.max(5, 10 - currentStock);

            if (providerMatch) {
                suggestions.push({
                    id: item.id,
                    productName: item.raw_title,
                    sku: item.raw_sku || 'N/A',
                    currentStock,
                    suggestedProvider: 'GOLAN',
                    providerPrice: Number(providerMatch.raw_price),
                    providerStock: Number(providerMatch.raw_stock),
                    suggestedQty,
                    savingPotential: 0
                });
            } else {
                suggestions.push({
                    id: item.id,
                    productName: item.raw_title,
                    sku: item.raw_sku || 'N/A',
                    currentStock,
                    suggestedProvider: 'COTIZAR',
                    providerPrice: 0,
                    providerStock: 0,
                    suggestedQty,
                    savingPotential: 0
                });
            }
        }

        return suggestions;

    } catch (error) {
        console.error("Error generating replenishment suggestions:", error);
        return [];
    } finally {
        await client.end();
    }
}
