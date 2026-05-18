
'use client';

import { useState, useTransition, useEffect } from 'react';
import { searchUnifiedProducts, UnifiedProduct, UnifiedProductContract } from '@/actions/analytics/price-arbitrage';
import { getFiltersAction } from '@/actions/public/get-filters';
import { useDebounce } from '@/hooks/use-debounce';
import { Search, Loader2, Building2, Package, TrendingUp, AlertTriangle, Eye, EyeOff, Filter, X, TrendingDown } from 'lucide-react';

interface UnifiedPriceConsultantProps {
    isPublicMode?: boolean;
    allowToggle?: boolean;
    canViewInternalPricing?: boolean;
}

export default function UnifiedPriceConsultant({
    isPublicMode = false,
    allowToggle = true,
    canViewInternalPricing = false,
}: UnifiedPriceConsultantProps) {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 500); // 500ms delay
    const [results, setResults] = useState<UnifiedProduct[]>([]);
    const [isPending, startTransition] = useTransition();
    const [hasSearched, setHasSearched] = useState(false);
    const [showInternalPricing, setShowInternalPricing] = useState(canViewInternalPricing && !isPublicMode);

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

    useEffect(() => {
        if (!canViewInternalPricing) {
            setShowInternalPricing(false);
            return;
        }

        setShowInternalPricing(!isPublicMode);
    }, [canViewInternalPricing, isPublicMode]);

    // Effect for Debounced Search
    useEffect(() => {
        const fetchResults = async () => {
            const hasFilters = filters.categoryId > 0 || filters.labId > 0 || filters.actionId > 0;

            if (debouncedQuery.length < 2 && !hasFilters) {
                setResults([]);
                return;
            }

            startTransition(async () => {
                const contract: UnifiedProductContract = showInternalPricing ? 'INTERNAL' : 'PUBLIC';
                const data = await searchUnifiedProducts(debouncedQuery, {
                    categoryId: filters.categoryId || undefined,
                    labId: filters.labId || undefined,
                    actionId: filters.actionId || undefined
                }, contract);
                setResults(data);
                setHasSearched(true);
            });
        };

        fetchResults();
    }, [debouncedQuery, filters, showInternalPricing]); // Trigger on debounce or filter change

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
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 sm:p-6">
                <div className="flex min-w-0 items-center gap-2">
                    <Search className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
                    <h2 className="truncate text-lg font-bold text-gray-900 sm:text-xl">Consultor de Precios</h2>
                </div>
                {allowToggle && canViewInternalPricing && (
                    <button
                        type="button"
                        onClick={() => setShowInternalPricing((current) => !current)}
                        aria-label={showInternalPricing ? 'Ocultar costos internos' : 'Mostrar costos internos'}
                        aria-pressed={showInternalPricing}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        title={showInternalPricing ? 'Modo interno (Click para ocultar costos)' : 'Modo público (Click para ver internos)'}
                    >
                        {showInternalPricing ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                    </button>
                )}
            </div>

            <div className="p-4 sm:p-6">
                {/* Search Input & Filter Toggle */}
                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                        <label htmlFor="unified-price-search" className="sr-only">Buscar producto en consultor de precios</label>
                        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                        <input
                            id="unified-price-search"
                            type="text"
                            placeholder="Buscar por nombre, código de barras o SKU…"
                            value={query}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            className="min-h-11 w-full rounded-lg border-2 border-gray-200 py-3 pl-12 pr-12 text-base outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:text-lg"
                        />
                        {isPending && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowFilters(!showFilters)}
                        aria-expanded={showFilters}
                        aria-controls="unified-price-filters"
                        className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border-2 px-4 py-2 font-medium transition-colors sm:w-auto ${showFilters ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-600 hover:border-blue-300'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
                    >
                        <Filter size={20} aria-hidden="true" />
                        Filtros
                    </button>
                </div>

                {/* Filters Panel */}
                {showFilters && (
                    <div id="unified-price-filters" className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-gray-100 bg-gray-50 p-4 animate-in fade-in slide-in-from-top-2 md:grid-cols-4">
                        <select
                            aria-label="Filtrar por categoría"
                            value={filters.categoryId}
                            onChange={(e) => updateFilter('categoryId', Number(e.target.value))}
                            className="min-h-11 rounded border border-gray-300 p-2 text-base outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                        >
                            <option value={0}>Todas las Categorías</option>
                            {availableFilters.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select
                            aria-label="Filtrar por laboratorio"
                            value={filters.labId}
                            onChange={(e) => updateFilter('labId', Number(e.target.value))}
                            className="min-h-11 rounded border border-gray-300 p-2 text-base outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                        >
                            <option value={0}>Todos los Laboratorios</option>
                            {availableFilters.laboratories.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <select
                            aria-label="Filtrar por acción terapéutica"
                            value={filters.actionId}
                            onChange={(e) => updateFilter('actionId', Number(e.target.value))}
                            className="min-h-11 rounded border border-gray-300 p-2 text-base outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                        >
                            <option value={0}>Todas las Acciones</option>
                            {availableFilters.actions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>

                        {(filters.categoryId > 0 || filters.labId > 0 || filters.actionId > 0) && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium text-red-500 hover:bg-red-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                            >
                                <X size={16} aria-hidden="true" /> Limpiar Filtros
                            </button>
                        )}
                    </div>
                )}

                {/* Results Table */}
                {results.length > 0 ? (
                    <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200">
                        <table className="w-full min-w-[720px]">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Producto</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Santiago</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Colchagua</th>
                                    {showInternalPricing && <th className="px-4 py-3 text-center text-sm font-semibold text-yellow-800 bg-yellow-50">Golan (Costo)</th>}
                                    {showInternalPricing && <th className="px-4 py-3 text-center text-sm font-semibold text-blue-800 bg-blue-50">Margen</th>}
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
                                    const productDetails = (
                                        <>
                                            <div className="flex items-center gap-2 text-lg font-bold text-gray-900 transition-colors group-hover:text-blue-600 group-focus-visible:text-blue-600">
                                                {product.productName}
                                                {product.activePrinciple && <Search size={14} className="text-blue-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />}
                                            </div>

                                            {product.activePrinciple && (
                                                <div className="mt-1 flex items-center gap-2">
                                                    <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-sm font-bold text-blue-600">
                                                        {product.activePrinciple}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Metadata Tags */}
                                            <div className="mb-1 mt-1 flex flex-wrap gap-1">
                                                {displayLab && (
                                                    <span className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                                                        {displayLab}
                                                    </span>
                                                )}
                                                {displayCategory && (
                                                    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-600">
                                                        {displayCategory}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                {!showInternalPricing && product.misc?.bioequivalencia && (
                                                    <span className="flex items-center gap-1 rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 font-bold text-purple-700">
                                                        <Package size={10} aria-hidden="true" /> Bioequivalente
                                                    </span>
                                                )}
                                                {product.ispCode && <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5">ISP: {product.ispCode}</span>}
                                                {product.sku && <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5">SKU: {product.sku}</span>}
                                                {showInternalPricing && product.maxMargin < 0 && (
                                                    <span className="flex items-center rounded border border-red-100 bg-red-50 px-1.5 py-0.5 font-bold text-red-600">
                                                        <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" /> Pérdida
                                                    </span>
                                                )}
                                            </div>

                                            {/* Units & PPU & Price Delta */}
                                            <div className="mt-2 flex flex-col items-start gap-1">
                                                {!showInternalPricing && product.unitsPerBox && product.bestPrice > 0 && (
                                                    <div className="flex items-baseline gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1">
                                                        <span className="text-xs font-medium text-gray-400">Costo x Unidad:</span>
                                                        <span className="text-sm font-bold text-gray-700">
                                                            {formatPrice(Math.round(product.bestPrice / product.unitsPerBox))}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Price Difference Indicator (Logic: If searching bioequivalents) */}
                                                {query && product.activePrinciple && query.includes(product.activePrinciple) && (
                                                    <div className="mt-1">
                                                        {product.bestPrice < results.reduce((acc, p) => acc + p.bestPrice, 0) / results.length ? (
                                                            <span className="flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-1 text-xs font-bold text-green-600">
                                                                <TrendingDown size={12} aria-hidden="true" /> Opción Más Económica
                                                            </span>
                                                        ) : (
                                                            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-bold text-gray-400">
                                                                Precio Estándar
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Savings Suggestion */}
                                            {product.savingsSuggestion && (
                                                <div className="mt-2 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-2">
                                                    <div className="mt-0.5 rounded-full bg-green-100 p-1 text-green-600">
                                                        <TrendingDown size={14} aria-hidden="true" />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold text-green-800">
                                                            ¡Ahorra {formatPrice(product.savingsSuggestion.saveAmount)}!
                                                        </div>
                                                        <div className="text-[10px] leading-tight text-green-700">
                                                            Prefiere <span className="font-semibold">{product.savingsSuggestion.productName}</span> a solo {formatPrice(product.savingsSuggestion.price)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );

                                    return (
                                        <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                                            {/* Name & Details - CLICK TO SEARCH BIOEQUIVALENTS */}
                                            <td className="px-4 py-3">
                                                {product.activePrinciple ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSearchInput(product.activePrinciple || '')}
                                                        aria-label={`Buscar alternativas con principio activo ${product.activePrinciple}`}
                                                        className="group block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                                    >
                                                        {productDetails}
                                                    </button>
                                                ) : (
                                                    <div>{productDetails}</div>
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
                                            {showInternalPricing && (
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
                                            {showInternalPricing && (
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
