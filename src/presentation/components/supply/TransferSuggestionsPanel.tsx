import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, ArrowRight, CheckCircle, ChevronDown, ChevronUp, Clock, DollarSign, MapPin, Package, RefreshCw, Truck } from 'lucide-react';
import { getTransferHistorySecure } from '@/actions/procurement-v2';
import TransferExecutionModal from './TransferExecutionModal';
import { toast } from 'sonner';

interface TransferSource {
    location_id: string;
    location_name: string;
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
    sku: string;
    product_name: string;
    from_location_name: string;
    to_location_name: string;
    quantity: number;
    executed_by: string;
    reason: string;
}

interface TransferSuggestionsPanelProps {
    suggestions: TransferSuggestion[];
    targetLocationId: string;
    targetLocationName: string;
    onTransferComplete: () => void;
}

const TransferSuggestionsPanel: React.FC<TransferSuggestionsPanelProps> = ({
    suggestions,
    targetLocationId,
    targetLocationName,
    onTransferComplete
}) => {
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [selectedSources, setSelectedSources] = useState<Record<string, string>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalItems, setModalItems] = useState<any[]>([]);
    const [history, setHistory] = useState<TransferHistoryItem[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Auto-select best source (most stock) for each suggestion
    useEffect(() => {
        const defaults: Record<string, string> = {};
        suggestions.forEach(s => {
            if (s.transfer_sources && s.transfer_sources.length > 0) {
                const best = s.transfer_sources.reduce((a, b) => a.available_qty > b.available_qty ? a : b);
                defaults[s.sku] = best.location_id;
            }
        });
        setSelectedSources(defaults);
    }, [suggestions]);

    const loadHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const result = await getTransferHistorySecure({ locationId: targetLocationId, limit: 30 });
            if (result.success && result.data) {
                setHistory(result.data as unknown as TransferHistoryItem[]);
            }
        } catch {
            toast.error('Error cargando historial');
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const toggleHistory = () => {
        if (!isHistoryOpen && history.length === 0) {
            loadHistory();
        }
        setIsHistoryOpen(!isHistoryOpen);
    };

    const getSelectedSource = (sku: string): TransferSource | undefined => {
        const suggestion = suggestions.find(s => s.sku === sku);
        const sourceId = selectedSources[sku];
        return suggestion?.transfer_sources?.find(s => s.location_id === sourceId);
    };

    const handleExecuteSingle = (suggestion: TransferSuggestion) => {
        const source = getSelectedSource(suggestion.sku);
        if (!source) {
            toast.error('Seleccione una sucursal de origen');
            return;
        }
        const transferQty = Math.min(suggestion.suggested_order_qty, source.available_qty);
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
                if (!source) return null;
                return {
                    sku: s.sku,
                    product_name: s.product_name,
                    quantity: Math.min(s.suggested_order_qty, source.available_qty),
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
    const uniqueSources = new Set(
        suggestions.flatMap(s => (s.transfer_sources || []).map(ts => ts.location_id))
    ).size;

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
                <div className="flex flex-wrap gap-4">
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
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl shadow-sm border border-emerald-100">
                        <MapPin size={16} className="text-emerald-600" />
                        <div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">Sucursales</div>
                            <div className="text-lg font-bold text-emerald-700">{uniqueSources}</div>
                        </div>
                    </div>
                    {selectedSkus.size > 0 && (
                        <button
                            onClick={handleExecuteSelected}
                            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-md shadow-emerald-200 text-sm"
                        >
                            <Truck size={16} />
                            Ejecutar {selectedSkus.size} traspaso(s)
                        </button>
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
                            <p className="text-sm">Ejecute el análisis para detectar oportunidades de traspaso entre sucursales</p>
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
                                const transferQty = selectedSource
                                    ? Math.min(item.suggested_order_qty, selectedSource.available_qty)
                                    : 0;

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
                                                <select
                                                    className="text-xs font-medium text-slate-700 bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer w-full max-w-[160px]"
                                                    value={selectedSources[item.sku] || ''}
                                                    onChange={(e) => setSelectedSources(prev => ({ ...prev, [item.sku]: e.target.value }))}
                                                >
                                                    {item.transfer_sources.map(src => (
                                                        <option key={src.location_id} value={src.location_id}>
                                                            {src.location_name} ({src.available_qty}u)
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : item.transfer_sources?.[0] ? (
                                                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                                                    <MapPin size={12} />
                                                    {item.transfer_sources[0].location_name}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">N/A</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center font-bold text-emerald-600">
                                            {selectedSource?.available_qty || 0}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                                                {transferQty}u
                                            </span>
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

            {/* Transfer History (Collapsible) */}
            <div className="border-t border-slate-200 bg-slate-50">
                <button
                    onClick={toggleHistory}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100 transition text-sm font-bold text-slate-600"
                >
                    <div className="flex items-center gap-2">
                        <Clock size={16} className="text-slate-400" />
                        Historial de Traspasos
                        {history.length > 0 && (
                            <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded-full">{history.length}</span>
                        )}
                    </div>
                    {isHistoryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {isHistoryOpen && (
                    <div className="max-h-64 overflow-y-auto px-4 pb-4">
                        {isLoadingHistory ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
                                <RefreshCw size={16} className="animate-spin" />
                                <span className="text-sm">Cargando historial...</span>
                            </div>
                        ) : history.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">Sin traspasos registrados</p>
                        ) : (
                            <div className="space-y-2">
                                {history.map((h, i) => (
                                    <div key={`${h.transfer_id}-${h.sku}-${i}`} className="bg-white rounded-xl p-3 border border-slate-200 flex items-center gap-3 text-sm">
                                        <div className="p-1.5 bg-emerald-50 rounded-lg">
                                            <CheckCircle size={14} className="text-emerald-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-slate-800 line-clamp-1">{h.product_name}</div>
                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                                                <span className="font-bold text-blue-600">{h.from_location_name}</span>
                                                <ArrowRight size={10} />
                                                <span className="font-bold text-emerald-600">{h.to_location_name}</span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="font-bold text-emerald-700">{h.quantity}u</div>
                                            <div className="text-[10px] text-slate-400">{formatDate(h.executed_at)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Transfer Execution Modal */}
            <TransferExecutionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                items={modalItems}
                targetLocationId={targetLocationId}
                targetLocationName={targetLocationName}
                onSuccess={() => {
                    onTransferComplete();
                    loadHistory();
                }}
            />
        </div>
    );
};

export default TransferSuggestionsPanel;
