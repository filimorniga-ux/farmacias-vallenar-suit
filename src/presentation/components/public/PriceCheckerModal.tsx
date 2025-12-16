'use client';

import React, { useState, useEffect, useRef, useTransition, useMemo } from 'react';
import { Search, ScanBarcode, Loader2, ArrowRight, ArrowLeft, TrendingDown, Pill, FlaskConical, Lock, LogOut, Scale } from 'lucide-react';
import { searchProductsAction, type ProductResult } from '@/actions/public/search-products';
import { getAlternativesAction, type AlternativeResult } from '@/actions/public/get-alternatives';
import { LegalModal } from './LegalModal';

interface PriceCheckerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PriceCheckerModal({ isOpen, onClose }: PriceCheckerModalProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductResult[]>([]);
    const [isPending, startTransition] = useTransition();
    const inputRef = useRef<HTMLInputElement>(null);

    // Comparison State
    const [isComparing, setIsComparing] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
    const [alternatives, setAlternatives] = useState<AlternativeResult[]>([]);
    const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);

    // Security Exit State
    const [isExitPinOpen, setIsExitPinOpen] = useState(false);
    const [exitPin, setExitPin] = useState('');
    const [exitError, setExitError] = useState(false);
    const exitInputRef = useRef<HTMLInputElement>(null);

    // Legal Modal State
    const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            // Reset state on close
            setQuery('');
            setResults([]);
            setIsComparing(false);
            setSelectedProduct(null);
            setAlternatives([]);
            setIsExitPinOpen(false);
            setExitPin('');
        }
    }, [isOpen]);

    // Debounced Search (Optimized to 300ms)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (query.length >= 3) {
                startTransition(async () => {
                    const data = await searchProductsAction(query);
                    setResults(data);
                });
            } else {
                setResults([]);
            }
        }, 300); // 300ms Turbo Mode

        return () => clearTimeout(timeoutId);
    }, [query]);

    // Handle Product Click
    const handleProductClick = async (product: ProductResult) => {
        if (!product.dci) return; // Only if it has DCI

        setSelectedProduct(product);
        setIsComparing(true);
        setIsLoadingAlternatives(true);

        // Fetch alternatives
        const alts = await getAlternativesAction(product.dci, product.id);
        setAlternatives(alts);
        setIsLoadingAlternatives(false);
    };

    const handleBackToSearch = () => {
        setIsComparing(false);
        setSelectedProduct(null);
        setAlternatives([]);
        // Re-focus search
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleExitAttempt = () => {
        setIsExitPinOpen(true);
        setTimeout(() => exitInputRef.current?.focus(), 100);
    };

    const handleExitVerify = (val: string) => {
        setExitPin(val);
        setExitError(false);
        if (val === '1213') {
            onClose();
        } else if (val.length === 4) {
            setExitError(true);
            setTimeout(() => setExitPin(''), 500);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 w-screen h-screen z-[9999] bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-300">

            {/* 1. INTERFAZ DE BÚSQUEDA (SIEMPRE VISIBLE AL FONDO - Z-0) */}
            <div className="flex-1 flex flex-col h-full relative z-0">

                {/* Header Kiosco */}
                <div className="bg-white border-b border-slate-200 p-6 flex justify-between items-center shrink-0 shadow-sm z-10">
                    <div className="flex items-center gap-4">
                        {isComparing ? (
                            <button
                                onClick={handleBackToSearch}
                                className="bg-slate-100 p-3 rounded-full hover:bg-slate-200 text-slate-600 transition-colors"
                            >
                                <ArrowLeft size={32} />
                            </button>
                        ) : (
                            <div className="bg-cyan-600 p-4 rounded-2xl text-white shadow-lg shadow-cyan-200">
                                <Search size={32} />
                            </div>
                        )}
                        <div>
                            <h2 className="text-3xl font-black text-slate-800 tracking-tight">
                                {isComparing ? 'Modo Comparación' : 'Consultor de Precios'}
                            </h2>
                            <p className="text-slate-500 font-medium text-lg">
                                {isComparing
                                    ? `Analizando: ${selectedProduct?.dci}`
                                    : 'Escanea el código de barras o escribe el nombre'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsExitPinOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors font-bold uppercase tracking-wide text-sm"
                    >
                        <Lock size={18} /> Salir
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-50">

                    {/* View: SEARCH */}
                    {!isComparing && (
                        <div className="flex flex-col h-full">
                            {/* Search Input Hero */}
                            <div className="p-8 pb-4 shrink-0 bg-white border-b border-slate-100 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
                                <div className="max-w-4xl mx-auto relative group">
                                    <div className={`absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-3xl blur opacity-20 group-focus-within:opacity-50 transition-opacity duration-300 ${isPending ? 'animate-pulse' : ''}`} />
                                    <div className="relative bg-white border-2 border-slate-200 rounded-3xl flex items-center overflow-hidden focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/10 transition-all active:scale-[0.99] duration-150 h-24">
                                        <div className="pl-8 text-slate-400">
                                            {isPending ? <Loader2 className="animate-spin text-cyan-500" size={40} /> : <ScanBarcode size={40} />}
                                        </div>
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            placeholder="Escanea o escribe aquí..."
                                            className="w-full h-full px-6 text-4xl font-extrabold text-slate-800 placeholder:text-slate-300 outline-none bg-transparent"
                                            autoFocus
                                        />
                                        {query && (
                                            <button
                                                onClick={() => setQuery('')}
                                                className="mr-6 p-4 rounded-full hover:bg-slate-100 text-slate-300 hover:text-red-500 transition-colors"
                                            >
                                                <span className="text-2xl font-bold">✕</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Results Grid */}
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                <div className="max-w-7xl mx-auto">
                                    {results.length === 0 && query.length > 0 && !isPending && (
                                        <div className="text-center py-32 opacity-50">
                                            <div className="w-32 h-32 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-6">
                                                <Search size={64} className="text-slate-400" />
                                            </div>
                                            <p className="text-3xl font-bold text-slate-400">No encontramos productos</p>
                                        </div>
                                    )}

                                    {results.length === 0 && query.length === 0 && (
                                        <div className="text-center py-32 opacity-30">
                                            <div className="w-40 h-40 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                                                <ScanBarcode size={80} className="text-slate-400" />
                                            </div>
                                            <p className="text-4xl font-black text-slate-400 tracking-tight">Listo para escanear</p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {results.map((product) => (
                                            <div
                                                key={product.id}
                                                onClick={() => product.dci && handleProductClick(product)}
                                                className={`
                                                    group relative bg-white border-2 border-slate-100 rounded-3xl p-6 hover:shadow-2xl hover:border-cyan-300 transition-all cursor-default active:scale-[0.98] duration-150
                                                    ${product.dci ? 'cursor-pointer' : ''}
                                                    ${product.stock === 0 ? 'opacity-60 saturate-50' : ''}
                                                `}
                                            >
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                            {product.is_bioequivalent && (
                                                                <span className="bg-green-100 text-green-700 text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider">
                                                                    Bioequivalente
                                                                </span>
                                                            )}
                                                            {product.dci && (
                                                                <span className="bg-blue-600 text-white text-xs font-black px-3 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1 shadow-md shadow-blue-200">
                                                                    <FlaskConical size={12} strokeWidth={3} /> Comparar
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h3 className="text-2xl font-black text-slate-800 leading-tight mb-2 group-hover:text-cyan-700 transition-colors">
                                                            {product.name}
                                                        </h3>
                                                        <p className="text-slate-500 font-medium">{product.laboratory}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-end justify-between mt-4 pt-4 border-t border-slate-50">
                                                    <div>
                                                        <div className="text-sm font-bold text-slate-400 mb-1">SKU: {product.sku}</div>
                                                        {product.stock > 0 ? (
                                                            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-xl text-sm font-black">
                                                                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse ring-4 ring-green-100" />
                                                                STOCK: {product.stock}
                                                            </div>
                                                        ) : (
                                                            <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-sm font-black">
                                                                SIN STOCK
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-bold text-slate-400 mb-0.5">Precio Unidad</div>
                                                        <div className="text-4xl font-black text-slate-900 tracking-tighter">
                                                            ${product.price.toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* DCI Interaction Hint */}
                                                {product.dci && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px] rounded-3xl z-20">
                                                        <div className="bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl font-bold text-lg transform scale-90 group-hover:scale-100 transition-all flex items-center gap-3">
                                                            Ver Alternativas <ArrowRight size={24} strokeWidth={3} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* View: COMPARISON (SPLIT SCREEN) */}
                    {isComparing && selectedProduct && (
                        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50">

                            {/* LEFT: Selected Product (Hero) */}
                            <div className="w-full md:w-[40%] p-8 md:p-12 border-r border-slate-200 bg-white z-10 shadow-2xl flex flex-col justify-center items-center relative overflow-hidden">
                                <div className="absolute top-0 w-full h-2 bg-gradient-to-r from-blue-500 via-cyan-500 to-green-500" />

                                <div className="text-sm font-black text-slate-300 uppercase tracking-[0.2em] mb-8">Producto Original</div>

                                <div className="w-48 h-48 bg-slate-50 rounded-full flex items-center justify-center mb-8 text-slate-300 shadow-inner border border-slate-100">
                                    <Pill size={96} strokeWidth={1} />
                                </div>

                                <h3 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 leading-tight text-center">
                                    {selectedProduct.name}
                                </h3>

                                <div className="bg-blue-50 text-blue-700 px-6 py-2 rounded-full text-lg font-bold mb-8 border border-blue-100 shadow-sm flex items-center gap-2">
                                    <FlaskConical size={20} className="text-blue-500" />
                                    {selectedProduct.dci}
                                </div>

                                <div className="text-center w-full max-w-sm bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                    <div className="text-slate-400 font-bold uppercase tracking-wider text-xs mb-2">Precio Actual</div>
                                    <div className="text-6xl font-black text-slate-900 mb-2 tracking-tighter">
                                        ${selectedProduct.price.toLocaleString()}
                                    </div>
                                    <div className="text-slate-500 font-medium">{selectedProduct.laboratory}</div>
                                </div>
                            </div>

                            {/* RIGHT: Alternatives List */}
                            <div className="flex-1 overflow-y-auto p-8 md:p-12 bg-slate-50 relative">
                                <div className="max-w-3xl mx-auto">
                                    <div className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6">
                                        <div>
                                            <h3 className="text-3xl font-black text-slate-800 mb-2">Opciones Bioequivalentes</h3>
                                            <p className="text-slate-500 text-lg">Hemos encontrado estas alternativas para ti.</p>
                                        </div>
                                        {isLoadingAlternatives && <Loader2 className="animate-spin text-cyan-500 w-10 h-10" />}
                                    </div>

                                    {!isLoadingAlternatives && alternatives.length === 0 && (
                                        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-slate-300">
                                            <div className="text-6xl mb-4">🤔</div>
                                            <p className="text-slate-500 text-xl font-bold mb-2">No encontramos alternativas directas.</p>
                                            <p className="text-slate-400 mb-6">Prueba consultando al químico farmacéutico.</p>
                                            <button onClick={handleBackToSearch} className="text-cyan-600 font-bold hover:underline text-lg">
                                                Volver al buscador
                                            </button>
                                        </div>
                                    )}

                                    <div className="space-y-4">
                                        {alternatives.map((alt, idx) => {
                                            const savings = selectedProduct.price - alt.price;
                                            const isCheaper = savings > 0;

                                            return (
                                                <div
                                                    key={alt.id}
                                                    className={`
                                                        bg-white p-6 rounded-3xl border-2 transition-all flex justify-between items-center group
                                                        ${idx === 0 && isCheaper ? 'border-green-500 shadow-xl shadow-green-100 scale-[1.02] z-10' : 'border-slate-100 hover:border-cyan-200 hover:shadow-lg'}
                                                    `}
                                                >
                                                    <div className="flex items-center gap-6">
                                                        <div className={`
                                                            w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-sm
                                                            ${idx === 0 && isCheaper ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}
                                                        `}>
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <div className="font-black text-2xl text-slate-800 mb-1 group-hover:text-cyan-700 transition-colors">{alt.name}</div>
                                                            <div className="flex items-center gap-2">
                                                                {alt.is_bioequivalent && (
                                                                    <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                                                        Bio
                                                                    </span>
                                                                )}
                                                                <span className="text-slate-500 font-bold text-sm">{alt.laboratory}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="text-right">
                                                        <div className={`text-3xl font-black tracking-tight ${isCheaper ? 'text-green-600' : 'text-slate-700'}`}>
                                                            ${alt.price.toLocaleString()}
                                                        </div>
                                                        {isCheaper ? (
                                                            <div className="flex items-center justify-end gap-1.5 mt-1 text-green-600 bg-green-50 px-3 py-1 rounded-lg font-bold text-sm">
                                                                <TrendingDown size={14} strokeWidth={3} />
                                                                Ahorras ${savings.toLocaleString()}
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs font-bold text-slate-400 mt-2">
                                                                Mismo precio
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer with Legal Button */}
                <div className="bg-white p-4 border-t border-slate-200 flex justify-between items-center shrink-0 z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsLegalModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-cyan-600 transition-colors font-bold uppercase tracking-wide text-xs border border-slate-200"
                        >
                            <Scale size={16} /> Normativa
                        </button>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden md:block">Farmacias Vallenar Suit v2.0</div>
                    </div>
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-widest">Kiosco Seguro • Terminal Unattended</div>
                </div>
            </div>

            {/* 2. CAPA DE SEGURIDAD (SOLO PARA SALIR - Z-50) */}
            {isExitPinOpen && (
                <div className="absolute inset-0 z-50 bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md text-center shadow-2xl">
                        <h3 className="text-2xl font-black text-slate-900 mb-2">Desbloquear Kiosco</h3>
                        <p className="text-slate-500 mb-8 font-medium">Ingrese PIN administrativo para salir.</p>

                        <input
                            ref={exitInputRef}
                            type="password"
                            value={exitPin}
                            onChange={(e) => handleExitVerify(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="••••"
                            className={`w-full bg-slate-100 border-2 ${exitError ? 'border-red-500 text-red-500 animate-pulse' : 'border-slate-200 focus:border-cyan-500'} rounded-2xl py-6 text-center text-4xl font-extra-bold tracking-[1em] outline-none transition-all mb-6`}
                            maxLength={4}
                            autoFocus
                        />

                        <button
                            onClick={() => {
                                setIsExitPinOpen(false);
                                setExitPin('');
                                // Refocus search when cancelling
                                setTimeout(() => inputRef.current?.focus(), 100);
                            }}
                            className="w-full py-4 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Legal Modal Component */}
            <LegalModal isOpen={isLegalModalOpen} onClose={() => setIsLegalModalOpen(false)} />
        </div>
    );
}
