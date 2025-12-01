import React, { useState, useEffect } from 'react';
import { X, Save, Thermometer, AlertTriangle, Tag, Package, DollarSign, Activity, Barcode, Syringe, Calendar, Trash2, Plus, Edit2 } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';

interface InventoryEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: InventoryBatch | null;
}

const InventoryEditModal: React.FC<InventoryEditModalProps> = ({ isOpen, onClose, product }) => {
    const { updateProduct, inventory, updateBatchDetails, addNewProduct } = usePharmaStore();
    const [formData, setFormData] = useState<Partial<InventoryBatch>>({});
    const [activeBatches, setActiveBatches] = useState<InventoryBatch[]>([]);
    const [newTag, setNewTag] = useState('');

    // Unique Options for Creatable Selects
    const uniqueLabs = React.useMemo(() => Array.from(new Set(inventory.map(i => i.laboratory))).filter(Boolean).sort(), [inventory]);
    const uniqueCategories = React.useMemo(() => Array.from(new Set(inventory.map(i => i.category))).filter(Boolean).sort(), [inventory]);

    useEffect(() => {
        if (product) {
            setFormData({
                ...product,
                contraindications: product.contraindications || [],
                therapeutic_tags: product.therapeutic_tags || []
            });
            // Filter batches for this product (assuming SKU is the grouper)
            setActiveBatches(inventory.filter(i => i.sku === product.sku && i.stock_actual > 0));
        }
    }, [product, inventory]);

    if (!isOpen || !product) return null;

    const handleSave = () => {
        if (product.id) {
            // SKU Validation
            if (formData.sku !== product.sku) {
                const skuExists = inventory.some(i => i.sku === formData.sku && i.id !== product.id);
                if (skuExists) {
                    toast.error('El SKU ya existe en otro producto');
                    return;
                }
            }

            // Update the main product (and potentially all batches if we want to sync shared data)
            // For now, we update the specific batch passed as "product"
            updateProduct(product.id, formData);

            // In a real "Master Product" scenario, we might want to update ALL batches with shared data
            // inventory.filter(i => i.sku === product.sku).forEach(b => updateProduct(b.id, formData));

            toast.success('Producto actualizado correctamente');
            onClose();
        }
    };

    const handleBatchUpdate = (batchId: string, field: keyof InventoryBatch, value: any) => {
        updateBatchDetails(product.id, batchId, { [field]: value });
        toast.success('Lote actualizado');
    };

    const handleAddBatch = () => {
        const newBatch: InventoryBatch = {
            ...product,
            id: `NEW-${Date.now()}`, // Temporary ID
            stock_actual: 0,
            expiry_date: Date.now() + 31536000000, // +1 year
            location_id: 'BODEGA_CENTRAL',
            aisle: '',
            cost_net: 0,
            tax_percent: 19,
            price_sell_box: 0,
            price_sell_unit: 0,
            price: 0,
            cost_price: 0
        };
        addNewProduct(newBatch); // Using addNewProduct as "addBatch" effectively
        toast.success('Nuevo lote creado');
    };

    const handleMermarBatch = (batchId: string) => {
        if (confirm('¿Estás seguro de dar de baja este lote? El stock quedará en 0.')) {
            updateBatchDetails(product.id, batchId, { stock_actual: 0 });
            toast.success('Lote dado de baja');
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

    // SEREMI Calculation
    const pricePerUnit = formData.price && formData.units_per_package
        ? Math.round(formData.price / formData.units_per_package)
        : 0;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-3xl">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Package className="text-cyan-600" />
                            Gestor Maestro de Producto
                        </h2>
                        <p className="text-slate-500 text-sm">{product.name} ({product.sku})</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition flex items-center gap-2 shadow-lg shadow-cyan-200"
                        >
                            <Save size={18} /> Guardar Cambios
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <X size={24} className="text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
                    <div className="grid grid-cols-12 gap-8">

                        {/* Left Column: Master Data */}
                        <div className="col-span-12 lg:col-span-7 space-y-6">

                            {/* 1. IDENTIFICACIÓN RÁPIDA (NEW) */}
                            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Tag size={16} /> Identificación Rápida
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">SKU (Código Interno)</label>
                                        <div className="relative">
                                            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                type="text"
                                                className="w-full pl-10 p-3 border border-slate-200 rounded-xl font-mono text-slate-700 focus:border-cyan-500 focus:outline-none bg-slate-50"
                                                value={formData.sku || ''}
                                                onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                                placeholder="SKU..."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Código de Barras (EAN)</label>
                                        <div className="relative">
                                            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                type="text"
                                                className="w-full pl-10 p-3 border border-slate-200 rounded-xl font-mono text-slate-700 focus:border-cyan-500 focus:outline-none bg-slate-50"
                                                value={formData.barcode || ''}
                                                onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                                placeholder="Escanea aquí..."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                                        <div className="relative">
                                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                list="categories-list"
                                                className="w-full pl-10 p-3 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-cyan-500 focus:outline-none bg-slate-50"
                                                value={formData.category || ''}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                placeholder="Seleccionar o crear..."
                                            />
                                            <datalist id="categories-list">
                                                {uniqueCategories.map(cat => <option key={cat} value={cat} />)}
                                            </datalist>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Vía de Administración</label>
                                        <div className="relative">
                                            <Syringe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <select
                                                className="w-full pl-10 p-3 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-cyan-500 focus:outline-none appearance-none bg-white"
                                                value={formData.administration_route || ''}
                                                onChange={e => setFormData({ ...formData, administration_route: e.target.value as any })}
                                            >
                                                <option value="">Seleccionar...</option>
                                                <option value="ORAL">Oral</option>
                                                <option value="TOPICA">Tópica</option>
                                                <option value="OFTALMICA">Oftálmica</option>
                                                <option value="NASAL">Nasal</option>
                                                <option value="RECTAL">Rectal</option>
                                                <option value="VAGINAL">Vaginal</option>
                                                <option value="PARENTERAL">Parenteral (Inyectable)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* 2. DATOS SANITARIOS (SEREMI) */}
                            <section className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm">
                                <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <AlertTriangle size={16} /> Datos Sanitarios (Norma Seremi)
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-amber-800/60 mb-1">Principio Activo (DCI)</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-amber-200 rounded-xl font-bold text-slate-700 focus:border-amber-500 focus:outline-none bg-white"
                                            value={formData.dci || ''}
                                            onChange={e => setFormData({ ...formData, dci: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-amber-800/60 mb-1">Laboratorio</label>
                                        <input
                                            list="labs-list"
                                            className="w-full p-3 border border-amber-200 rounded-xl font-bold bg-white"
                                            value={formData.laboratory || ''}
                                            onChange={e => setFormData({ ...formData, laboratory: e.target.value })}
                                            placeholder="Seleccionar o crear..."
                                        />
                                        <datalist id="labs-list">
                                            {uniqueLabs.map(lab => <option key={lab} value={lab} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-amber-800/60 mb-1">Registro ISP</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-amber-200 rounded-xl font-mono text-sm bg-white"
                                            value={formData.isp_register || ''}
                                            onChange={e => setFormData({ ...formData, isp_register: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-amber-800/60 mb-1">Unidades por Caja</label>
                                        <input
                                            type="number"
                                            className="w-full p-3 border border-amber-200 rounded-xl font-mono bg-white"
                                            value={formData.units_per_package || 1}
                                            onChange={e => setFormData({ ...formData, units_per_package: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-amber-800/60 mb-1">Precio Unitario Calc.</label>
                                        <div className="w-full p-3 bg-amber-100/50 border border-amber-200 rounded-xl font-mono font-bold text-amber-800">
                                            ${pricePerUnit}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* 3. DATOS COMERCIALES */}
                            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
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
                                </div>
                            </section>
                        </div>

                        {/* Right Column: Batch Management & Tags */}
                        <div className="col-span-12 lg:col-span-5 space-y-6">

                            {/* 4. GESTIÓN DE LOTES (CRITICAL) */}
                            <section className="bg-blue-50 p-6 rounded-2xl shadow-sm border border-blue-100">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider flex items-center gap-2">
                                        <Package size={16} className="text-blue-600" /> Existencias Físicas (Lotes)
                                    </h3>
                                    <button
                                        onClick={handleAddBatch}
                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-sm"
                                    >
                                        <Plus size={14} /> Nuevo Lote
                                    </button>
                                </div>

                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {activeBatches.map(batch => (
                                        <div key={batch.id} className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm hover:border-blue-300 transition-colors">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">N° Lote</label>
                                                    <input
                                                        type="text"
                                                        value={batch.id} // Usually Batch Number is separate, but using ID for now
                                                        readOnly
                                                        className="block w-full text-sm font-bold text-slate-700 bg-transparent outline-none"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => handleMermarBatch(batch.id)}
                                                    className="text-slate-300 hover:text-red-500 transition-colors"
                                                    title="Dar de baja"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 mb-3">
                                                <div>
                                                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase mb-1">
                                                        <Calendar size={10} /> Vencimiento
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={new Date(batch.expiry_date).toISOString().split('T')[0]}
                                                        onChange={e => handleBatchUpdate(batch.id, 'expiry_date', new Date(e.target.value).getTime())}
                                                        className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-slate-600"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase mb-1">
                                                        <Package size={10} /> Stock
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={batch.stock_actual}
                                                        onChange={e => handleBatchUpdate(batch.id, 'stock_actual', parseInt(e.target.value))}
                                                        className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-slate-600"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Ubicación</label>
                                                <input
                                                    type="text"
                                                    value={batch.aisle || ''}
                                                    onChange={e => handleBatchUpdate(batch.id, 'aisle', e.target.value)}
                                                    placeholder="Ej: Estante A1"
                                                    className="w-full p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600"
                                                />
                                            </div>
                                        </div>
                                    ))}

                                    {activeBatches.length === 0 && (
                                        <div className="text-center py-8 text-slate-400 text-sm italic">
                                            No hay lotes activos para este producto.
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Tags */}
                            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Activity size={16} /> Etiquetas Terapéuticas
                                </h3>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {formData.therapeutic_tags?.map(tag => (
                                        <span key={tag} className="px-3 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs font-bold flex items-center gap-1">
                                            {tag}
                                            <button onClick={() => removeTag(tag)} className="hover:text-cyan-900"><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-slate-200 rounded-xl text-sm"
                                    placeholder="Escribe y presiona Enter..."
                                    value={newTag}
                                    onChange={e => setNewTag(e.target.value)}
                                    onKeyDown={handleAddTag}
                                />
                            </section>

                            <section className="bg-red-50 p-6 rounded-2xl border border-red-100">
                                <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <AlertTriangle size={16} /> Contraindicaciones
                                </h3>
                                <div className="space-y-2">
                                    {['EMBARAZO', 'LACTANCIA', 'HIPERTENSION', 'DIABETES', 'ULCERA'].map(ci => (
                                        <label key={ci} className="flex items-center gap-2 cursor-pointer hover:bg-red-100/50 p-2 rounded-lg transition">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 text-red-500 rounded focus:ring-red-400"
                                                checked={formData.contraindications?.includes(ci) || false}
                                                onChange={() => toggleContraindication(ci)}
                                            />
                                            <span className="text-sm font-bold text-red-800">{ci}</span>
                                        </label>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InventoryEditModal;
