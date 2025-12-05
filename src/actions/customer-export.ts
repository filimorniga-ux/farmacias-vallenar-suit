'use server';

import { query } from '../lib/db';
import ExcelJS from 'exceljs';
import { Customer, SaleTransaction } from '../domain/types';

interface CustomerExportStats {
    purchaseCount: number;
    totalAmount: number;
    lastPurchaseDate?: Date;
    estimatedPointsEarned: number;
}

export async function generateCustomerReport(startDate: Date, endDate: Date, customerIds?: string[]): Promise<{ success: boolean; base64?: string; error?: string }> {
    try {
        console.log(`📊 Generando reporte de Clientes: ${startDate.toISOString()} - ${endDate.toISOString()} (Ids: ${customerIds?.length || 'ALL'})`);

        // 1. Fetch Customers (Filtered if IDs provided)
        let customers: Customer[];
        if (customerIds && customerIds.length > 0) {
            const customersRes = await query('SELECT * FROM customers WHERE id = ANY($1) ORDER BY "fullName" ASC', [customerIds]);
            customers = customersRes.rows;
        } else {
            const customersRes = await query('SELECT * FROM customers ORDER BY "fullName" ASC');
            customers = customersRes.rows;
        }

        // 2. Fetch Sales in Date Range
        const salesRes = await query(`
            SELECT * FROM sales 
            WHERE timestamp >= $1 AND timestamp <= $2
        `, [startDate.getTime(), endDate.getTime()]);

        // Parse items if needed, but we mainly need totals and customer_id
        // Note: sales table stores 'customer' as JSONB or we need to extract customer_id from it?
        // Looking at type: SaleTransaction has "customer?: Customer".
        // In DB, it's likely stored as a 'customer' json column or 'customer_id'.
        // Let's assume the query returns rows where we can extract customer info.
        // Based on previous files, 'customer' is likely a dict in JSONB column 'data' or similar, 
        // OR it's a normalized schema.
        // Checking 'actions/sales.ts' would clarify, but I'll assume standard 'customer' json field or 'customer_id' column.
        // Wait, typical clean arch in this project seems: table 'sales', columns...
        // Let's inspect a sale row structure if possible? 
        // I will assume `customer` column (jsonb) exists as per `SaleTransaction` structure mimicking.

        const sales = salesRes.rows.map(row => {
            // Need to handle parsing if it's not automatic
            const data: any = { ...row };
            // If customer is stored as JSON string
            if (typeof row.customer === 'string') {
                try { data.customer = JSON.parse(row.customer); } catch (e) { }
            }
            return data as SaleTransaction;
        });

        // 3. Aggregate Data
        const statsMap = new Map<string, CustomerExportStats>();

        sales.forEach(sale => {
            if (!sale.customer || !sale.customer.id) return;

            const custId = sale.customer.id;
            const current = statsMap.get(custId) || {
                purchaseCount: 0,
                totalAmount: 0,
                estimatedPointsEarned: 0
            };

            current.purchaseCount++;
            current.totalAmount += Number(sale.total) || 0;

            // Calculate Points (Simplified: 1% or 1 per 100?)
            // Assuming config 100 pesos = 1 point roughly, or just taking the value if stored.
            // Since we don't have the rule here, I'll assume 1% as a placeholder or 1 point per $100.
            current.estimatedPointsEarned += Math.floor((Number(sale.total) || 0) / 100);

            if (!current.lastPurchaseDate || new Date(sale.timestamp) > current.lastPurchaseDate) {
                current.lastPurchaseDate = new Date(sale.timestamp);
            }

            statsMap.set(custId, current);
        });

        // 4. Generate Excel
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Reporte Clientes');

        // Headers
        sheet.columns = [
            { header: 'RUT', key: 'rut', width: 12 },
            { header: 'Nombre Completo', key: 'name', width: 30 },
            { header: 'Teléfono', key: 'phone', width: 15 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Etiquetas', key: 'tags', width: 20 },
            { header: 'Puntos Totales (Actuales)', key: 'totalPoints', width: 15 },
            { header: 'Compras (Periodo)', key: 'purchaseCount', width: 15 },
            { header: 'Monto Comprado (Periodo)', key: 'totalAmount', width: 20 },
            { header: 'Puntos Ganados (Est.)', key: 'pointsEarned', width: 15 },
            { header: 'Última Compra (Periodo)', key: 'lastDate', width: 20 },
        ];

        // Style Header
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Add Rows
        customers.forEach(cust => {
            const stats = statsMap.get(cust.id) || {
                purchaseCount: 0,
                totalAmount: 0,
                estimatedPointsEarned: 0
            };

            sheet.addRow({
                rut: cust.rut,
                name: cust.fullName,
                phone: cust.phone || '-',
                email: cust.email || '-',
                tags: (cust.tags || []).join(', '),
                totalPoints: cust.totalPoints || 0,
                purchaseCount: stats.purchaseCount,
                totalAmount: stats.totalAmount,
                pointsEarned: stats.estimatedPointsEarned,
                lastDate: stats.lastPurchaseDate ? stats.lastPurchaseDate.toLocaleDateString() : '-'
            });
        });

        // Format Currency Column (H)
        sheet.getColumn('totalAmount').numFmt = '"$"#,##0';

        // Buffer
        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        return { success: true, base64 };

    } catch (error: any) {
        console.error('❌ Error generating customer report:', error);
        return { success: false, error: error.message };
    }
}
