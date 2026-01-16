
'use client';

import { useState, useTransition, useEffect } from 'react';
import { searchUnifiedProducts, UnifiedProduct, Offering } from '@/actions/analytics/price-arbitrage';
import { getFiltersAction } from '@/actions/public/get-filters';
import { useDebounce } from '@/hooks/use-debounce';
import { Search, Loader2, Building2, Package, TrendingUp, AlertTriangle, Eye, EyeOff, Filter, X, TrendingDown } from 'lucide-react';

interface UnifiedPriceConsultantProps {
    isPublicMode?: boolean;
    allowToggle?: boolean;
}

export default function UnifiedPriceConsultant({ isPublicMode = false, allowToggle = true }: UnifiedPriceConsultantProps) {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 500); // 500ms delay
    const [results, setResults] = useState<UnifiedProduct[]>([]);
    const [isPending, startTransition] = useTransition();
    const [hasSearched, setHasSearched] = useState(false);
    const [isPublic, setIsPublic] = useState(isPublicMode);

    // Filters State
    const [filters, setFilters] = useState({ categoryId: 0, labId: 0, actionId: 0 });
    const [availableFilters, setAvailableFilters] = useState<{
        categories: { id: number, name: string }[],
        laboratories: { id: number, name: string }[],
        actions: { id: number, name: string }[]
    }>({ categories: [], laboratories: [], actions: [] });
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        getFiltersAction().then(setAvailableFilters);
    }, []);

    // Effect for Debounced Search
    useEffect(() => {
        const fetchResults = async () => {
            const hasFilters = filters.categoryId > 0 || filters.labId > 0 || filters.actionId > 0;

            if (debouncedQuery.length < 2 && !hasFilters) {
                setResults([]);
                return;
            }

            startTransition(async () => {
                const data = await searchUnifiedProducts(debouncedQuery, {
                    categoryId: filters.categoryId || undefined,
                    labId: filters.labId || undefined,
                    actionId: filters.actionId || undefined
                });
                setResults(data);
                setHasSearched(true);
            });
        };

        fetchResults();
    }, [debouncedQuery, filters]); // Trigger on debounce or filter change

    // Simple handler to update local state
    const handleSearchInput = (term: string) => {
        setQuery(term);
    };

    const updateFilter = (type: 'categoryId' | 'labId' | 'actionId', value: number) => {
        setFilters(prev => ({ ...prev, [type]: value }));
        // Effect will trigger search automatically
    };

    const clearFilters = () => {
        setFilters({ categoryId: 0, labId: 0, actionId: 0 });
        // Effect will trigger search automatically
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);
    };

    return (
        <div className="w-full bg-white rounded-xl shadow-md border-t-4 border-t-blue-600 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-gray-500" />
                    <h2 className="text-xl font-bold text-gray-900">Consultor de Precios</h2>
                </div>
                {allowToggle && (
                    <button
                        onClick={() => setIsPublic(!isPublic)}
                        className="p-2 text-gray-400 hover:text-blue-600 transition-colors rounded-full hover:bg-gray-100"
                        title={isPublic ? "Modo Público (Click para ver Costos)" : "Modo Admin (Click para Ocultar)"}
                    >
                        {isPublic ? <Eye size={20} /> : <EyeOff size={20} />}
                    </button>
                )}
            </div>

            <div className="p-6">
                {/* Search Input & Filter Toggle */}
                <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, código de barras o SKU..."
                            value={query}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            className="w-full pl-12 pr-12 py-3 text-lg border-2 border-gray-200 rounded-lg focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                            autoFocus
                        />
                        {isPending && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-4 py-2 rounded-lg border-2 font-medium flex items-center gap-2 transition-colors ${showFilters ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
                    >
                        <Filter size={20} />
                        Filtros
                    </button>
                </div>

                {/* Filters Panel */}
                {showFilters && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100 grid md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2">
                        <select
                            value={filters.categoryId}
                            onChange={(e) => updateFilter('categoryId', Number(e.target.value))}
                            className="p-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value={0}>Todas las Categorías</option>
                            {availableFilters.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select
                            value={filters.labId}
                            onChange={(e) => updateFilter('labId', Number(e.target.value))}
                            className="p-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value={0}>Todos los Laboratorios</option>
                            {availableFilters.laboratories.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <select
                            value={filters.actionId}
                            onChange={(e) => updateFilter('actionId', Number(e.target.value))}
                            className="p-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value={0}>Todas las Acciones</option>
                            {availableFilters.actions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>

                        {(filters.categoryId > 0 || filters.labId > 0 || filters.actionId > 0) && (
                            <button onClick={clearFilters} className="text-red-500 text-sm font-medium hover:underline flex items-center gap-1 justify-center">
                                <X size={16} /> Limpiar Filtros
                            </button>
                        )}
                    </div>
                )}

                {/* Results Table */}
                {results.length > 0 ? (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Producto</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Santiago</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Colchagua</th>
                                    {!isPublic && <th className="px-4 py-3 text-center text-sm font-semibold text-yellow-800 bg-yellow-50">Golan (Costo)</th>}
                                    {!isPublic && <th className="px-4 py-3 text-center text-sm font-semibold text-blue-800 bg-blue-50">Margen</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {results.map((product) => {
                                    // Logic to find best/worst prices among ACTIVE offerings > 0
                                    const prices = product.offerings
                                        .filter(o => o.price > 0 && (o.source.includes('SUCURSAL') || o.source.includes('SANTIAGO') || o.source.includes('COLCHAGUA')))
                                        .map(o => o.price);

                                    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
                                    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

                                    // Extract sources
                                    const stgo = product.offerings.find(o => o.source.includes('SANTIAGO') || o.source.includes('VALLENAR (S)'));
                                    const colch = product.offerings.find(o => o.source.includes('COLCHAGUA') || o.source.includes('VALLENAR (C)'));
                                    const golan = product.offerings.find(o => o.source.includes('GOLAN'));

                                    // Metadata for display
                                    const displayCategory = product.misc?.category;
                                    const displayLab = product.misc?.laboratory;
                                    const displayAction = product.misc?.action;

                                    return (
                                        <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                                            {/* Name & Details - CLICK TO SEARCH BIOEQUIVALENTS */}
                                            <td
                                                className="px-4 py-3 cursor-pointer group"
                                                onClick={() => {
                                                    if (product.activePrinciple) {
                                                        handleSearchInput(product.activePrinciple);
                                                    }
                                                }}
                                            >
                                                <div className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                                    {product.productName}
                                                    {product.activePrinciple && <Search size={14} className="opacity-0 group-hover:opacity-100 text-blue-400" />}
                                                </div>

                                                {product.activePrinciple && (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                            {product.activePrinciple}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Metadata Tags */}
                                                <div className="flex flex-wrap gap-1 mt-1 mb-1">
                                                    {displayLab && (
                                                        <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                                            {displayLab}
                                                        </span>
                                                    )}
                                                    {displayCategory && (
                                                        <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                                            {displayCategory}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500 items-center">
                                                    {isPublic && product.misc?.bioequivalencia && (
                                                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 font-bold flex items-center gap-1">
                                                            <Package size={10} /> Bioequivalente
                                                        </span>
                                                    )}
                                                    {product.ispCode && <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">ISP: {product.ispCode}</span>}
                                                    {product.sku && <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">SKU: {product.sku}</span>}
                                                    {!isPublic && product.maxMargin < 0 && (
                                                        <span className="text-red-600 font-bold flex items-center bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                                            <AlertTriangle className="h-3 w-3 mr-1" /> Pérdida
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Units & PPU & Price Delta */}
                                                <div className="mt-2 flex flex-col items-start gap-1">
                                                    {isPublic && product.unitsPerBox && product.bestPrice > 0 && (
                                                        <div className="flex items-baseline gap-2 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                                            <span className="text-xs text-gray-400 font-medium">Costo x Unidad:</span>
                                                            <span className="text-sm font-bold text-gray-700">
                                                                {formatPrice(Math.round(product.bestPrice / product.unitsPerBox))}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Price Difference Indicator (Logic: If searching bioequivalents) */}
                                                    {query && product.activePrinciple && query.includes(product.activePrinciple) && (
                                                        <div className="mt-1">
                                                            {product.bestPrice < results.reduce((acc, p) => acc + p.bestPrice, 0) / results.length ? (
                                                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200 flex items-center gap-1">
                                                                    <TrendingDown size={12} /> Opción Más Económica
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                                                    Precio Estándar
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Savings Suggestion */}
                                                {product.savingsSuggestion && (
                                                    <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-2 flex items-start gap-2">
                                                        <div className="bg-green-100 p-1 rounded-full text-green-600 mt-0.5">
                                                            <TrendingDown size={14} />
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-green-800 font-bold">
                                                                ¡Ahorra {formatPrice(product.savingsSuggestion.saveAmount)}!
                                                            </div>
                                                            <div className="text-[10px] text-green-700 leading-tight">
                                                                Prefiere <span className="font-semibold">{product.savingsSuggestion.productName}</span> a solo {formatPrice(product.savingsSuggestion.price)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Santiago */}
                                            <td className="px-4 py-3 text-center border-l border-gray-100">
                                                {stgo ? (
                                                    <div className={`inline-block px-3 py-1 rounded-lg ${stgo.price === minPrice && stgo.price > 0 ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : ''}`}>
                                                        <div className="font-bold text-base">{formatPrice(stgo.price)}</div>
                                                        <div className={`text-xs mt-0.5 ${stgo.stock === 0 ? 'text-red-600 font-bold bg-red-50 px-1 rounded' : 'text-gray-500'}`}>
                                                            Stock: {stgo.stock}
                                                        </div>
                                                    </div>
                                                ) : <span className="text-gray-300">-</span>}
                                            </td>

                                            {/* Colchagua */}
                                            <td className="px-4 py-3 text-center border-l border-gray-100">
                                                {colch ? (
                                                    <div className={`inline-block px-3 py-1 rounded-lg ${colch.price === minPrice && colch.price > 0 ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : ''}`}>
                                                        <div className="font-bold text-base">{formatPrice(colch.price)}</div>
                                                        <div className={`text-xs mt-0.5 ${colch.stock === 0 ? 'text-red-600 font-bold bg-red-50 px-1 rounded' : 'text-gray-500'}`}>
                                                            Stock: {colch.stock}
                                                        </div>
                                                    </div>
                                                ) : <span className="text-gray-300">-</span>}
                                            </td>

                                            {/* Golan (Private) */}
                                            {!isPublic && (
                                                <td className="px-4 py-3 text-center border-l border-gray-100 bg-yellow-50/30">
                                                    {golan ? (
                                                        <div className="text-yellow-800">
                                                            <div className="font-mono font-medium">{formatPrice(golan.price)}</div>
                                                            <div className="text-xs text-yellow-600/80">Stock: {golan.stock}</div>
                                                        </div>
                                                    ) : <span className="text-gray-300">-</span>}
                                                </td>
                                            )}

                                            {/* Margin (Private) */}
                                            {!isPublic && (
                                                <td className="px-4 py-3 text-center border-l border-gray-100 bg-blue-50/30">
                                                    <div className={`font-bold ${product.maxMargin > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {formatPrice(product.maxMargin)}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    hasSearched && query.length > 2 && !isPending && (
                        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                            No se encontraron productos para "{query}"
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
