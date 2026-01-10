
'use client';

import { useState, useTransition } from 'react';
import { searchUnifiedInventory, InventorySearchResult } from '@/actions/inventory-search';
import { Search, Loader2, Package, Building2, TrendingDown, AlertCircle } from 'lucide-react';

export default function PriceConsultant() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<InventorySearchResult[]>([]);
    const [isPending, startTransition] = useTransition();
    const [hasSearched, setHasSearched] = useState(false);

    // Debounce could be added, but for now we'll search on enter or button click
    // or simple delay. Let's do instant search with small delay?
    // User asked for "Input de búsqueda grande y claro".

    const handleSearch = (term: string) => {
        setQuery(term);
        if (term.length < 2) {
            setResults([]);
            return;
        }

        startTransition(async () => {
            const data = await searchUnifiedInventory(term);
            setResults(data);
            setHasSearched(true);
        });
    };

    const getSourceBadge = (source: string) => {
        const isProvider = source.includes('GOLAN') || source.includes('ENRICHED');
        if (isProvider) {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                    <Package className="w-3 h-3 mr-1" />
                    PROVEEDOR ({source.replace('.xlsx', '').replace('.csv', '')})
                </span>
            );
        }
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                <Building2 className="w-3 h-3 mr-1" />
                SUCURSAL ({source.replace('farmacias vallenar ', '').replace('.xlsx', '').toUpperCase()})
            </span>
        );
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);
    };

    return (
        <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Search className="w-6 h-6 text-blue-600" />
                    Consultor de Precios Unificado
                </h2>

                <div className="relative">
                    <input
                        type="text"
                        className="w-full px-4 py-4 pl-12 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                        placeholder="Buscar por nombre, SKU o código de barras..."
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        autoFocus
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-6 h-6" />
                    {isPending && (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 w-6 h-6 animate-spin" />
                    )}
                </div>
            </div>

            {results.length > 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-sm uppercase tracking-wider">
                                    <th className="px-6 py-4 font-medium">Producto / Título</th>
                                    <th className="px-6 py-4 font-medium">Origen</th>
                                    <th className="px-6 py-4 font-medium">SKU / ISP</th>
                                    <th className="px-6 py-4 font-medium text-right">Stock</th>
                                    <th className="px-6 py-4 font-medium text-right">Precio</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {results.map((item, index) => {
                                    // Check if this is the lowest price in the result set
                                    // Filter out 0 price if desirable, but request said lowest.
                                    // Assuming list is sorted by price ASC from server action.
                                    const isCheapest = index === 0;
                                    const isNoStock = item.stock <= 0;

                                    return (
                                        <tr
                                            key={item.id}
                                            className={`hover:bg-gray-50 transition-colors ${isCheapest ? 'bg-green-50/50' : ''}`}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-gray-900">{item.title}</div>
                                                {item.branch && <div className="text-xs text-gray-500 mt-1">{item.branch}</div>}
                                            </td>
                                            <td className="px-6 py-4">
                                                {getSourceBadge(item.source)}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                <div className="font-mono">{item.sku}</div>
                                                {item.ispCode && <div className="text-xs text-gray-400">ISP: {item.ispCode}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {isNoStock ? (
                                                    <span className="inline-flex items-center text-red-600 font-bold text-sm bg-red-50 px-2 py-1 rounded">
                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                        0
                                                    </span>
                                                ) : (
                                                    <span className="font-medium text-gray-700">{item.stock}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className={`text-lg font-bold ${isCheapest ? 'text-emerald-700 flex items-center justify-end gap-1' : 'text-gray-900'}`}>
                                                    {isCheapest && <TrendingDown className="w-4 h-4" />}
                                                    {formatPrice(item.price)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                hasSearched && !isPending && query.length >= 2 && (
                    <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
                        <Package className="mx-auto h-12 w-12 text-gray-300" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron productos</h3>
                        <p className="mt-1 text-sm text-gray-500">Intenta con otro término de búsqueda.</p>
                    </div>
                )
            )}
        </div>
    );
}
