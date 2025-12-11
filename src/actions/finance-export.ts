'use server';

import { ExcelService } from '@/lib/excel-generator';
import {
    getCashFlowLedger,
    getDetailedFinancialSummary,
    getTaxSummary,
    getInventoryValuation,
    getLogisticsKPIs,
    getPayrollPreview,
    getStockMovementsDetail
} from './reports-detail';

// Re-using types from reports-detail if needed, or inferring

export type ReportType = 'CASH_FLOW' | 'TAX' | 'LOGISTICS' | 'PAYROLL';

interface FinanceExportParams {
    type: ReportType;
    startDate: string; // ISO
    endDate: string; // ISO
    warehouseId?: string; // For Logistics
    locationId?: string; // For Cash Flow context
    userName?: string; // For metadata
    locationName?: string; // For metadata
}

export async function exportFinanceReport(params: FinanceExportParams) {
    try {
        const { type, startDate, endDate, warehouseId, locationId, userName, locationName } = params;
        const excel = new ExcelService();
        let buffer: Buffer;
        let fileName = `Reporte_${type}_${startDate.split('T')[0]}.xlsx`;

        switch (type) {
            case 'CASH_FLOW': {
                const [ledger, summary] = await Promise.all([
                    getCashFlowLedger(startDate, endDate, locationId),
                    getDetailedFinancialSummary(startDate, endDate)
                ]);

                // Prepare Data
                const data = ledger.map(row => ({
                    date: new Date(row.timestamp).toLocaleString('es-CL'),
                    desc: row.description,
                    cat: row.category,
                    user: row.user_name,
                    in: row.amount_in,
                    out: row.amount_out
                }));

                // We could add a summary sheet or put summary at top. ExcelService supports subtitle.
                // Let's format subtitle with summary info.
                const sub = `Ingresos: $${summary.total_sales.toLocaleString()} | Egresos: $${(summary.total_payroll + summary.total_operational_expenses).toLocaleString()} | Utilidad: $${summary.net_income.toLocaleString()}`;

                buffer = await excel.generateReport({
                    title: 'Flujo de Caja Detallado',
                    subtitle: sub,
                    sheetName: 'Movimientos',
                    creator: userName,
                    locationName: locationName,
                    columns: [
                        { header: 'Fecha', key: 'date', width: 20 },
                        { header: 'Descripción', key: 'desc', width: 40 },
                        { header: 'Categoría', key: 'cat', width: 15 },
                        { header: 'Responsable', key: 'user', width: 20 },
                        { header: 'Entrada ($)', key: 'in', width: 15 },
                        { header: 'Salida ($)', key: 'out', width: 15 }
                    ],
                    data: data
                });
                break;
            }

            case 'TAX': {
                // Determine month from startDate
                const dateObj = new Date(startDate);
                const monthStr = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;

                const taxData = await getTaxSummary(monthStr);

                const data = [
                    { concept: 'Ventas Netas', value: taxData.total_net_sales, detail: 'Base Imponible Ventas' },
                    { concept: 'IVA Débito (Ventas)', value: taxData.total_vat_debit, detail: 'Impuesto Recaudado' },
                    { concept: 'Compras Netas', value: taxData.total_net_purchases, detail: 'Base Imponible Compras' },
                    { concept: 'IVA Crédito (Compras)', value: taxData.total_vat_credit, detail: 'Impuesto Soportado' },
                    { concept: 'IMPUESTO A PAGAR (Estimado)', value: taxData.estimated_tax_payment, detail: 'Débito - Crédito' }
                ];

                buffer = await excel.generateReport({
                    title: 'Resumen Tributario (Simulación F29)',
                    subtitle: `Período: ${taxData.period}`,
                    sheetName: 'Impuestos',
                    creator: userName,
                    locationName: locationName,
                    columns: [
                        { header: 'Concepto', key: 'concept', width: 30 },
                        { header: 'Monto ($)', key: 'value', width: 20 },
                        { header: 'Detalle', key: 'detail', width: 30 }
                    ],
                    data: data
                });
                break;
            }

            case 'LOGISTICS': {
                const [valData, kpiData] = await Promise.all([
                    getInventoryValuation(warehouseId),
                    getLogisticsKPIs(startDate, endDate, warehouseId)
                ]);

                // We'll export the Top Products list as it's the most "tabular" data
                // And maybe add KPIs in subtitle
                const sub = `Entradas: ${kpiData.total_in} | Salidas: ${kpiData.total_out} | Valor Costo: $${valData.total_cost_value.toLocaleString()} | Valor Venta: $${valData.total_sales_value.toLocaleString()}`;

                const data = valData.top_products.map(p => ({
                    name: p.name,
                    sku: p.sku,
                    qty: p.quantity,
                    cost: p.cost_value,
                    sale: p.sales_value,
                    margin: p.sales_value - p.cost_value
                }));

                buffer = await excel.generateReport({
                    title: 'Valorización de Inventario (Top Productos)',
                    subtitle: sub,
                    sheetName: 'Inventario',
                    creator: userName,
                    locationName: locationName,
                    columns: [
                        { header: 'Producto', key: 'name', width: 40 },
                        { header: 'SKU', key: 'sku', width: 15 },
                        { header: 'Cantidad', key: 'qty', width: 10 },
                        { header: 'Valor Costo ($)', key: 'cost', width: 15 },
                        { header: 'Valor Venta ($)', key: 'sale', width: 15 },
                        { header: 'Margen ($)', key: 'margin', width: 15 }
                    ],
                    data: data
                });
                break;
            }

            case 'PAYROLL': {
                const payroll = await getPayrollPreview();

                const data = payroll.map(p => ({
                    rut: p.rut,
                    name: p.name,
                    role: p.job_title,
                    base: p.base_salary,
                    afp: p.deductions.afp,
                    health: p.deductions.health,
                    liquid: p.total_liquid
                }));

                const totalLiquido = payroll.reduce((acc, curr) => acc + curr.total_liquid, 0);

                buffer = await excel.generateReport({
                    title: 'Pre-Nómina de Remuneraciones',
                    subtitle: `Total a Pagar (Líquido): $${totalLiquido.toLocaleString('es-CL')}`,
                    sheetName: 'Nomina',
                    creator: userName,
                    locationName: locationName,
                    columns: [
                        { header: 'RUT', key: 'rut', width: 15 },
                        { header: 'Nombre', key: 'name', width: 30 },
                        { header: 'Cargo', key: 'role', width: 20 },
                        { header: 'Sueldo Base ($)', key: 'base', width: 15 },
                        { header: 'AFP ($)', key: 'afp', width: 15 },
                        { header: 'Salud ($)', key: 'health', width: 15 },
                        { header: 'Líquido ($)', key: 'liquid', width: 15 }
                    ],
                    data: data
                });
                break;
            }

            default:
                throw new Error('Tipo de reporte no soportado');
        }

        const base64 = buffer.toString('base64');
        return { success: true, fileData: base64, fileName };

    } catch (error: any) {
        console.error('Export Finance Error:', error);
        return { success: false, error: error.message };
    }
}
