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

interface BarcodeDuplicateGroup {
    barcode: string;
    count: number | string;
    skus?: string[];
    names?: string[];
}

interface BatchDuplicateGroup {
    sku?: string;
    name?: string;
    lot_number?: string | null;
    count: number | string;
}

export default function InventoryDuplicates() {
    const [isLoading, setIsLoading] = useState(false);
    const [searchMode, setSearchMode] = useState<SearchMode>('barcode'); // Default to barcode
    const [batchResults, setBatchResults] = useState<BatchDuplicateGroup[]>([]);
    const [barcodeResults, setBarcodeResults] = useState<BarcodeDuplicateGroup[]>([]);
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
        } catch {
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                    <Database size={24} />
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900">Duplicados de inventario</h3>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase text-emerald-700">
                            Solo lectura
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        Revisa coincidencias de códigos de barras y lotes sin fusionar ni modificar registros.
                    </p>
                </div>
            </div>

            {/* Mode Selection */}
            <div className="bg-slate-50 p-4 rounded-lg mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-3 block">¿Qué buscar?</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => setSearchMode('barcode')}
                        className={`flex min-h-11 items-center gap-2 rounded-lg border-2 px-4 py-2 text-left transition ${searchMode === 'barcode'
                                ? 'border-amber-500 bg-amber-50 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                    >
                        <Barcode size={18} />
                        <span className="font-medium">Códigos de barras duplicados</span>
                        <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded">Recomendado</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSearchMode('batch')}
                        className={`flex min-h-11 items-center gap-2 rounded-lg border-2 px-4 py-2 text-left transition ${searchMode === 'batch'
                                ? 'border-blue-500 bg-blue-50 text-blue-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                    >
                        <Database size={18} />
                        <span className="font-medium">Lotes duplicados</span>
                    </button>
                </div>
            </div>

            {/* Batch Criteria (only show for batch mode) */}
            {searchMode === 'batch' && (
                <div className="bg-slate-50 p-4 rounded-lg mb-6">
                    <h4 className="text-sm font-bold text-slate-700 mb-3 block">Agrupar Lotes Por:</h4>
                    <div className="flex flex-wrap gap-3">
                        <label className="flex min-h-11 items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={params.sku}
                                onChange={e => setParams({ ...params, sku: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">SKU / Producto</span>
                        </label>
                        <label className="flex min-h-11 items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={params.lot}
                                onChange={e => setParams({ ...params, lot: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">N° Lote</span>
                        </label>
                        <label className="flex min-h-11 items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={params.expiry}
                                onChange={e => setParams({ ...params, expiry: e.target.checked })}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">Fecha Vencimiento</span>
                        </label>
                        <label className="flex min-h-11 items-center gap-2 cursor-pointer">
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

            <div className="mb-6 flex justify-end">
                <button
                    type="button"
                    onClick={handleSearch}
                    disabled={isLoading}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                    {searchMode === 'barcode' ? 'Buscar códigos duplicados' : 'Buscar lotes duplicados'}
                </button>
            </div>

            {/* Barcode Results */}
            {barcodeResults.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                    <div className="flex items-center gap-2 border-b bg-amber-50 p-3">
                        <AlertTriangle size={18} className="text-amber-600" />
                        <span className="font-bold text-amber-800">
                            {barcodeResults.length} código(s) de barras duplicado(s) encontrado(s)
                        </span>
                    </div>
                    <div className="space-y-3 p-3 md:hidden">
                        {barcodeResults.map((group, idx) => (
                            <div key={`${group.barcode}-${idx}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-bold uppercase text-slate-400">Código</div>
                                        <div className="break-all font-mono text-sm font-bold text-amber-700">{group.barcode}</div>
                                    </div>
                                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-600">
                                        {group.count}
                                    </span>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {group.names?.map((name, i) => (
                                        <div key={`${name}-${i}`} className="rounded-md bg-slate-50 px-2 py-1.5">
                                            <div className="font-mono text-[11px] font-bold text-slate-500">
                                                {group.skus?.[i] || 'SKU no informado'}
                                            </div>
                                            <div className="text-sm font-medium text-slate-800">{name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-xs font-bold uppercase text-slate-600">
                                <tr>
                                    <th className="p-3">Código de barras</th>
                                    <th className="p-3">Productos con este código</th>
                                    <th className="p-3 text-right">Cantidad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {barcodeResults.map((group, idx) => (
                                    <tr key={`${group.barcode}-${idx}`} className="hover:bg-slate-50">
                                        <td className="p-3 font-mono font-bold text-amber-700">{group.barcode}</td>
                                        <td className="p-3">
                                            <div className="space-y-1">
                                                {group.names?.map((name, i) => (
                                                    <div key={`${name}-${i}`} className="flex items-center gap-2">
                                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
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
                </div>
            )}

            {/* Batch Results */}
            {batchResults.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                    <div className="space-y-3 p-3 md:hidden">
                        {batchResults.map((group, idx) => (
                            <div key={`${group.sku || 'sku'}-${group.lot_number || 'lot'}-${idx}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">POSIBLE DUPLICADO</span>
                                        <div className="mt-2 font-medium text-slate-900">{group.name || 'Producto sin nombre'}</div>
                                        <div className="font-mono text-xs text-slate-500">{group.sku || 'SKU no informado'}</div>
                                    </div>
                                    <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-600">
                                        {group.count}
                                    </span>
                                </div>
                                <div className="mt-3 text-sm text-slate-600">
                                    Lote: <span className="font-medium text-slate-800">{group.lot_number || '-'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-xs font-bold uppercase text-slate-600">
                                <tr>
                                    <th className="p-3">Análisis</th>
                                    <th className="p-3">SKU</th>
                                    <th className="p-3">Producto</th>
                                    <th className="p-3">Lote</th>
                                    <th className="p-3 text-right">Cantidad de registros</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {batchResults.map((group, idx) => (
                                    <tr key={`${group.sku || 'sku'}-${group.lot_number || 'lot'}-${idx}`} className="hover:bg-slate-50">
                                        <td className="p-3">
                                            <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">POSIBLE DUPLICADO</span>
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
                </div>
            )}
        </div>
    );
}
