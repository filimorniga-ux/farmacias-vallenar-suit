import React, { useState } from 'react';
import { AlertTriangle, Clock, RefreshCw, XCircle, Send, Search, PlusCircle, Bot } from 'lucide-react';
import { ClinicalAnalysisResult, InventoryBatch } from '../../../domain/types';
import { ClinicalAgent } from '../../../domain/logic/clinicalAgent';
import { usePharmaStore } from '../../store/useStore';

interface ClinicalSidebarProps {
    analysis: ClinicalAnalysisResult | null;
    lastChecked: number;
}

const ClinicalSidebar: React.FC<ClinicalSidebarProps> = ({ analysis, lastChecked }) => {
    const { inventory, addToCart } = usePharmaStore();
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<InventoryBatch[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = () => {
        if (!query.trim()) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const results = ClinicalAgent.searchBySymptom(query, inventory);
        setSearchResults(results);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const statusColor = analysis?.status === 'BLOCK' ? 'bg-red-600' : analysis?.status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-600';

    return (
        <div className="w-full h-full flex flex-col bg-slate-800 rounded-xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-700">
                <h3 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                    <Bot size={20} /> Agente Clínico IA
                </h3>
                <p className="text-[10px] text-slate-400">Asistente Terapéutico & Seguridad</p>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* 1. Safety Alerts (Always Visible if Critical) */}
                {analysis && analysis.status !== 'SAFE' && (
                    <div className={`p-3 rounded-xl text-white ${statusColor} animate-in fade-in slide-in-from-top-2`}>
                        <div className="flex items-start gap-3">
                            {analysis.status === 'BLOCK' ? <XCircle size={24} className="shrink-0" /> : <AlertTriangle size={24} className="shrink-0" />}
                            <div>
                                <p className="font-bold text-sm mb-1">
                                    {analysis.status === 'BLOCK' ? 'INTERACCIÓN CRÍTICA' : 'ADVERTENCIA'}
                                </p>
                                <p className="text-xs opacity-90 leading-relaxed">{analysis.message}</p>
                                {analysis.blocking_items && (
                                    <ul className="mt-2 text-[10px] bg-black/20 p-2 rounded-lg list-disc list-inside">
                                        {analysis.blocking_items.map((item, i) => <li key={i}>{item}</li>)}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Search Results or Default State */}
                {isSearching ? (
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                                Tratamientos Sugeridos
                            </h4>
                            <button
                                onClick={() => { setIsSearching(false); setQuery(''); setSearchResults([]); }}
                                className="text-[10px] text-slate-400 hover:text-white underline"
                            >
                                Limpiar
                            </button>
                        </div>

                        {searchResults.length > 0 ? (
                            searchResults.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => addToCart(item, 1)}
                                    className="bg-slate-700 hover:bg-slate-600 p-3 rounded-xl cursor-pointer transition-colors group border border-transparent hover:border-cyan-500/50"
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <h5 className="font-bold text-white text-sm line-clamp-1 group-hover:text-cyan-300">{item.name}</h5>
                                        <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                            Stock: {item.stock_actual}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mb-2 line-clamp-1">{item.dci}</p>
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-emerald-400">${item.price.toLocaleString()}</span>
                                        <PlusCircle size={16} className="text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-slate-500">
                                <Search size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-xs">No se encontraron productos para "{query}"</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Default State: Cross Selling Suggestions */
                    analysis?.suggested_items && analysis.suggested_items.length > 0 ? (
                        <div className="bg-slate-700/50 rounded-xl p-3 border border-slate-700">
                            <p className="text-xs text-cyan-300 font-bold mb-2 flex items-center gap-1">
                                <RefreshCw size={12} /> Oportunidades de Venta
                            </p>
                            <ul className="space-y-2">
                                {analysis.suggested_items.map((item, index) => (
                                    <li key={index} className="text-xs text-slate-300 flex items-start gap-2 bg-slate-800 p-2 rounded-lg">
                                        <span className="text-cyan-500">•</span> {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="text-center py-10 text-slate-600">
                            <Bot size={48} className="mx-auto mb-3 opacity-20" />
                            <p className="text-xs">El agente está listo para ayudar.</p>
                            <p className="text-[10px] mt-1">Escribe un síntoma abajo.</p>
                        </div>
                    )
                )}
            </div>

            {/* Chat Input Area */}
            <div className="p-4 bg-slate-900 border-t border-slate-700">
                <div className="relative">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Escribe síntoma (ej: dolor de cabeza)..."
                        className="w-full bg-slate-800 text-white pl-4 pr-10 py-3 rounded-xl border border-slate-700 focus:border-cyan-500 focus:outline-none text-sm placeholder:text-slate-500"
                    />
                    <button
                        onClick={handleSearch}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-400 p-1.5 hover:bg-cyan-500/10 rounded-lg transition-colors"
                    >
                        <Send size={16} />
                    </button>
                </div>
                <div className="flex justify-between items-center mt-2 px-1">
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock size={10} /> Actualizado: {new Date(lastChecked).toLocaleTimeString('es-CL')}
                    </p>
                    <span className="text-[10px] font-bold text-emerald-500/80">ONLINE</span>
                </div>
            </div>
        </div>
    );
};

export default ClinicalSidebar;
