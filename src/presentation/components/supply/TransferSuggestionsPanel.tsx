import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, ArrowRight, CheckCircle, Clock, DollarSign, MapPin, Package, RefreshCw, Truck, TrendingUp, ChevronDown } from 'lucide-react';
import { getTransferHistorySecure, getTransferDetailHistorySecure, TransferDetail } from '@/actions/procurement-v2';
import { exportTransferDetailSecure } from '@/actions/transfer-export';
import TransferExecutionModal from './TransferExecutionModal';
import TransferDetailModal from './TransferDetailModal';
import { toast } from 'sonner';
import { resolveTransferQuantity } from './transfer-suggestions-utils';
import { usePharmaStore } from '@/presentation/store/useStore';

interface TransferSource {
    location_id: string;
    location_name: string;
    location_type?: 'STORE' | 'WAREHOUSE' | 'HQ';
    available_qty: number;
}

interface TransferSuggestion {
    product_id?: string;
    product_name: string;
    sku: string;
    current_stock: number;
    suggested_order_qty: number;
    global_stock?: number;
    action_type?: string;
    transfer_sources?: TransferSource[];
    unit_cost?: number;
    total_estimated?: number;
    urgency?: string;
}

interface TransferHistoryItem {
    transfer_id: string;
    executed_at: string;
    from_location_name: string;
    to_location_name: string;
    quantity: number;
    items_count?: number;
    executed_by: string;
    reason: string;
}

interface TransferSuggestionsPanelProps {
    suggestions: TransferSuggestion[];
    targetLocationId: string;
    targetLocationName: string;
    defaultWarehouseId?: string;
    onTransferComplete: () => void;
    onGoBack?: () => void;
}

const TransferSuggestionsPanel: React.FC<TransferSuggestionsPanelProps> = ({
    suggestions,
    targetLocationId,
    targetLocationName,
    defaultWarehouseId,
    onTransferComplete,
    onGoBack
}) => {
    const { user } = usePharmaStore();
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [selectedSources, setSelectedSources] = useState<Record<string, string>>({});
    const [requestedQuantities, setRequestedQuantities] = useState<Record<string, string>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalItems, setModalItems] = useState<any[]>([]);
    const [history, setHistory] = useState<TransferHistoryItem[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Detailed View State
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedTransfer, setSelectedTransfer] = useState<{
        id: string;
        date: string;
        user: string;
        reason: string;
        items: TransferDetail[];
    } | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Auto-select best source for each suggestion with priority for WAREHOUSE
    useEffect(() => {
        const defaults: Record<string, string> = {};
        suggestions.forEach(s => {
            if (s.transfer_sources && s.transfer_sources.length > 0) {
                // Priority logic:
                // 1. Assigned Default Warehouse (if specified and has stock)
                // 2. WAREHOUSE with most stock
                // 3. STORE with most stock
                const sorted = [...s.transfer_sources].sort((a, b) => {
                    // Highest priority: default assigned warehouse
                    if (defaultWarehouseId) {
                        if (a.location_id === defaultWarehouseId) return -1;
                        if (b.location_id === defaultWarehouseId) return 1;
                    }

                    // Second priority: any WAREHOUSE
                    if (a.location_type === 'WAREHOUSE' && b.location_type !== 'WAREHOUSE') return -1;
                    if (a.location_type !== 'WAREHOUSE' && b.location_type === 'WAREHOUSE') return 1;

                    // Finally, by quantity
                    return b.available_qty - a.available_qty;
                });
                defaults[s.sku] = sorted[0].location_id;
            }
        });
        setSelectedSources(defaults);
    }, [suggestions, defaultWarehouseId]);

    // Bulk Source Selector Logic
    const allAvailableOrigins = React.useMemo(() => {
        const origins = new Map<string, { id: string; name: string; type: string }>();
        suggestions.forEach(s => {
            s.transfer_sources?.forEach(src => {
                origins.set(src.location_id, { id: src.location_id, name: src.location_name, type: src.location_type || 'STORE' });
            });
        });
        return Array.from(origins.values());
    }, [suggestions]);

    const suggestionsSignature = React.useMemo(
        () => suggestions.map((s) => `${s.sku}:${s.suggested_order_qty}`).join('|'),
        [suggestions]
    );

    useEffect(() => {
        setRequestedQuantities((prev) => {
            const next: Record<string, string> = {};
            suggestions.forEach((suggestion) => {
                next[suggestion.sku] = prev[suggestion.sku] ?? String(suggestion.suggested_order_qty);
            });
            return next;
        });
    }, [suggestionsSignature]);

    const setOriginForAll = (locationId: string) => {
        if (!locationId) return;
        const newSources = { ...selectedSources };
        suggestions.forEach(s => {
            const hasSource = s.transfer_sources?.some(src => src.location_id === locationId);
            if (hasSource) {
                newSources[s.sku] = locationId;
            }
        });
        setSelectedSources(newSources);
        toast.success(`Origen actualizado para todos los productos disponibles en esa ubicación`);
    };

    const setByTypeForAll = (type: 'WAREHOUSE' | 'STORE') => {
        const newSources = { ...selectedSources };
        let count = 0;
        suggestions.forEach(s => {
            if (s.transfer_sources && s.transfer_sources.length > 0) {
                const bestOfType = s.transfer_sources
                    .filter(src => src.location_type === type)
                    .sort((a, b) => b.available_qty - a.available_qty)[0];

                if (bestOfType) {
                    newSources[s.sku] = bestOfType.location_id;
                    count++;
                }
            }
        });
        setSelectedSources(newSources);
        toast.info(`Origen cambiado a ${type === 'WAREHOUSE' ? 'Bodegas' : 'Sucursales'} para ${count} productos`);
    };

    // Load history when component mounts or location changes
    useEffect(() => {
        if (targetLocationId) {
            loadHistory();
        }
    }, [targetLocationId]);

    const loadHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const result = await getTransferHistorySecure({ locationId: targetLocationId, limit: 10 });
            if (result.success && result.data) {
                setHistory(result.data as unknown as TransferHistoryItem[]);
            } else if (!result.success) {
                toast.error(result.error || 'Error cargando historial');
            }
        } catch {
            toast.error('Error cargando historial');
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleViewDetail = async (transferId: string) => {
        const item = history.find(h => h.transfer_id === transferId);
        if (!item) return;

        try {
            const result = await getTransferDetailHistorySecure(transferId);
            if (result.success && result.data) {
                setSelectedTransfer({
                    id: transferId,
                    date: formatDate(item.executed_at),
                    user: item.executed_by,
                    reason: item.reason,
                    items: result.data as any[]
                });
                setIsDetailModalOpen(true);
            }
        } catch {
            toast.error('Error cargando detalle del traspaso');
        }
    };

    const handleExportTransfer = async () => {
        if (!selectedTransfer) return;
        setIsExporting(true);
        try {
            const result = await exportTransferDetailSecure({ transferId: selectedTransfer.id });
            if (result.success && result.data) {
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename || `Traspaso_${selectedTransfer.id}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast.success('Excel generado exitosamente');
            } else {
                toast.error(result.error || 'Error al exportar');
            }
        } catch {
            toast.error('Error al exportar');
        } finally {
            setIsExporting(false);
        }
    };

    const getSelectedSource = (sku: string): TransferSource | undefined => {
        const suggestion = suggestions.find(s => s.sku === sku);
        const sourceId = selectedSources[sku];
        return suggestion?.transfer_sources?.find(s => s.location_id === sourceId);
    };

    const getTransferQty = (suggestion: TransferSuggestion, source?: TransferSource): number => {
        const rawValue = requestedQuantities[suggestion.sku];
        const requestedQty = rawValue === undefined || rawValue.trim() === ''
            ? undefined
            : Number.parseInt(rawValue, 10);

        return resolveTransferQuantity({
            requestedQty,
            suggestedQty: suggestion.suggested_order_qty,
            availableQty: source?.available_qty || 0
        });
    };

    const updateRequestedQuantity = (suggestion: TransferSuggestion, source: TransferSource | undefined, rawValue: string) => {
        const sanitized = rawValue.replace(/[^\d]/g, '');
        if (sanitized === '') {
            setRequestedQuantities((prev) => ({
                ...prev,
                [suggestion.sku]: ''
            }));
            return;
        }

        const parsed = Number.parseInt(sanitized, 10);
        const normalized = resolveTransferQuantity({
            requestedQty: parsed,
            suggestedQty: suggestion.suggested_order_qty,
            availableQty: source?.available_qty || 0
        });

        setRequestedQuantities((prev) => ({
            ...prev,
            [suggestion.sku]: String(Number.isNaN(normalized) ? 0 : normalized)
        }));
    };

    const handleExecuteSingle = (suggestion: TransferSuggestion) => {
        const source = getSelectedSource(suggestion.sku);
        if (!source) {
            toast.error('Seleccione una sucursal de origen');
            return;
        }
        const transferQty = getTransferQty(suggestion, source);
        if (transferQty <= 0) {
            toast.error('La cantidad a traspasar debe ser mayor a 0');
            return;
        }
        setModalItems([{
            sku: suggestion.sku,
            product_name: suggestion.product_name,
            quantity: transferQty,
            source_location_id: source.location_id,
            source_location_name: source.location_name
        }]);
        setIsModalOpen(true);
    };

    const handleExecuteSelected = () => {
        const items = suggestions
            .filter(s => selectedSkus.has(s.sku))
            .map(s => {
                const source = getSelectedSource(s.sku);
                const qty = getTransferQty(s, source);
                if (!source || qty <= 0) return null;
                return {
                    sku: s.sku,
                    product_name: s.product_name,
                    quantity: qty,
                    source_location_id: source.location_id,
                    source_location_name: source.location_name
                };
            })
            .filter(Boolean) as any[];

        if (items.length === 0) {
            toast.error('Seleccione al menos un producto con origen válido');
            return;
        }
        setModalItems(items);
        setIsModalOpen(true);
    };

    // Stats
    const totalTransfers = suggestions.length;
    const potentialSavings = suggestions.reduce((sum, s) => sum + (s.total_estimated || 0), 0);

    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Stats Header */}
            <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-emerald-100">
                        <Package size={16} className="text-emerald-600" />
                        <div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Traspasos</div>
                            <div className="text-lg font-bold text-emerald-700">{totalTransfers}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-emerald-100">
                        <DollarSign size={16} className="text-emerald-600" />
                        <div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Ahorro Est.</div>
                            <div className="text-lg font-bold text-emerald-700">${potentialSavings.toLocaleString()}</div>
                        </div>
                    </div>

                    {/* Selector Masivo de Origen */}
                    <div className="flex-1 min-w-[300px] flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500 font-bold uppercase ml-1">Origen Masivo (Todas las Sugerencias)</span>
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                                <select
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-sm appearance-none"
                                    onChange={(e) => setOriginForAll(e.target.value)}
                                    defaultValue=""
                                >
                                    <option value="" disabled>Seleccionar origen para todos...</option>
                                    <optgroup label="Bodegas (Prioridad)">
                                        {allAvailableOrigins.filter(o => o.type === 'WAREHOUSE').map(o => (
                                            <option key={o.id} value={o.id}>{o.name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Otros Locales">
                                        {allAvailableOrigins.filter(o => o.type !== 'WAREHOUSE').map(o => (
                                            <option key={o.id} value={o.id}>{o.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                            <div className="flex p-1 bg-white border border-emerald-100 rounded-xl shadow-sm gap-1">
                                <button
                                    onClick={() => setByTypeForAll('WAREHOUSE')}
                                    className="px-3 py-1 text-[10px] font-bold rounded-lg hover:bg-emerald-50 text-emerald-700 transition"
                                    title="Priorizar Bodegas"
                                >
                                    Bodegas
                                </button>
                                <div className="w-[1px] bg-slate-100 my-1" />
                                <button
                                    onClick={() => setByTypeForAll('STORE')}
                                    className="px-3 py-1 text-[10px] font-bold rounded-lg hover:bg-emerald-50 text-emerald-700 transition"
                                    title="Priorizar Sucursales"
                                >
                                    Sucursales
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {selectedSkus.size > 0 && (
                            <button
                                onClick={handleExecuteSelected}
                                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 text-sm whitespace-nowrap"
                            >
                                <Truck size={18} />
                                Ejecutar {selectedSkus.size} traspaso(s)
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Transfer History - Always visible on top */}
            <div className="border-b border-slate-200 bg-slate-50/50">
                <div className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        Historial Reciente
                        {history.length > 0 && (
                            <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full text-[9px]">{history.length}</span>
                        )}
                    </div>
                </div>

                <div className="max-h-52 overflow-y-auto px-4 pb-3">
                    {isLoadingHistory ? (
                        <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
                            <RefreshCw size={14} className="animate-spin" />
                            <span className="text-xs">Cargando...</span>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-4 bg-white/50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-xs text-slate-400">No hay traspasos registrados recientemente</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {history.filter((h, i, self) => self.findIndex(t => t.transfer_id === h.transfer_id) === i).map((h, i) => (
                                <div
                                    key={`${h.transfer_id}-${i}`}
                                    onClick={() => handleViewDetail(h.transfer_id)}
                                    className="bg-white rounded-xl p-3 border border-slate-100 flex items-center gap-3 text-xs shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group/card"
                                >
                                    <div className="p-1.5 bg-emerald-50 rounded-lg shrink-0 group-hover/card:bg-emerald-500 group-hover/card:text-white transition-colors">
                                        <Package size={14} className="text-emerald-500 group-hover/card:text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                            Traslado masivo
                                            <span className="text-[9px] font-mono text-slate-400">#{h.transfer_id.substring(0, 8)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                                            <span className="font-bold text-blue-600">{h.from_location_name}</span>
                                            <ArrowRight size={10} className="text-slate-300" />
                                            <span className="font-bold text-emerald-600 font-mono italic">
                                                {h.items_count ? `${h.items_count} items` : 'Multiples items'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[9px] text-slate-400 font-medium">{formatDate(h.executed_at)}</div>
                                        <div className="flex items-center gap-1 text-emerald-600 font-bold mt-0.5">
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

            {/* Suggestions Table */}
            <div className="flex-1 overflow-y-auto">
                {suggestions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 p-8">
                        <div className="p-4 bg-emerald-50 rounded-full">
                            <ArrowLeftRight className="text-emerald-300" size={48} />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-bold text-slate-600">Sin traspasos sugeridos</p>
                            <p className="text-sm mb-4">Ejecute el análisis para detectar oportunidades de traspaso entre sucursales</p>
                            {onGoBack && (
                                <button
                                    onClick={onGoBack}
                                    className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition flex items-center gap-2 mx-auto"
                                >
                                    <TrendingUp size={16} />
                                    Volver al Análisis
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white text-slate-500 font-bold text-xs uppercase sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 w-10">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                        checked={suggestions.length > 0 && selectedSkus.size === suggestions.length}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedSkus(new Set(suggestions.map(s => s.sku)));
                                            else setSelectedSkus(new Set());
                                        }}
                                    />
                                </th>
                                <th className="p-3">Producto</th>
                                <th className="p-3 text-center">Stock Actual</th>
                                <th className="p-3 text-center">Necesario</th>
                                <th className="p-3">Origen</th>
                                <th className="p-3 text-center">Disponible</th>
                                <th className="p-3 text-center">A Traspasar</th>
                                <th className="p-3 w-28"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm bg-white">
                            {suggestions.map((item, idx) => {
                                const selectedSource = getSelectedSource(item.sku);
                                const transferQty = getTransferQty(item, selectedSource);

                                return (
                                    <tr
                                        key={`${item.sku}-${idx}`}
                                        className={`group hover:bg-emerald-50/50 transition border-l-4 ${selectedSkus.has(item.sku) ? 'border-l-emerald-500 bg-emerald-50/20' : 'border-l-transparent'
                                            }`}
                                    >
                                        <td className="p-3">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                                checked={selectedSkus.has(item.sku)}
                                                onChange={(e) => {
                                                    const s = new Set(selectedSkus);
                                                    if (e.target.checked) s.add(item.sku); else s.delete(item.sku);
                                                    setSelectedSkus(s);
                                                }}
                                            />
                                        </td>
                                        <td className="p-3">
                                            <div className="font-bold text-slate-800 line-clamp-1">{item.product_name}</div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{item.sku}</span>
                                                {item.action_type === 'PARTIAL_TRANSFER' && (
                                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">PARCIAL</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`font-bold ${item.current_stock <= 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                                {item.current_stock}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center font-bold text-purple-700">
                                            {item.suggested_order_qty}
                                        </td>
                                        <td className="p-3">
                                            {item.transfer_sources && item.transfer_sources.length > 1 ? (
                                                <div className="relative group/source">
                                                    <select
                                                        className={`text-xs font-bold border rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer w-full max-w-[160px] appearance-none pr-8 ${selectedSource?.location_type === 'WAREHOUSE'
                                                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                            }`}
                                                        value={selectedSources[item.sku] || ''}
                                                        onChange={(e) => setSelectedSources(prev => ({ ...prev, [item.sku]: e.target.value }))}
                                                    >
                                                        {item.transfer_sources.map(src => (
                                                            <option key={src.location_id} value={src.location_id}>
                                                                {src.location_type === 'WAREHOUSE' ? '🏢' : '🏪'} {src.location_name} ({src.available_qty}u)
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                </div>
                                            ) : item.transfer_sources?.[0] ? (
                                                <div className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-lg border ${item.transfer_sources[0].location_type === 'WAREHOUSE'
                                                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                    }`}>
                                                    {item.transfer_sources[0].location_type === 'WAREHOUSE' ? <Package size={12} /> : <MapPin size={12} />}
                                                    <span className="truncate">{item.transfer_sources[0].location_name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">No hay stock disponible</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center font-bold text-emerald-600">
                                            {selectedSource?.available_qty || 0}
                                        </td>
                                        <td className="p-3 text-center">
                                            {/*
                                             * Allow temporary empty value so the user can delete and rewrite
                                             * without snapping back to "1" on each keystroke.
                                             */}
                                            <div className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1">
                                                <input
                                                    type="number"
                                                    min={selectedSource?.available_qty ? 1 : 0}
                                                    max={selectedSource?.available_qty || 0}
                                                    disabled={!selectedSource || selectedSource.available_qty <= 0}
                                                    className="w-16 bg-transparent text-right font-bold text-emerald-700 outline-none disabled:opacity-50"
                                                    value={requestedQuantities[item.sku] ?? String(transferQty)}
                                                    onChange={(e) => updateRequestedQuantity(item, selectedSource, e.target.value)}
                                                />
                                                <span className="text-xs font-bold text-emerald-700">u</span>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <button
                                                onClick={() => handleExecuteSingle(item)}
                                                disabled={!selectedSource}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <ArrowRight size={12} />
                                                Ejecutar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Transfer Detail Modal */}
            {selectedTransfer && (
                <TransferDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={() => setIsDetailModalOpen(false)}
                    transferId={selectedTransfer.id}
                    executedAt={selectedTransfer.date}
                    executedBy={selectedTransfer.user}
                    reason={selectedTransfer.reason}
                    items={selectedTransfer.items}
                    isExporting={isExporting}
                    onExport={handleExportTransfer}
                />
            )}

            <TransferExecutionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                items={modalItems}
                targetLocationId={targetLocationId}
                targetLocationName={targetLocationName}
                targetWarehouseId={defaultWarehouseId}
                userId={user?.id}
                onSuccess={() => {
                    setIsModalOpen(false);
                    setSelectedSkus(new Set());
                    onTransferComplete();
                    loadHistory();
                }}
            />
        </div>
    );
};

export default TransferSuggestionsPanel;
