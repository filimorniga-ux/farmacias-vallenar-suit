'use server';

import { getClient } from '@/lib/db';
import { AIForecastingService, ForecastInput } from '@/services/ai-forecasting';

export interface ReplenishmentSuggestion {
    id: string; // ID of the branch product
    productName: string;
    sku: string;
    currentStock: number;
    suggestedProvider: 'GOLAN' | 'COTIZAR' | 'TRASPASO';
    providerPrice: number;
    providerStock: number;
    suggestedQty: number;
    savingPotential: number;
    reasoning?: string; // AI Reason
    sourceBranch?: string; // If 'TRASPASO', which branch?
}


export async function getReplenishmentSuggestions(branch: 'SANTIAGO' | 'COLCHAGUA'): Promise<ReplenishmentSuggestion[]> {
    if (!['SANTIAGO', 'COLCHAGUA'].includes(branch)) return [];

    const client = await getClient();

    try {
        console.time("GenerateSuggestions");

        // 1. Identify Critical Producst in Target Branch
        // (Simulating critical logic: Stock <= 5)
        const targetBranchFilter = branch === 'SANTIAGO'
            ? `(source_file ILIKE '%SANTIAGO%' OR raw_branch = 'SANTIAGO')`
            : `(source_file ILIKE '%COLCHAGUA%' OR raw_branch = 'COLCHAGUA')`;

        // Also fetch ID to match with other branch
        const criticalItemsSql = `
            SELECT id, raw_title, raw_sku, raw_stock, raw_barcodes, raw_price, product_id
            FROM inventory_imports
            WHERE ${targetBranchFilter}
            AND (raw_stock::int <= 5 OR raw_stock IS NULL)
            AND product_id IS NOT NULL 
            ORDER BY raw_stock ASC NULLS FIRST
            LIMIT 10 -- LIMIT FOR DEMO/PERFORMANCE
        `;

        const criticalRes = await client.query(criticalItemsSql);
        const suggestions: ReplenishmentSuggestion[] = [];

        // 2. Process Critical Items
        for (const item of criticalRes.rows) {
            const productId = item.product_id;
            const currentStock = Number(item.raw_stock) || 0;
            const productName = item.raw_title;

            // A. FETCH SALES HISTORY (Real DB Data)
            // We group sales by month for the last 3 months
            const salesHistorySql = `
                SELECT 
                    TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') as month,
                    SUM(quantity) as qty
                FROM sales_items si
                JOIN sales_headers sh ON si.sale_id = sh.id
                WHERE si.product_id = (SELECT id FROM products WHERE id::text = $1 LIMIT 1) -- product_id is text in imports, uuid in products
                AND sh.created_at >= NOW() - INTERVAL '3 months'
                GROUP BY 1
                ORDER BY 1 ASC
            `;

            // Note: Since we don't have real linked sales yet for imports, this might return empty. 
            // We'll mock it if empty for the demo.
            const historyRes = await client.query(salesHistorySql, [productId]);
            let salesHistory = historyRes.rows.map(r => ({ date: r.month, quantity: Number(r.qty) }));

            // MOCK IF EMPTY (To demonstrate AI)
            if (salesHistory.length === 0) {
                salesHistory = [
                    { date: '2025-10', quantity: Math.floor(Math.random() * 20) + 5 },
                    { date: '2025-11', quantity: Math.floor(Math.random() * 30) + 10 },
                    { date: '2025-12', quantity: Math.floor(Math.random() * 40) + 15 }, // Trending up
                ];
            }

            // B. AI FORECASTING
            const forecastInput: ForecastInput = {
                productName,
                currentStock,
                salesHistory,
                branchName: branch
            };

            const aiForecast = await AIForecastingService.predictDemand(forecastInput);

            // If AI says we don't need stock, skip
            if (aiForecast.suggestedOrderQty <= 0) continue;


            // C. CROSS-BRANCH CHECK (The "Equilibrista" Logic)
            // Check if the OTHER branch has excess stock
            const otherBranch = branch === 'SANTIAGO' ? 'COLCHAGUA' : 'SANTIAGO';
            const otherBranchFilter = branch === 'SANTIAGO'
                ? `(source_file ILIKE '%COLCHAGUA%' OR raw_branch = 'COLCHAGUA')`
                : `(source_file ILIKE '%SANTIAGO%' OR raw_branch = 'SANTIAGO')`;

            const otherBranchStockSql = `
                SELECT raw_stock 
                FROM inventory_imports
                WHERE product_id = $1
                AND ${otherBranchFilter}
                LIMIT 1
            `;
            const otherStockRes = await client.query(otherBranchStockSql, [productId]);
            const otherStock = otherStockRes.rows.length > 0 ? Number(otherStockRes.rows[0].raw_stock) : 0;

            // Rule: If other branch has more than double what we need, suggest TRANSFER
            if (otherStock > aiForecast.suggestedOrderQty * 2) {
                suggestions.push({
                    id: item.id,
                    productName,
                    sku: item.raw_sku || 'N/A',
                    currentStock,
                    suggestedProvider: 'TRASPASO',
                    sourceBranch: otherBranch,
                    providerPrice: 0, // Transfer cost is roughly 0 (logistics only)
                    providerStock: otherStock,
                    suggestedQty: aiForecast.suggestedOrderQty,
                    savingPotential: 1000, // Placeholder
                    reasoning: `⚡️ ${aiForecast.reasoning} | Ahorra comprando: ${otherBranch} tiene ${otherStock} uds.`
                });
                continue; // Skip provider search
            }


            // D. VENDOR ARBITRAGE (Legacy Logic Enhanced)
            // If we can't transfer, we buy. Find best price.
            // (Using the existing clean logic)
            const cleanNameParams = item.raw_title.split(' ').slice(0, 2).join(' '); // Simple Fuzzy

            const providerSql = `
                SELECT raw_price, raw_stock, source_file 
                FROM inventory_imports 
                WHERE (source_file ILIKE '%GOLAN%' OR source_file ILIKE '%ENRICHED%')
                AND (raw_title ILIKE $1 OR raw_barcodes LIKE $2)
                AND raw_stock > 0
                ORDER BY raw_price ASC
                LIMIT 1
            `;

            // Simplify barcode logic for now
            const barcodeParam = item.raw_barcodes ? `%${item.raw_barcodes.split(',')[0]}%` : '%NOP%';
            const providerRes = await client.query(providerSql, [`%${cleanNameParams}%`, barcodeParam]);

            const providerMatch = providerRes.rows[0];

            if (providerMatch) {
                suggestions.push({
                    id: item.id,
                    productName,
                    sku: item.raw_sku || 'N/A',
                    currentStock,
                    suggestedProvider: 'GOLAN',
                    providerPrice: Number(providerMatch.raw_price),
                    providerStock: Number(providerMatch.raw_stock),
                    suggestedQty: aiForecast.suggestedOrderQty,
                    savingPotential: 0,
                    reasoning: `🤖 AI: ${aiForecast.reasoning}`
                });
            } else {
                suggestions.push({
                    id: item.id,
                    productName,
                    sku: item.raw_sku || 'N/A',
                    currentStock,
                    suggestedProvider: 'COTIZAR', // Generic fallback
                    providerPrice: 0,
                    providerStock: 0,
                    suggestedQty: aiForecast.suggestedOrderQty,
                    savingPotential: 0,
                    reasoning: `🤖 AI: ${aiForecast.reasoning} (Proveedor no encontrado)`
                });
            }
        }

        console.timeEnd("GenerateSuggestions");
        return suggestions;

    } catch (error) {
        console.error("Error generating AI suggestions:", error);
        return [];
    } finally {
        client.release();
    }
}
