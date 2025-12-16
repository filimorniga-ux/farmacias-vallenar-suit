'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateRestockSuggestion, createPurchaseOrderFromSuggestion, RestockSuggestion } from '@/actions/procurement';
import { getSuppliersList } from '@/actions/suppliers';
import { Calculator, ShoppingCart, Loader2, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';

export default function SmartOrderPage() {
    const router = useRouter();

    // filters
    const [supplierId, setSupplierId] = useState('');
    const [suppliers, setSuppliers] = useState<{ id: string, name: string }[]>([]);
    const [daysToCover, setDaysToCover] = useState(15);
    const [analysisWindow, setAnalysisWindow] = useState(30);

    // data
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
    const [editableQuantities, setEditableQuantities] = useState<Record<string, number>>({});

    // creating
    const [creatingOrder, setCreatingOrder] = useState(false);

    useEffect(() => {
        getSuppliersList().then(setSuppliers);
    }, []);

    const handleCalculate = async () => {
        if (!supplierId) return;
        setLoading(true);
        setSuggestions([]); // clear prev

        try {
            const res = await generateRestockSuggestion(supplierId, daysToCover, analysisWindow);
            if (res.success && res.data) {
                setSuggestions(res.data);
                // Initialize editables
                const initial: Record<string, number> = {};
                res.data.forEach(item => {
                    initial[item.product_id] = item.suggested_quantity;
                });
                setEditableQuantities(initial);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleQuantityChange = (productId: string, val: string) => {
        const num = parseInt(val) || 0;
        setEditableQuantities(prev => ({ ...prev, [productId]: num }));
    };

    const handleCreateOrder = async () => {
        if (!supplierId || suggestions.length === 0) return;
        if (!confirm('¿Generar Orden de Compra con las cantidades definidas?')) return;

        setCreatingOrder(true);
        try {
            // Filter non-zero
            const itemsToOrder = suggestions
                .map(s => ({
                    product_id: s.product_id,
                    product_name: s.product_name,
                    quantity: editableQuantities[s.product_id] || 0,
                    cost: s.unit_cost
                }))
                .filter(i => i.quantity > 0);

            if (itemsToOrder.length === 0) {
                alert('No hay items con cantidad mayor a 0');
                return;
            }

            const res = await createPurchaseOrderFromSuggestion(supplierId, itemsToOrder);
            if (res.success && res.orderId) {
                // Redirect
                // Assuming standard path /logistica/ordenes/[id] or similar. 
                // Let's try redirect to a "Success" or the list if specific page doesn't exist yet.
                // Assuming /supply/purchase-orders/[id] based on earlier context? Or just /
                alert(`Orden #${res.orderId.slice(0, 8)} creada exitosamente (Borrador).`);
            } else {
                alert('Error creando orden: ' + res.error);
            }
        } catch (e) {
            console.error(e);
            alert('Error inesperado');
        } finally {
            setCreatingOrder(false);
        }
    };

    const totalEstimated = suggestions.reduce((acc, curr) => {
        const qty = editableQuantities[curr.product_id] || 0;
        return acc + (qty * curr.unit_cost);
    }, 0);

    const itemsCount = suggestions.filter(s => (editableQuantities[s.product_id] || 0) > 0).length;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Calculator className="text-purple-600" />
                        Pedido Inteligente (Smart Order)
                    </h1>
                    <p className="text-slate-500">Genera propuestas de compra basadas en MRP (Material Requirements Planning).</p>
                </div>
            </div>

            {/* Config Panel */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Proveedor</label>
                    <select
                        className="w-full p-2 border rounded-lg bg-slate-50"
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                    >
                        <option value="">-- Seleccionar --</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Días de Cobertura</label>
                    <div className="relative">
                        <input
                            type="number"
                            className="w-full p-2 pl-3 border rounded-lg"
                            value={daysToCover}
                            onChange={(e) => setDaysToCover(Number(e.target.value))}
                        />
                        <span className="absolute right-3 top-2 text-slate-400 text-sm">días</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Ventana de Análisis</label>
                    <div className="relative">
                        <input
                            type="number"
                            className="w-full p-2 pl-3 border rounded-lg"
                            value={analysisWindow}
                            onChange={(e) => setAnalysisWindow(Number(e.target.value))}
                        />
                        <span className="absolute right-3 top-2 text-slate-400 text-sm">días atrás</span>
                    </div>
                </div>

                <button
                    onClick={handleCalculate}
                    disabled={!supplierId || loading}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-medium p-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <TrendingUp size={20} />}
                    Calcular Propuesta
                </button>
            </div>

            {/* Results Grid */}
            {suggestions.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <tr>
                                    <th className="p-4 font-semibold">Producto</th>
                                    <th className="p-4 font-semibold text-center">Stock Actual</th>
                                    <th className="p-4 font-semibold text-center">Velocidad</th>
                                    <th className="p-4 font-semibold text-center bg-purple-50 text-purple-700">Sugerido (IA)</th>
                                    <th className="p-4 font-semibold text-center w-32">A Pedir</th>
                                    <th className="p-4 font-semibold text-right">Costo Est.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {suggestions.map((item) => {
                                    const isCritical = item.current_stock < (item.daily_velocity * 3); // Critical if < 3 days stock
                                    return (
                                        <tr key={item.product_id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-medium text-slate-900">{item.product_name}</div>
                                                <div className="text-xs text-slate-500">SKU: {item.sku}</div>
                                                {item.supplier_sku && <div className="text-[10px] text-slate-400">Prov SKU: {item.supplier_sku}</div>}
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${isCritical ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                    {isCritical && <AlertTriangle size={10} className="mr-1" />}
                                                    {item.current_stock} un
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="text-slate-700 font-medium">{item.daily_velocity}</div>
                                                <div className="text-[10px] text-slate-400">un/día</div>
                                            </td>
                                            <td className="p-4 text-center bg-purple-50/30">
                                                <span className="font-bold text-purple-700 text-lg">{item.suggested_quantity}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-20 p-2 text-center border rounded-md focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                                                    value={editableQuantities[item.product_id] || 0}
                                                    onChange={(e) => handleQuantityChange(item.product_id, e.target.value)}
                                                />
                                            </td>
                                            <td className="p-4 text-right font-medium text-slate-700">
                                                ${((editableQuantities[item.product_id] || 0) * item.unit_cost).toLocaleString('es-CL')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-slate-600">
                            Resumen: <span className="font-bold text-slate-900">{itemsCount} items</span> seleccionados
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <div className="text-xs text-slate-500">Total Estimado</div>
                                <div className="text-2xl font-bold text-slate-900">${totalEstimated.toLocaleString('es-CL')}</div>
                            </div>
                            <button
                                onClick={handleCreateOrder}
                                disabled={creatingOrder || itemsCount === 0}
                                className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:shadow-none"
                            >
                                {creatingOrder ? <Loader2 className="animate-spin" /> : <ShoppingCart size={20} />}
                                Generar Orden de Compra
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && suggestions.length === 0 && supplierId && (
                <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <Calculator size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No se encontraron sugerencias para este proveedor con los parámetros actuales.</p>
                </div>
            )}
        </div>
    );
}
