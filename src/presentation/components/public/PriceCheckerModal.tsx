'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { Search, ScanBarcode, Loader2, ArrowRight, ArrowLeft, TrendingDown, Pill, FlaskConical, Lock, Scale, FileText, Stethoscope, BookOpen, ChevronRight, Scan } from 'lucide-react';
import { usePlatform } from '@/hooks/usePlatform';
import { CameraScanner } from '../ui/CameraScanner';
import { searchProductsAction, type ProductResult } from '@/actions/public/search-products';
import { browseProductsAction } from '@/actions/public/browse-products';
import { searchBioequivalentsAction, findInventoryMatchesAction, getUniqueActiveIngredientsAction, type BioequivalentResult } from '@/actions/public/bioequivalents';
import { getAlternativesAction, type AlternativeResult } from '@/actions/public/get-alternatives';
import { LegalModal } from './LegalModal';
import { VirtualKeyboard } from '../ui/VirtualKeyboard';
import { AlphabetFilter } from '../ui/AlphabetFilter';

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
    const [bioResults, setBioResults] = useState<any[]>([]); // Mixed types now (BioResult or String Ingredient)

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

    // Keyboard State
    // Keyboard & Platform State
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [activeLetter, setActiveLetter] = useState<string | null>(null);
    const { isMobile, isNative } = usePlatform();
    const [showScanner, setShowScanner] = useState(false);

    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
        setPage(1);
        setHasMore(true);
        setError(null);
    };

    // Auto-focus input when entering search modes (ONLY if not mobile to avoid keyboard popup)
    useEffect(() => {
        if (mode !== 'LANDING' && !selectedProduct && !selectedBioequivalent && inventoryMatches.length === 0) {
            if (!isMobile) {
                setTimeout(() => inputRef.current?.focus(), 100);
            }
        }
        // If back to landing, reset query
        if (mode === 'LANDING') {
            setQuery('');
            setProductResults([]);
            setBioResults([]);
            setPage(1);
        }
    }, [mode, selectedProduct, selectedBioequivalent, inventoryMatches]);

    // Search Logic with Debounce
    useEffect(() => {
        // Initial load for Bioequivalents OR Active Ingredients
        if ((mode === 'SEARCH_BIO' || mode === 'SEARCH_ACTIVE') && query === '') {
            startTransition(async () => {
                if (mode === 'SEARCH_BIO') {
                    const results = await searchBioequivalentsAction('', 1, 50);
                    setBioResults(results);
                    setHasMore(results.length === 50);
                } else {
                    // Load Active Ingredients List
                    const ingredients = await getUniqueActiveIngredientsAction('', 1, 50);
                    setBioResults(ingredients);
                    setHasMore(ingredients.length === 50);
                }
                setPage(1);
            });
            return;
        }

        const timeoutId = setTimeout(() => {
            if (activeLetter) return; // Ignore query updates if letter filter is active (handled separately)

            // Allow search if >= 2 chars OR if it's a number (for ID/Registry search)
            const isNumeric = /^\d+$/.test(query);
            if (query.length >= 2 || (isNumeric && query.length >= 1)) {
                startTransition(async () => {
                    setPage(1); // Reset page on new search
                    setError(null);
                    try {
                        if (mode === 'SEARCH_BIO') {
                            // ISP Search
                            const results = await searchBioequivalentsAction(query, 1, 50);
                            setBioResults(results);
                            setHasMore(results.length === 50);
                        } else if (mode === 'SEARCH_ACTIVE') {
                            // Filter Ingredients List
                            const ingredients = await getUniqueActiveIngredientsAction(query, 1, 50);
                            setBioResults(ingredients);
                            setHasMore(ingredients.length === 50);
                        } else {
                            // Product Search
                            const results = await searchProductsAction(query);
                            setProductResults(results);
                        }
                    } catch (err: any) {
                        console.error("Search error:", err);
                        setError(err.message || 'Error al buscar productos');
                        setProductResults([]);
                        setBioResults([]);
                    }
                });
            } else if (query.length === 0) {
                // Return to default lists if query cleared
                startTransition(async () => {
                    setPage(1);
                    if (mode === 'SEARCH_ACTIVE') {
                        const ingredients = await getUniqueActiveIngredientsAction('', 1, 50);
                        setBioResults(ingredients);
                        setHasMore(ingredients.length === 50);
                    } else if (mode === 'SEARCH_BIO') {
                        const results = await searchBioequivalentsAction('', 1, 50);
                        setBioResults(results);
                        setHasMore(results.length === 50);
                    } else {
                        setProductResults([]);
                    }
                });
            }
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [query, mode]);

    // Pagination Handler
    const handleLoadMore = async () => {
        const nextPage = page + 1;
        let newResults: any[] = [];

        if (mode === 'SEARCH_BIO') {
            newResults = await searchBioequivalentsAction(query, nextPage, 50);
        } else if (mode === 'SEARCH_ACTIVE') {
            newResults = await getUniqueActiveIngredientsAction(query, nextPage, 50);
        } else if (mode === 'SEARCH_PRODUCT' && activeLetter) {
            newResults = await browseProductsAction(activeLetter, nextPage, 50);
        }

        if (newResults.length > 0) {
            if (mode === 'SEARCH_PRODUCT' && activeLetter) {
                setProductResults(prev => [...prev, ...newResults]);
            } else {
                setBioResults(prev => [...prev, ...newResults]);
            }
            setPage(nextPage);
            setHasMore(newResults.length === 50);
        } else {
            setHasMore(false);
        }
    };


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
            // Hybrid search: pass both DCI and ISP Product Name
            const matches = await findInventoryMatchesAction(bio.active_ingredient, bio.product_name);
            setInventoryMatches(matches);
        } catch (e) {
            console.error(e);
        }
        setIsThinking(false);
    };

    const handleActiveIngredientSelect = async (ingredient: string) => {
        console.log('🧪 [ActiveIngredientSelect] Selected:', ingredient);
        setQuery(ingredient);
        setInventoryMatches([]);
        setIsThinking(true);
        try {
            const matches = await findInventoryMatchesAction(ingredient, '');
            console.log('🧪 [ActiveIngredientSelect] Matches received:', matches.length, matches);
            setInventoryMatches(matches);
        } catch (e) {
            console.error('🧪 [ActiveIngredientSelect] Error:', e);
        }
        setIsThinking(false);
    };

    const handleBack = () => {
        if (selectedProduct) {
            setSelectedProduct(null);
            // If we came from a Bioequivalent or Active selection, check context
            if (mode === 'SEARCH_BIO' && selectedBioequivalent && inventoryMatches.length > 0) {
                return;
            }
            if (mode === 'SEARCH_ACTIVE' && inventoryMatches.length > 0) {
                return;
            }
            return;
        }

        if (selectedBioequivalent) {
            setSelectedBioequivalent(null);
            setInventoryMatches([]);
            return;
        }

        if (mode === 'SEARCH_ACTIVE' && inventoryMatches.length > 0) {
            // Back from ingredient matches list to Ingredients List
            setInventoryMatches([]);
            setQuery(''); // Optional: clear query to reshow full list? Or keep query?
            // If we keep query, the list remains filtered. Let's keep it for now but user might want to see all.
            // If they clicked an item from the list, query was set to that item.
            // So we should probably empty query to go back to "list" state if they want to choose another.
            setQuery('');

            // Re-fetch default list if query cleared
            startTransition(async () => {
                const ingredients = await getUniqueActiveIngredientsAction('', 1, 50);
                setBioResults(ingredients);
                setHasMore(ingredients.length === 50);
                setPage(1);
            });
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

    // Keyboard & Filter Handlers
    const handleKeyPress = (key: string) => {
        setQuery(prev => prev + key);
        if (inputRef.current) inputRef.current.focus();
    };

    const handleDelete = () => {
        setQuery(prev => prev.slice(0, -1));
        if (inputRef.current) inputRef.current.focus();
    };

    const handleClear = () => {
        setQuery('');
        if (inputRef.current) inputRef.current.focus();
    };

    const handleLetterSelect = (letter: string) => {
        const newLetter = letter === activeLetter ? null : letter;
        setActiveLetter(newLetter);
        setQuery(''); // Clear manual search query when using filter
        setPage(1);

        startTransition(async () => {
            if (newLetter) {
                if (mode === 'SEARCH_PRODUCT') {
                    const results = await browseProductsAction(newLetter, 1, 50);
                    setProductResults(results);
                    setHasMore(results.length === 50);
                } else if (mode === 'SEARCH_ACTIVE') {
                    const results = await getUniqueActiveIngredientsAction(newLetter, 1, 50);
                    setBioResults(results);
                    setHasMore(results.length === 50);
                } else if (mode === 'SEARCH_BIO') {
                    // Existing search action uses "Includes", might need tweak for StartWith if desired,
                    // but for now passing letter works as filter.
                    const results = await searchBioequivalentsAction(newLetter, 1, 50);
                    setBioResults(results);
                    setHasMore(results.length === 50);
                }
            } else {
                // Reset to default "All" view (or empty)
                if (mode === 'SEARCH_PRODUCT') {
                    setProductResults([]);
                    setHasMore(false);
                } else if (mode === 'SEARCH_ACTIVE') {
                    const ingredients = await getUniqueActiveIngredientsAction('', 1, 50);
                    setBioResults(ingredients);
                    setHasMore(ingredients.length === 50);
                } else if (mode === 'SEARCH_BIO') {
                    const results = await searchBioequivalentsAction('', 1, 50);
                    setBioResults(results);
                    setHasMore(results.length === 50);
                }
            }
        });
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 w-screen h-[100dvh] z-[9999] bg-slate-50 flex flex-col overflow-hidden font-sans">

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
                    <div className="flex-1 flex flex-col items-center justify-start md:justify-center p-4 md:p-8 overflow-y-auto animate-in fade-in duration-500 w-full">
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
                {mode !== 'LANDING' && !selectedProduct && !selectedBioequivalent && inventoryMatches.length === 0 && (
                    <div className="flex flex-col h-full animate-in slide-in-from-right duration-300">
                        {/* SEARCH BAR */}
                        <div className="p-4 md:p-6 shrink-0 max-w-4xl mx-auto w-full">
                            <div className="relative group">
                                <div className={`absolute inset-0 bg-gradient-to-r ${mode === 'SEARCH_BIO' ? 'from-amber-400 to-orange-400' : mode === 'SEARCH_ACTIVE' ? 'from-emerald-400 to-teal-400' : 'from-blue-400 to-cyan-400'} rounded-3xl blur opacity-20 group-focus-within:opacity-40 transition-opacity duration-300`} />
                                <div className="relative bg-white border-2 border-slate-200 rounded-3xl flex items-center overflow-hidden h-20 md:h-24 shadow-sm focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/10 transition-all">
                                    <div className="pl-4 md:pl-8 text-slate-400 hidden md:block">
                                        {isPending ? <Loader2 className="animate-spin text-cyan-500" size={36} /> : mode === 'SEARCH_BIO' ? <FileText size={36} /> : <Search size={36} />}
                                    </div>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder={
                                            mode === 'SEARCH_PRODUCT' ? (isMobile ? "Buscar Producto..." : "Escribe nombre del producto...") :
                                                mode === 'SEARCH_ACTIVE' ? (isMobile ? "Buscar P. Activo..." : "Escribe el principio activo...") :
                                                    "Buscar en registro ISP..."
                                        }
                                        className="w-full h-full px-4 md:px-6 text-xl md:text-3xl font-bold text-slate-800 placeholder:text-slate-300 outline-none bg-transparent"
                                        autoFocus={!isMobile} // Disable autofocus on mobile
                                    />

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 pr-2 md:pr-4">
                                        {query && (
                                            <button onClick={() => setQuery('')} className="p-2 rounded-full hover:bg-slate-100 text-slate-300 hover:text-red-500">
                                                <span className="text-xl font-bold">✕</span>
                                            </button>
                                        )}

                                        {/* Mobile Scanner Button */}
                                        {(isMobile || isNative) && mode === 'SEARCH_PRODUCT' && (
                                            <button
                                                onClick={() => setShowScanner(true)}
                                                className="p-3 bg-blue-100 text-blue-600 rounded-xl hover:bg-blue-200 transition-colors"
                                            >
                                                <Scan size={24} />
                                            </button>
                                        )}

                                        <button
                                            onClick={() => setShowKeyboard(!showKeyboard)}
                                            className={`hidden md:block p-2 rounded-xl border-2 font-bold text-xs transition-all ${showKeyboard ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            TECLADO
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* LIST RESULTS */}
                        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 custom-scrollbar relative min-h-0">
                            {/* ALPHABET FILTER */}
                            {(mode === 'SEARCH_PRODUCT' || mode === 'SEARCH_ACTIVE' || mode === 'SEARCH_BIO') && (
                                <AlphabetFilter onSelectLetter={handleLetterSelect} activeLetter={activeLetter} />
                            )}

                            {/* VIRTUAL KEYBOARD OVERLAY OR INLINE */}
                            {showKeyboard && (
                                <div className="mb-6 animate-in slide-in-from-bottom duration-300">
                                    <VirtualKeyboard
                                        onKeyPress={handleKeyPress}
                                        onDelete={handleDelete}
                                        onClear={handleClear}
                                    />
                                </div>
                            )}

                            <div className={`mx-auto space-y-4 ${mode === 'SEARCH_BIO' ? 'w-full' : 'max-w-6xl'}`}>
                                {isPending && <div className="text-center py-10 text-slate-400 font-bold">Buscando...</div>}

                                {/* BIO RESULTS TABLE */}
                                {mode === 'SEARCH_BIO' && bioResults.length > 0 && (
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                        <div className="overflow-x-auto custom-scrollbar">
                                            <table className="w-full text-left whitespace-nowrap">
                                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Registro</th>
                                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Producto</th>
                                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Principio Activo</th>
                                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Titular</th>
                                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Estado</th>
                                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Vigencia</th>
                                                        <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Uso / Tratamiento</th>
                                                        <th className="px-4 py-4 w-10"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {bioResults.map((bio, idx) => (
                                                        <tr
                                                            key={idx}
                                                            onClick={() => handleBioSelect(bio)}
                                                            className="hover:bg-amber-50 cursor-pointer transition-colors group"
                                                        >
                                                            <td className="px-6 py-4 text-sm font-bold text-slate-500 font-mono">
                                                                {bio.registry_number}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="text-sm font-black text-slate-800 group-hover:text-amber-700 max-w-[250px] truncate" title={bio.product_name}>{bio.product_name}</div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                                                    <FlaskConical size={14} className="text-emerald-500 shrink-0" />
                                                                    <span className="truncate max-w-[200px]" title={bio.active_ingredient}>{bio.active_ingredient}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="text-xs font-bold text-slate-400 truncate max-w-[150px]" title={bio.holder}>{bio.holder}</div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                                                                    {bio.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-slate-500 font-bold">
                                                                {bio.validity}
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-slate-500 truncate max-w-[150px]" title={bio.usage}>
                                                                {bio.usage}
                                                            </td>
                                                            <td className="px-4 py-4 text-right sticky right-0 bg-white group-hover:bg-amber-50">
                                                                <ChevronRight className="text-slate-300 group-hover:text-amber-500" size={20} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {/* LOAD MORE BUTTON */}
                                        {hasMore && (
                                            <div className="p-4 bg-slate-50 border-t border-slate-200 text-center">
                                                <button
                                                    onClick={handleLoadMore}
                                                    className="px-6 py-3 bg-white border border-slate-300 rounded-full text-slate-600 font-bold hover:bg-cyan-50 hover:text-cyan-700 hover:border-cyan-300 transition-all flex items-center gap-2 mx-auto shadow-sm"
                                                >
                                                    <ChevronRight className="rotate-90" size={16} />
                                                    Cargar más resultados
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* PRODUCT RESULTS */}
                                {mode === 'SEARCH_ACTIVE' && bioResults.length > 0 && !selectedProduct && inventoryMatches.length === 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {bioResults.map((ingredient: any, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleActiveIngredientSelect(ingredient)}
                                                className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-50 text-left transition-all group"
                                            >
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                                        <FlaskConical size={20} />
                                                    </div>
                                                    <span className="font-bold text-slate-400 text-xs">PRINCIPIO ACTIVO</span>
                                                </div>
                                                <h3 className="text-lg font-black text-slate-800 group-hover:text-emerald-700 leading-tight">
                                                    {ingredient}
                                                </h3>
                                            </button>
                                        ))}

                                        {hasMore && (
                                            <div className="col-span-full text-center py-4">
                                                <button
                                                    onClick={handleLoadMore}
                                                    className="px-6 py-3 bg-slate-100 rounded-full text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                                                >
                                                    Cargar más principios activos...
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

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
                                            {/* Unit Price in List */}
                                            <div className="text-[10px] font-bold text-slate-400">
                                                ${Math.ceil(product.price / (product.units_per_box || 1)).toLocaleString()} c/u
                                            </div>
                                            {product.stock > 0 ? (
                                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded inline-block mt-1">Disponible</span>
                                            ) : (
                                                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded inline-block mt-1">Agotado</span>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {mode === 'SEARCH_PRODUCT' && hasMore && productResults.length > 0 && (
                                    <div className="text-center py-4">
                                        <button
                                            onClick={handleLoadMore}
                                            className="px-6 py-3 bg-slate-100 rounded-full text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                                        >
                                            Cargar más productos...
                                        </button>
                                    </div>
                                )}

                                {!isPending && query.length > 2 && productResults.length === 0 && bioResults.length === 0 && !error && (
                                    <div className="text-center py-20 opacity-50">
                                        <Search size={48} className="mx-auto mb-4 text-slate-300" />
                                        <p className="text-xl font-bold text-slate-400">No se encontraron resultados</p>
                                    </div>
                                )}

                                {!isPending && error && (
                                    <div className="text-center py-20 opacity-80 animate-in fade-in">
                                        <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-500">
                                            <Search size={32} />
                                        </div>
                                        <h3 className="text-xl font-black text-slate-700 mb-2">Error de Conexión</h3>
                                        <p className="text-slate-500 max-w-md mx-auto mb-4">{error}</p>
                                        <p className="text-sm text-slate-400">
                                            Por favor verifique la conexión a Internet o configure las variables de entorno correctamente.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. BIO INVENTORY MATCHES OR ACTIVE INGREDIENT MATCHES */}
                {(selectedBioequivalent || (mode === 'SEARCH_ACTIVE' && inventoryMatches.length > 0)) && (
                    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden animate-in slide-in-from-right">

                        {/* HEADER CONTEXT */}
                        {mode === 'SEARCH_BIO' && selectedBioequivalent && (
                            <div className="bg-amber-50 p-6 border-b border-amber-100">
                                <div className="max-w-4xl mx-auto">
                                    <span className="text-amber-600 font-bold tracking-widest text-xs uppercase">Buscando equivalentes para:</span>
                                    <h2 className="text-3xl font-black text-slate-900 mt-1">{selectedBioequivalent.product_name}</h2>
                                    <p className="text-lg text-slate-500 font-medium flex items-center gap-2">
                                        <FlaskConical size={18} /> {selectedBioequivalent.active_ingredient}
                                    </p>
                                </div>
                            </div>
                        )}

                        {mode === 'SEARCH_ACTIVE' && inventoryMatches.length > 0 && (
                            <div className="bg-emerald-50 p-6 border-b border-emerald-100">
                                <div className="max-w-4xl mx-auto">
                                    <span className="text-emerald-600 font-bold tracking-widest text-xs uppercase">Resultados para Principio Activo:</span>
                                    <h2 className="text-3xl font-black text-slate-900 mt-1">{query || 'Selección'}</h2>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="max-w-4xl mx-auto space-y-4">
                                {isThinking ? (
                                    <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-amber-500" size={48} /></div>
                                ) : inventoryMatches.length > 0 ? (
                                    // MATCHES LIST (Shared for Bio & Active)
                                    inventoryMatches.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => handleProductSelect(item)}
                                            className={`bg-white p-6 rounded-2xl border border-slate-200 cursor-pointer transition-all flex justify-between items-center group ${mode === 'SEARCH_ACTIVE' ? 'hover:border-emerald-400' : 'hover:border-amber-400'} hover:shadow-xl`}
                                        >
                                            <div>
                                                <h4 className={`text-xl font-black text-slate-800 ${mode === 'SEARCH_ACTIVE' ? 'group-hover:text-emerald-700' : 'group-hover:text-amber-700'}`}>{item.name}</h4>
                                                <div className="flex gap-2 mt-2">
                                                    <span className="text-sm font-bold text-slate-500">{item.laboratory}</span>
                                                    {item.is_bioequivalent && <span className="bg-amber-100 text-amber-800 text-xs font-black px-2 py-0.5 rounded">BIO</span>}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-black text-slate-800">${item.price.toLocaleString()}</div>
                                                {/* Unit Price in List */}
                                                <div className="text-[10px] font-bold text-slate-400">
                                                    ${Math.ceil(item.price / (item.units_per_box || 1)).toLocaleString()} c/u
                                                </div>
                                                <span className="text-xs font-bold text-slate-400 mt-1 inline-block">Ver Ficha <ArrowRight size={12} className="inline ml-1" /></span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-20 text-slate-400">
                                        <p className="font-bold text-xl">
                                            {mode === 'SEARCH_ACTIVE' && !selectedBioequivalent
                                                ? 'Seleccione un principio activo.'
                                                : 'No hay coincidencias en inventario.'}
                                        </p>
                                        {mode === 'SEARCH_ACTIVE' && inventoryMatches.length === 0 && query && (
                                            <p className="mt-2 text-sm text-slate-500">
                                                No encontramos productos con <b>{query}</b> en stock.
                                            </p>
                                        )}
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
                            <div className="mb-6">
                                <span className="inline-block px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-400 mb-2">SKU: {selectedProduct.sku}</span>
                                <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight mb-2">{selectedProduct.name}</h1>
                            </div>

                            {/* DETAILED INFO GRID */}
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4 mb-8">
                                <div className="grid grid-cols-2 gap-4 border-b border-slate-50 pb-4">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PRINCIPIO ACTIVO</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedProduct.dci || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PRESENTACIÓN</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedProduct.format || '-'}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 border-b border-slate-50 pb-4">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">TITULAR / LAB</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedProduct.laboratory || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">REGISTRO ISP</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedProduct.isp_register || '-'}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PRECIO VENTA</div>
                                        <div className="text-4xl font-black text-slate-900">${selectedProduct.price.toLocaleString()}</div>
                                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded mt-1 inline-block">DISPONIBLE</span>
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PRECIO UNITARIO</div>
                                        <div className="text-xl font-bold text-slate-500">
                                            ${Math.ceil(selectedProduct.price / (selectedProduct.units_per_box || 1)).toLocaleString()}
                                            <span className="text-xs font-normal ml-1">c/u</span>
                                        </div>
                                    </div>
                                </div>
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
                                        {alternatives.filter(a => String(a.id) !== String(selectedProduct.id)).map((alt, idx) => { // Filter out current product
                                            const diff = selectedProduct.price - alt.price;
                                            const isCheaper = diff > 0;
                                            const isMoreExpensive = diff < 0;
                                            const absDiff = Math.abs(diff);

                                            return (
                                                <div key={alt.id} className={`flex items-center justify-between p-4 bg-white rounded-xl border transition-all ${isCheaper ? 'border-emerald-200 shadow-md shadow-emerald-50' : 'border-slate-100'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${isCheaper ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {idx + 1}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-800">{alt.name}</h4>
                                                            <p className="text-xs text-slate-400 font-bold">{alt.laboratory || 'Generico'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`text-xl font-black ${isCheaper ? 'text-emerald-600' : isMoreExpensive ? 'text-slate-500' : 'text-slate-700'}`}>
                                                            ${alt.price.toLocaleString()}
                                                        </div>
                                                        {/* Unit Price in Alternative */}
                                                        <div className="text-[10px] font-bold text-slate-400">
                                                            ${Math.ceil(alt.price / (alt.units_per_box || 1)).toLocaleString()} c/u
                                                        </div>

                                                        {isCheaper && (
                                                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded block mt-1">
                                                                AHORRA ${absDiff.toLocaleString()}
                                                            </span>
                                                        )}
                                                        {isMoreExpensive && (
                                                            <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded block mt-1">
                                                                PAGAS ${absDiff.toLocaleString()} +
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
            {
                isExitPinOpen && (
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
                )
            }

            <LegalModal isOpen={isLegalModalOpen} onClose={() => setIsLegalModalOpen(false)} />
            {/* SCANNER OVERLAY */}
            {showScanner && (
                <CameraScanner
                    onScan={(code) => {
                        setQuery(code);
                        setShowScanner(false);
                    }}
                    onClose={() => setShowScanner(false)}
                />
            )}
        </div >
    );
}

