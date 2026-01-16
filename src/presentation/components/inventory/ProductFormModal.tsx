import React, { useState, useEffect } from 'react';
import { X, Save, Package, Camera } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { InventoryBatch } from '../../../domain/types';
import { toast } from 'sonner';
import CameraScanner from '../ui/CameraScanner';

interface ProductFormModalProps {
    product?: InventoryBatch;
    initialValues?: {
        sku?: string;
        name?: string;
        cost?: number;
        price?: number;
        barcode?: string;
        dci?: string;
        units_per_box?: number;
    };
    onClose: () => void;
    onSuccess?: (newProductId: string, productData: any) => void;
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({ product, initialValues, onClose, onSuccess }) => {
    const { fetchInventory, suppliers, currentLocationId, currentWarehouseId, locations } = usePharmaStore();
    const isEdit = !!product;
    const { createProductSecure } = require('../../../actions/products-v2'); // Import Server Action (require for client component compat if needed, or import at top)

    const [formData, setFormData] = useState({
        sku: product?.sku || initialValues?.sku || '',
        name: product?.name || initialValues?.name || '',
        category: product?.category || 'MEDICAMENTO',
        subcategory: product?.subcategory || '',
        stock_actual: product?.stock_actual || 0,
        stock_min: product?.stock_min || 0,
        stock_max: product?.stock_max || 0,
        safety_stock: product?.safety_stock || 0,
        price_sell_box: product?.price_sell_box || initialValues?.price || 0,
        cost_net: product?.cost_net || initialValues?.cost || 0,
        location_id: product?.location_id || currentLocationId || (locations.length > 0 ? locations[0].id : ''),
        preferred_supplier_id: product?.preferred_supplier_id || '',
        lead_time_days: product?.lead_time_days || 3,
        barcode: product?.barcode || initialValues?.barcode || '',
        initialLot: '',
        initialExpiry: '',
    });

    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, ''); // Remove non-digits
        if (val.length > 8) val = val.substring(0, 8); // Limit to 8 digits

        // Masking DD/MM/YYYY
        let formatted = val;
        if (val.length > 2) {
            formatted = val.substring(0, 2) + '/' + val.substring(2);
        }
        if (val.length > 4) {
            formatted = formatted.substring(0, 5) + '/' + formatted.substring(5);
        }
        setFormData({ ...formData, initialExpiry: formatted });
    };

    const parseDateFromMask = (dateStr: string): Date | undefined => {
        if (!dateStr || dateStr.length !== 10) return undefined;
        const [day, month, year] = dateStr.split('/').map(Number);
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? undefined : date;
    };

    // Format CLP Helper
    const formatCLP = (val: number | undefined) => {
        if (val === undefined || val === null) return '';
        return Math.round(val).toLocaleString('es-CL');
    };

    // Parse CLP Input Helper
    const handleNumberChange = (val: string, field: string) => {
        const cleanVal = val.replace(/\./g, '').replace(/[^0-9]/g, '');
        const numVal = cleanVal === '' ? 0 : parseInt(cleanVal, 10);
        setFormData({ ...formData, [field]: numVal });
    };

    const handleSubmit = async () => {
        // 1. Validation
        if (!formData.sku || !formData.name) {
            toast.error('Complete los campos requeridos');
            return;
        }
        if (formData.name.length > 200) {
            toast.error('El nombre es muy largo (máx 200 caracteres). Por favor resúmalo.');
            return;
        }
        if (formData.sku.length > 50) {
            toast.error('El SKU es muy largo (máx 50 caracteres).');
            return;
        }

        if (isEdit && product) {
            // Update logic (keep existing store call or migrate to secure)
            // updateProduct(product.id, formData as Partial<InventoryBatch>);
            // toast.success('Producto actualizado');
            toast.info('Edición pendiente de migración a V2');
        } else {
            // 2. Prepare Data for Backend
            let expiryDate = undefined;
            if (formData.initialExpiry) {
                expiryDate = parseDateFromMask(formData.initialExpiry);
                if (!expiryDate) {
                    toast.error('Fecha de vencimiento inválida. Use formato DD/MM/AAAA');
                    return;
                }
            }

            const payload = {
                sku: formData.sku,
                name: formData.name,
                description: '', // Optional
                price: formData.price_sell_box, // Using box price as main price
                priceCost: formData.cost_net,
                minStock: formData.stock_min,
                maxStock: formData.stock_max,
                userId: 'SYSTEM', // Should come from useStore user.id
                // Schema compliance
                initialStock: formData.stock_actual,
                initialLot: formData.initialLot,
                initialExpiry: expiryDate, // Pass Date object
                initialLocation: formData.location_id,
                barcode: formData.barcode || undefined
            };

            // 3. Call Server Action
            try {
                // @ts-ignore
                const result = await createProductSecure({
                    ...payload,
                    // Need to fetch user ID globally, assuming store has it or logic handles it
                    // For now, let's grab it from store if possible, or assume context
                    userId: usePharmaStore.getState().user?.id || 'SYSTEM-FALLBACK'
                });

                if (result.success) {
                    toast.success('Producto guardado exitosamente en base de datos');

                    // 4. Trigger Real Fetch to Update UI
                    await fetchInventory(currentLocationId, currentWarehouseId);

                    if (onSuccess && result.data?.id) {
                        onSuccess(result.data.id, payload);
                    }

                    onClose();
                } else {
                    toast.error('Error al guardar: ' + result.error);
                }
            } catch (err) {
                console.error(err);
                toast.error('Error de conexión al crear producto');
            }
        }
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
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={formData.barcode}
                                            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                            className="flex-1 p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                            placeholder="Escanear o escribir..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setIsScannerOpen(true)}
                                            className="px-4 py-3 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 transition flex items-center gap-2"
                                            title="Escanear con cámara"
                                        >
                                            <Camera size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stock - Tiger Cloud compliant */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase">Stock Inicial</h3>
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
                                        disabled={isEdit} // Initial stock only on create
                                    />
                                </div>
                                {formData.stock_actual > 0 && !isEdit && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                                Lote Inicial *
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.initialLot || ''}
                                                onChange={(e) => setFormData({ ...formData, initialLot: e.target.value })}
                                                placeholder="Ej: LOTE-001"
                                                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                                Vencimiento *
                                            </label>
                                            <input
                                                type="text"
                                                maxLength={10}
                                                placeholder="DD/MM/AAAA"
                                                value={formData.initialExpiry || ''}
                                                onChange={handleDateChange}
                                                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500 font-mono"
                                            />
                                        </div>
                                    </>
                                )}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Ubicación (location_id)
                                    </label>
                                    <div className="relative">
                                        <input
                                            list="locations-list"
                                            type="text"
                                            className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                                            placeholder="Buscar ubicación..."
                                            value={locations.find(l => l.id === formData.location_id)?.name || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const found = locations.find(l => l.name === val);
                                                if (found) {
                                                    setFormData({ ...formData, location_id: found.id });
                                                } else if (val === '') {
                                                    setFormData({ ...formData, location_id: '' });
                                                }
                                            }}
                                        />
                                        <datalist id="locations-list">
                                            {locations.map(loc => (
                                                <option key={loc.id} value={loc.name} />
                                            ))}
                                        </datalist>
                                    </div>
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
                                        type="text" // TEXT TYPE
                                        value={formatCLP(formData.price_sell_box)}
                                        onChange={(e) => handleNumberChange(e.target.value, 'price_sell_box')}
                                        className="w-full p-3 border border-emerald-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-emerald-50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-red-600 mb-2">
                                        Costo Neto (cost_net)
                                    </label>
                                    <input
                                        type="text" // TEXT TYPE
                                        value={formatCLP(formData.cost_net)}
                                        onChange={(e) => handleNumberChange(e.target.value, 'cost_net')}
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

            {/* Camera Scanner Modal */}
            {isScannerOpen && (
                <CameraScanner
                    onScan={(code) => {
                        setFormData({ ...formData, barcode: code });
                        setIsScannerOpen(false);
                        toast.success(`Código escaneado: ${code}`);
                    }}
                    onClose={() => setIsScannerOpen(false)}
                />
            )}
        </>
    );
};

export default ProductFormModal;
