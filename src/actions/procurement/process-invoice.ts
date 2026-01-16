'use server';

import { Client } from 'pg';
import { XMLParser } from 'fast-xml-parser';
import { matchProduct, type MatchResult } from '../../services/inventory-matcher';
import { InvoiceMapperService, InvoiceItemCandidate } from '../../services/invoice-mapper';

const getClient = () => new Client({ connectionString: process.env.DATABASE_URL });

export interface ProcessedInvoiceItem {
    line: number;
    rawName: string;
    rawCode: string; // Supplier SKU
    qty: number;
    price: number;
    matchResult?: MatchResult;
    updatedStock?: number;
    updatedCost?: number;
    error?: string;
    aiReasoning?: string;
}

export interface InvoiceProcessResult {
    success: boolean;
    invoiceNumber?: string;
    supplierRut?: string;
    totalAmount?: number;
    items?: ProcessedInvoiceItem[];
    message?: string;
}

export async function processInvoiceXML(xmlContent: string): Promise<InvoiceProcessResult> {
    const client = getClient();
    await client.connect();

    try {
        // 1. Check if tables exist (Safety check for migration)
        const checkTable = await client.query(`
            SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'product_suppliers')
        `);
        const hasMappingTable = checkTable.rows[0].exists;

        // 2. Parse XML
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        const jsonObj = parser.parse(xmlContent);

        const dte = jsonObj.DTE || jsonObj.EnvioDTE?.SetDTE?.DTE;
        if (!dte) throw new Error("Formato XML no reconocido (No se encontró nodo DTE)");

        const doc = Array.isArray(dte) ? dte[0] : dte;
        const encabezado = doc.Documento?.Encabezado;
        const detalle = doc.Documento?.Detalle;

        if (!encabezado || !detalle) throw new Error("XML incompleto: falta Encabezado o Detalle");

        const invoiceId = encabezado.IdDoc?.Folio || 'UNKNOWN';
        const rutEmisor = encabezado.Emisor?.RUTEmisor || 'UNKNOWN';
        const razonsocial = encabezado.Emisor?.RznSoc || 'Unknown Supplier';
        const total = Number(encabezado.Totales?.MntTotal) || 0;

        const items = Array.isArray(detalle) ? detalle : [detalle];
        const processedItems: ProcessedInvoiceItem[] = [];

        await client.query('BEGIN');

        // Identify Supplier ID first (needed for learning)
        let supplierId: string | null = null;
        const suppRes = await client.query(`SELECT id FROM suppliers WHERE rut = $1`, [rutEmisor]);
        if (suppRes.rows.length > 0) {
            supplierId = suppRes.rows[0].id;
        } else {
            // Auto-create supplier if missing
            const newSupp = await client.query(`
                INSERT INTO suppliers (name, rut, contact_email) 
                VALUES ($1, $2, 'facturacion@auto.cl') 
                RETURNING id`,
                [razonsocial, rutEmisor]
            );
            supplierId = newSupp.rows[0].id;
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const rawName = item.NmbItem || '';
            const rawCode = item.CdgItem?.VlrCodigo || '';
            const qty = Number(item.QtyItem) || 0;
            const price = Number(item.PrcItem) || 0;

            const pItem: ProcessedInvoiceItem = {
                line: i + 1,
                rawName,
                rawCode,
                qty,
                price
            };

            // STRATEGY 1: Learned Mapping (Memory)
            // Check if we already know this Supplier SKU
            let targetProductId: string | null = null;
            let matchSource = 'UNKNOWN';
            let reasoning = '';

            if (supplierId && rawCode) {
                const mapRes = await client.query(`
                    SELECT product_id FROM product_suppliers 
                    WHERE supplier_id = $1 AND supplier_sku = $2
                `, [supplierId, rawCode]);

                if (mapRes.rows.length > 0) {
                    targetProductId = mapRes.rows[0].product_id;
                    matchSource = 'LEARNED_MEMORY';
                    reasoning = 'Match histórico por Código Proveedor';
                }
            }

            // STRATEGY 2: Conventional Matching (Barcode/Fuzzy)
            if (!targetProductId) {
                const matchRes = await matchProduct(client, { title: rawName, sku: rawCode });
                if (matchRes.targetProductId && matchRes.confidence > 0.8) {
                    targetProductId = matchRes.targetProductId;
                    matchSource = 'ALGORITHM';
                    reasoning = `Algoritmo Clásico (Confianza ${(matchRes.confidence * 100).toFixed(0)}%)`;
                }
            }

            // STRATEGY 3: AI Semantic Matcher (The Brain)
            if (!targetProductId) {
                // Fetch candidates using Full Text Search to narrow down for AI
                const candidatesRes = await client.query(`
                    SELECT id, name as title, sku, active_principle 
                    FROM products 
                    WHERE to_tsvector('spanish', name) @@ plainto_tsquery('spanish', $1)
                    LIMIT 5
                `, [rawName]);

                const candidates = candidatesRes.rows as InvoiceItemCandidate[];

                if (candidates.length > 0) {
                    const aiDecision = await InvoiceMapperService.findBestMatch(rawName, rawCode, candidates);
                    if (aiDecision.bestMatchId && aiDecision.confidence > 0.7) {
                        targetProductId = aiDecision.bestMatchId;
                        matchSource = 'AI_SEMANTIC';
                        reasoning = `✨ ${aiDecision.reasoning}`;
                    }
                }
            }

            // ACTION: Update Stock + Learn
            if (targetProductId) {
                // A. Update Stock
                const currentProdRes = await client.query(`
                    SELECT stock_actual, cost_price FROM products WHERE id = $1 FOR UPDATE
                `, [targetProductId]);

                if (currentProdRes.rows.length > 0) {
                    const row = currentProdRes.rows[0];
                    const currentStock = Number(row.stock_actual || 0);
                    const currentCost = Number(row.cost_price || 0);

                    // Weighted Average Cost (PPP)
                    const totalQty = currentStock + qty;
                    let newCost = currentCost;
                    if (totalQty > 0) newCost = Math.round(((currentStock * currentCost) + (qty * price)) / totalQty);

                    await client.query(`
                        UPDATE products 
                        SET stock_actual = $1, stock_total = $1, cost_price = $2, updated_at = NOW()
                        WHERE id = $3
                    `, [currentStock + qty, newCost, targetProductId]);

                    pItem.updatedStock = currentStock + qty;
                    pItem.updatedCost = newCost;

                    // B. Learn (Save Mapping) if it wasn't already learned
                    if (matchSource !== 'LEARNED_MEMORY' && supplierId && rawCode) {
                        // We upsert into product_suppliers so next time it is instant
                        await client.query(`
                            INSERT INTO product_suppliers (product_id, supplier_id, supplier_sku, supplier_product_name, is_preferred)
                            VALUES ($1, $2, $3, $4, true)
                            ON CONFLICT (product_id, supplier_id) 
                            DO UPDATE SET supplier_sku = EXCLUDED.supplier_sku, supplier_product_name = EXCLUDED.supplier_product_name
                         `, [targetProductId, supplierId, rawCode, rawName]);
                        reasoning += ' (Aprendido para el futuro)';
                    }
                }

                pItem.matchResult = {
                    status: 'MATCHED',
                    confidence: 1,
                    targetProductId,
                    matchType: 'AI_SUGGESTION' as const,
                    suggestion: { id: targetProductId, name: "Matched", source: matchSource }
                };
                pItem.aiReasoning = reasoning;
            } else {
                pItem.matchResult = {
                    status: 'NEEDS_REVIEW' as const,
                    confidence: 0,
                    matchType: 'AI_SKIPPED' as const,
                    targetProductId: null,
                    suggestion: undefined
                };
            }

            processedItems.push(pItem);
        }

        // Save Invoice History
        await client.query(`
            INSERT INTO invoice_history (invoice_number, supplier_rut, total_amount, processed_data) 
            VALUES ($1, $2, $3, $4)
        `, [String(invoiceId), rutEmisor, total, JSON.stringify({ items: processedItems })]);

        await client.query('COMMIT');

        return {
            success: true,
            invoiceNumber: String(invoiceId),
            supplierRut: rutEmisor,
            totalAmount: total,
            items: processedItems
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Invoice Processing Error:", error);
        return { success: false, message: error.message };
    } finally {
        await client.end();
    }
}
