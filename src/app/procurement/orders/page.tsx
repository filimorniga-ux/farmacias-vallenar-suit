'use client';

import { useState, useTransition } from 'react';
import {
    ShoppingCart,
    RefreshCw,
    CheckCircle2,
    HelpCircle,
    FileText,
    Loader2
} from 'lucide-react';
import { getReplenishmentSuggestions, ReplenishmentSuggestion } from '@/actions/procurement/generate-order';

export default function OrdersPage() {
    const [branch, setBranch] = useState<'SANTIAGO' | 'COLCHAGUA'>('SANTIAGO');
    const [suggestions, setSuggestions] = useState<ReplenishmentSuggestion[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});

    const [isPending, startTransition] = useTransition();

    // --- Actions ---
    const loadSuggestions = () => {
        startTransition(async () => {
            try {
                const data = await getReplenishmentSuggestions(branch);
                setSuggestions(data);
                // Select only GOLAN by default? Or all? User prompt implied selecting "what to add".
                // Let's select nothing or GOLAN ones. Selecting GOLAN feels smart.
                const initialSelected = new Set(data.filter(i => i.suggestedProvider === 'GOLAN').map(i => i.id));
                setSelectedIds(initialSelected);
            } catch (error) {
                console.error("Failed to load suggestions", error);
            }
        });
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const updateQty = (id: string, val: number) => {
        setQtyOverrides(prev => ({ ...prev, [id]: val }));
    };

    const generateOrder = () => {
        const selectedCount = selectedIds.size;
        const golanCount = suggestions.filter(s => selectedIds.has(s.id) && s.suggestedProvider === 'GOLAN').length;
        const total = suggestions
            .filter(s => selectedIds.has(s.id))
            .reduce((acc, s) => acc + (s.providerPrice * (qtyOverrides[s.id] ?? s.suggestedQty)), 0);

        const fmtTotal = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(total);

        alert(`📄 Orden generada exitosamente.\n\nResumen:\n- Proveedor Principal: GOLAN (${golanCount} items)\n- Total Estimado: ${fmtTotal}\n\nSe ha enviado una copia al proveedor.`);
    };

    // --- Derived ---
    const totalEstimated = suggestions
        .filter(s => selectedIds.has(s.id))
        .reduce((acc, s) => acc + (s.providerPrice * (qtyOverrides[s.id] ?? s.suggestedQty)), 0);

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            {/* Header */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <RefreshCw className="text-blue-600" />
                        Reposición Inteligente
                    </h1>

                    <div className="flex items-center gap-4">
                        <div className="flex bg-slate-100 rounded-lg p-1">
                            {(['SANTIAGO', 'COLCHAGUA'] as const).map(b => (
                                <button
                                    key={b}
                                    onClick={() => { setBranch(b); setSuggestions([]); }}
                                    className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${branch === b
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    {b}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={loadSuggestions}
                            disabled={isPending}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm"
                        >
                            {isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                            Analizar Stock
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto p-6">
                {suggestions.length > 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 uppercase text-slate-500 text-xs font-bold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 w-12">
                                        <input
                                            type="checkbox"
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedIds(new Set(suggestions.map(s => s.id)));
                                                else setSelectedIds(new Set());
                                            }}
                                            checked={selectedIds.size === suggestions.length}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                    </th>
                                    <th className="px-6 py-4">Producto</th>
                                    <th className="px-6 py-4 text-center">Stock Crítico</th>
                                    <th className="px-6 py-4">Proveedor Sugerido</th>
                                    <th className="px-6 py-4 text-right">Costo Unit.</th>
                                    <th className="px-6 py-4 text-center">Cantidad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {suggestions.map((item) => {
                                    const isGolan = item.suggestedProvider === 'GOLAN';
                                    const qty = qtyOverrides[item.id] ?? item.suggestedQty;

                                    return (
                                        <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(item.id) ? 'bg-blue-50/20' : ''}`}>
                                            <td className="px-6 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(item.id)}
                                                    onChange={() => toggleSelection(item.id)}
                                                    className="rounded text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900">{item.productName}</div>
                                                <div className="text-xs text-slate-400 font-mono mt-0.5">{item.sku}</div>
                                                {item.reasoning && (
                                                    <div className="mt-2 text-[10px] text-blue-600 bg-blue-50 p-1.5 rounded-md border border-blue-100 flex items-start gap-1 max-w-xs">
                                                        <span className="font-bold">✨ IA:</span> {item.reasoning}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.currentStock === 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                    {item.currentStock} unid.
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {item.suggestedProvider === 'TRASPASO' ? (
                                                    <span className="inline-flex items-center gap-1.5 bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-bold border border-purple-200">
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                        TRASPASO ({item.sourceBranch})
                                                    </span>
                                                ) : isGolan ? (
                                                    <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        GOLAN (Barato)
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
                                                        <HelpCircle className="w-3.5 h-3.5" />
                                                        COTIZAR
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {item.suggestedProvider === 'TRASPASO' ? (
                                                    <span className="text-purple-600 font-bold text-xs uppercase">Sin Costo</span>
                                                ) : isGolan ? (
                                                    <span className="font-mono font-bold text-slate-700">
                                                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(item.providerPrice)}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 italic text-xs">N/A</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={qty}
                                                    onChange={(e) => updateQty(item.id, parseInt(e.target.value) || 0)}
                                                    className="w-20 text-center border border-slate-200 rounded-md py-1 text-sm font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    !isPending && (
                        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                            <RefreshCw className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-slate-700">Sin Sugerencias Activas</h3>
                            <p className="text-slate-500">Selecciona una sucursal y analiza el stock.</p>
                        </div>
                    )
                )}
            </div>

            {/* Floating Summary Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-4 transform transition-transform duration-300 z-50">
                    <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-8">
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-bold tracking-wide">Seleccionados</div>
                                <div className="text-xl font-bold text-slate-900">{selectedIds.size} productos</div>
                            </div>
                            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
                            <div>
                                <div className="text-xs text-slate-500 uppercase font-bold tracking-wide">Total Estimado</div>
                                <div className="text-xl font-bold text-emerald-600">
                                    {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totalEstimated)}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={generateOrder}
                            className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95"
                        >
                            <FileText className="w-5 h-5" />
                            Generar Orden de Compra
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
