'use server';

import { query } from '../lib/db';
import ExcelJS from 'exceljs';
import { Supplier, PurchaseOrder, SupplierDocument } from '../domain/types';

interface SupplierExportStats {
    poCount: number;
    poTotalAmount: number;
    invoiceCount: number;
    invoiceTotalAmount: number;
    creditNoteCount: number;
    creditNoteTotalAmount: number;
    lastInteractionDate?: Date;
}

export async function generateSupplierReport(startDate: Date, endDate: Date, supplierIds?: string[]): Promise<{ success: boolean; base64?: string; error?: string }> {
    try {
        console.log(`📊 Generando reporte de Proveedores: ${startDate.toISOString()} - ${endDate.toISOString()} (Ids: ${supplierIds?.length || 'ALL'})`);

        // 1. Fetch Suppliers (Filtered if IDs provided)
        let suppliers: Supplier[];
        if (supplierIds && supplierIds.length > 0) {
            const suppliersRes = await query('SELECT * FROM suppliers WHERE id = ANY($1) ORDER BY "business_name" ASC', [supplierIds]);
            suppliers = suppliersRes.rows;
        } else {
            const suppliersRes = await query('SELECT * FROM suppliers ORDER BY "business_name" ASC');
            suppliers = suppliersRes.rows;
        }

        // 2. Fetch Purchase Orders in Range
        const poRes = await query(`
            SELECT * FROM purchase_orders 
            WHERE created_at >= $1 AND created_at <= $2
        `, [startDate.getTime(), endDate.getTime()]);
        const purchaseOrders: PurchaseOrder[] = poRes.rows;

        // 3. Fetch Documents (Invoices/Credit Notes) in Range
        // Attempt to query supplier_documents. If table misses, we catch error or handle empty.
        let supplierDocs: SupplierDocument[] = [];
        try {
            const docsRes = await query(`
                SELECT * FROM supplier_documents 
                WHERE issue_date >= $1 AND issue_date <= $2
            `, [startDate.getTime(), endDate.getTime()]);
            supplierDocs = docsRes.rows;
        } catch (e) {
            console.warn('⚠️ Could not fetch supplier_documents (table might not exist yet)', e);
        }

        // 4. Aggregate Data
        const statsMap = new Map<string, SupplierExportStats>();

        // Process POs
        purchaseOrders.forEach(po => {
            if (!po.supplier_id) return;
            const current = statsMap.get(po.supplier_id) || {
                poCount: 0, poTotalAmount: 0,
                invoiceCount: 0, invoiceTotalAmount: 0,
                creditNoteCount: 0, creditNoteTotalAmount: 0
            };

            current.poCount++;
            current.poTotalAmount += Number(po.total_estimated) || 0;

            const poDate = new Date(po.created_at);
            if (!current.lastInteractionDate || poDate > current.lastInteractionDate) {
                current.lastInteractionDate = poDate;
            }
            statsMap.set(po.supplier_id, current);
        });

        // Process Documents
        supplierDocs.forEach(doc => {
            if (!doc.supplier_id) return;
            const current = statsMap.get(doc.supplier_id) || {
                poCount: 0, poTotalAmount: 0,
                invoiceCount: 0, invoiceTotalAmount: 0,
                creditNoteCount: 0, creditNoteTotalAmount: 0
            };

            const docDate = new Date(doc.issue_date);
            if (!current.lastInteractionDate || docDate > current.lastInteractionDate) {
                current.lastInteractionDate = docDate;
            }

            if (doc.type === 'FACTURA') {
                current.invoiceCount++;
                current.invoiceTotalAmount += Number(doc.amount) || 0;
            } else if (doc.type === 'NOTA_CREDITO') {
                current.creditNoteCount++;
                current.creditNoteTotalAmount += Number(doc.amount) || 0;
            }
            statsMap.set(doc.supplier_id, current);
        });

        // 5. Generate Excel
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Reporte Proveedores');

        // Headers
        sheet.columns = [
            { header: 'RUT', key: 'rut', width: 12 },
            { header: 'Razón Social', key: 'business_name', width: 30 },
            { header: 'Rubro/Sector', key: 'sector', width: 20 },
            { header: 'Email Contacto', key: 'email', width: 25 },
            { header: 'Teléfono', key: 'phone', width: 15 },
            { header: 'Condición Pago', key: 'payment_terms', width: 15 },
            { header: 'Tiempo Entrega (Días)', key: 'lead_time', width: 15 },

            // Dynamic Data
            { header: 'Ordenes Compra (N°)', key: 'poCount', width: 15 },
            { header: 'Total O.C. ($)', key: 'poTotal', width: 18 },
            { header: 'Facturas (N°)', key: 'invCount', width: 15 },
            { header: 'Total Facturado ($)', key: 'invTotal', width: 18 },
            { header: 'Notas Crédito (N°)', key: 'ncCount', width: 15 },
            { header: 'Total N.C. ($)', key: 'ncTotal', width: 18 },
            { header: 'Última Actividad', key: 'lastDate', width: 18 },
        ];

        // Style
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }; // Light Green

        // Add Rows
        suppliers.forEach(sup => {
            const stats = statsMap.get(sup.id) || {
                poCount: 0, poTotalAmount: 0,
                invoiceCount: 0, invoiceTotalAmount: 0,
                creditNoteCount: 0, creditNoteTotalAmount: 0
            };

            sheet.addRow({
                rut: sup.rut,
                business_name: sup.business_name,
                sector: sup.sector,
                email: sup.contact_email || '-',
                phone: sup.phone_1 || '-',
                payment_terms: sup.payment_terms || 'CONTADO',
                lead_time: sup.lead_time_days || '-',

                poCount: stats.poCount,
                poTotal: stats.poTotalAmount,
                invCount: stats.invoiceCount,
                invTotal: stats.invoiceTotalAmount,
                ncCount: stats.creditNoteCount,
                ncTotal: stats.creditNoteTotalAmount,
                lastDate: stats.lastInteractionDate ? stats.lastInteractionDate.toLocaleDateString() : '-'
            });
        });

        // Format Currencies
        ['poTotal', 'invTotal', 'ncTotal'].forEach(key => {
            sheet.getColumn(key).numFmt = '"$"#,##0';
        });

        // Buffer
        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        return { success: true, base64 };

    } catch (error: any) {
        console.error('❌ Error generating supplier report:', error);
        return { success: false, error: error.message };
    }
}
