import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, ChevronDown, Clock, FileDown, Filter, RefreshCw, TrendingUp } from 'lucide-react';
import { exportSuggestedOrdersSecure } from '@/actions/procurement-export';
import { getSuggestionAnalysisHistorySecure, type SuggestionAnalysisHistoryItem } from '@/actions/procurement-v2';
import { toast } from 'sonner';

interface SuggestionAnalysisHistoryPanelProps {
    locationId?: string;
    isActive?: boolean;
    refreshKey?: number;
    onRestore?: (entry: SuggestionAnalysisHistoryItem) => void;
}

function formatDateTime(value: string): string {
    try {
        const parsed = new Date(value);
        return parsed.toLocaleDateString('es-CL', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return value;
    }
}

function formatStockThreshold(value: number | null): string {
    if (value === null || value === undefined) return 'Todo';
    return `${Math.round(value * 100)}%`;
}

function downloadExcel(base64Data: string, filename: string): void {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let index = 0; index < byteCharacters.length; index++) {
        byteNumbers[index] = byteCharacters.charCodeAt(index);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
}

const SuggestionAnalysisHistoryPanel: React.FC<SuggestionAnalysisHistoryPanelProps> = ({
    locationId,
    isActive = true,
    refreshKey = 0,
    onRestore
}) => {
    const [history, setHistory] = useState<SuggestionAnalysisHistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoadError, setHasLoadError] = useState(false);
    const [isExportingId, setIsExportingId] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<SuggestionAnalysisHistoryItem | null>(null);

    const loadHistory = async () => {
        if (!isActive) return;

        setIsLoading(true);
        setHasLoadError(false);
        try {
            const result = await getSuggestionAnalysisHistorySecure({
                locationId: locationId || undefined,
                limit: 10
            });

            if (result.success && result.data) {
                setHistory(result.data);
            } else {
                setHistory([]);
                setHasLoadError(true);
            }
        } catch {
            setHistory([]);
            setHasLoadError(true);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadHistory();
    }, [isActive, locationId, refreshKey]);

    const handleExportHistory = async (entry: SuggestionAnalysisHistoryItem) => {
        setIsExportingId(entry.history_id);
        try {
            const result = await exportSuggestedOrdersSecure({
                supplierId: entry.supplier_id || undefined,
                daysToCover: entry.days_to_cover,
                analysisWindow: entry.analysis_window,
                locationId: entry.location_id || locationId || undefined,
                stockThreshold: entry.stock_threshold ?? undefined,
                searchQuery: entry.search_query || undefined,
                limit: entry.limit
            });

            if (result.success && result.data) {
                downloadExcel(result.data, result.filename || `Analisis_Sugerencias_${entry.history_id.slice(0, 8)}.xlsx`);
                toast.success('Excel generado exitosamente');
            } else {
                toast.error(result.error || 'No se pudo exportar este analisis');
            }
        } catch {
            toast.error('No se pudo exportar este analisis');
        } finally {
            setIsExportingId(null);
        }
    };

    return (
        <>
            <div className="border-b border-slate-200 bg-slate-50/50">
                <div className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        Historial Reciente
                        {history.length > 0 && (
                            <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full text-[9px]">
                                {history.length}
                            </span>
                        )}
                    </div>
                </div>

                <div className="max-h-52 overflow-y-auto px-4 pb-3">
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
                            <RefreshCw size={14} className="animate-spin" />
                            <span className="text-xs">Cargando...</span>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-4 bg-white/50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-xs text-slate-400">
                                {hasLoadError
                                    ? 'No fue posible cargar el historial del motor en este momento'
                                    : 'No hay analisis recientes del motor de sugerencias'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {history.map((entry, index) => (
                                <div
                                    key={`${entry.history_id}-${index}`}
                                    onClick={() => setSelectedEntry(entry)}
                                    className="bg-white rounded-xl p-3 border border-slate-100 flex items-center gap-3 text-xs shadow-sm hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group/card"
                                >
                                    <div className="p-1.5 bg-purple-50 rounded-lg shrink-0 group-hover/card:bg-purple-500 group-hover/card:text-white transition-colors">
                                        <TrendingUp size={14} className="text-purple-500 group-hover/card:text-white" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                            Analisis masivo
                                            <span className="text-[9px] font-mono text-slate-400">#{entry.history_id.substring(0, 8)}</span>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5 truncate">
                                            <span className="font-bold text-indigo-600">{entry.location_name}</span>
                                            <span className="text-slate-300">|</span>
                                            <span className="truncate">{entry.supplier_name || 'Todos los proveedores'}</span>
                                        </div>

                                        <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-500">
                                            <span className="font-bold text-purple-600">{entry.total_results} items</span>
                                            <span className="inline-flex items-center gap-1 text-red-500">
                                                <AlertTriangle size={10} />
                                                {entry.critical_count}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-emerald-600">
                                                <ArrowLeftRight size={10} />
                                                {entry.transfer_count}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <div className="text-[9px] text-slate-400 font-medium">{formatDateTime(entry.executed_at)}</div>
                                        <div className="flex items-center gap-1 text-purple-600 font-bold mt-0.5">
                                            <span>Ver detalle</span>
                                            <ChevronDown size={10} className="-rotate-90" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {selectedEntry && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
                        <div className="bg-slate-900 p-6 text-white">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-black tracking-tight">Detalle de Analisis</h2>
                                    <p className="text-xs text-slate-400 mt-1 font-mono">ID #{selectedEntry.history_id.substring(0, 8)}</p>
                                </div>
                                <button
                                    onClick={() => setSelectedEntry(null)}
                                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors"
                                >
                                    Cerrar
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                                <div className="bg-white/10 rounded-xl px-3 py-2">
                                    <div className="text-[10px] uppercase text-slate-300">Resultados</div>
                                    <div className="text-base font-black">{selectedEntry.total_results}</div>
                                </div>
                                <div className="bg-white/10 rounded-xl px-3 py-2">
                                    <div className="text-[10px] uppercase text-slate-300">Criticos</div>
                                    <div className="text-base font-black">{selectedEntry.critical_count}</div>
                                </div>
                                <div className="bg-white/10 rounded-xl px-3 py-2">
                                    <div className="text-[10px] uppercase text-slate-300">Traspasos</div>
                                    <div className="text-base font-black">{selectedEntry.transfer_count}</div>
                                </div>
                                <div className="bg-white/10 rounded-xl px-3 py-2">
                                    <div className="text-[10px] uppercase text-slate-300">Ventana</div>
                                    <div className="text-base font-black">{selectedEntry.analysis_window}d</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-3 bg-slate-50/60 text-sm">
                            <div className="flex items-center gap-2 text-slate-700">
                                <Filter size={14} className="text-slate-400" />
                                <span className="font-bold">Cobertura:</span>
                                <span>{selectedEntry.days_to_cover} dias</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700">
                                <Filter size={14} className="text-slate-400" />
                                <span className="font-bold">Proveedor:</span>
                                <span>{selectedEntry.supplier_name || 'Todos'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700">
                                <Filter size={14} className="text-slate-400" />
                                <span className="font-bold">Stock maximo:</span>
                                <span>{formatStockThreshold(selectedEntry.stock_threshold)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700">
                                <Filter size={14} className="text-slate-400" />
                                <span className="font-bold">Busqueda:</span>
                                <span>{selectedEntry.search_query || 'Sin filtro'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700">
                                <Filter size={14} className="text-slate-400" />
                                <span className="font-bold">Top:</span>
                                <span>{selectedEntry.limit}</span>
                            </div>
                        </div>

                        <div className="p-6 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
                            <div className="text-xs text-slate-500">
                                Ejecutado por <span className="font-bold text-slate-700">{selectedEntry.executed_by}</span>
                            </div>
                            <div className="flex gap-2">
                                {onRestore && (
                                    <button
                                        onClick={() => {
                                            onRestore(selectedEntry);
                                            setSelectedEntry(null);
                                        }}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition"
                                    >
                                        <TrendingUp size={16} />
                                        Cargar Análisis
                                    </button>
                                )}
                                <button
                                    onClick={() => handleExportHistory(selectedEntry)}
                                    disabled={isExportingId === selectedEntry.history_id}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition disabled:opacity-50"
                                >
                                    {isExportingId === selectedEntry.history_id ? (
                                        <RefreshCw size={16} className="animate-spin" />
                                    ) : (
                                        <FileDown size={16} />
                                    )}
                                    {isExportingId === selectedEntry.history_id ? 'Exportando...' : 'Exportar Excel'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SuggestionAnalysisHistoryPanel;
