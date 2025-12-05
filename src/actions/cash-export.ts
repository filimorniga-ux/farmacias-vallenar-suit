'use server';

import ExcelJS from 'exceljs';
import { SaleTransaction, CashMovement, Expense } from '@/domain/types';

interface ExtendedSaleTransaction extends SaleTransaction {
    seller_name?: string;
    terminal_name?: string;
}

interface ExtendedCashMovement extends CashMovement {
    user_name?: string;
    terminal_name?: string;
}

interface CashReportData {
    sales: ExtendedSaleTransaction[];
    movements: ExtendedCashMovement[];
    expenses: Expense[];
    startDate: string;
    endDate: string;
    generatedBy: string;
}

export async function generateCashReport(data: CashReportData) {
    try {
        const { sales, movements, expenses, startDate, endDate, generatedBy } = data;
        const workbook = new ExcelJS.Workbook();

        workbook.creator = generatedBy;
        workbook.created = new Date();

        // ---------------------------------------------------------
        // SHEET 1: VENTAS DETALLADAS (Item Level)
        // ---------------------------------------------------------
        const salesSheet = workbook.addWorksheet('Detalle Ventas');

        salesSheet.columns = [
            { header: 'ID Venta', key: 'id', width: 20 },
            { header: 'Fecha', key: 'date', width: 12 },
            { header: 'Hora', key: 'time', width: 10 },
            { header: 'Sucursal', key: 'branch', width: 15 },
            { header: 'Caja', key: 'terminal', width: 15 }, // NEW
            { header: 'Vendedor', key: 'seller', width: 20 }, // Wider for Name
            { header: 'Cliente', key: 'customer', width: 25 },
            { header: 'RUT Cliente', key: 'customer_rut', width: 15 },
            { header: 'Método Pago', key: 'payment', width: 15 },
            { header: 'Estado DTE', key: 'dte_status', width: 15 },
            { header: 'Folio', key: 'folio', width: 10 },
            { header: 'SKU Item', key: 'sku', width: 15 },
            { header: 'Producto', key: 'product', width: 40 },
            { header: 'Cantidad', key: 'qty', width: 10 },
            { header: 'Precio Unit.', key: 'price', width: 12 },
            { header: 'Total Item', key: 'total_item', width: 12 },
            { header: 'Total Venta', key: 'total_sale', width: 15 }, // Repeated for context
        ];

        // Add Data
        sales.forEach(sale => {
            const dateObj = new Date(sale.timestamp);
            const dateStr = dateObj.toLocaleDateString('es-CL');
            const timeStr = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

            sale.items.forEach(item => {
                salesSheet.addRow({
                    id: sale.id,
                    date: dateStr,
                    time: timeStr,
                    branch: sale.branch_id || 'N/A',
                    terminal: sale.terminal_name || 'N/A', // NEW
                    seller: sale.seller_name || sale.seller_id, // Fallback to ID if name missing
                    customer: sale.customer?.fullName || 'Anónimo',
                    customer_rut: sale.customer?.rut || '',
                    payment: sale.payment_method,
                    dte_status: sale.dte_status || 'N/A',
                    folio: sale.dte_folio || '',
                    sku: item.sku,
                    product: item.name,
                    qty: item.quantity,
                    price: item.price,
                    total_item: item.price * item.quantity,
                    total_sale: sale.total
                });
            });
        });

        // Styling Header
        salesSheet.getRow(1).font = { bold: true };
        salesSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // ---------------------------------------------------------
        // SHEET 2: MOVIMIENTOS DE CAJA (In/Out)
        // ---------------------------------------------------------
        const cashSheet = workbook.addWorksheet('Movimientos Caja');

        cashSheet.columns = [
            { header: 'ID', key: 'id', width: 20 },
            { header: 'Fecha', key: 'date', width: 12 },
            { header: 'Hora', key: 'time', width: 10 },
            { header: 'Caja', key: 'terminal', width: 15 }, // NEW
            { header: 'Turno ID', key: 'shift', width: 15 },
            { header: 'Usuario', key: 'user', width: 20 }, // Wider for Name
            { header: 'Tipo', key: 'type', width: 10 }, // IN / OUT
            { header: 'Motivo', key: 'reason', width: 20 },
            { header: 'Descripción', key: 'desc', width: 40 },
            { header: 'Monto', key: 'amount', width: 15 },
            { header: 'Efectivo?', key: 'is_cash', width: 10 },
        ];

        movements.forEach(mov => {
            const dateObj = new Date(mov.timestamp);
            cashSheet.addRow({
                id: mov.id,
                date: dateObj.toLocaleDateString('es-CL'),
                time: dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
                terminal: mov.terminal_name || 'N/A', // NEW
                shift: mov.shift_id.slice(-6), // Short ID
                user: mov.user_name || mov.user_id, // Fallback
                type: mov.type === 'IN' ? 'INGRESO' : 'EGRESO',
                reason: mov.reason,
                desc: mov.description,
                amount: mov.amount,
                is_cash: mov.is_cash ? 'Sí' : 'No'
            });
        });

        cashSheet.getRow(1).font = { bold: true };
        cashSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // ---------------------------------------------------------
        // SHEET 3: GASTOS REGISTRADOS
        // ---------------------------------------------------------
        const expenseSheet = workbook.addWorksheet('Gastos');

        expenseSheet.columns = [
            { header: 'ID', key: 'id', width: 20 },
            { header: 'Fecha', key: 'date', width: 12 },
            { header: 'Categoría', key: 'cat', width: 20 },
            { header: 'Descripción', key: 'desc', width: 40 },
            { header: 'Monto', key: 'amount', width: 15 },
            { header: 'Deducible?', key: 'deductible', width: 10 },
            { header: 'Documento', key: 'doc', width: 15 },
        ];

        expenses.forEach(exp => {
            const dateObj = new Date(exp.date);
            expenseSheet.addRow({
                id: exp.id,
                date: dateObj.toLocaleDateString('es-CL'),
                cat: exp.category,
                desc: exp.description,
                amount: exp.amount,
                deductible: exp.is_deductible ? 'Sí' : 'No',
                doc: exp.document_type || 'N/A'
            });
        });

        expenseSheet.getRow(1).font = { bold: true };
        expenseSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // ---------------------------------------------------------
        // WRITE TO BUFFER & RETURN
        // ---------------------------------------------------------
        const buffer = await workbook.xlsx.writeBuffer();

        // Convert buffer to Base64 string to send back to client
        const base64 = Buffer.from(buffer).toString('base64');

        return { success: true, fileData: base64, fileName: `Reporte_Caja_${startDate}_${endDate}.xlsx` };

    } catch (error: any) {
        console.error('Error generating cash report:', error);
        return { success: false, error: error.message };
    }
}
