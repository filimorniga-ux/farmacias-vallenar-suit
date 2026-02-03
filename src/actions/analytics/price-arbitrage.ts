'use server';

import { query } from '@/lib/db';


export type OfferingType = 'BRANCH' | 'PROVIDER';

export interface Offering {
    source: string; // e.g. 'SANTIAGO', 'GOLAN'
    price: number;
    stock: number;
    type: OfferingType;
    fileName?: string;
    updatedAt?: Date;
}

interface DBRow {
    id: string;
    source_file: string;
    raw_branch: string | null;
    raw_title: string;
    raw_price: number;
    raw_stock: number;
    raw_sku: string | null;
    raw_isp_code: string | null;
    target_product_id: string | null;
    created_at: Date;
    raw_active_principle: string | null;
    raw_misc: any;
    canonical_name: string | null;
    canonical_barcode: string | null;
}

export interface UnifiedProduct {
    id: string;
    productName: string;
    ispCode: string | null;
    sku: string | null;
    activePrinciple: string | null;
    misc: any;
    offerings: Offering[];
    bestPrice: number;
    highestPrice: number;
    maxMargin: number;
    alerts: string[];
    unitsPerBox?: number;
    savingsSuggestion?: {
        productName: string;
        price: number;
        saveAmount: number;
    };
}


export interface SearchFilters {
    categoryId?: number;
    labId?: number;
    actionId?: number;
}

export async function searchUnifiedProducts(searchTerm: string, filters?: SearchFilters): Promise<UnifiedProduct[]> {
    if ((!searchTerm || searchTerm.trim().length < 2) && (!filters || Object.keys(filters).length === 0)) return [];

    try {
        const params: any[] = [];
        const whereClauses: string[] = [];

        // 1. Text Search
        if (searchTerm && searchTerm.trim().length > 0) {
            const cleanQuery = `%${searchTerm.trim()}%`;
            params.push(cleanQuery);
            // NOTE: We do NOT push to whereClauses here because we handle the text search explicitly 
            // in the CTEs (matches) to allow splitting logic between inventory_imports and products table.
        }

        // 2. Metadata Filters
        if (filters?.categoryId) {
            params.push(filters.categoryId);
            whereClauses.push(`ii.normalized_category_id = $${params.length}`);
        }
        if (filters?.labId) {
            params.push(filters.labId);
            whereClauses.push(`ii.normalized_lab_id = $${params.length}`);
        }
        if (filters?.actionId) {
            params.push(filters.actionId);
            whereClauses.push(`ii.normalized_action_id = $${params.length}`);
        }

        const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        // 3. Fetch enriched matches using CTEs (Performance Optimization)
        const sql = `
            WITH matches AS (
                -- 1. Match in inventory_imports columns
                SELECT ii.id, 1 as priority
                FROM inventory_imports ii
                WHERE (
                    ii.raw_title ILIKE $1 
                    OR ii.processed_title ILIKE $1
                    OR ii.raw_barcodes ILIKE $1 
                    OR ii.raw_sku ILIKE $1
                    OR ii.raw_isp_code ILIKE $1
                    OR ii.raw_active_principle ILIKE $1
                )
                ${whereClauses.length > 0 ? 'AND ' + whereClauses.join(' AND ') : ''}

                UNION

                -- 2. Match in linked products (name)
                SELECT ii.id, 2 as priority
                FROM inventory_imports ii
                JOIN products p ON ii.target_product_id::text = p.id
                WHERE p.name ILIKE $1
                ${whereClauses.length > 0 ? 'AND ' + whereClauses.join(' AND ') : ''}
            )
            SELECT 
                ii.id,
                ii.source_file,
                ii.raw_branch,
                COALESCE(ii.processed_title, ii.raw_title) as raw_title,
                ii.raw_price,
                ii.raw_stock,
                ii.raw_sku,
                ii.raw_isp_code,
                ii.target_product_id,
                ii.created_at,
                ii.raw_active_principle,
                ii.raw_misc,
                p.name as canonical_name,
                p.barcode as canonical_barcode,
                p.is_bioequivalent,
                p.dci,
                p.units_per_box,
                c.name as category_name,
                l.name as lab_name,
                a.name as action_name
            FROM matches m
            JOIN inventory_imports ii ON m.id = ii.id
            LEFT JOIN products p ON ii.target_product_id::text = p.id
            LEFT JOIN categories c ON ii.normalized_category_id = c.id
            LEFT JOIN laboratories l ON ii.normalized_lab_id = l.id
            LEFT JOIN therapeutic_actions a ON ii.normalized_action_id = a.id
            ORDER BY m.priority ASC, ii.raw_price ASC
            LIMIT 100
        `;

        const res = await query(sql, params);
        const rows = res.rows as (DBRow & { category_name?: string, lab_name?: string, action_name?: string, is_bioequivalent?: boolean, dci?: string, units_per_box?: number })[];

        // 4. Grouping Logic
        const groups = new Map<string, typeof rows>();

        for (const row of rows) {
            let key = '';
            if (row.target_product_id) key = `PID:${row.target_product_id}`;
            else if (row.raw_isp_code && row.raw_isp_code.trim().length > 3) key = `ISP:${row.raw_isp_code.trim()}`;
            else if (row.canonical_barcode) key = `BAR:${row.canonical_barcode}`;
            else {
                const normTitle = row.raw_title.toUpperCase().replace(/\s+/g, ' ').trim();
                key = `NAME:${normTitle}`;
            }

            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)?.push(row);
        }

        // 5. Construct Unified Objects
        const results: UnifiedProduct[] = [];

        for (const [key, groupRows] of groups.entries()) {
            if (groupRows.length === 0) continue;

            // Determine Best Info
            const canonicalRow = groupRows.find(r => r.canonical_name);

            const productName = (canonicalRow?.canonical_name) || groupRows[0].raw_title || 'Sin Nombre';
            const ispCode = canonicalRow ? (groupRows.find(r => r.raw_isp_code)?.raw_isp_code || null) : (groupRows.find(r => r.raw_isp_code)?.raw_isp_code || null);
            const sku = groupRows[0].raw_sku || null;

            // Find enriched info from any row in the group (preferably from Master/Enriched source)
            const enrichedRow = groupRows.find(r => r.raw_misc && r.raw_misc.bioequivalente) || groupRows.find(r => r.raw_active_principle);

            // Priority for regulatory info: Product Table (Synced data) > Enriched Import > Raw Import
            const activePrinciple = canonicalRow?.dci || enrichedRow?.raw_active_principle || groupRows[0].raw_active_principle || null;
            const isBioequivalent = canonicalRow?.is_bioequivalent ?? (enrichedRow?.raw_misc?.bioequivalente || false);

            const misc = enrichedRow?.raw_misc || groupRows[0].raw_misc || {};
            // Inject regulatory status into misc for frontend
            misc.bioequivalencia = isBioequivalent;

            // Extract Metadata from any row that has it (Priority: Master > Imports)
            const category = groupRows.find(r => r.category_name)?.category_name || null;
            const laboratory = groupRows.find(r => r.lab_name)?.lab_name || misc.laboratorio || null;
            const action = groupRows.find(r => r.action_name)?.action_name || misc.accion_terapeutica || null;

            const offerings: Offering[] = groupRows.map(r => {
                let type: OfferingType = 'PROVIDER';
                let sourceName = r.source_file.replace('.xlsx', '').replace('.csv', '').toUpperCase();

                if (sourceName.includes('SANTIAGO') || sourceName.includes('COLCHAGUA') || r.raw_branch) {
                    type = 'BRANCH';
                    sourceName = r.raw_branch ? r.raw_branch.toUpperCase() : (sourceName.includes('SANTIAGO') ? 'SUCURSAL SANTIAGO' : 'SUCURSAL COLCHAGUA');
                } else if (sourceName.includes('GOLAN')) {
                    sourceName = 'LAB. GOLAN';
                } else if (sourceName.includes('ENRICHED')) {
                    sourceName = 'CATALOGO MAESTRO';
                }

                return {
                    source: sourceName,
                    price: Number(r.raw_price) || 0,
                    stock: Number(r.raw_stock) || 0,
                    type: type,
                    fileName: r.source_file,
                    updatedAt: r.created_at
                };
            });

            // Stats
            // Filter out 0 prices for "Best Price" finding, unless all are 0
            const activePrices = offerings.filter(o => o.price > 0).map(o => o.price);
            const bestPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0;
            const highestPrice = activePrices.length > 0 ? Math.max(...activePrices) : 0;
            const maxMargin = highestPrice - bestPrice;

            const alerts: string[] = [];

            // Alert: Branch Price < Provider Price? (Selling below replacement cost?)
            // We need to know which offering is Branch and which is Provider.
            const branchOfferings = offerings.filter(o => o.type === 'BRANCH' && o.price > 0);
            const providerOfferings = offerings.filter(o => o.type === 'PROVIDER' && o.price > 0);

            if (branchOfferings.length > 0 && providerOfferings.length > 0) {
                const minProviderPrice = Math.min(...providerOfferings.map(o => o.price));

                branchOfferings.forEach(bo => {
                    if (bo.price < minProviderPrice) {
                        alerts.push(`⚠️ Precio en ${bo.source} ($${bo.price}) es MENOR al costo de reposición proveedor ($${minProviderPrice})`);
                    }
                });
            }

            results.push({
                id: key,
                productName,
                ispCode,
                sku,
                activePrinciple,
                misc: { ...misc, category, laboratory, action }, // Inject consolidated metadata into misc for UI to use
                offerings,
                bestPrice,
                highestPrice,
                maxMargin,
                alerts,
                unitsPerBox: canonicalRow?.units_per_box || undefined
            });
        }

        // 6. Savings Calculation Logic (Cross-Product Analysis)
        // Group by Normalized Active Principle
        const byAP = new Map<string, UnifiedProduct[]>();
        results.forEach(r => {
            if (r.activePrinciple) {
                const k = r.activePrinciple.toUpperCase().trim();
                if (!byAP.has(k)) byAP.set(k, []);
                byAP.get(k)?.push(r);
            }
        });

        byAP.forEach(group => {
            if (group.length < 2) return;
            // Find absolute cheapest option in this group (must have stock > 0, price > 0)
            // We use 'bestPrice' which is min of offerings.
            const validOptions = group.filter(p => p.bestPrice > 0);
            if (validOptions.length < 2) return;

            const cheapest = validOptions.reduce((prev, curr) => prev.bestPrice < curr.bestPrice ? prev : curr);

            group.forEach(p => {
                if (p.id !== cheapest.id && p.bestPrice > cheapest.bestPrice) {
                    p.savingsSuggestion = {
                        productName: cheapest.productName,
                        price: cheapest.bestPrice,
                        saveAmount: p.bestPrice - cheapest.bestPrice
                    };
                }
            });
        });

        // Sort results by relevance (optional, maybe best margin?)
        return results;

    } catch (error) {
        console.error("Error in Unified Search:", error);
        return [];
    }
}
