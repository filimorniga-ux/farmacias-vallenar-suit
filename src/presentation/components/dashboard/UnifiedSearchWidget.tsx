
'use client';

import React, { useState, useTransition, useEffect, useRef } from 'react';
import { Search, Loader2, TrendingUp, AlertTriangle, Building2, Package, X } from 'lucide-react';
import { searchUnifiedProducts, UnifiedProduct } from '@/actions/analytics/price-arbitrage';
import { motion, AnimatePresence } from 'framer-motion';

const UnifiedSearchWidget = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<UnifiedProduct[]>([]);
    const [isPending, startTransition] = useTransition();
    const [showResults, setShowResults] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const handleSearch = (term: string) => {
        setQuery(term);
        if (term.length < 2) {
            setResults([]);
            setShowResults(false);
            return;
        }

        startTransition(async () => {
            const data = await searchUnifiedProducts(term);
            setResults(data);
            setShowResults(true);
        });
    };

    const formatPrice = (price: number) => {
        if (!price) return '-';
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);
    };

    return (
        <div className="relative w-full z-20" ref={wrapperRef}>
            {/* Search Input */}
            <div className="relative group">
                <input
                    type="text"
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:shadow-md focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 outline-none transition-all text-lg font-medium text-slate-700 placeholder:text-slate-400"
                    placeholder="Consultar precio unificado (Sucursales vs Proveedores)..."
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => { if (results.length > 0) setShowResults(true); }}
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-600 transition-colors" size={20} />
                {isPending ? (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500 animate-spin" size={20} />
                ) : query && (
                    <button
                        onClick={() => { setQuery(''); setResults([]); setShowResults(false); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                    >
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Results Dropdown */}
            <AnimatePresence>
                {showResults && results.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden max-h-[600px] overflow-y-auto"
                    >
                        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center px-4">
                            <span className="text-xs font-bold text-slate-500 uppercase">Resultados ({results.length})</span>
                            <span className="text-[10px] text-slate-400 bg-slate-200 px-2 py-1 rounded-full">
                                🟢 Mejor Compra | 🔵 Mejor Venta
                            </span>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {results.map((product) => (
                                <div key={product.id} className="p-4 hover:bg-slate-50 transition-colors">
                                    {/* Header */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm">{product.productName}</h4>
                                            <div className="flex gap-2 text-[10px] text-slate-400 mt-1">
                                                {product.ispCode && <span>ISP: {product.ispCode}</span>}
                                                {product.sku && <span>SKU: {product.sku}</span>}
                                            </div>
                                        </div>
                                        {product.maxMargin > 0 && (
                                            <div className="text-right">
                                                <div className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1">
                                                    <TrendingUp size={12} />
                                                    Margin: {formatPrice(product.maxMargin)}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Alerts */}
                                    {product.alerts.length > 0 && (
                                        <div className="mb-3 bg-amber-50 p-2 rounded-lg border border-amber-100">
                                            {product.alerts.map((alert, idx) => (
                                                <div key={idx} className="flex items-center gap-2 text-xs text-amber-700 font-medium">
                                                    <AlertTriangle size={12} />
                                                    {alert}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Compact Grid */}
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        {/* SANTIAGO (Branch) */}
                                        <SourceColumn
                                            title="Santiago"
                                            offerings={product.offerings.filter(o => o.source.includes('SANTIAGO'))}
                                            bestPrice={product.bestPrice}
                                            highestPrice={product.highestPrice}
                                            type="BRANCH"
                                        />

                                        {/* COLCHAGUA (Branch) */}
                                        <SourceColumn
                                            title="Colchagua"
                                            offerings={product.offerings.filter(o => o.source.includes('COLCHAGUA'))}
                                            bestPrice={product.bestPrice}
                                            highestPrice={product.highestPrice}
                                            type="BRANCH"
                                        />

                                        {/* GOLAN (Provider) */}
                                        <SourceColumn
                                            title="Golan (Prov)"
                                            offerings={product.offerings.filter(o => o.source.includes('GOLAN'))}
                                            bestPrice={product.bestPrice}
                                            highestPrice={product.highestPrice}
                                            type="PROVIDER"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const SourceColumn = ({ title, offerings, bestPrice, highestPrice, type }: any) => {
    const mainOffer = offerings[0]; // Take first if multiple (rare for branch, possible for batches)

    if (!mainOffer) {
        return (
            <div className="bg-slate-50 rounded-lg p-2 text-center opacity-50">
                <p className="font-bold text-slate-400 mb-1">{title}</p>
                <div className="h-0.5 w-4 bg-slate-300 mx-auto my-2"></div>
                <p className="text-slate-300">-</p>
            </div>
        );
    }

    const isBest = mainOffer.price === bestPrice && mainOffer.price > 0;
    const isHighest = mainOffer.price === highestPrice && mainOffer.price > 0;
    const isZeroStockBranch = type === 'BRANCH' && mainOffer.stock <= 0;

    return (
        <div className={`rounded-lg p-2 text-center border ${isZeroStockBranch ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
            <p className="font-bold text-slate-500 mb-1 flex items-center justify-center gap-1">
                {type === 'BRANCH' ? <Building2 size={10} /> : <Package size={10} />}
                {title}
            </p>

            <p className={`font-bold text-sm mb-1 
                ${isBest ? 'text-emerald-600' : ''}
                ${isHighest ? 'text-blue-600' : ''}
                ${!isBest && !isHighest ? 'text-slate-700' : ''}
            `}>
                ${mainOffer.price.toLocaleString()}
            </p>

            <p className={`text-[10px] font-mono ${isZeroStockBranch ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                Stock: {mainOffer.stock}
            </p>
        </div>
    );
};

export default UnifiedSearchWidget;
