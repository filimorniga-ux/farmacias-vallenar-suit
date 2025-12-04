import React, { useState, useEffect } from 'react';
import { X, Save, Package } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { InventoryBatch } from '../../../domain/types';
import { toast } from 'sonner';

interface ProductFormModalProps {
    product?: InventoryBatch;
    onClose: () => void;
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({ product, onClose }) => {
    const { createProduct, updateProduct, suppliers } = usePharmaStore();
    const isEdit = !!product;

    const [formData, setFormData] = useState({
        sku: product?.sku || '',
        name: product?.name || '',
        category: product?.category || 'MEDICAMENTO',
        subcategory: product?.subcategory || '',
        stock_actual: product?.stock_actual || 0,
        stock_min: product?.stock_min || 0,
        stock_max: product?.stock_max || 0,
        safety_stock: product?.safety_stock || 0,
        price_sell_box: product?.price_sell_box || 0,
        cost_net: product?.cost_net || 0,
        location_id: product?.location_id || 'BODEGA_CENTRAL',
        preferred_supplier_id: product?.preferred_supplier_id || '',
        lead_time_days: product?.lead_time_days || 3,
        barcode: product?.barcode || '',
    });

    const handleSubmit = () => {
        if (!formData.sku || !formData.name) {
            toast.error('Complete los campos requeridos');
            return;
        }

        if (isEdit && product) {
            updateProduct(product.id, formData as Partial<InventoryBatch>);
            toast.success('Producto actualizado');
        } else {
            // Tiger Cloud compliant creation
            const newProduct = createProduct({
                ...formData,
                price_sell_unit: Math.round(formData.price_sell_box),
                tax_percent: 19,
                price: formData.price_sell_box,
                cost_price: formData.cost_net,
                concentration: '',
                unit_count: 1,
                is_generic: false,
                bioequivalent_status: 'NO_BIOEQUIVALENTE',
                condition: 'VD',
                expiry_date: Date.now() + (365 * 24 * 60 * 60 * 1000),
                allows_commission: false,
                active_ingredients: [],
            } as Omit<InventoryBatch, 'id'>);
            toast.success('Producto creado');
        }

        onClose();
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-cyan-100 text-cyan-600 rounded-lg">
                                <Package size={24} />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">
                                {isEdit ? 'Editar Producto' : 'Nuevo Producto'}
                            </h2>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Form */}
                    <div className="p-6 space-y-6">
                        {/* General */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase">General</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        SKU *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.sku}
                                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                        disabled={isEdit}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Nombre *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Categoría
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                    >
                                        <option value="MEDICAMENTO">Medicamento</option>
                                        <option value="PERFUMERIA">Perfumería</option>
                                        <option value="SUPLEMENTO">Suplemento</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Código Barras
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.barcode}
                                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Stock - Tiger Cloud compliant */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase">Stock</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-amber-600 mb-2">
                                        Stock Actual
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.stock_actual}
                                        onChange={(e) => setFormData({ ...formData, stock_actual: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-amber-200 rounded-xl focus:outline-none focus:border-amber-500 bg-amber-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Ubicación (location_id)
                                    </label>
                                    <select
                                        value={formData.location_id}
                                        onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                    >
                                        <option value="BODEGA_CENTRAL">Bodega Central</option>
                                        <option value="SUCURSAL_CENTRO">Sucursal Centro</option>
                                        <option value="SUCURSAL_NORTE">Sucursal Norte</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Stock Mínimo
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.stock_min}
                                        onChange={(e) => setFormData({ ...formData, stock_min: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Stock Máximo
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.stock_max}
                                        onChange={(e) => setFormData({ ...formData, stock_max: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-blue-600 mb-2">
                                        Stock Seguridad
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.safety_stock}
                                        onChange={(e) => setFormData({ ...formData, safety_stock: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-blue-200 rounded-xl focus:outline-none focus:border-blue-500 bg-blue-50"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Precios - Tiger Cloud Schema V8.0 */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase">Precios (Tiger Cloud)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-emerald-600 mb-2">
                                        Precio Venta Caja (price_sell_box)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.price_sell_box}
                                        onChange={(e) => setFormData({ ...formData, price_sell_box: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-emerald-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-emerald-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-red-600 mb-2">
                                        Costo Neto (cost_net)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.cost_net}
                                        onChange={(e) => setFormData({ ...formData, cost_net: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-red-200 rounded-xl focus:outline-none focus:border-red-500 bg-red-50"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Proveedor */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase">Proveedor</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Proveedor Preferido
                                    </label>
                                    <select
                                        value={formData.preferred_supplier_id}
                                        onChange={(e) => setFormData({ ...formData, preferred_supplier_id: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                    >
                                        <option value="">Ninguno</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.fantasy_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Lead Time (días)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.lead_time_days}
                                        onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 0 })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-200 flex justify-end gap-3 sticky bottom-0 bg-white">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-6 py-2 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition flex items-center gap-2"
                        >
                            <Save size={18} />
                            {isEdit ? 'Actualizar' : 'Crear'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProductFormModal;
