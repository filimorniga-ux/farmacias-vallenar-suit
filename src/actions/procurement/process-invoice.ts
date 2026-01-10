'use server';

import { Client } from 'pg';
import { XMLParser } from 'fast-xml-parser';
import { matchProduct, type MatchResult } from '../../services/inventory-matcher';

const getClient = () => new Client({ connectionString: process.env.DATABASE_URL });

export interface ProcessedInvoiceItem {
    line: number;
    rawName: string;
    rawCode: string;
    qty: number;
    price: number;
    matchResult?: MatchResult;
    updatedStock?: number;
    updatedCost?: number;
    error?: string;
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
        // 1. Parse XML
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        const jsonObj = parser.parse(xmlContent);

        // Basic DTE structure handling (Chilean DTE)
        // Usually DTE -> Documento -> Encabezado / Detalle
        const dte = jsonObj.DTE || jsonObj.EnvioDTE?.SetDTE?.DTE; // Simplified check
        if (!dte) {
            throw new Error("Formato XML no reconocido (No se encontró nodo DTE)");
        }

        const doc = Array.isArray(dte) ? dte[0] : dte; // Handle sets
        const encabezado = doc.Documento?.Encabezado;
        const detalle = doc.Documento?.Detalle;

        if (!encabezado || !detalle) {
            throw new Error("XML incompleto: falta Encabezado o Detalle");
        }

        const invoiceId = encabezado.IdDoc?.Folio || 'UNKNOWN';
        const rutEmisor = encabezado.Emisor?.RUTEmisor || 'UNKNOWN';
        const total = Number(encabezado.Totales?.MntTotal) || 0;

        const items = Array.isArray(detalle) ? detalle : [detalle];
        const processedItems: ProcessedInvoiceItem[] = [];

        // 2. Process Items
        await client.query('BEGIN'); // Transaction

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const rawName = item.NmbItem || '';
            const rawCode = item.CdgItem?.VlrCodigo || ''; // Assuming VlrCodigo holds SKU/Barcode often
            const qty = Number(item.QtyItem) || 0;
            const price = Number(item.PrcItem) || 0;

            const pItem: ProcessedInvoiceItem = {
                line: i + 1,
                rawName,
                rawCode,
                qty,
                price
            };

            // 3. Match
            const matchRes = await matchProduct(client, {
                title: rawName,
                sku: rawCode,
                // We could guess lab if provided in description
            });

            pItem.matchResult = matchRes;

            // 4. Update Inventory if High Confidence
            // Only if we found a TARGET PRODUCT ID (e.g. barcode match or strict ISP link that we mapped)
            // Current matchProduct logic returns targetProductId mainly on BARCODE match.
            // If AI match, we usually set NEEDS_REVIEW and no ID unless we trust it blindly.
            // Requirement: "Si match.confidence > 0.85 (alta seguridad), procede automáticamente."

            if (matchRes.targetProductId && matchRes.confidence > 0.85) {
                // Get current values
                const currentProdRes = await client.query(`
                    SELECT stock_actual, cost_price, stock_total FROM products WHERE id = $1 FOR UPDATE
                `, [matchRes.targetProductId]);

                if (currentProdRes.rows.length > 0) {
                    const row = currentProdRes.rows[0];
                    const currentStock = Number(row.stock_actual || 0);
                    const currentCost = Number(row.cost_price || 0);

                    // Calc new values (PPP)
                    // New Cost = ((OldStock * OldCost) + (NewQty * NewCost)) / (OldStock + NewQty)
                    const totalQty = currentStock + qty;
                    let newCost = currentCost;

                    if (totalQty > 0) {
                        newCost = Math.round(((currentStock * currentCost) + (qty * price)) / totalQty);
                    }

                    const newStock = currentStock + qty;

                    // Update DB
                    await client.query(`
                        UPDATE products 
                        SET 
                            stock_actual = $1,
                            stock_total = $1, -- Assuming total tracks actual for now
                            cost_price = $2,
                            updated_at = NOW()
                        WHERE id = $3
                    `, [newStock, newCost, matchRes.targetProductId]);

                    pItem.updatedStock = newStock;
                    pItem.updatedCost = newCost;
                    pItem.matchResult.status = 'MATCHED'; // Confirmed
                }
            }

            processedItems.push(pItem);
        }

        // 5. Save History
        await client.query(`
            INSERT INTO invoice_history (
                invoice_number, supplier_rut, total_amount, processed_data
            ) VALUES ($1, $2, $3, $4)
        `, [
            String(invoiceId),
            rutEmisor,
            total,
            JSON.stringify({ items: processedItems })
        ]);

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
        return {
            success: false,
            message: error.message
        };
    } finally {
        await client.end();
    }
}
