import React, { useState, useEffect } from 'react';
import { X, Save, Thermometer, AlertTriangle, Tag, Package, DollarSign, Activity } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';

interface InventoryEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: InventoryBatch | null;
}

const InventoryEditModal: React.FC<InventoryEditModalProps> = ({ isOpen, onClose, product }) => {
    const { updateProduct } = usePharmaStore();
    const [formData, setFormData] = useState<Partial<InventoryBatch>>({});
    const [newTag, setNewTag] = useState('');

    useEffect(() => {
        if (product) {
            setFormData({ ...product });
        }
    }, [product]);

    if (!isOpen || !product) return null;

    const handleSave = () => {
        if (product.id) {
            updateProduct(product.id, formData);
            onClose();
        }
    };

    const handleAddTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && newTag.trim()) {
            e.preventDefault();
            const currentTags = formData.therapeutic_tags || [];
            if (!currentTags.includes(newTag.trim().toUpperCase())) {
                setFormData({
                    ...formData,
                    therapeutic_tags: [...currentTags, newTag.trim().toUpperCase()]
                });
            }
            setNewTag('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setFormData({
            ...formData,
            therapeutic_tags: (formData.therapeutic_tags || []).filter(tag => tag !== tagToRemove)
        });
    };

    const toggleContraindication = (ci: string) => {
        const current = formData.contraindications || [];
        if (current.includes(ci)) {
            setFormData({ ...formData, contraindications: current.filter(c => c !== ci) });
        } else {
            setFormData({ ...formData, contraindications: [...current, ci] });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Package className="text-cyan-600" />
                            Editar Producto
                        </h2>
                        <p className="text-slate-500 text-sm">{product.name} ({product.sku})</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    <div className="grid grid-cols-12 gap-8">

                        {/* Left Column: Commercial & Logistics */}
                        <div className="col-span-7 space-y-8">

                            {/* Commercial Data */}
                            <section>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <DollarSign size={16} /> Datos Comerciales
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Comercial</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-cyan-500 focus:outline-none"
                                            value={formData.name || ''}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Precio Venta</label>
                                        <input
                                            type="number"
                                            className="w-full p-3 border border-slate-200 rounded-xl font-mono"
                                            value={formData.price || 0}
                                            onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Costo Neto</label>
                                        <input
                                            type="number"
                                            className="w-full p-3 border border-slate-200 rounded-xl font-mono"
                                            value={formData.cost_price || 0}
                                            onChange={e => setFormData({ ...formData, cost_price: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Stock Mínimo</label>
                                        <input
                                            type="number"
                                            className="w-full p-3 border border-slate-200 rounded-xl font-mono"
                                            value={formData.stock_min || 0}
                                            onChange={e => setFormData({ ...formData, stock_min: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Condición Venta</label>
                                        <select
                                            className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold"
                                            value={formData.condition}
                                            onChange={e => setFormData({ ...formData, condition: e.target.value as any })}
                                        >
                                            <option value="VD">Venta Directa</option>
                                            <option value="R">Receta Simple (R)</option>
                                            <option value="RR">Receta Retenida (RR)</option>
                                            <option value="RCH">Receta Cheque (RCH)</option>
                                        </select>
                                    </div>
                                </div>
                            </section>

                            {/* Logistics */}
                            <section>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Package size={16} /> Logística
                                </h3>
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Ubicación Física (Estante/Pasillo)</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-slate-200 rounded-xl text-sm"
                                            value={formData.aisle || ''}
                                            onChange={e => setFormData({ ...formData, aisle: e.target.value })}
                                            placeholder="Ej: ESTANTE A-2"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${formData.storage_condition === 'REFRIGERADO' ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-100 text-slate-400'}`}>
                                                <Thermometer size={20} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-slate-700">Cadena de Frío</p>
                                                <p className="text-xs text-slate-400">Requiere refrigeración (2°C - 8°C)</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={formData.storage_condition === 'REFRIGERADO'}
                                                onChange={e => setFormData({ ...formData, storage_condition: e.target.checked ? 'REFRIGERADO' : 'AMBIENTE' })}
                                            />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                                        </label>
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Right Column: Clinical Intelligence */}
                        <div className="col-span-5 bg-slate-50 rounded-3xl p-6 border border-slate-200 h-full">
                            <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider mb-6 flex items-center gap-2">
                                <Activity size={16} /> Inteligencia Clínica
                            </h3>

                            <div className="space-y-6">
                                {/* Therapeutic Tags */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 flex items-center gap-2">
                                        <Tag size={14} /> Tags Terapéuticos (Síntomas)
                                    </label>
                                    <div className="bg-white p-3 rounded-xl border border-slate-200 min-h-[100px]">
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {formData.therapeutic_tags?.map(tag => (
                                                <span key={tag} className="px-2 py-1 bg-cyan-100 text-cyan-700 text-xs font-bold rounded-lg flex items-center gap-1">
                                                    {tag}
                                                    <button onClick={() => removeTag(tag)} className="hover:text-cyan-900"><X size={12} /></button>
                                                </span>
                                            ))}
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Escribe y presiona Enter..."
                                            className="w-full text-sm outline-none bg-transparent placeholder:text-slate-400"
                                            value={newTag}
                                            onChange={e => setNewTag(e.target.value)}
                                            onKeyDown={handleAddTag}
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">Estos tags permiten que la IA recomiende este producto.</p>
                                </div>

                                {/* Contraindications */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-2 flex items-center gap-2">
                                        <AlertTriangle size={14} /> Contraindicaciones
                                    </label>
                                    <div className="space-y-2">
                                        {['EMBARAZO', 'HIPERTENSION', 'DIABETES', 'ULCERA', 'LACTANCIA'].map(ci => (
                                            <label key={ci} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    className="rounded text-red-500 focus:ring-red-500"
                                                    checked={formData.contraindications?.includes(ci)}
                                                    onChange={() => toggleContraindication(ci)}
                                                />
                                                <span className="text-xs font-bold text-slate-600">{ci}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 rounded-b-3xl">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition-colors shadow-lg shadow-cyan-200 flex items-center gap-2"
                    >
                        <Save size={18} />
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InventoryEditModal;
