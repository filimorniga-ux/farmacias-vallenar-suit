'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { Search, ScanBarcode, Loader2, ArrowRight, ArrowLeft, TrendingDown, Pill, FlaskConical, Lock, Scale, FileText, Stethoscope, BookOpen } from 'lucide-react';
import { searchProductsAction, type ProductResult } from '@/actions/public/search-products';
import { searchBioequivalentsAction, findInventoryMatchesAction, type BioequivalentResult } from '@/actions/public/bioequivalents';
import { getAlternativesAction, type AlternativeResult } from '@/actions/public/get-alternatives';
import { LegalModal } from './LegalModal';

interface PriceCheckerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Modes: LANDING | PRODUCT_SEARCH | ACTIVE_SEARCH | BIO_SEARCH
type ViewMode = 'LANDING' | 'SEARCH_PRODUCT' | 'SEARCH_ACTIVE' | 'SEARCH_BIO';

export default function PriceCheckerModal({ isOpen, onClose }: PriceCheckerModalProps) {
    // Navigation State
    const [mode, setMode] = useState<ViewMode>('LANDING');

    // Data State
    const [query, setQuery] = useState('');
    const [productResults, setProductResults] = useState<ProductResult[]>([]);
    const [bioResults, setBioResults] = useState<BioequivalentResult[]>([]);

    const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
    const [selectedBioequivalent, setSelectedBioequivalent] = useState<BioequivalentResult | null>(null);
    const [inventoryMatches, setInventoryMatches] = useState<ProductResult[]>([]);
    const [alternatives, setAlternatives] = useState<AlternativeResult[]>([]);

    // UI State
    const [isPending, startTransition] = useTransition();
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isThinking, setIsThinking] = useState(false); // For local inventory matching
    const inputRef = useRef<HTMLInputElement>(null);

    // Security/Modal State
    const [isExitPinOpen, setIsExitPinOpen] = useState(false);
    const [exitPin, setExitPin] = useState('');
    const [exitError, setExitError] = useState(false);
    const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
    const exitInputRef = useRef<HTMLInputElement>(null);

    // Initializer
    useEffect(() => {
        if (isOpen) {
            resetState();
        } else {
            setQuery(''); // Clear on fully close
        }
    }, [isOpen]);

    const resetState = () => {
        setMode('LANDING');
        setQuery('');
        setProductResults([]);
        setBioResults([]);
        setSelectedProduct(null);
        setSelectedBioequivalent(null);
        setInventoryMatches([]);
        setAlternatives([]);
        setIsExitPinOpen(false);
    };

    // Auto-focus input when entering search modes
    useEffect(() => {
        if (mode !== 'LANDING' && !selectedProduct && !selectedBioequivalent) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
        // If back to landing, reset query
        if (mode === 'LANDING') {
            setQuery('');
            setProductResults([]);
            setBioResults([]);
        }
    }, [mode, selectedProduct, selectedBioequivalent]);

    // Search Logic with Debounce
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (query.length >= 3) {
                startTransition(async () => {
                    if (mode === 'SEARCH_BIO') {
                        // ISP Search
                        const results = await searchBioequivalentsAction(query);
                        setBioResults(results);
                    } else {
                        // Product or Active Ingredient Search (Unified Backend for now, but UI context differs)
                        const results = await searchProductsAction(query);
                        setProductResults(results);
                    }
                });
            } else {
                setProductResults([]);
                setBioResults([]);
            }
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [query, mode]);


    // --- HANDLERS ---

    const handleProductSelect = async (product: ProductResult) => {
        setSelectedProduct(product);
        setIsLoadingDetails(true);
        // Load alternatives
        const searchDci = product.dci || product.name || '';
        try {
            const alts = await getAlternativesAction(searchDci, product.id);
            setAlternatives(alts);
        } catch (e) {
            console.error(e);
        }
        setIsLoadingDetails(false);
    };

    const handleBioSelect = async (bio: BioequivalentResult) => {
        setSelectedBioequivalent(bio);
        setIsThinking(true);
        try {
            // Fuzzy search in local inventory
            const terms = bio.active_ingredient || bio.product_name;
            const matches = await findInventoryMatchesAction(terms);
            setInventoryMatches(matches);
        } catch (e) {
            console.error(e);
        }
        setIsThinking(false);
    };

    const handleBack = () => {
        if (selectedProduct) {
            setSelectedProduct(null);
            // If we came from a Bioequivalent selection, going back means back to bio matches list?
            // Or back to main flow? 
            // If we are in BIO mode and have a selected bioequivalent, going back from product should go back to matches
            if (mode === 'SEARCH_BIO' && selectedBioequivalent && inventoryMatches.length > 0) {
                // Stay in matches view
                return;
            }
            return;
        }

        if (selectedBioequivalent) {
            setSelectedBioequivalent(null);
            setInventoryMatches([]);
            return;
        }

        // If in search mode, go back to Landing
        setMode('LANDING');
    };

    const getModeTitle = () => {
        switch (mode) {
            case 'SEARCH_PRODUCT': return 'Búsqueda por Nombre / Código';
            case 'SEARCH_ACTIVE': return 'Búsqueda por Principio Activo';
            case 'SEARCH_BIO': return 'Búsqueda de Bioequivalentes (ISP)';
            default: return 'Consultor de Precios';
        }
    };

    const getModeColor = () => {
        switch (mode) {
            case 'SEARCH_PRODUCT': return 'text-blue-600';
            case 'SEARCH_ACTIVE': return 'text-emerald-600';
            case 'SEARCH_BIO': return 'text-amber-600';
            default: return 'text-slate-800';
        }
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


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 w-screen h-screen z-[9999] bg-slate-50 flex flex-col overflow-hidden font-sans">

            {/* TOP BAR */}
            <div className="bg-white border-b border-slate-200 p-4 shadow-sm z-20 flex justify-between items-center shrink-0 h-20">
                <div className="flex items-center gap-4">
                    {mode !== 'LANDING' ? (
                        <button
                            onClick={handleBack}
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
                        <h2 className={`text-2xl font-black tracking-tight leading-none ${getModeColor()}`}>
                            {selectedProduct ? 'Ficha de Producto' : selectedBioequivalent ? 'Resultados Bioequivalencia' : getModeTitle()}
                        </h2>
                        <p className="text-slate-400 text-sm font-bold">
                            Farmacias Vallenar
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

            {/* MAIN CONTENT */}
            <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-50">

                {/* 1. LANDING PAGE (3 BIG BUTTONS) */}
                {mode === 'LANDING' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
                        <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-2 text-center">
                            ¿Qué estás buscando hoy?
                        </h1>
                        <p className="text-xl text-slate-500 font-medium mb-12 text-center max-w-2xl">
                            Selecciona una opción para comenzar tu consulta.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
                            {/* OPTION 1: PRODUCT SEARCH */}
                            <button
                                onClick={() => setMode('SEARCH_PRODUCT')}
                                className="group relative bg-white border-2 border-slate-100 hover:border-blue-400 p-8 rounded-3xl shadow-sm hover:shadow-2xl hover:shadow-blue-100 transition-all text-left flex flex-col gap-6 active:scale-95"
                            >
                                <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <ScanBarcode size={40} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 group-hover:text-blue-700">Buscar por Producto</h3>
                                    <p className="text-slate-400 font-medium mt-2">Ingresa el nombre comercial o escanea el código de barras.</p>
                                </div>
                                <div className="absolute top-8 right-8 text-slate-200 group-hover:text-blue-400">
                                    <ArrowRight size={32} />
                                </div>
                            </button>

                            {/* OPTION 2: ACTIVE INGREDIENT */}
                            <button
                                onClick={() => setMode('SEARCH_ACTIVE')}
                                className="group relative bg-white border-2 border-slate-100 hover:border-emerald-400 p-8 rounded-3xl shadow-sm hover:shadow-2xl hover:shadow-emerald-100 transition-all text-left flex flex-col gap-6 active:scale-95"
                            >
                                <div className="w-20 h-20 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                    <FlaskConical size={40} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 group-hover:text-emerald-700">Principio Activo</h3>
                                    <p className="text-slate-400 font-medium mt-2">Busca por componente (ej: Paracetamol, Losartán).</p>
                                </div>
                                <div className="absolute top-8 right-8 text-slate-200 group-hover:text-emerald-400">
                                    <ArrowRight size={32} />
                                </div>
                            </button>

                            {/* OPTION 3: BIOEQUIVALENTS */}
                            <button
                                onClick={() => setMode('SEARCH_BIO')}
                                className="group relative bg-white border-2 border-slate-100 hover:border-amber-400 p-8 rounded-3xl shadow-sm hover:shadow-2xl hover:shadow-amber-100 transition-all text-left flex flex-col gap-6 active:scale-95"
                            >
                                <div className="w-20 h-20 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                    <FileText size={40} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 group-hover:text-amber-700">Bioequivalentes</h3>
                                    <p className="text-slate-400 font-medium mt-2">Consulta el registro oficial ISP y encuentra alternativas.</p>
                                </div>
                                <div className="absolute top-8 right-8 text-slate-200 group-hover:text-amber-400">
                                    <ArrowRight size={32} />
                                </div>
                            </button>
                        </div>

                        {/* LEGAL BUTTON */}
                        <div className="mt-16">
                            <button
                                onClick={() => setIsLegalModalOpen(true)}
                                className="flex items-center gap-3 px-8 py-4 bg-slate-200 text-slate-600 rounded-full font-bold hover:bg-slate-300 hover:text-slate-800 transition-colors"
                            >
                                <Scale size={24} />
                                Información Legal y Derechos del Paciente
                            </button>
                        </div>
                    </div>
                )}

                {/* 2. SEARCH INTERFACES */}
                {mode !== 'LANDING' && !selectedProduct && !selectedBioequivalent && (
                    <div className="flex flex-col h-full animate-in slide-in-from-right duration-300">
                        {/* SEARCH BAR */}
                        <div className="p-6 shrink-0 max-w-4xl mx-auto w-full">
                            <div className="relative group">
                                <div className={`absolute inset-0 bg-gradient-to-r ${mode === 'SEARCH_BIO' ? 'from-amber-400 to-orange-400' : mode === 'SEARCH_ACTIVE' ? 'from-emerald-400 to-teal-400' : 'from-blue-400 to-cyan-400'} rounded-3xl blur opacity-20 group-focus-within:opacity-40 transition-opacity duration-300`} />
                                <div className="relative bg-white border-2 border-slate-200 rounded-3xl flex items-center overflow-hidden h-24 shadow-sm focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/10 transition-all">
                                    <div className="pl-8 text-slate-400">
                                        {isPending ? <Loader2 className="animate-spin text-cyan-500" size={36} /> : mode === 'SEARCH_BIO' ? <FileText size={36} /> : <Search size={36} />}
                                    </div>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder={
                                            mode === 'SEARCH_PRODUCT' ? "Escribe nombre del producto..." :
                                                mode === 'SEARCH_ACTIVE' ? "Escribe el principio activo..." :
                                                    "Buscar en registro ISP..."
                                        }
                                        className="w-full h-full px-6 text-3xl font-bold text-slate-800 placeholder:text-slate-300 outline-none bg-transparent"
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

                        {/* LIST RESULTS */}
                        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                            <div className="max-w-6xl mx-auto space-y-4">
                                {isPending && <div className="text-center py-10 text-slate-400 font-bold">Buscando...</div>}

                                {/* BIO RESULTS */}
                                {mode === 'SEARCH_BIO' && bioResults.map((bio, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleBioSelect(bio)}
                                        className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-amber-400 hover:shadow-lg cursor-pointer transition-all flex items-center justify-between group"
                                    >
                                        <div>
                                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                                RECORD ISP: {bio.registry_number}
                                            </span>
                                            <h3 className="text-xl font-black text-slate-800 mt-1">{bio.product_name}</h3>
                                            <p className="text-slate-500 font-medium">{bio.active_ingredient}</p>
                                        </div>
                                        <ArrowRight className="text-slate-300 group-hover:text-amber-500" />
                                    </div>
                                ))}

                                {/* PRODUCT RESULTS */}
                                {mode !== 'SEARCH_BIO' && productResults.map((product) => (
                                    <div
                                        key={product.id}
                                        onClick={() => handleProductSelect(product)}
                                        className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-lg cursor-pointer transition-all flex items-center justify-between group"
                                    >
                                        <div>
                                            <h3 className="text-xl font-black text-slate-800 group-hover:text-blue-700">{product.name}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-sm font-bold text-slate-500">{product.laboratory}</span>
                                                {product.dci && <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-medium">{product.dci}</span>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-2xl font-black text-slate-800">${product.price.toLocaleString()}</div>
                                            {product.stock > 0 ? (
                                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Disponible</span>
                                            ) : (
                                                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">Agotado</span>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {!isPending && query.length > 2 && productResults.length === 0 && bioResults.length === 0 && (
                                    <div className="text-center py-20 opacity-50">
                                        <Search size={48} className="mx-auto mb-4 text-slate-300" />
                                        <p className="text-xl font-bold text-slate-400">No se encontraron resultados</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. BIO INVENTORY MATCHES */}
                {selectedBioequivalent && !selectedProduct && (
                    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden animate-in slide-in-from-right">
                        <div className="bg-amber-50 p-6 border-b border-amber-100">
                            <div className="max-w-4xl mx-auto">
                                <span className="text-amber-600 font-bold tracking-widest text-xs uppercase">Buscando equivalentes para:</span>
                                <h2 className="text-3xl font-black text-slate-900 mt-1">{selectedBioequivalent.product_name}</h2>
                                <p className="text-lg text-slate-500 font-medium flex items-center gap-2">
                                    <FlaskConical size={18} /> {selectedBioequivalent.active_ingredient}
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="max-w-4xl mx-auto space-y-4">
                                {isThinking ? (
                                    <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-amber-500" size={48} /></div>
                                ) : inventoryMatches.length > 0 ? (
                                    inventoryMatches.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => handleProductSelect(item)}
                                            className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-amber-400 hover:shadow-xl cursor-pointer transition-all flex justify-between items-center group"
                                        >
                                            <div>
                                                <h4 className="text-xl font-black text-slate-800 group-hover:text-amber-700">{item.name}</h4>
                                                <div className="flex gap-2 mt-2">
                                                    <span className="text-sm font-bold text-slate-500">{item.laboratory}</span>
                                                    {item.is_bioequivalent && <span className="bg-amber-100 text-amber-800 text-xs font-black px-2 py-0.5 rounded">BIO</span>}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-black text-slate-800">${item.price.toLocaleString()}</div>
                                                <span className="text-xs font-bold text-slate-400">Ver Ficha <ArrowRight size={12} className="inline ml-1" /></span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-20 text-slate-400">
                                        <p className="font-bold text-xl">No tenemos coincidencia exacta en inventario.</p>
                                        <p>Intente buscar por principio activo directamente.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. PRODUCT DETAIL (FINAL) */}
                {selectedProduct && (
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white animate-in zoom-in-95 duration-200">
                        {/* LEFT: INFO */}
                        <div className="w-full md:w-5/12 bg-slate-50 p-8 flex flex-col border-r border-slate-100 overflow-y-auto custom-scrollbar">
                            <div className="mb-8">
                                <span className="inline-block px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-400 mb-4">SKU: {selectedProduct.sku}</span>
                                <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight mb-4">{selectedProduct.name}</h1>

                                {selectedProduct.dci && (
                                    <div className="flex items-center gap-2 mb-2">
                                        <FlaskConical className="text-blue-500" size={20} />
                                        <span className="text-lg font-bold text-blue-700">{selectedProduct.dci}</span>
                                    </div>
                                )}
                                <p className="text-slate-500 font-medium">{selectedProduct.laboratory}</p>
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

                            <div className="mt-auto space-y-3">
                                {selectedProduct.is_bioequivalent && (
                                    <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100">
                                        <div className="w-10 h-10 bg-emerald-200 rounded-full flex items-center justify-center shrink-0">
                                            <FileText size={20} className="text-emerald-700" />
                                        </div>
                                        <div>
                                            <p className="font-black text-sm">BIOEQUIVALENTE APROBADO</p>
                                            <p className="text-xs opacity-80">Cumple normativa ISP Chile.</p>
                                        </div>
                                    </div>
                                )}
                                {selectedProduct.stock <= 0 && (
                                    <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-center font-bold">
                                        ❌ PRODUCTO AGOTADO
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT: ALTERNATIVES */}
                        <div className="w-full md:w-7/12 bg-white flex flex-col h-full overflow-hidden">
                            <div className="p-6 border-b border-slate-100 bg-white/80 backdrop-blur z-10 sticky top-0">
                                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                    <TrendingDown className="text-emerald-500" />
                                    Otras Opciones
                                </h3>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
                                {isLoadingDetails ? (
                                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-300" size={40} /></div>
                                ) : alternatives.length === 0 ? (
                                    <div className="text-center py-20 opacity-40">
                                        <p className="font-bold text-slate-400">No hay alternativas directas.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {alternatives.map((alt, idx) => {
                                            const savings = selectedProduct.price - alt.price;
                                            const isCheaper = savings > 0;
                                            return (
                                                <div key={alt.id} className={`flex items-center justify-between p-4 bg-white rounded-xl border transition-all ${isCheaper ? 'border-emerald-200 shadow-md shadow-emerald-50' : 'border-slate-100'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${isCheaper ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-800">{alt.name}</h4>
                                                            <p className="text-xs text-slate-400 font-bold">{alt.laboratory}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`text-xl font-black ${isCheaper ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                            ${alt.price.toLocaleString()}
                                                        </div>
                                                        {isCheaper && (
                                                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                                                                AHORRA ${savings.toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* EXIT PIN & LEGAL MODAL */}
            {isExitPinOpen && (
                <div className="absolute inset-0 z-[10000] bg-black/95 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-md text-center shadow-2xl animate-in zoom-in-95 duration-200">
                        <Lock size={48} className="mx-auto text-slate-800 mb-4" />
                        <h3 className="text-2xl font-black text-slate-900 mb-6">Bloqueo de Seguridad</h3>
                        <input
                            ref={exitInputRef}
                            type="password"
                            value={exitPin}
                            onChange={(e) => getExitPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="••••"
                            className={`w-full bg-slate-100 border-2 ${exitError ? 'border-red-500 animate-pulse' : 'border-slate-200 focus:border-cyan-500'} rounded-2xl py-5 text-center text-4xl font-black tracking-[0.5em] outline-none transition-all mb-6`}
                            maxLength={4}
                            autoFocus
                        />
                        <button onClick={() => { setIsExitPinOpen(false); setExitPin(''); }} className="w-full py-4 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                    </div>
                </div>
            )}

            <LegalModal isOpen={isLegalModalOpen} onClose={() => setIsLegalModalOpen(false)} />
        </div>
    );
}
