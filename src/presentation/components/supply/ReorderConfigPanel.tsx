import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { ReorderConfig } from '../../../domain/types';
import { Settings, Save, X, Plus, Trash2, Search, Building2 } from 'lucide-react';
import { toast } from 'sonner';

const ReorderConfigPanel: React.FC = () => {
    const { inventory, suppliers, reorderConfigs, setReorderConfig } = usePharmaStore();

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingConfig, setEditingConfig] = useState<ReorderConfig | null>(null);

    // Form state
    const [formData, setFormData] = useState<Partial<ReorderConfig>>({
        sku: '',
        location_id: 'BODEGA_CENTRAL',
        min_stock: 100,
        max_stock: 500,
        safety_stock: 50,
        auto_reorder_enabled: true,
        preferred_supplier_id: '',
        lead_time_days: 3,
        review_period_days: 30
    });

    const handleOpenForm = (config?: ReorderConfig) => {
        if (config) {
            setFormData(config);
            setEditingConfig(config);
        } else {
            setFormData({
                sku: '',
                location_id: 'BODEGA_CENTRAL',
                min_stock: 100,
                max_stock: 500,
                safety_stock: 50,
                auto_reorder_enabled: true,
                preferred_supplier_id: '',
                lead_time_days: 3,
                review_period_days: 30
            });
            setEditingConfig(null);
        }
        setIsFormOpen(true);
    };

    const handleSave = () => {
        if (!formData.sku || !formData.preferred_supplier_id) {
            toast.error('Complete los campos requeridos');
            return;
        }

        setReorderConfig(formData as ReorderConfig);
        toast.success(editingConfig ? 'Configuración actualizada' : 'Configuración creada');
        setIsFormOpen(false);
        setFormData({
            sku: '',
            location_id: 'BODEGA_CENTRAL',
            min_stock: 100,
            max_stock: 500,
            safety_stock: 50,
            auto_reorder_enabled: true,
            preferred_supplier_id: '',
            lead_time_days: 3,
            review_period_days: 30
        });
    };

    const filteredConfigs = reorderConfigs.filter(config => {
        const product = inventory.find(p => p.sku === config.sku);
        const productName = product?.name.toLowerCase() || '';
        const sku = config.sku.toLowerCase();
        const search = searchTerm.toLowerCase();
        return productName.includes(search) || sku.includes(search);
    });

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                            <Settings size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">
                                Configuración de Auto-Ordenamiento
                            </h1>
                            <p className="text-slate-500 text-sm">
                                Define reglas de reorden para cada producto
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleOpenForm()}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition"
                    >
                        <Plus size={18} />
                        Nueva Regla
                    </button>
                </div>

                {/* Search */}
                <div className="mb-6 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por producto o SKU..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
                    />
                </div>

                {/* Config List */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    {filteredConfigs.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Settings size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No hay configuraciones. Crea una para comenzar.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left p-4 font-bold text-xs text-slate-600 uppercase">Producto</th>
                                    <th className="text-left p-4 font-bold text-xs text-slate-600 uppercase">Ubicación</th>
                                    <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Min</th>
                                    <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Max</th>
                                    <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Safety</th>
                                    <th className="text-left p-4 font-bold text-xs text-slate-600 uppercase">Proveedor</th>
                                    <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Lead Time</th>
                                    <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Estado</th>
                                    <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredConfigs.map((config) => {
                                    const product = inventory.find(p => p.sku === config.sku);
                                    const supplier = suppliers.find(s => s.id === config.preferred_supplier_id);
                                    return (
                                        <tr key={`${config.sku}-${config.location_id}`} className="hover:bg-slate-50 transition">
                                            <td className="p-4">
                                                <div className="font-bold text-slate-800">{product?.name || 'Producto desconocido'}</div>
                                                <div className="text-xs text-slate-400 font-mono">{config.sku}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <Building2 size={16} className="text-slate-400" />
                                                    <span className="text-sm text-slate-600">{config.location_id}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="font-bold text-amber-600">{config.min_stock}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="font-bold text-emerald-600">{config.max_stock}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="font-bold text-blue-600">{config.safety_stock}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-sm text-slate-700">{supplier?.fantasy_name || 'Desconocido'}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="text-sm text-slate-600">{config.lead_time_days} días</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                {config.auto_reorder_enabled ? (
                                                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                                                        Activo
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
                                                        Inactivo
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => handleOpenForm(config)}
                                                    className="text-purple-600 hover:text-purple-700 font-bold text-sm"
                                                >
                                                    Editar
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Form Modal */}
                {isFormOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
                                <h2 className="text-xl font-bold text-slate-900">
                                    {editingConfig ? 'Editar Configuración' : 'Nueva Configuración'}
                                </h2>
                                <button
                                    onClick={() => setIsFormOpen(false)}
                                    className="text-slate-400 hover:text-slate-600"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Form */}
                            <div className="p-6 space-y-4">
                                {/* Product Selection */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Producto *
                                    </label>
                                    <select
                                        value={formData.sku}
                                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
                                        disabled={!!editingConfig}
                                    >
                                        <option value="">Seleccionar producto</option>
                                        {inventory.map(product => (
                                            <option key={product.sku} value={product.sku}>
                                                {product.name} ({product.sku})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Location */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Ubicación *
                                    </label>
                                    <select
                                        value={formData.location_id}
                                        onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="BODEGA_CENTRAL">Bodega Central</option>
                                        <option value="SUCURSAL_CENTRO">Sucursal Centro</option>
                                        <option value="SUCURSAL_NORTE">Sucursal Norte</option>
                                    </select>
                                </div>

                                {/* Stock Levels */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-amber-600 mb-2">
                                            Stock Mínimo *
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.min_stock}
                                            onChange={(e) => setFormData({ ...formData, min_stock: parseInt(e.target.value) })}
                                            className="w-full p-3 border border-amber-200 rounded-xl focus:outline-none focus:border-amber-500 bg-amber-50"
                                            min="0"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Punto de reorden</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-emerald-600 mb-2">
                                            Stock Máximo *
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.max_stock}
                                            onChange={(e) => setFormData({ ...formData, max_stock: parseInt(e.target.value) })}
                                            className="w-full p-3 border border-emerald-200 rounded-xl focus:outline-none focus:border-emerald-500 bg-emerald-50"
                                            min="0"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Nivel objetivo</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-blue-600 mb-2">
                                            Stock Seguridad *
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.safety_stock}
                                            onChange={(e) => setFormData({ ...formData, safety_stock: parseInt(e.target.value) })}
                                            className="w-full p-3 border border-blue-200 rounded-xl focus:outline-none focus:border-blue-500 bg-blue-50"
                                            min="0"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Buffer extra</p>
                                    </div>
                                </div>

                                {/* Supplier */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Proveedor Preferido *
                                    </label>
                                    <select
                                        value={formData.preferred_supplier_id}
                                        onChange={(e) => setFormData({ ...formData, preferred_supplier_id: e.target.value })}
                                        className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
                                    >
                                        <option value="">Seleccionar proveedor</option>
                                        {suppliers.map(supplier => (
                                            <option key={supplier.id} value={supplier.id}>
                                                {supplier.fantasy_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Lead Time & Review Period */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">
                                            Tiempo de Entrega (días) *
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.lead_time_days}
                                            onChange={(e) => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) })}
                                            className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
                                            min="1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">
                                            Período de Análisis (días)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.review_period_days}
                                            onChange={(e) => setFormData({ ...formData, review_period_days: parseInt(e.target.value) })}
                                            className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
                                            min="7"
                                        />
                                    </div>
                                </div>

                                {/* Auto Reorder Toggle */}
                                <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl border border-purple-200">
                                    <input
                                        type="checkbox"
                                        id="auto-reorder"
                                        checked={formData.auto_reorder_enabled}
                                        onChange={(e) => setFormData({ ...formData, auto_reorder_enabled: e.target.checked })}
                                        className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                                    />
                                    <label htmlFor="auto-reorder" className="text-sm font-bold text-purple-900 cursor-pointer">
                                        Habilitar Auto-Ordenamiento
                                    </label>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-6 border-t border-slate-200 flex justify-end gap-3 sticky bottom-0 bg-white">
                                <button
                                    onClick={() => setIsFormOpen(false)}
                                    className="px-6 py-2 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="px-6 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition flex items-center gap-2"
                                >
                                    <Save size={18} />
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReorderConfigPanel;
