'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { Search, ScanBarcode, Loader2, ArrowRight, ArrowLeft, TrendingDown, Pill, FlaskConical, Lock, Scale, FileText, Stethoscope } from 'lucide-react';
import { searchProductsAction, type ProductResult } from '@/actions/public/search-products';
import { searchBioequivalentsAction, findInventoryMatchesAction, type BioequivalentResult } from '@/actions/public/bioequivalents';
import { getAlternativesAction, type AlternativeResult } from '@/actions/public/get-alternatives';
import { LegalModal } from './LegalModal'; // Ensure this exists or imported correctly

interface PriceCheckerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type SearchMode = 'PRODUCT' | 'BIOEQUIVALENT';

export default function PriceCheckerModal({ isOpen, onClose }: PriceCheckerModalProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductResult[]>([]);
    const [bioResults, setBioResults] = useState<BioequivalentResult[]>([]);
    const [isPending, startTransition] = useTransition();
    const inputRef = useRef<HTMLInputElement>(null);

    // Search Mode State
    const [searchMode, setSearchMode] = useState<SearchMode>('PRODUCT');

    // Comparison / Detail State
    const [isThinking, setIsThinking] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
    const [selectedBioequivalent, setSelectedBioequivalent] = useState<BioequivalentResult | null>(null);

    const [alternatives, setAlternatives] = useState<AlternativeResult[]>([]); // For Product Detail Alternatives
    const [inventoryMatches, setInventoryMatches] = useState<ProductResult[]>([]); // For Bioequivalent Inventory Matches

    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    // Security Exit State
    const [isExitPinOpen, setIsExitPinOpen] = useState(false);
    const [exitPin, setExitPin] = useState('');
    const [exitError, setExitError] = useState(false);
    const exitInputRef = useRef<HTMLInputElement>(null);

    // Legal Modal State
    const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);

    // Reset State on Open/Close
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            resetState();
        }
    }, [isOpen]);

    const resetState = () => {
        setQuery('');
        setResults([]);
        setBioResults([]);
        setSearchMode('PRODUCT');
        setSelectedProduct(null);
        setSelectedBioequivalent(null);
        setAlternatives([]);
        setInventoryMatches([]);
        setIsExitPinOpen(false);
        setExitPin('');
    };

    // Debounced Search Logic
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (query.length >= 3) {
                startTransition(async () => {
                    if (searchMode === 'PRODUCT') {
                        // Standard Product Search (Name, SKU, DCI via DB index)
                        const data = await searchProductsAction(query);
                        setResults(data);
                    } else if (searchMode === 'BIOEQUIVALENT') {
                        // Bioequivalent Search from ISP CSV
                        const data = await searchBioequivalentsAction(query);
                        setBioResults(data);
                    }
                });
            } else {
                setResults([]);
                setBioResults([]);
            }
        }, 400); // Slightly increased debounce for CSV processing

        return () => clearTimeout(timeoutId);
    }, [query, searchMode]);

    // --- HANDLERS ---

    const handleModeSwitch = (mode: SearchMode) => {
        setSearchMode(mode);
        setQuery('');
        setResults([]);
        setBioResults([]);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const handleProductClick = async (product: ProductResult) => {
        setSelectedProduct(product);
        setIsLoadingDetails(true);

        // Load alternatives if DCI exists
        if (product.dci) {
            try {
                const alts = await getAlternativesAction(product.dci, product.id);
                setAlternatives(alts);
            } catch (e) {
                console.error("Error fetching alternatives", e);
                setAlternatives([]);
            }
        } else {
            setAlternatives([]);
        }
        setIsLoadingDetails(false);
    };

    const handleBioequivalentClick = async (bio: BioequivalentResult) => {
        // When clicking an ISP result, we search our inventory for matches
        setSelectedBioequivalent(bio);
        setIsThinking(true);
        try {
            // Search by Active Ingredient primarily, fallback to Name
            const matches = await findInventoryMatchesAction(bio.active_ingredient || bio.product_name);
            setInventoryMatches(matches);
        } catch (error) {
            setInventoryMatches([]);
        } finally {
            setIsThinking(false);
        }
    };

    const handleBackToSearch = () => {
        if (selectedBioequivalent && inventoryMatches.length > 0 && selectedProduct) {
            // If we are deep in bio -> product, go back to bio matches
            setSelectedProduct(null);
            return;
        }

        setSelectedProduct(null);
        setSelectedBioequivalent(null);
        setInventoryMatches([]);
        setTimeout(() => inputRef.current?.focus(), 100);
    };

    const getExitPin = (val: string) => {
        setExitPin(val);
        setExitError(false);
        if (val === '1213') {
            onClose();
        } else if (val.length === 4) {
            setExitError(true);
            setTimeout(() => setExitPin(''), 500);
        }
    };

    // --- RENDER HELPERS ---

    const renderStockBadge = (stock: number) => {
        if (stock > 0) {
            return (
                <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-sm font-black border border-emerald-100">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    DISPONIBLE
                </div>
            );
        }
        return (
            <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1 rounded-lg text-sm font-black border border-red-100">
                AGOTADO
            </div>
        );
    };

    if (!isOpen) return null;

    // --- MAIN RENDER ---
    return (
        <div className="fixed inset-0 w-screen h-screen z-[9999] bg-slate-50 flex flex-col overflow-hidden font-sans">

            {/* TOP BAR */}
            <div className="bg-white border-b border-slate-200 p-4 shadow-sm z-20 flex justify-between items-center shrink-0 h-20">
                <div className="flex items-center gap-4">
                    {(selectedProduct || selectedBioequivalent) ? (
                        <button
                            onClick={handleBackToSearch}
                            className="bg-slate-100 p-3 rounded-full hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                            <ArrowLeft size={28} />
                        </button>
                    ) : (
                        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-3 rounded-xl text-white shadow-lg shadow-cyan-200/50">
                            <Search size={28} />
                        </div>
                    )}

                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">
                            {selectedProduct ? 'Ficha de Producto' :
                                selectedBioequivalent ? 'Resultados Bioequivalencia' : 'Consultor de Precios'}
                        </h2>
                        <p className="text-slate-500 text-sm font-medium">
                            {selectedProduct ? 'Detalle y Alternativas' :
                                selectedBioequivalent ? `Buscando: ${selectedBioequivalent.active_ingredient}` : 'Farmacias Vallenar'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setIsExitPinOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-bold text-sm tracking-wide"
                    >
                        <Lock size={16} /> <span className="hidden md:inline">SALIR</span>
                    </button>
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-50">

                {/* 1. SEARCH INTERFACE (DEFAULT) */}
                {!selectedProduct && !selectedBioequivalent && (
                    <div className="flex flex-col h-full opacity-100 transition-opacity duration-300">

                        {/* MODE TABS */}
                        <div className="flex justify-center p-6 pb-2 gap-4">
                            <button
                                onClick={() => handleModeSwitch('PRODUCT')}
                                className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-bold text-lg transition-all ${searchMode === 'PRODUCT'
                                        ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20 scale-105'
                                        : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'
                                    }`}
                            >
                                <Pill size={20} />
                                Buscar Producto / Activo
                            </button>
                            <button
                                onClick={() => handleModeSwitch('BIOEQUIVALENT')}
                                className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-bold text-lg transition-all ${searchMode === 'BIOEQUIVALENT'
                                        ? 'bg-amber-500 text-white shadow-xl shadow-amber-500/20 scale-105'
                                        : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'
                                    }`}
                            >
                                <FileText size={20} />
                                Buscar Bioequivalentes (ISP)
                            </button>
                        </div>

                        {/* SEARCH INPUT */}
                        <div className="p-6 pt-4 shrink-0 max-w-4xl mx-auto w-full relative z-10">
                            <div className="relative group">
                                <div className={`absolute inset-0 bg-gradient-to-r ${searchMode === 'PRODUCT' ? 'from-blue-400 to-cyan-400' : 'from-amber-400 to-orange-400'} rounded-3xl blur opacity-20 group-focus-within:opacity-40 transition-opacity duration-300`} />
                                <div className="relative bg-white border-2 border-slate-200 rounded-3xl flex items-center overflow-hidden h-20 shadow-sm focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/10 transition-all">
                                    <div className="pl-6 text-slate-400">
                                        {isPending ? <Loader2 className="animate-spin text-cyan-500" size={32} /> : <ScanBarcode size={32} />}
                                    </div>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder={searchMode === 'PRODUCT' ? "Escribe el nombre, activo o escanea..." : "Escribe principio activo o nombre genérico..."}
                                        className="w-full h-full px-6 text-2xl font-bold text-slate-800 placeholder:text-slate-300 outline-none bg-transparent"
                                        autoFocus
                                    />
                                    {query && (
                                        <button onClick={() => setQuery('')} className="mr-6 p-2 rounded-full hover:bg-slate-100 text-slate-300 hover:text-red-500">
                                            <span className="text-xl font-bold">✕</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* RESULTS GRID */}
                        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                            <div className="max-w-7xl mx-auto">

                                {/* EMPTY STATE */}
                                {!isPending && query.length < 3 && (
                                    <div className="text-center py-20 opacity-40">
                                        <div className="w-32 h-32 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-6">
                                            {searchMode === 'PRODUCT' ? <ScanBarcode size={64} className="text-slate-400" /> : <Stethoscope size={64} className="text-slate-400" />}
                                        </div>
                                        <p className="text-2xl font-bold text-slate-500">
                                            {searchMode === 'PRODUCT' ? 'Escanea o escribe para buscar' : 'Consulta el listado oficial ISP por activo'}
                                        </p>
                                    </div>
                                )}

                                {/* PRODUCT RESULTS */}
                                {searchMode === 'PRODUCT' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {results.map((product) => (
                                            <div
                                                key={product.id}
                                                onClick={() => handleProductClick(product)}
                                                className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-100 cursor-pointer transition-all active:scale-[0.98] group"
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h3 className="text-xl font-black text-slate-800 leading-tight mb-1 group-hover:text-cyan-700">
                                                            {product.name}
                                                        </h3>
                                                        <p className="text-sm font-semibold text-slate-500">{product.laboratory}</p>
                                                    </div>
                                                </div>
                                                {product.dci && (
                                                    <div className="mb-4">
                                                        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-1 rounded-md uppercase">
                                                            {product.dci}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex items-end justify-between border-t border-slate-50 pt-3">
                                                    <div className="text-right w-full">
                                                        <span className="block text-xs font-bold text-slate-400 uppercase">Precio</span>
                                                        <span className="text-3xl font-black text-slate-800 tracking-tight">
                                                            ${(product.price || 0).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* BIOEQUIVALENT RESULTS (ISP CSV) */}
                                {searchMode === 'BIOEQUIVALENT' && (
                                    <div className="space-y-3">
                                        {bioResults.map((bio, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => handleBioequivalentClick(bio)}
                                                className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-amber-400 hover:shadow-md cursor-pointer transition-all active:scale-[0.99] flex justify-between items-center group"
                                            >
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                                            REG: {bio.registry_number}
                                                        </span>
                                                        <span className="text-slate-400 text-xs font-bold">| {bio.holder}</span>
                                                    </div>
                                                    <h3 className="text-lg font-black text-slate-800 group-hover:text-amber-700 transition-colors">
                                                        {bio.product_name}
                                                    </h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <FlaskConical size={14} className="text-amber-500" />
                                                        <span className="font-bold text-slate-600">{bio.active_ingredient}</span>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-50 p-3 rounded-xl group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">
                                                    <ArrowRight size={20} className="text-slate-300 group-hover:text-amber-500" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. BIOEQUIVALENT INVENTORY MATCHES VIEW */}
                {selectedBioequivalent && !selectedProduct && (
                    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">

                        {/* Selected ISP Header */}
                        <div className="bg-white p-6 border-b border-slate-200 shadow-sm shrink-0">
                            <div className="max-w-4xl mx-auto">
                                <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-black mb-3 border border-amber-200">
                                    <FileText size={14} /> REGISTRO ISP: {selectedBioequivalent.registry_number}
                                </div>
                                <h2 className="text-3xl font-black text-slate-900 mb-2">
                                    {selectedBioequivalent.product_name}
                                </h2>
                                <p className="text-xl text-slate-500 font-medium flex items-center gap-2">
                                    <FlaskConical size={20} className="text-slate-400" />
                                    Principio Activo: <span className="text-amber-600 font-bold">{selectedBioequivalent.active_ingredient}</span>
                                </p>
                            </div>
                        </div>

                        {/* Matches List */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="max-w-4xl mx-auto">
                                <h3 className="text-lg font-bold text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-200 pb-2">
                                    Disponibilidad en Farmacia
                                </h3>

                                {isThinking ? (
                                    <div className="flex justify-center py-12">
                                        <Loader2 className="animate-spin text-amber-500" size={48} />
                                    </div>
                                ) : inventoryMatches.length === 0 ? (
                                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300">
                                        <p className="text-xl font-bold text-slate-500 mb-2">No encontrado en inventario</p>
                                        <p className="text-slate-400">Este producto ISP no coincide con nuestro stock actual.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        {inventoryMatches.map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => handleProductClick(item)}
                                                className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-amber-400 hover:shadow-lg cursor-pointer transition-all flex justify-between items-center group"
                                            >
                                                <div>
                                                    <h4 className="text-xl font-black text-slate-800 mb-1 group-hover:text-amber-600">{item.name}</h4>
                                                    <p className="text-slate-500 text-sm font-medium">{item.laboratory}</p>

                                                    <div className="flex gap-2 mt-3">
                                                        {item.is_bioequivalent && (
                                                            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded uppercase">Bioequivalente</span>
                                                        )}
                                                        {renderStockBadge(item.stock)}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-3xl font-black text-slate-800">${item.price.toLocaleString()}</div>
                                                    <div className="text-xs text-slate-400 font-bold mt-1">Ver Detalle <ArrowRight size={10} className="inline" /></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. PRODUCT DETAIL VIEW (FINAL) */}
                {selectedProduct && (
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white animate-in slide-in-from-right duration-300">

                        {/* LEFT: Product Info */}
                        <div className="w-full md:w-5/12 bg-slate-50 p-8 md:p-12 border-r border-slate-100 flex flex-col relative overflow-y-auto custom-scrollbar">

                            <div className="mb-8">
                                <span className="inline-block px-3 py-1 bg-slate-200 rounded-lg text-xs font-bold text-slate-500 mb-4">
                                    SKU: {selectedProduct.sku}
                                </span>
                                <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight mb-4">
                                    {selectedProduct.name}
                                </h1>
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {selectedProduct.laboratory && (
                                        <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600">
                                            {selectedProduct.laboratory}
                                        </span>
                                    )}
                                    {selectedProduct.dci && (
                                        <span className="px-3 py-1 bg-blue-50 border border-blue-100 rounded-lg text-sm font-bold text-blue-700 flex items-center gap-1">
                                            <FlaskConical size={14} /> {selectedProduct.dci}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 mb-8 text-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-blue-500" />
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Precio Venta</p>
                                <p className="text-6xl font-black text-slate-900 tracking-tighter">
                                    ${selectedProduct.price.toLocaleString()}
                                </p>
                                {selectedProduct.units_per_box && selectedProduct.units_per_box > 1 && (
                                    <p className="text-sm font-bold text-slate-400 mt-2 bg-slate-50 inline-block px-3 py-1 rounded-full">
                                        ${Math.round(selectedProduct.price / selectedProduct.units_per_box).toLocaleString()} c/u
                                    </p>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between p-4 bg-white rounded-xl border border-slate-100">
                                    <span className="font-bold text-slate-500">Estado</span>
                                    {renderStockBadge(selectedProduct.stock)}
                                </div>
                                <div className="flex justify-between p-4 bg-white rounded-xl border border-slate-100">
                                    <span className="font-bold text-slate-500">Bioequivalencia</span>
                                    <span className={`font-black ${selectedProduct.is_bioequivalent ? 'text-green-600' : 'text-slate-400'}`}>
                                        {selectedProduct.is_bioequivalent ? 'SÍ, CERTIFICADO' : 'NO APLICA'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: Alternatives / Related */}
                        <div className="w-full md:w-7/12 bg-white flex flex-col h-full overflow-hidden">
                            <div className="p-8 border-b border-slate-100 bg-white z-10">
                                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                                    <TrendingDown className="text-emerald-500" />
                                    Alternativas Disponibles
                                </h3>
                                <p className="text-slate-500">Comparativa de precios para el mismo principio activo.</p>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/50">
                                {isLoadingDetails ? (
                                    <div className="flex justify-center py-20">
                                        <Loader2 className="animate-spin text-cyan-500" size={40} />
                                    </div>
                                ) : alternatives.length === 0 ? (
                                    <div className="text-center py-12 opacity-50">
                                        <p className="font-bold text-slate-400">No se encontraron alternativas directas.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {alternatives.map((alt, idx) => {
                                            const savings = selectedProduct.price - alt.price;
                                            const isCheaper = savings > 0;
                                            return (
                                                <div key={alt.id} className={`flex items-center justify-between p-5 bg-white rounded-2xl border transition-all ${isCheaper ? 'border-green-200 shadow-md shadow-green-50' : 'border-slate-100'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${isCheaper ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-800 text-lg">{alt.name}</h4>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-slate-500">{alt.laboratory}</span>
                                                                {alt.is_bioequivalent && (
                                                                    <span className="bg-green-50 text-green-600 text-[10px] font-black px-1.5 py-0.5 rounded border border-green-100">BIO</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`text-2xl font-black ${isCheaper ? 'text-green-600' : 'text-slate-700'}`}>
                                                            ${alt.price.toLocaleString()}
                                                        </div>
                                                        {isCheaper && (
                                                            <div className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md inline-block mt-1">
                                                                Ahorra ${savings.toLocaleString()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="p-4 bg-slate-100 text-center text-xs text-slate-400 font-medium">
                                * Los precios pueden variar. Consulte a su químico farmacéutico para mayor orientación.
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* EXIT PIN MODAL */}
            {isExitPinOpen && (
                <div className="absolute inset-0 z-[10000] bg-black/95 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md text-center shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="mb-6">
                            <Lock size={48} className="mx-auto text-slate-800 mb-4" />
                            <h3 className="text-2xl font-black text-slate-900">Modo Kiosco Bloqueado</h3>
                            <p className="text-slate-500 font-medium">Ingrese PIN para salir al sistema.</p>
                        </div>
                        <input
                            ref={exitInputRef}
                            type="password"
                            value={exitPin}
                            onChange={(e) => getExitPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="••••"
                            className={`w-full bg-slate-100 border-2 ${exitError ? 'border-red-500 text-red-500 animate-pulse' : 'border-slate-200 focus:border-cyan-500'} rounded-2xl py-5 text-center text-4xl font-black tracking-[0.5em] outline-none transition-all mb-6`}
                            maxLength={4}
                            autoFocus
                        />
                        <button
                            onClick={() => {
                                setIsExitPinOpen(false);
                                setExitPin('');
                                setTimeout(() => inputRef.current?.focus(), 100);
                            }}
                            className="w-full py-4 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            <LegalModal isOpen={isLegalModalOpen} onClose={() => setIsLegalModalOpen(false)} />
        </div>
    );
}
