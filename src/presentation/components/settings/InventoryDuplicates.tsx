'use client';

import React, { useState } from 'react';
import { Search, AlertTriangle, CheckSquare, XSquare, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import { findDuplicateBatches } from '@/actions/inventory-diagnostics';

interface DuplicateParams {
    groupBy: {
        sku: boolean;
        lot: boolean;
        expiry: boolean;
        price: boolean;
    };
}

export default function InventoryDuplicates() {
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [params, setParams] = useState<DuplicateParams['groupBy']>({
        sku: true,
        lot: true,
        expiry: false,
        price: false
    });

    const handleSearch = async () => {
        setIsLoading(true);
        try {
            const res = await findDuplicateBatches(params);
            if (res.success) {
                const data = res.data || [];
                setResults(data);
                if (data.length === 0) toast.success('No se encontraron duplicados con estos criterios.');
            } else {
                toast.error('Error al buscar duplicados');
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
                    <h3 className="text-lg font-bold text-slate-900">Buscador de Duplicados o Inconsistencias</h3>
                    <p className="text-slate-500 mt-1">
                        Detecta lotes que podrían estar duplicados basándose en criterios específicos.
                    </p>
                </div>
            </div>

            {/* Criteria Selection */}
            <div className="bg-slate-50 p-4 rounded-lg mb-6">
                <h4 className="text-sm font-bold text-slate-700 mb-3 block">Agrupar Por:</h4>
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

            <div className="flex justify-end mb-6">
                <button
                    onClick={handleSearch}
                    disabled={isLoading}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                    Buscar Duplicados
                </button>
            </div>

            {/* Results */}
            {results.length > 0 && (
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-3">Analisis</th>
                                <th className="p-3">SKU</th>
                                <th className="p-3">Producto</th>
                                <th className="p-3">Lote</th>
                                <th className="p-3 text-right">Cantidad de Registros</th>
                                <th className="p-3 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {results.map((group, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-3">
                                        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold">POSIBLE DUPLICADO</span>
                                    </td>
                                    <td className="p-3 font-mono text-slate-500">{group.sku}</td>
                                    <td className="p-3 font-medium text-slate-900">{group.name}</td>
                                    <td className="p-3">{group.lot_number || '-'}</td>
                                    <td className="p-3 text-right font-bold text-red-600">{group.count}</td>
                                    <td className="p-3 text-center">
                                        <button className="text-blue-600 hover:underline text-xs" title="Ver detalle (No implementado)">Revisar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
