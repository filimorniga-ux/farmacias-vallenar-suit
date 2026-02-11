/**
 * WMSReportPanel - Panel reutilizable de reportes para operaciones WMS
 * 
 * Filtros por rango de fechas, presets, factura.
 * Tabla de resultados con personal, movimientos y desglose.
 * Botón de exportar Excel.
 * 
 * Zona horaria: America/Santiago (skill timezone-santiago)
 */
import React, { useState, useCallback } from 'react';
import {
    FileSpreadsheet, Calendar, Download, X, Filter,
    Loader2, ChevronDown, Clock, User, ArrowUpDown,
    Package, Search
} from 'lucide-react';
import { getStockHistorySecure } from '@/actions/wms-v2';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';

const CHILE_TZ = 'America/Santiago';

/** Obtiene la fecha actual en Chile como string YYYY-MM-DD */
function getChileDateStr(offsetDays = 0): string {
    const now = new Date();
    if (offsetDays !== 0) now.setDate(now.getDate() + offsetDays);
    // Formatear en zona horaria Chile
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: CHILE_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now); // sv-SE locale gives YYYY-MM-DD natively
    return parts;
}

// Tipos
export type WMSReportTab = 'DESPACHO' | 'RECEPCION' | 'TRANSFERENCIA' | 'PEDIDOS';

interface WMSReportPanelProps {
    /** Tab activo para contextualizar el reporte */
    activeTab: WMSReportTab;
    /** ID de la ubicación actual */
    locationId: string;
    /** Callback para cerrar el panel */
    onClose: () => void;
    /** Callback para exportar Excel (implementación en padre) */
    onExportExcel?: (filters: ReportFilters) => Promise<void>;
}

export interface ReportFilters {
    startDate: string;
    endDate: string;
    movementType?: string;
    invoiceNumber?: string;
    page: number;
    pageSize: number;
}

interface ReportRow {
    id?: string;
    sku: string;
    product_name: string;
    movement_type: string;
    quantity: number;
    stock_before: number;
    stock_after: number;
    timestamp: string;
    user_id?: string;
    notes?: string;
    location_id?: string;
    reference_type?: string;
}

// Mapeo de tabs a tipos de movimiento
const TAB_MOVEMENT_TYPES: Record<WMSReportTab, string[]> = {
    DESPACHO: ['TRANSFER_OUT', 'SALE'],
    RECEPCION: ['TRANSFER_IN', 'RECEIPT'],
    TRANSFERENCIA: ['TRANSFER_OUT', 'TRANSFER_IN'],
    PEDIDOS: ['PURCHASE_ENTRY', 'RECEIPT'],
};

// Presets de fecha — Siempre en hora Chile (America/Santiago)
const DATE_PRESETS = [
    {
        label: 'Hoy', getValue: () => {
            const today = getChileDateStr();
            return { startDate: today, endDate: today };
        }
    },
    {
        label: 'Última Semana', getValue: () => ({
            startDate: getChileDateStr(-7),
            endDate: getChileDateStr(),
        })
    },
    {
        label: 'Último Mes', getValue: () => ({
            startDate: getChileDateStr(-30),
            endDate: getChileDateStr(),
        })
    },
    {
        label: 'Últimos 3 Meses', getValue: () => ({
            startDate: getChileDateStr(-90),
            endDate: getChileDateStr(),
        })
    },
];

// Labels de tipo de movimiento
const MOVEMENT_LABELS: Record<string, string> = {
    TRANSFER_OUT: 'Salida',
    TRANSFER_IN: 'Entrada',
    SALE: 'Venta',
    RECEIPT: 'Recepción',
    PURCHASE_ENTRY: 'Ingreso Compra',
    LOSS: 'Pérdida',
    RETURN: 'Devolución',
    ADJUSTMENT: 'Ajuste',
};

const TAB_LABELS: Record<WMSReportTab, string> = {
    DESPACHO: 'Despachos',
    RECEPCION: 'Recepciones',
    TRANSFERENCIA: 'Transferencias',
    PEDIDOS: 'Recepción de Pedidos',
};

export const WMSReportPanel: React.FC<WMSReportPanelProps> = ({
    activeTab,
    locationId,
    onClose,
    onExportExcel,
}) => {
    // Filtros — fechas en hora Chile
    const today = getChileDateStr();
    const weekAgo = getChileDateStr(-7);

    const [filters, setFilters] = useState<ReportFilters>({
        startDate: weekAgo,
        endDate: today,
        movementType: undefined,
        invoiceNumber: undefined,
        page: 1,
        pageSize: 50,
    });

    const [results, setResults] = useState<ReportRow[]>([]);
    const [totalResults, setTotalResults] = useState(0);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Buscar
    const handleSearch = useCallback(async (page = 1) => {
        setLoading(true);
        setHasSearched(true);

        try {
            const movementTypes = TAB_MOVEMENT_TYPES[activeTab];
            // Obtener para cada tipo y unir
            const allMovements: ReportRow[] = [];
            let total = 0;

            for (const type of movementTypes) {
                if (filters.movementType && filters.movementType !== type) continue;

                const res = await getStockHistorySecure({
                    warehouseId: locationId,
                    startDate: new Date(filters.startDate),
                    endDate: new Date(filters.endDate + 'T23:59:59'),
                    movementType: type,
                    page,
                    pageSize: filters.pageSize,
                });

                if (res.success && res.data) {
                    allMovements.push(...res.data.movements);
                    total += res.data.total;
                }
            }

            // Ordenar por fecha desc
            allMovements.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            setResults(allMovements);
            setTotalResults(total);
            setFilters(prev => ({ ...prev, page }));
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', component: 'ReportPanel' },
                extra: { activeTab, filters }
            });
            toast.error('Error al cargar reportes');
        } finally {
            setLoading(false);
        }
    }, [activeTab, filters, locationId]);

    // Preset de fecha
    const applyPreset = (preset: typeof DATE_PRESETS[0]) => {
        const { startDate, endDate } = preset.getValue();
        setFilters(prev => ({ ...prev, startDate, endDate }));
    };

    // Exportar
    const handleExport = async () => {
        if (!onExportExcel) {
            toast.info('Exportación no disponible para este tab');
            return;
        }
        setExporting(true);
        try {
            await onExportExcel(filters);
            toast.success('Excel generado exitosamente');
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', component: 'ReportPanel', action: 'export' }
            });
            toast.error('Error al exportar');
        } finally {
            setExporting(false);
        }
    };

    // Formatear fecha Chile
    const formatDate = (isoDate: string) => {
        return new Date(isoDate).toLocaleDateString('es-CL', {
            timeZone: 'America/Santiago',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-8 px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden
                          animate-in fade-in slide-in-from-top-4 duration-300">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <FileSpreadsheet size={20} className="text-sky-400" />
                            Reportes: {TAB_LABELS[activeTab]}
                        </h3>
                        <p className="text-sm text-slate-400 mt-0.5">
                            Historial de movimientos y exportación Excel
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Filtros */}
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
                    {/* Presets */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-500 uppercase mr-1">
                            <Clock size={12} className="inline mr-1" />
                            Período:
                        </span>
                        {DATE_PRESETS.map((preset) => (
                            <button
                                key={preset.label}
                                onClick={() => applyPreset(preset)}
                                className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 
                                         rounded-lg hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700
                                         transition-colors"
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Fechas + Filtros */}
                    <div className="flex items-end gap-3 flex-wrap">
                        <div>
                            <label className="text-xs font-medium text-slate-500 block mb-1">Desde</label>
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium 
                                         text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-100
                                         outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 block mb-1">Hasta</label>
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium 
                                         text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-100
                                         outline-none transition-all"
                            />
                        </div>

                        {/* Filtro tipo de movimiento */}
                        <div>
                            <label className="text-xs font-medium text-slate-500 block mb-1">Tipo</label>
                            <select
                                value={filters.movementType || ''}
                                onChange={(e) => setFilters(prev => ({ ...prev, movementType: e.target.value || undefined }))}
                                className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium
                                         text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-100
                                         outline-none transition-all"
                            >
                                <option value="">Todos</option>
                                {TAB_MOVEMENT_TYPES[activeTab].map(type => (
                                    <option key={type} value={type}>
                                        {MOVEMENT_LABELS[type] || type}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Filtro factura (solo para Pedidos) */}
                        {activeTab === 'PEDIDOS' && (
                            <div>
                                <label className="text-xs font-medium text-slate-500 block mb-1">Nº Factura</label>
                                <input
                                    type="text"
                                    value={filters.invoiceNumber || ''}
                                    onChange={(e) => setFilters(prev => ({ ...prev, invoiceNumber: e.target.value || undefined }))}
                                    placeholder="Buscar factura..."
                                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium
                                             text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-100
                                             outline-none transition-all w-36"
                                />
                            </div>
                        )}

                        {/* Botón buscar */}
                        <button
                            onClick={() => handleSearch(1)}
                            disabled={loading}
                            className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-white font-bold 
                                     rounded-xl shadow-lg shadow-sky-500/20
                                     disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {loading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Search size={16} />
                            )}
                            Buscar
                        </button>

                        {/* Exportar Excel */}
                        <button
                            onClick={handleExport}
                            disabled={exporting || results.length === 0}
                            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold 
                                     rounded-xl shadow-lg shadow-emerald-500/20
                                     disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {exporting ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Download size={16} />
                            )}
                            Excel
                        </button>
                    </div>
                </div>

                {/* Tabla de resultados */}
                <div className="flex-1 overflow-auto">
                    {!hasSearched ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <Filter size={40} className="mb-3 text-slate-300" />
                            <p className="text-sm font-medium">Aplique filtros y presione Buscar</p>
                        </div>
                    ) : loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 size={32} className="animate-spin text-sky-400" />
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <Package size={40} className="mb-3 text-slate-300" />
                            <p className="text-sm font-medium">Sin resultados para estos filtros</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">
                                        Fecha
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">
                                        Producto
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">
                                        SKU
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">
                                        Tipo
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">
                                        Cantidad
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">
                                        Stock Antes
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">
                                        Stock Después
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">
                                        Notas
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {results.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                                            {formatDate(row.timestamp)}
                                        </td>
                                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800 max-w-[200px] truncate">
                                            {row.product_name}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">
                                            {row.sku}
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${row.quantity > 0
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-red-100 text-red-700'
                                                }`}>
                                                {MOVEMENT_LABELS[row.movement_type] || row.movement_type}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-2.5 text-right text-sm font-bold ${row.quantity > 0 ? 'text-emerald-600' : 'text-red-600'
                                            }`}>
                                            {row.quantity > 0 ? '+' : ''}{row.quantity}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-sm text-slate-600">
                                            {row.stock_before}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-sm text-slate-600">
                                            {row.stock_after}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[150px] truncate">
                                            {row.notes || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer con paginación */}
                {results.length > 0 && (
                    <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                        <span className="text-sm text-slate-500">
                            Mostrando {results.length} de {totalResults} registros
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleSearch(filters.page - 1)}
                                disabled={filters.page <= 1 || loading}
                                className="px-3 py-1.5 text-sm font-medium bg-white border border-slate-200 
                                         rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors"
                            >
                                Anterior
                            </button>
                            <span className="text-sm font-medium text-slate-700">
                                Pág. {filters.page}
                            </span>
                            <button
                                onClick={() => handleSearch(filters.page + 1)}
                                disabled={results.length < filters.pageSize || loading}
                                className="px-3 py-1.5 text-sm font-medium bg-white border border-slate-200 
                                         rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WMSReportPanel;
