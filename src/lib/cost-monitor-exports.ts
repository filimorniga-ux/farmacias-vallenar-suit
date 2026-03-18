'use client';

import { ExcelService } from './excel-generator';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTimeCL } from './timezone';

/* ====================================================================
   TYPES (reusable from page state)
   ==================================================================== */

interface DashboardSummary {
    totalChanges: number;
    costIncreases: number;
    costDecreases: number;
    priceChanges: number;
    levelings: number;
    avgChangePercent: number;
    topIncreases: HistoryRow[];
    topDecreases: HistoryRow[];
}

interface HistoryRow {
    id?: string;
    product_name?: string;
    sku?: string;
    old_value: number;
    new_value: number;
    change_percent: number;
    change_type?: string;
    source?: string;
    created_at: string;
}

interface Recommendation {
    id: string;
    product_name?: string;
    sku?: string;
    recommendation_type: string;
    reason: string;
    current_cost: number;
    suggested_cost: number;
    current_price: number;
    suggested_price: number;
    margin_current: number;
    margin_suggested: number;
    savings_per_unit: number;
    status: string;
    created_at: string;
    resolved_at?: string;
}

interface SupplierRow {
    product_name?: string;
    sku?: string;
    current_cost: number;
    cheapest_cost: number;
    cheapest_supplier: string;
    most_expensive_cost: number;
    most_expensive_supplier: string;
    price_spread: number;
    supplier_count: number;
}

/* ====================================================================
   HELPERS
   ==================================================================== */

const CLP = (v: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);

function downloadBlob(buffer: Buffer | ArrayBuffer | Uint8Array, filename: string) {
    const blob = new Blob([buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function dateSuffix(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

const REC_TYPE_LABELS: Record<string, string> = {
    RAISE_PRICE: 'Subir Precio',
    KEEP_PRICE: 'Mantener Precio',
    LOWER_PRICE: 'Bajar Precio',
    LEVEL_PRICE: 'Nivelar Precio',
    FINISH_OLD_STOCK: 'Terminar Stock',
    SWITCH_SUPPLIER: 'Cambiar Proveedor',
};

const SOURCE_LABELS: Record<string, string> = {
    RECEPTION: 'OC',
    LEVELING: 'Nivelación',
    BULK_GENERATE: 'Automático',
};

/* ====================================================================
   EXCEL EXPORTS — Using ExcelService with corporate branding
   ==================================================================== */

export async function exportDashboardExcel(summary: DashboardSummary, periodLabel: string) {
    const svc = new ExcelService();

    const kpiData = [
        { indicador: 'Total Cambios', valor: summary.totalChanges },
        { indicador: 'Costos Subieron', valor: summary.costIncreases },
        { indicador: 'Costos Bajaron', valor: summary.costDecreases },
        { indicador: 'Cambios de Precio', valor: summary.priceChanges },
        { indicador: 'Nivelaciones', valor: summary.levelings },
        { indicador: '% Variación Promedio', valor: summary.avgChangePercent },
    ];

    const buffer = await svc.generateMultiSheetReport({
        creator: 'Monitor de Precios',
        locationName: 'Farmacias Vallenar',
        sheets: [
            {
                name: 'Resumen',
                title: `Dashboard Monitor de Precios`,
                subtitle: `Período: ${periodLabel}`,
                columns: [
                    { header: 'Indicador', key: 'indicador', width: 30 },
                    { header: 'Valor', key: 'valor', width: 15 },
                ],
                data: kpiData,
            },
            {
                name: 'Mayores Subidas',
                title: 'Mayores Subidas de Costo',
                subtitle: periodLabel,
                columns: [
                    { header: 'Producto', key: 'product_name', width: 35 },
                    { header: 'SKU', key: 'sku', width: 15 },
                    { header: 'Costo Anterior', key: 'old_value', width: 18 },
                    { header: 'Costo Nuevo', key: 'new_value', width: 18 },
                    { header: '% Cambio', key: 'change_percent', width: 12 },
                ],
                data: summary.topIncreases.map(r => ({
                    ...r,
                    change_percent: Number(r.change_percent).toFixed(1) + '%',
                })),
            },
            {
                name: 'Mayores Bajadas',
                title: 'Mayores Bajadas de Costo',
                subtitle: periodLabel,
                columns: [
                    { header: 'Producto', key: 'product_name', width: 35 },
                    { header: 'SKU', key: 'sku', width: 15 },
                    { header: 'Costo Anterior', key: 'old_value', width: 18 },
                    { header: 'Costo Nuevo', key: 'new_value', width: 18 },
                    { header: '% Cambio', key: 'change_percent', width: 12 },
                ],
                data: summary.topDecreases.map(r => ({
                    ...r,
                    change_percent: Number(r.change_percent).toFixed(1) + '%',
                })),
            },
        ],
    });

    downloadBlob(buffer, `dashboard_precios_${dateSuffix()}.xlsx`);
}

export async function exportRecommendationsExcel(
    pending: Recommendation[],
    resolved: Recommendation[]
) {
    const svc = new ExcelService();
    const cols = [
        { header: 'Producto', key: 'product_name', width: 35 },
        { header: 'SKU', key: 'sku', width: 15 },
        { header: 'Tipo', key: 'tipo', width: 18 },
        { header: 'Razón', key: 'reason', width: 40 },
        { header: 'Costo Actual', key: 'current_cost', width: 16 },
        { header: 'Costo Sugerido', key: 'suggested_cost', width: 16 },
        { header: 'Precio Actual', key: 'current_price', width: 16 },
        { header: 'Precio Sugerido', key: 'suggested_price', width: 16 },
        { header: 'Margen Actual %', key: 'margin_current', width: 14 },
        { header: 'Margen Sugerido %', key: 'margin_suggested', width: 14 },
        { header: 'Ahorro/Ud', key: 'savings_per_unit', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 18 },
    ];

    const mapRec = (rec: Recommendation) => ({
        ...rec,
        tipo: REC_TYPE_LABELS[rec.recommendation_type] || rec.recommendation_type,
        fecha: formatDateTimeCL(rec.created_at),
    });

    const resolvedCols = [
        ...cols,
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Fecha Resolución', key: 'fecha_resolucion', width: 18 },
    ];

    const buffer = await svc.generateMultiSheetReport({
        creator: 'Monitor de Precios',
        locationName: 'Farmacias Vallenar',
        sheets: [
            {
                name: 'Pendientes',
                title: 'Recomendaciones Pendientes',
                columns: cols,
                data: pending.map(mapRec),
            },
            {
                name: 'Historial Decisiones',
                title: 'Historial de Decisiones',
                columns: resolvedCols,
                data: resolved.map(rec => ({
                    ...mapRec(rec),
                    estado: rec.status === 'ACCEPTED' ? 'Aplicado' : 'Descartado',
                    fecha_resolucion: rec.resolved_at ? formatDateTimeCL(rec.resolved_at) : '-',
                })),
            },
        ],
    });

    downloadBlob(buffer, `alertas_precios_${dateSuffix()}.xlsx`);
}

export async function exportSuppliersExcel(data: SupplierRow[]) {
    const svc = new ExcelService();
    const buffer = await svc.generateReport({
        title: 'Comparativa de Precios por Proveedor',
        sheetName: 'Proveedores',
        creator: 'Monitor de Precios',
        locationName: 'Farmacias Vallenar',
        columns: [
            { header: 'Producto', key: 'product_name', width: 35 },
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'Costo Actual', key: 'current_cost', width: 16 },
            { header: 'Más Barato', key: 'cheapest_cost', width: 16 },
            { header: 'Proveedor Barato', key: 'cheapest_supplier', width: 22 },
            { header: 'Más Caro', key: 'most_expensive_cost', width: 16 },
            { header: 'Proveedor Caro', key: 'most_expensive_supplier', width: 22 },
            { header: 'Spread', key: 'price_spread', width: 14 },
            { header: '# Proveedores', key: 'supplier_count', width: 14 },
        ],
        data: data.map(r => ({
            ...r,
            current_cost: Number(r.current_cost),
            cheapest_cost: Number(r.cheapest_cost),
            most_expensive_cost: Number(r.most_expensive_cost),
            price_spread: Number(r.price_spread),
        })),
    });

    downloadBlob(buffer, `proveedores_precios_${dateSuffix()}.xlsx`);
}

export async function exportHistoryExcel(data: HistoryRow[], periodLabel: string) {
    const svc = new ExcelService();
    const buffer = await svc.generateReport({
        title: 'Historial de Cambios de Costo y Precio',
        subtitle: `Período: ${periodLabel}`,
        sheetName: 'Historial',
        creator: 'Monitor de Precios',
        locationName: 'Farmacias Vallenar',
        columns: [
            { header: 'Fecha', key: 'fecha', width: 20 },
            { header: 'Producto', key: 'product_name', width: 35 },
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'Tipo', key: 'tipo', width: 14 },
            { header: 'Valor Anterior', key: 'old_value', width: 16 },
            { header: 'Valor Nuevo', key: 'new_value', width: 16 },
            { header: '% Cambio', key: 'cambio', width: 12 },
            { header: 'Fuente', key: 'fuente', width: 14 },
        ],
        data: data.map(r => ({
            ...r,
            fecha: formatDateTimeCL(r.created_at),
            tipo: r.change_type === 'PRICE_LEVELING' ? 'Nivelación' :
                r.change_type === 'COST_GENERATED' ? 'Automático' :
                    r.new_value > r.old_value ? 'Subida' : 'Bajada',
            cambio: `${Number(r.change_percent) > 0 ? '+' : ''}${Number(r.change_percent).toFixed(1)}%`,
            fuente: SOURCE_LABELS[r.source || ''] || r.source || '-',
        })),
    });

    downloadBlob(buffer, `historial_precios_${dateSuffix()}.xlsx`);
}

/* ====================================================================
   PDF EXPORTS — Using jsPDF + autoTable with corporate look
   ==================================================================== */

const PDF_COLORS = {
    primary: [0, 86, 179] as [number, number, number],     // Azul Corporativo
    headerText: [255, 255, 255] as [number, number, number],
    bodyText: [51, 51, 51] as [number, number, number],
    altRow: [240, 244, 248] as [number, number, number],
    accent: [245, 158, 11] as [number, number, number],    // Amber
};

function createPDF(orientation: 'portrait' | 'landscape' = 'portrait'): jsPDF {
    return new jsPDF({ orientation, unit: 'mm', format: 'letter' });
}

function addPDFHeader(doc: jsPDF, title: string, subtitle?: string) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(...PDF_COLORS.primary);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14).setFont('helvetica', 'bold');
    doc.text(title, 10, 10);
    doc.setFontSize(9).setFont('helvetica', 'normal');
    doc.text(subtitle || 'Farmacias Vallenar', 10, 17);
    const dateStr = formatDateTimeCL(new Date());
    doc.text(`Generado: ${dateStr}`, pageWidth - 10, 17, { align: 'right' });
    doc.setTextColor(...PDF_COLORS.bodyText);
}

function addAutoTable(
    doc: jsPDF,
    headers: string[],
    rows: (string | number)[][],
    startY: number
) {
    autoTable(doc, {
        head: [headers],
        body: rows as any,
        startY,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, textColor: PDF_COLORS.bodyText },
        headStyles: {
            fillColor: PDF_COLORS.primary,
            textColor: PDF_COLORS.headerText,
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'center',
        },
        alternateRowStyles: { fillColor: PDF_COLORS.altRow },
        margin: { left: 10, right: 10 },
    });
}

function savePDF(doc: jsPDF, filename: string) {
    doc.save(filename);
}

/* --- Dashboard PDF --- */
export function printDashboardPDF(summary: DashboardSummary, periodLabel: string) {
    const doc = createPDF('landscape');
    addPDFHeader(doc, 'Monitor de Costos y Precios — Dashboard', `Período: ${periodLabel}`);

    // KPIs as small table
    addAutoTable(doc, ['Indicador', 'Valor'], [
        ['Total Cambios', String(summary.totalChanges)],
        ['Costos Subieron', String(summary.costIncreases)],
        ['Costos Bajaron', String(summary.costDecreases)],
        ['Cambios de Precio', String(summary.priceChanges)],
        ['Nivelaciones', String(summary.levelings)],
        ['% Variación Promedio', `${summary.avgChangePercent}%`],
    ], 28);

    const kpiEndY = (doc as any).lastAutoTable?.finalY || 70;

    // Top Increases
    if (summary.topIncreases.length > 0) {
        doc.setFontSize(10).setFont('helvetica', 'bold');
        doc.text('Mayores Subidas de Costo', 10, kpiEndY + 8);
        addAutoTable(
            doc,
            ['Producto', 'SKU', 'Anterior', 'Nuevo', '% Cambio'],
            summary.topIncreases.map(r => [
                r.product_name || '-', r.sku || '-',
                CLP(r.old_value), CLP(r.new_value),
                `+${Number(r.change_percent).toFixed(1)}%`,
            ]),
            kpiEndY + 12
        );
    }

    const incEndY = (doc as any).lastAutoTable?.finalY || kpiEndY + 20;

    // Top Decreases
    if (summary.topDecreases.length > 0) {
        doc.setFontSize(10).setFont('helvetica', 'bold');
        doc.text('Mayores Bajadas de Costo', 10, incEndY + 8);
        addAutoTable(
            doc,
            ['Producto', 'SKU', 'Anterior', 'Nuevo', '% Cambio'],
            summary.topDecreases.map(r => [
                r.product_name || '-', r.sku || '-',
                CLP(r.old_value), CLP(r.new_value),
                `${Number(r.change_percent).toFixed(1)}%`,
            ]),
            incEndY + 12
        );
    }

    savePDF(doc, `dashboard_precios_${dateSuffix()}.pdf`);
}

/* --- Recommendations PDF --- */
export function printRecommendationsPDF(
    pending: Recommendation[],
    resolved: Recommendation[]
) {
    const doc = createPDF('landscape');
    addPDFHeader(doc, 'Alertas y Recomendaciones de Precios');

    if (pending.length > 0) {
        doc.setFontSize(10).setFont('helvetica', 'bold');
        doc.text(`Recomendaciones Pendientes (${pending.length})`, 10, 28);
        addAutoTable(
            doc,
            ['Producto', 'Tipo', 'Costo Actual', 'Costo Sug.', 'Precio', 'Precio Sug.', 'Margen %', 'Razón'],
            pending.map(r => [
                r.product_name || '-',
                REC_TYPE_LABELS[r.recommendation_type] || r.recommendation_type,
                CLP(r.current_cost),
                CLP(r.suggested_cost),
                CLP(r.current_price),
                CLP(r.suggested_price || 0),
                `${Number(r.margin_current).toFixed(1)}%`,
                r.reason.length > 60 ? r.reason.substring(0, 57) + '...' : r.reason,
            ]),
            32
        );
    } else {
        doc.setFontSize(10).setFont('helvetica', 'normal');
        doc.text('No hay recomendaciones pendientes.', 10, 32);
    }

    const pendingEndY = (doc as any).lastAutoTable?.finalY || 42;

    if (resolved.length > 0) {
        doc.setFontSize(10).setFont('helvetica', 'bold');
        doc.text(`Historial de Decisiones (${resolved.length})`, 10, pendingEndY + 8);
        addAutoTable(
            doc,
            ['Producto', 'Tipo', 'Estado', 'Costo', 'Precio', 'Margen %', 'Fecha'],
            resolved.map(r => [
                r.product_name || '-',
                REC_TYPE_LABELS[r.recommendation_type] || r.recommendation_type,
                r.status === 'ACCEPTED' ? '✓ Aplicado' : '✗ Descartado',
                CLP(r.current_cost),
                CLP(r.current_price),
                `${Number(r.margin_current).toFixed(1)}%`,
                r.resolved_at ? formatDateTimeCL(r.resolved_at) : '-',
            ]),
            pendingEndY + 12
        );
    }

    savePDF(doc, `alertas_precios_${dateSuffix()}.pdf`);
}

/* --- Suppliers PDF --- */
export function printSuppliersPDF(data: SupplierRow[]) {
    const doc = createPDF('landscape');
    addPDFHeader(doc, 'Comparativa de Precios por Proveedor');

    addAutoTable(
        doc,
        ['Producto', 'SKU', 'Costo Actual', 'Más Barato', 'Proveedor', 'Más Caro', 'Proveedor', 'Spread', '# Prov.'],
        data.map(r => [
            r.product_name || '-', r.sku || '-',
            CLP(Number(r.current_cost)),
            CLP(Number(r.cheapest_cost)),
            r.cheapest_supplier,
            CLP(Number(r.most_expensive_cost)),
            r.most_expensive_supplier,
            CLP(Number(r.price_spread)),
            String(r.supplier_count),
        ]),
        28
    );

    savePDF(doc, `proveedores_precios_${dateSuffix()}.pdf`);
}

/* --- History PDF --- */
export function printHistoryPDF(data: HistoryRow[], periodLabel: string) {
    const doc = createPDF('landscape');
    addPDFHeader(doc, 'Historial de Cambios de Costo y Precio', `Período: ${periodLabel}`);

    addAutoTable(
        doc,
        ['Fecha', 'Producto', 'SKU', 'Tipo', 'Anterior', 'Nuevo', '% Cambio', 'Fuente'],
        data.map(r => [
            formatDateTimeCL(r.created_at),
            r.product_name || '-', r.sku || '-',
            r.change_type === 'PRICE_LEVELING' ? 'Nivelación' :
                r.change_type === 'COST_GENERATED' ? 'Auto' :
                    r.new_value > r.old_value ? 'Subida' : 'Bajada',
            CLP(r.old_value), CLP(r.new_value),
            `${Number(r.change_percent) > 0 ? '+' : ''}${Number(r.change_percent).toFixed(1)}%`,
            SOURCE_LABELS[r.source || ''] || r.source || '-',
        ]),
        28
    );

    savePDF(doc, `historial_precios_${dateSuffix()}.pdf`);
}
