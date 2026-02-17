import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Save, Package, Camera, Info, Sparkles, Search as SearchIcon, AlertTriangle, Globe, Loader2, CheckCircle, Calculator, Percent, Syringe, Tag, Truck, FileText, Barcode, DollarSign } from 'lucide-react';
import { createProductSecure, updateProductMasterSecure } from '../../../actions/products-v2';
import { usePharmaStore } from '../../store/useStore';
import { InventoryBatch } from '../../../domain/types';
import { toast } from 'sonner';
import CameraScanner from '../ui/CameraScanner';
import { lookupBarcode, BarcodeLookupResult } from '../../../infrastructure/services/BarcodeLookupService';
import { calculateRecommendedPrice, calculateMargin } from '../../../domain/logic/pricing-rules'; // Importar lógica de precios

import { useQueryClient } from '@tanstack/react-query';

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
    const queryClient = useQueryClient();
    const { suppliers, currentLocationId, locations, user } = usePharmaStore();
    const isEdit = !!product;

    // Calculadora State
    const [calculator, setCalculator] = useState({
        applyTax: true, // Default con IVA
        targetMargin: 40, // Default 40%
        calculatedPrice: 0
    });

    const [formData, setFormData] = useState({
        sku: product?.sku || initialValues?.sku || '',
        name: (product?.name || initialValues?.name || '').replace(/^\[AL DETAL\]\s*/i, '').trim(),
        category: product?.category || 'MEDICAMENTO',
        subcategory: product?.subcategory || '',
        stock_actual: product?.stock_actual || 0,
        stock_min: product?.stock_min || 0,
        stock_max: product?.stock_max || 1000,
        safety_stock: product?.safety_stock || 0,
        price: product?.price || product?.price_sell_box || initialValues?.price || 0,
        cost_net: product?.cost_net || initialValues?.cost || 0,
        location_id: product?.location_id || currentLocationId || (locations.length > 0 ? locations[0].id : ''),
        preferred_supplier_id: product?.preferred_supplier_id || '',
        lead_time_days: product?.lead_time_days || 3,
        barcode: product?.barcode || initialValues?.barcode || '',

        // Extended Fields (Legacy InventoryEditModal)
        dci: product?.dci || initialValues?.dci || '',
        laboratory: product?.laboratory || '',
        isp_register: product?.isp_register || '',
        units_per_box: product?.units_per_box || initialValues?.units_per_box || 1,
        format: product?.format || '',
        is_bioequivalent: product?.is_bioequivalent || false,
        administration_route: product?.administration_route || '',
        therapeutic_tags: product?.therapeutic_tags || [],

        // Initial Batch Data (Creation Only)
        initialLot: '',
        initialExpiry: '',
    });

    // Estado para tags
    const [newTag, setNewTag] = useState('');

    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Barcode Lookup State
    const [barcodeLookup, setBarcodeLookup] = useState<BarcodeLookupResult | null>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lastLookedUpBarcode, setLastLookedUpBarcode] = useState('');

    // Search State
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const uniqueLabs = useMemo(() => Array.from(new Set(suppliers.flatMap(s => s.brands || []))).sort(), [suppliers]);
    const uniqueCategories = useMemo(() => ['MEDICAMENTO', 'PERFUMERIA', 'SUPLEMENTO', 'INSUMO', 'ACCESORIO', 'ALIMENTO'].sort(), []);

    const [isSaving, setIsSaving] = useState(false);

    // Effect: Recalcular precio sugerido cuando cambia Costo, IVA o Margen
    useEffect(() => {
        const suggested = calculateRecommendedPrice(formData.cost_net, calculator.applyTax, calculator.targetMargin);
        setCalculator(prev => ({ ...prev, calculatedPrice: suggested }));
    }, [formData.cost_net, calculator.applyTax, calculator.targetMargin]);

    // Barcode Lookup Logic
    const performBarcodeLookup = useCallback(async (barcode: string) => {
        if (!barcode || barcode.length < 8 || barcode === lastLookedUpBarcode) return;
        setIsLookingUp(true);
        setLastLookedUpBarcode(barcode);
        try {
            const result = await lookupBarcode(barcode);
            setBarcodeLookup(result);
            if (result.found) {
                if (!formData.name && result.name) {
                    setFormData(prev => ({
                        ...prev,
                        name: result.name || prev.name,
                        category: result.category?.toLowerCase().includes('cosm') ? 'PERFUMERIA' : prev.category
                    }));
                    toast.success(`Encontrado: ${result.name}`);
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLookingUp(false);
        }
    }, [formData.name, lastLookedUpBarcode]);

    useEffect(() => {
        if (formData.barcode.length >= 8 && formData.barcode !== lastLookedUpBarcode) {
            const timer = setTimeout(() => performBarcodeLookup(formData.barcode), 500);
            return () => clearTimeout(timer);
        }
    }, [formData.barcode, performBarcodeLookup, lastLookedUpBarcode]);

    // Search existing functionality
    const handleSearch = async (term: string) => {
        if (term.length < 2) return;
        setIsSearching(true);
        try {
            const { searchProductsSecure } = await import('../../../actions/search-actions');
            const res = await searchProductsSecure(term);
            if (res.success && res.data) setSearchResults(res.data);
        } catch (err) { console.error(err); }
        setIsSearching(false);
    };

    const handleSelectMatch = (match: any) => {
        setFormData({
            ...formData,
            sku: match.sku,
            name: match.name,
            barcode: match.barcode || formData.barcode,
            price: match.price || 0,
        });
        toast.success(`Datos cargados desde: ${match.name}`);
        setShowSearch(false);
    };

    // Formatters
    const formatCLP = (val: number | undefined) => {
        if (val === undefined || val === null) return '';
        return Math.round(val).toLocaleString('es-CL');
    };

    const handleNumberChange = (val: string, field: string) => {
        const cleanVal = val.replace(/\./g, '').replace(/[^0-9]/g, '');
        const numVal = cleanVal === '' ? 0 : parseInt(cleanVal, 10);
        setFormData({ ...formData, [field]: numVal });
    };

    const handleApplySuggestedPrice = () => {
        setFormData({ ...formData, price: calculator.calculatedPrice });
        toast.success('Precio sugerido aplicado');
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

    const removeTag = (tag: string) => {
        setFormData({
            ...formData,
            therapeutic_tags: (formData.therapeutic_tags || []).filter(t => t !== tag)
        });
    };

    const handleSubmit = async () => {
        if (!formData.sku || !formData.name) return toast.error('Complete SKU y Nombre');

        // Robust Product ID Extraction
        // Prioritize product_id (Master) over id (Batch) if available
        const targetProductId = isEdit && product
            ? ((product as any).product_id || product.id)
            : undefined;

        // Validation for Edit Mode
        if (isEdit && (!targetProductId || targetProductId.length < 20)) {
            console.error('Invalid Product ID:', product);
            return toast.error('Error Crítico: ID de producto inválido o no encontrado. Contacte soporte.');
        }

        // Validate User ID
        const validUserId = user?.id && user.id.length > 20
            ? user.id
            : '00000000-0000-4000-8000-000000000000';

        // Prepare Payload
        const commonPayload = {
            sku: formData.sku,
            name: formData.name,
            description: '',
            price: Number(formData.price) || 0,
            costPrice: Number(formData.cost_net) || 0,
            minStock: Number(formData.stock_min) || 0,
            maxStock: Number(formData.stock_max) || 0,
            userId: validUserId,
            approverPin: undefined, // Optional, can be added if UI supports it
            barcode: formData.barcode || undefined, // Send undefined if empty string
            dci: formData.dci || undefined,
            laboratory: formData.laboratory || undefined,
            ispRegister: formData.isp_register || undefined,
            unitsPerBox: Number(formData.units_per_box) || 1,
            isBioequivalent: formData.is_bioequivalent,
            format: formData.format || undefined,
            condition: 'VD' as any,
            requiresPrescription: false,
            isColdChain: false,
        };

        setIsSaving(true);
        try {
            let result;
            if (isEdit && targetProductId) {
                result = await updateProductMasterSecure({
                    productId: targetProductId,
                    ...commonPayload
                });
            } else {
                result = await createProductSecure({
                    ...commonPayload,
                    initialStock: Number(formData.stock_actual) || 0,
                    initialLot: formData.initialLot || undefined,
                    initialExpiry: formData.initialExpiry ? new Date(formData.initialExpiry.split('/').reverse().join('-')) : undefined,
                    initialLocation: formData.location_id || undefined
                });
            }

            if (result.success) {
                toast.success(isEdit ? 'Producto actualizado correctamente' : 'Producto creado correctamente');

                // Aggressively invalidate queries to refresh UI
                await queryClient.invalidateQueries({ queryKey: ['inventory'] });
                await queryClient.invalidateQueries({ queryKey: ['products'] });

                let finalProductId = isEdit ? targetProductId : undefined;
                if ('data' in result && result.data) {
                    finalProductId = result.data.productId;
                }

                if (onSuccess && finalProductId) onSuccess(finalProductId, commonPayload);
                onClose();
            } else {
                console.error('Save Error:', result.error);
                toast.error('Error al guardar: ' + (result.error || 'Verifique los datos'));
            }
        } catch (err: any) {
            console.error('Submission Error:', err);
            toast.error('Error de conexión: ' + (err.message || 'Intente nuevamente'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90dvh] md:h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-3xl">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Package className="text-cyan-600" />
                            {isEdit ? 'Editar Producto Maestro' : 'Nuevo Producto Maestro'}
                        </h2>
                        <p className="text-slate-500 text-sm">Gestión centralizada de inventario y precios</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
                    <div className="grid grid-cols-12 gap-8">

                        {/* LEFT COLUMN: IDENTIFICATION & SANITARY */}
                        <div className="col-span-12 lg:col-span-7 space-y-6">

                            {/* Identificación */}
                            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Tag size={16} /> Identificación
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">SKU *</label>
                                        <div className="relative">
                                            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                className="w-full pl-10 p-3 border border-slate-200 rounded-xl font-mono text-slate-700 bg-slate-50 text-base"
                                                value={formData.sku}
                                                onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                                placeholder="SKU Único"
                                                disabled={isEdit}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Código Barras</label>
                                        <div className="flex gap-2">
                                            <input
                                                className="flex-1 p-3 border border-slate-200 rounded-xl font-mono text-base"
                                                value={formData.barcode}
                                                onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                                placeholder="EAN"
                                                autoFocus={!isEdit}
                                            />
                                            <button onClick={() => setIsScannerOpen(true)} className="p-3 bg-cyan-100 text-cyan-600 rounded-xl">
                                                <Camera size={20} />
                                            </button>
                                        </div>
                                        {isLookingUp && <span className="text-xs text-cyan-500 flex items-center gap-1 mt-1"><Loader2 size={10} className="animate-spin" /> Buscando...</span>}
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Comercial *</label>
                                        <input
                                            className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-cyan-500 focus:outline-none text-base"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Ej: Paracetamol 500mg"
                                        />
                                        {!isEdit && (
                                            <button onClick={() => setShowSearch(true)} className="text-xs text-purple-600 font-bold hover:underline mt-1 flex items-center gap-1">
                                                <Sparkles size={12} /> Verificar si existe
                                            </button>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                                        <input
                                            list="categories-list"
                                            className="w-full p-3 border border-slate-200 rounded-xl text-base"
                                            value={formData.category}
                                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                                        />
                                        <datalist id="categories-list">
                                            {uniqueCategories.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Laboratorio</label>
                                        <input
                                            list="labs-list"
                                            className="w-full p-3 border border-slate-200 rounded-xl text-base"
                                            value={formData.laboratory || ''}
                                            onChange={e => setFormData({ ...formData, laboratory: e.target.value })}
                                            placeholder="Ej: Chile, Bagó"
                                        />
                                        <datalist id="labs-list">
                                            {uniqueLabs.map(l => <option key={l} value={l} />)}
                                        </datalist>
                                    </div>
                                </div>
                            </section>

                            {/* Datos Sanitarios */}
                            <section className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm">
                                <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <AlertTriangle size={16} /> Datos Sanitarios (Norma Seremi)
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-amber-800/60 mb-1">Principio Activo (DCI)</label>
                                        <input
                                            className="w-full p-3 border border-amber-200 rounded-xl font-bold text-slate-700 focus:border-amber-500 focus:outline-none bg-white text-base"
                                            value={formData.dci}
                                            onChange={e => setFormData({ ...formData, dci: e.target.value })}
                                            placeholder="Ej: Amoxicilina"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-amber-800/60 mb-1">Vía Administración</label>
                                        <div className="relative">
                                            <Syringe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <select
                                                className="w-full pl-10 p-3 border border-amber-200 rounded-xl bg-white focus:outline-none text-base"
                                                value={formData.administration_route}
                                                onChange={e => setFormData({ ...formData, administration_route: e.target.value })}
                                            >
                                                <option value="">Seleccionar...</option>
                                                <option value="ORAL">Oral</option>
                                                <option value="TOPICA">Tópica</option>
                                                <option value="PARENTERAL">Inyectable</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-amber-800/60 mb-1">Reg. ISP</label>
                                        <input
                                            className="w-full p-3 border border-amber-200 rounded-xl bg-white text-base"
                                            value={formData.isp_register}
                                            onChange={e => setFormData({ ...formData, isp_register: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-3 rounded-xl border border-amber-200 hover:bg-amber-100/50 transition w-full h-full">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500"
                                                checked={formData.is_bioequivalent}
                                                onChange={e => setFormData({ ...formData, is_bioequivalent: e.target.checked })}
                                            />
                                            <span className="text-sm font-bold text-amber-800">Es Bioequivalente</span>
                                        </label>
                                    </div>
                                </div>
                            </section>

                            {/* Tags */}
                            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Etiquetas Terapéuticas</h3>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {formData.therapeutic_tags?.map(tag => (
                                        <span key={tag} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold flex items-center gap-1">
                                            {tag}
                                            <button onClick={() => removeTag(tag)} className="hover:text-purple-900"><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    className="w-full p-3 border border-slate-200 rounded-xl text-base"
                                    placeholder="Escribe y presiona Enter para agregar tag (Ej: DOLOR, FIEBRE)..."
                                    value={newTag}
                                    onChange={e => setNewTag(e.target.value)}
                                    onKeyDown={handleAddTag}
                                />
                            </section>
                        </div>

                        {/* RIGHT COLUMN: FINANCIALS & STOCK */}
                        <div className="col-span-12 lg:col-span-5 space-y-6">

                            {/* CALCULADORA DE PRECIOS */}
                            <section className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10"><Calculator size={120} /></div>
                                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-6 flex items-center gap-2 relative z-10">
                                    <DollarSign size={16} /> Inteligencia de Precios
                                </h3>

                                <div className="space-y-4 relative z-10">
                                    {/* Costo */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block text-xs font-bold text-slate-400">1. Costo Neto Unitario</label>
                                            {formData.units_per_box > 1 && (
                                                <button
                                                    onClick={() => {
                                                        const newCost = Math.round(formData.cost_net / formData.units_per_box);
                                                        setFormData({ ...formData, cost_net: newCost });
                                                        toast.success(`Costo ajustado: $${formatCLP(newCost)} (Dividido por ${formData.units_per_box})`);
                                                    }}
                                                    className="text-[10px] text-orange-400 hover:text-orange-300 underline decoration-dotted cursor-pointer flex items-center gap-1"
                                                    title={`Dividir el costo actual (${formatCLP(formData.cost_net)}) por la cantidad de unidades (${formData.units_per_box})`}
                                                >
                                                    <Percent size={10} /> Dividir por {formData.units_per_box} (U/Caja)
                                                </button>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                                            <input
                                                className="w-full pl-8 p-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white font-mono focus:border-cyan-500 focus:outline-none"
                                                value={formatCLP(formData.cost_net)}
                                                onChange={e => handleNumberChange(e.target.value, 'cost_net')}
                                            />
                                        </div>
                                    </div>

                                    {/* Configuración Margen */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">2. Configuración</label>
                                            <label className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-xl border border-slate-600 cursor-pointer hover:bg-slate-700 transition">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded text-cyan-500 bg-slate-800"
                                                    checked={calculator.applyTax}
                                                    onChange={e => setCalculator({ ...calculator, applyTax: e.target.checked })}
                                                />
                                                <span className="text-xs text-slate-300">Sumar IVA (19%)</span>
                                            </label>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 mb-1">3. Margen Deseado %</label>
                                            <div className="relative">
                                                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                                <input
                                                    type="number"
                                                    className="w-full pl-8 p-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white font-bold text-center focus:border-cyan-500 focus:outline-none"
                                                    value={calculator.targetMargin}
                                                    onChange={e => setCalculator({ ...calculator, targetMargin: Number(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Precio Actual (Referencia) */}
                                    {isEdit && (
                                        <div className="mb-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                                            <div className="flex justify-between items-end">
                                                <div>
                                                    <span className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Precio Actual Sistema</span>
                                                    <span className="text-xl font-bold text-slate-200">${formatCLP(product?.price || product?.price_sell_box || 0)}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] text-slate-500">Margen Actual</span>
                                                    <span className="block text-sm font-bold text-slate-400">
                                                        {calculateMargin(product?.price || 0, product?.cost_net || 0, true)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Resultado Sugerido (Editable con Recálculo Inverso) */}
                                    <div className="p-4 bg-cyan-900/30 border border-cyan-500/30 rounded-xl space-y-2">
                                        <div className="flex justify-between items-center mb-1">
                                            <div>
                                                <span className="block text-xs text-cyan-400 uppercase font-bold">Precio Sugerido (Editable)</span>
                                                <span className="text-[10px] text-cyan-300/70">Ajusta también el margen</span>
                                            </div>
                                            <button
                                                onClick={handleApplySuggestedPrice}
                                                className="text-[10px] text-white bg-cyan-600 hover:bg-cyan-500 px-3 py-1 rounded-full font-bold transition-colors shadow-sm"
                                            >
                                                Aplicar a Venta
                                            </button>
                                        </div>

                                        <div className="relative group">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-500 font-bold">$</span>
                                            <input
                                                className="w-full pl-8 p-3 bg-cyan-950/50 border border-cyan-700 rounded-xl text-cyan-300 font-bold text-2xl focus:border-cyan-400 focus:outline-none transition-colors"
                                                value={formatCLP(calculator.calculatedPrice)}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '')) || 0;

                                                    // Reverse Calculation of Margin
                                                    // Price = Cost * 1.19 * (1 + Margin/100)
                                                    // Margin% = ((Price / (Cost * 1.19)) - 1) * 100

                                                    const costBase = calculator.applyTax ? (formData.cost_net * 1.19) : formData.cost_net;
                                                    let newMargin = 0;
                                                    if (costBase > 0) {
                                                        newMargin = ((val / costBase) - 1) * 100;
                                                    }

                                                    setCalculator({
                                                        ...calculator,
                                                        calculatedPrice: val,
                                                        targetMargin: parseFloat(newMargin.toFixed(2))
                                                    });
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Precio Final (Editable) - Highlighted */}
                                    <div className="pt-4 border-t border-slate-700">
                                        <label className="block text-xs font-bold text-emerald-400 mb-1">Precio Venta Final (Manual)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500">$</span>
                                            <input
                                                className="w-full pl-8 p-4 bg-slate-800 border-2 border-emerald-500/50 rounded-xl text-emerald-400 font-mono text-xl font-bold focus:border-emerald-500 focus:outline-none"
                                                value={formatCLP(formData.price)}
                                                onChange={e => handleNumberChange(e.target.value, 'price')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {!isEdit && (
                                <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Package size={16} /> Stock Inicial
                                    </h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Stock Físico</label>
                                            <input
                                                type="number"
                                                className="w-full p-3 border border-slate-200 rounded-xl text-base"
                                                value={formData.stock_actual}
                                                onChange={e => setFormData({ ...formData, stock_actual: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                        {formData.stock_actual > 0 && (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">N° Lote Inicial</label>
                                                    <input
                                                        className="w-full p-3 border border-slate-200 rounded-xl font-mono uppercase text-base"
                                                        value={formData.initialLot}
                                                        onChange={e => setFormData({ ...formData, initialLot: e.target.value.toUpperCase() })}
                                                        placeholder="LOTE-001"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Vencimiento</label>
                                                    <input
                                                        type="text"
                                                        className="w-full p-3 border border-slate-200 rounded-xl text-base"
                                                        placeholder="DD/MM/AAAA"
                                                        value={formData.initialExpiry}
                                                        onChange={e => {
                                                            let val = e.target.value.replace(/[^0-9]/g, '');
                                                            if (val.length > 8) val = val.substring(0, 8);
                                                            if (val.length > 4) val = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4);
                                                            else if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                                                            setFormData({ ...formData, initialExpiry: val })
                                                        }}
                                                    />
                                                </div>
                                            </>
                                        )}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-red-500 mb-1">Mínimo</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-3 border border-red-100 bg-red-50 rounded-xl text-red-600 font-bold text-base"
                                                    value={formData.stock_min}
                                                    onChange={e => setFormData({ ...formData, stock_min: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-blue-500 mb-1">Máximo</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-3 border border-blue-100 bg-blue-50 rounded-xl text-blue-600 font-bold text-base"
                                                    value={formData.stock_max}
                                                    onChange={e => setFormData({ ...formData, stock_max: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-white rounded-b-3xl">
                    <button onClick={onClose} className="px-6 py-3 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="px-8 py-3 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <Save size={20} />
                        )}
                        {isEdit ? 'Guardar Cambios' : 'Crear Producto Maestro'}
                    </button>
                </div>
            </div>

            {/* Modals Extras */}
            {isScannerOpen && <CameraScanner onScan={c => { setFormData({ ...formData, barcode: c }); setIsScannerOpen(false); toast.success('Escaneado: ' + c) }} onClose={() => setIsScannerOpen(false)} />}
        </div>
    );
};

export default ProductFormModal;
