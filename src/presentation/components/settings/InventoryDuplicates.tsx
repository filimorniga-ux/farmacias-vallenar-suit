'use client';

import React, { useState } from 'react';
import { Search, Loader2, Database, Barcode, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { findDuplicateBatchesSecure, findDuplicateBarcodesSecure } from '@/actions/inventory-diagnostics-v2';

type SearchMode = 'barcode' | 'batch';

interface DuplicateParams {
    sku: boolean;
    lot: boolean;
    expiry: boolean;
    price: boolean;
}

export default function InventoryDuplicates() {
    const [isLoading, setIsLoading] = useState(false);
    const [searchMode, setSearchMode] = useState<SearchMode>('barcode'); // Default to barcode
    const [batchResults, setBatchResults] = useState<any[]>([]);
    const [barcodeResults, setBarcodeResults] = useState<any[]>([]);
    const [params, setParams] = useState<DuplicateParams>({
        sku: true,
        lot: true,
        expiry: false,
        price: false
    });

    const handleSearch = async () => {
        setIsLoading(true);
        try {
            if (searchMode === 'barcode') {
                const res = await findDuplicateBarcodesSecure();
                if (res.success) {
                    const data = res.data || [];
                    setBarcodeResults(data);
                    setBatchResults([]);
                    if (data.length === 0) {
                        toast.success('No se encontraron códigos de barras duplicados.');
                    } else {
                        toast.warning(`Se encontraron ${data.length} códigos de barras duplicados.`);
                    }
                } else {
                    toast.error(res.error || 'Error al buscar duplicados');
                }
            } else {
                const res = await findDuplicateBatchesSecure(params);
                if (res.success) {
                    const data = res.data || [];
                    setBatchResults(data);
                    setBarcodeResults([]);
                    if (data.length === 0) {
                        toast.success('No se encontraron lotes duplicados con estos criterios.');
                    } else {
                        toast.warning(`Se encontraron ${data.length} grupos de lotes duplicados.`);
                    }
                } else {
                    toast.error(res.error || 'Error al buscar duplicados');
                }
            }
        } catch (e) {
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-amber-100 rounded-lg text-amber-600">
                    <Database size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Buscador de Duplicados</h3>
                    <p className="text-slate-500 mt-1">
                        Detecta productos o lotes que podrían estar duplicados en el sistema.
                    </p>
                </div>
            </div>

            {/* Mode Selection */}
            <div className="bg-slate-50 p-4 rounded-lg mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-3 block">¿Qué buscar?</h4>
                <div className="flex gap-4">
                    <button
                        onClick={() => setSearchMode('barcode')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition ${searchMode === 'barcode'
                                ? 'border-amber-500 bg-amber-50 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                    >
                        <Barcode size={18} />
                        <span className="font-medium">Códigos de Barras Duplicados</span>
                        <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded">Recomendado</span>
                    </button>
                    <button
                        onClick={() => setSearchMode('batch')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition ${searchMode === 'batch'
                                ? 'border-blue-500 bg-blue-50 text-blue-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                    >
                        <Database size={18} />
                        <span className="font-medium">Lotes Duplicados (Avanzado)</span>
                    </button>
                </div>
            </div>

            {/* Batch Criteria (only show for batch mode) */}
            {searchMode === 'batch' && (
                <div className="bg-slate-50 p-4 rounded-lg mb-6">
                    <h4 className="text-sm font-bold text-slate-700 mb-3 block">Agrupar Lotes Por:</h4>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={params.sku}
                                onChange={e => setParams({ ...params, sku: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">SKU / Producto</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={params.lot}
                                onChange={e => setParams({ ...params, lot: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">N° Lote</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={params.expiry}
                                onChange={e => setParams({ ...params, expiry: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">Fecha Vencimiento</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={params.price}
                                onChange={e => setParams({ ...params, price: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">Precio Venta (Diferente)</span>
                        </label>
                    </div>
                </div>
            )}

            <div className="flex justify-end mb-6">
                <button
                    onClick={handleSearch}
                    disabled={isLoading}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                    {searchMode === 'barcode' ? 'Buscar Barcodes Duplicados' : 'Buscar Lotes Duplicados'}
                </button>
            </div>

            {/* Barcode Results */}
            {barcodeResults.length > 0 && (
                <div className="overflow-x-auto border rounded-lg">
                    <div className="p-3 bg-amber-50 border-b flex items-center gap-2">
                        <AlertTriangle size={18} className="text-amber-600" />
                        <span className="font-bold text-amber-800">
                            {barcodeResults.length} código(s) de barras duplicado(s) encontrado(s)
                        </span>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-3">Código de Barras</th>
                                <th className="p-3">Productos con este código</th>
                                <th className="p-3 text-right">Cantidad</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {barcodeResults.map((group, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-3 font-mono font-bold text-amber-700">{group.barcode}</td>
                                    <td className="p-3">
                                        <div className="space-y-1">
                                            {group.names?.map((name: string, i: number) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                                                        {group.skus?.[i]}
                                                    </span>
                                                    <span className="text-slate-800">{name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-3 text-right font-bold text-red-600">{group.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Batch Results */}
            {batchResults.length > 0 && (
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-3">Análisis</th>
                                <th className="p-3">SKU</th>
                                <th className="p-3">Producto</th>
                                <th className="p-3">Lote</th>
                                <th className="p-3 text-right">Cantidad de Registros</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {batchResults.map((group, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-3">
                                        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold">POSIBLE DUPLICADO</span>
                                    </td>
                                    <td className="p-3 font-mono text-slate-500">{group.sku}</td>
                                    <td className="p-3 font-medium text-slate-900">{group.name}</td>
                                    <td className="p-3">{group.lot_number || '-'}</td>
                                    <td className="p-3 text-right font-bold text-red-600">{group.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
