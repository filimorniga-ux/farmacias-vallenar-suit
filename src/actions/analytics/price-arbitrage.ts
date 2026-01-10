'use server';

import { Client } from 'pg';

const getClient = () => new Client({ connectionString: process.env.DATABASE_URL });

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
}


export interface SearchFilters {
    categoryId?: number;
    labId?: number;
    actionId?: number;
}

export async function searchUnifiedProducts(query: string, filters?: SearchFilters): Promise<UnifiedProduct[]> {
    if ((!query || query.trim().length < 2) && (!filters || Object.keys(filters).length === 0)) return [];

    const client = getClient();
    await client.connect();

    try {
        const params: any[] = [];
        let whereClauses: string[] = [];

        // 1. Text Search
        if (query && query.trim().length > 0) {
            const cleanQuery = `%${query.trim()}%`;
            params.push(cleanQuery);
            whereClauses.push(`(
                ii.raw_title ILIKE $${params.length} 
                OR ii.processed_title ILIKE $${params.length}
                OR ii.raw_barcodes ILIKE $${params.length} 
                OR ii.raw_sku ILIKE $${params.length}
                OR ii.raw_isp_code ILIKE $${params.length}
                OR ii.raw_active_principle ILIKE $${params.length}
                OR p.name ILIKE $${params.length}
            )`);
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

        // 3. Fetch enriched matches
        const sql = `
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
        c.name as category_name,
        l.name as lab_name,
        a.name as action_name
      FROM inventory_imports ii
      LEFT JOIN products p ON ii.target_product_id::text = p.id
      LEFT JOIN categories c ON ii.normalized_category_id = c.id
      LEFT JOIN laboratories l ON ii.normalized_lab_id = l.id
      LEFT JOIN therapeutic_actions a ON ii.normalized_action_id = a.id
      ${whereSQL}
      LIMIT 100
    `;

        const res = await client.query(sql, params);
        const rows = res.rows as (DBRow & { category_name?: string, lab_name?: string, action_name?: string })[];

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
            const activePrinciple = enrichedRow?.raw_active_principle || groupRows[0].raw_active_principle || null;
            const misc = enrichedRow?.raw_misc || groupRows[0].raw_misc || {};

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
                alerts
            });
        }

        // Sort results by relevance (optional, maybe best margin?)
        return results;

    } catch (error) {
        console.error("Error in Unified Search:", error);
        return [];
    } finally {
        await client.end();
    }
}
