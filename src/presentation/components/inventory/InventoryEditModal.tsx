import React, { useState, useEffect } from 'react';
import { X, Save, Thermometer, AlertTriangle, Tag, Package, DollarSign, Activity, Barcode, Syringe, Calendar, Trash2, Plus, Edit2, FileText, Truck, Calculator, Percent } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';
// V2: Funciones seguras
import { createBatchSecure } from '../../../actions/inventory-v2';
import { updateProductMasterSecure } from '../../../actions/products-v2';

import { useQueryClient } from '@tanstack/react-query';

interface InventoryEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: InventoryBatch | null;
}

const InventoryEditModal: React.FC<InventoryEditModalProps> = ({ isOpen, onClose, product }) => {
    const queryClient = useQueryClient();
    const { inventory, updateBatchDetails, addNewProduct, user, currentLocationId, suppliers } = usePharmaStore();
    const [formData, setFormData] = useState<Partial<InventoryBatch>>({});
    const [activeBatches, setActiveBatches] = useState<InventoryBatch[]>([]);
    const [newTag, setNewTag] = useState('');
    const [isCreatingBatch, setIsCreatingBatch] = useState(false);
    const [showReceptionForm, setShowReceptionForm] = useState(false);
    const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
    const { addSupplier } = usePharmaStore();

    // Unique Options for Creatable Selects
    const uniqueLabs = React.useMemo(() => Array.from(new Set(inventory.map(i => i.laboratory))).filter(Boolean).sort(), [inventory]);
    const uniqueCategories = React.useMemo(() => Array.from(new Set(inventory.map(i => i.category))).filter(Boolean).sort(), [inventory]);

    // 🧠 Smart Unit Detection Helper (Shared Logic)
    const getEffectiveUnits = (item: Partial<InventoryBatch>) => {
        // 1. Try explicit DB fields first IF they are > 1
        const dbUnits = item.units_per_box || item.unit_count || 0;
        if (dbUnits > 1) return dbUnits;

        // 2. Try Heuristic from Name (e.g., "X60", "X 30", "X100")
        const name = item.name || '';
        const match = name.match(/X\s?(\d+)/i);

        if (match && match[1]) {
            const parsed = parseInt(match[1], 10);
            if (parsed > 1 && parsed < 1000) return parsed;
        }

        return 1;
    };


    useEffect(() => {
        if (product) {
            const normalizedSku =
                product.sku.startsWith('AUTO-') || product.sku.startsWith('TEMP-')
                    ? ''
                    : product.sku;
            // Intelligence: If units are 1 but we detect more, Autofill
            const detectedUnits = getEffectiveUnits(product);
            const initialUnits = (product.units_per_box && product.units_per_box > 1) ? product.units_per_box : detectedUnits;

            setFormData({
                ...product,
                sku: normalizedSku,
                contraindications: product.contraindications || [],
                therapeutic_tags: product.therapeutic_tags || [],
                units_per_box: initialUnits, // Auto-Populate Smartly
                // Ensure numbers
                cost_net: Number(product.cost_net || product.cost_price || 0),
                price: Number(product.price || product.price_sell_box || 0)
            });
            // Filter batches for this product (assuming SKU is the grouper)
            setActiveBatches(inventory.filter(i => i.sku === product.sku && i.stock_actual > 0));
        }
    }, [product, inventory]);

    // Format CLP Helper
    const formatCLP = (val: number | undefined) => {
        if (val === undefined || val === null) return '';
        return Math.round(val).toLocaleString('es-CL');
    };

    // Parse CLP Input Helper
    const handleNumberChange = (val: string, field: keyof InventoryBatch) => {
        // Remove dots and everything that is not a digit
        const cleanVal = val.replace(/\./g, '').replace(/[^0-9]/g, '');
        const numVal = cleanVal === '' ? 0 : parseInt(cleanVal, 10);
        setFormData(prev => ({ ...prev, [field]: numVal }));
    };

    if (!isOpen || !product) return null;

    const handleSave = async () => {
        if (!product.id) return;

        const rawSku = (formData.sku || '').trim();
        if (rawSku && rawSku.length > 50) {
            toast.error('El SKU es muy largo (máx 50 caracteres)');
            return;
        }

        try {
            const formDataAny = formData as any;

            // 🔍 Robust Product ID Resolution
            // Problem: Sometimes `product` is a Batch (id=batch_id) where product_id might be missing.
            // Solution: Try product.product_id -> Try finding by SKU in inventory -> Fail gracefully.
            const resolvedProductId = product.product_id ||
                inventory.find(i => i.sku === product.sku && i.product_id)?.product_id;

            if (!resolvedProductId) {
                toast.error('Error crítico: No se encuentra el ID Maestro del producto. Contacte a soporte.');
                return;
            }

            // Call the new Master Update Action
            const result = await updateProductMasterSecure({
                productId: resolvedProductId,
                sku: rawSku || undefined,
                name: formData.name || undefined,
                description: formDataAny.description || undefined,

                // Stock Config
                minStock: formData.stock_min,
                maxStock: formData.stock_max,

                // Financials
                price: formData.price,
                costPrice: formData.cost_net,

                // Clinical / Extra
                dci: formData.dci || undefined,
                laboratory: formData.laboratory || undefined,
                ispRegister: formData.isp_register || undefined,
                format: formData.format || undefined,
                unitsPerBox: formData.units_per_box,
                isBioequivalent: formData.is_bioequivalent,
                condition: formData.condition || 'VD',

                requiresPrescription: formDataAny.requires_prescription,
                isColdChain: formDataAny.is_cold_chain,
                userId: user?.id || '00000000-0000-0000-0000-000000000000'
            });

            if (!result.success) {
                toast.error(result.error || 'Error al actualizar producto');
                if (result.requiresApproval) {
                    toast.warning('El cambio de precio requiere autorización de un Manager.');
                }
                return;
            }

            toast.success('Producto actualizado correctamente');
            await queryClient.invalidateQueries({ queryKey: ['inventory', currentLocationId] });
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Error de conexión al actualizar producto');
        }
    };

    const handleBatchUpdate = (batchId: string, field: keyof InventoryBatch, value: any) => {
        updateBatchDetails(product.id, batchId, { [field]: value });
        toast.success('Lote actualizado');
    };

    const handleOpenReception = () => {
        setShowReceptionForm(true);
    };

    // --- BATCH RECEPTION FORM COMPONENT ---
    const BatchReceptionForm = () => {
        const [receptionData, setReceptionData] = useState({
            supplierId: '',
            invoiceNumber: '',
            invoiceDate: new Date().toISOString().split('T')[0],
            lotNumber: '',
            expiryDate: '',
            quantity: '1',      // Changed to string
            unitCost: (formData.cost_net || 0).toString(), // Changed to string
            salePrice: (formData.price || 0).toString(),   // Changed to string
            updateMasterPrice: false
        });

        // Quick Supplier Creation State
        const [newAppSupplier, setNewAppSupplier] = useState({
            rut: '',
            name: '',
            fantasyName: ''
        });

        const handleQuickSupplierCreate = async () => {
            if (!newAppSupplier.rut || !newAppSupplier.name) {
                return toast.error('RUT y Nombre son obligatorios');
            }

            try {
                // Call store action (which calls secure action)
                // We mock the full supplier object with defaults
                await addSupplier({
                    rut: newAppSupplier.rut,
                    business_name: newAppSupplier.name,
                    fantasy_name: newAppSupplier.fantasyName || newAppSupplier.name,
                    email_orders: undefined,
                    phone_1: undefined,
                    address: undefined,
                    city: undefined,
                    region: 'Atacama', // Default
                    commune: 'Vallenar', // Default
                    payment_terms: '30_DIAS',
                    lead_time_days: 1,
                    is_active: true,
                    contacts: [],
                    brands: []
                } as any);

                // Assuming addSupplier updates the store optimization, we find the new one
                // Since addSupplier is async void, we might not get the ID back directly easily without refactoring store
                // But the store updates 'suppliers' array.
                // We'll retry finding it by RUT to auto-select
                setTimeout(() => {
                    const created = suppliers.find(s => s.rut === newAppSupplier.rut);
                    if (created) {
                        setReceptionData(prev => ({ ...prev, supplierId: created.id }));
                        setIsCreatingSupplier(false);
                    }
                }, 1000);

            } catch (e: any) {
                console.error(e);
                toast.error('Error al crear proveedor: ' + (e?.message || 'Error desconocido'));
            }
        };

        // Calculations - Parse strings safely
        const quantityNum = parseInt(receptionData.quantity) || 0;
        const netCost = parseFloat(receptionData.unitCost) || 0;
        const salePrice = parseFloat(receptionData.salePrice) || 0;
        const grossCost = Math.round(netCost * 1.19);
        const margin = netCost > 0 ? ((salePrice - netCost) / netCost) * 100 : 0;

        const handleReceptionSubmit = async () => {
            // Validations
            if (!receptionData.lotNumber) return toast.error('Falta número de lote');
            if (!receptionData.expiryDate) return toast.error('Falta fecha de vencimiento');
            if (quantityNum <= 0) return toast.error('Cantidad debe ser mayor a 0');

            setIsCreatingBatch(true);
            try {
                // V2: createBatchSecure with reception details
                const result = await createBatchSecure({
                    productId: product.product_id || product.id,
                    sku: formData.sku || 'UNKNOWN',
                    name: formData.name || 'Unknown Product',
                    locationId: product.location_id || 'BODEGA_CENTRAL', // Default location
                    warehouseId: undefined, // Let backend handle or default
                    quantity: quantityNum,
                    expiryDate: new Date(receptionData.expiryDate),
                    lotNumber: receptionData.lotNumber,
                    unitCost: netCost,
                    salePrice: salePrice,
                    stockMin: formData.stock_min || 0,
                    stockMax: formData.stock_max || 1000,
                    userId: user?.id || 'SYSTEM',

                    // New Fields
                    supplierId: receptionData.supplierId || undefined,
                    invoiceNumber: receptionData.invoiceNumber || undefined,
                    invoiceDate: receptionData.invoiceDate ? new Date(receptionData.invoiceDate) : undefined,
                    updateMasterPrice: receptionData.updateMasterPrice
                });

                if (result.success && result.batchId) {
                    // Update Local Store (Optimistic)
                    const newLocalBatch: InventoryBatch = {
                        ...product, // Base props
                        id: result.batchId,
                        lot_number: receptionData.lotNumber,
                        expiry_date: new Date(receptionData.expiryDate).getTime(),
                        stock_actual: quantityNum,
                        cost_net: netCost,
                        price: salePrice,
                        // Add other fields as needed for display
                    } as any;

                    addNewProduct(newLocalBatch);
                    toast.success('Recepción completada exitosamente');

                    // Refresh
                    queryClient.invalidateQueries({ queryKey: ['inventory', currentLocationId] });
                    setShowReceptionForm(false);
                } else {
                    toast.error('Error en recepción: ' + result.error);
                }
            } catch (e: any) {
                console.error(e);
                toast.error('Error inesperado al procesar recepción: ' + (e?.message || 'Error desconocido'));
            } finally {
                setIsCreatingBatch(false);
            }
        };

        return (
            <div className="absolute inset-0 bg-white z-50 rounded-3xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-blue-50/50 rounded-t-3xl">
                    <div>
                        <h2 className="text-xl font-bold text-blue-900 flex items-center gap-2">
                            <Truck className="text-blue-600" /> Nueva Recepción de Lote
                        </h2>
                        <p className="text-blue-500 text-sm">Ingreso de mercadería para: {product.name}</p>
                    </div>
                    <button onClick={() => setShowReceptionForm(false)} className="p-2 hover:bg-blue-100 rounded-full text-blue-400">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="grid grid-cols-12 gap-6">
                        {/* 1. Documento y Proveedor */}
                        <div className="col-span-12 md:col-span-4 space-y-4">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <FileText size={16} /> Documento Origen
                            </h3>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Proveedor</label>
                                <select
                                    className="w-full p-3 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 bg-slate-50"
                                    value={receptionData.supplierId}
                                    onChange={e => setReceptionData({ ...receptionData, supplierId: e.target.value })}
                                >
                                    <option value="">Seleccionar Proveedor...</option>
                                    {suppliers?.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name || s.fantasy_name}</option>
                                    ))}
                                </select>

                                <div className="mt-1 flex justify-end">
                                    {!isCreatingSupplier ? (
                                        <button
                                            onClick={() => setIsCreatingSupplier(true)}
                                            className="text-xs text-blue-500 font-bold hover:underline flex items-center gap-1"
                                        >
                                            <Plus size={12} /> Nuevo Proveedor
                                        </button>
                                    ) : (
                                        <div className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl mt-2 space-y-2 animate-in slide-in-from-top-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-xs font-bold text-blue-700">Nuevo Proveedor Rápido</span>
                                                <button onClick={() => setIsCreatingSupplier(false)}><X size={14} className="text-slate-400 hover:text-red-500" /></button>
                                            </div>
                                            <input
                                                className="w-full p-2 text-xs border rounded-lg"
                                                placeholder="RUT (Ej: 76.123.456-7)"
                                                value={newAppSupplier.rut}
                                                onChange={e => setNewAppSupplier({ ...newAppSupplier, rut: e.target.value })}
                                            />
                                            <input
                                                className="w-full p-2 text-xs border rounded-lg"
                                                placeholder="Razón Social"
                                                value={newAppSupplier.name}
                                                onChange={e => setNewAppSupplier({ ...newAppSupplier, name: e.target.value })}
                                            />
                                            <input
                                                className="w-full p-2 text-xs border rounded-lg"
                                                placeholder="Nombre Fantasía (Opcional)"
                                                value={newAppSupplier.fantasyName}
                                                onChange={e => setNewAppSupplier({ ...newAppSupplier, fantasyName: e.target.value })}
                                            />
                                            <button
                                                onClick={handleQuickSupplierCreate}
                                                className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700"
                                            >
                                                Guardar y Seleccionar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">N° Factura / Boleta</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-slate-200 rounded-xl font-mono"
                                    placeholder="Ej: 123456"
                                    value={receptionData.invoiceNumber}
                                    onChange={e => setReceptionData({ ...receptionData, invoiceNumber: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Documento</label>
                                <input
                                    type="date"
                                    className="w-full p-3 border border-slate-200 rounded-xl"
                                    value={receptionData.invoiceDate}
                                    onChange={e => setReceptionData({ ...receptionData, invoiceDate: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* 2. Detalles del Lote */}
                        <div className="col-span-12 md:col-span-4 space-y-4 border-l border-slate-100 pl-6">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Package size={16} /> Detalles del Lote
                            </h3>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Número de Lote (Serie)</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-slate-200 rounded-xl font-mono uppercase"
                                    placeholder="LOTE-001"
                                    value={receptionData.lotNumber}
                                    onChange={e => setReceptionData({ ...receptionData, lotNumber: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Vencimiento</label>
                                <input
                                    type="date"
                                    className="w-full p-3 border border-slate-200 rounded-xl"
                                    value={receptionData.expiryDate}
                                    onChange={e => setReceptionData({ ...receptionData, expiryDate: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Cantidad Recibida</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    className="w-full p-3 border border-blue-200 rounded-xl font-bold text-blue-600 bg-blue-50 text-xl"
                                    value={receptionData.quantity}
                                    onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        setReceptionData({ ...receptionData, quantity: val });
                                    }}
                                />
                            </div>
                        </div>

                        {/* 3. Costos y Precios */}
                        <div className="col-span-12 md:col-span-4 space-y-4 border-l border-slate-100 pl-6">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Calculator size={16} /> Costos y Precios
                            </h3>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Costo Unitario Neto</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full pl-8 p-3 border border-slate-200 rounded-xl font-mono"
                                        value={receptionData.unitCost}
                                        onChange={e => {
                                            const val = e.target.value.replace(/[^0-9.]/g, ''); // Allow basic decimal matching if needed, though clean logic is better
                                            setReceptionData({ ...receptionData, unitCost: val });
                                        }}
                                    />
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                                    <span>IVA (19%): ${Math.round(netCost * 0.19)}</span>
                                    <span>Bruto: ${grossCost}</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Precio Venta Público</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full pl-8 p-3 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                                        value={receptionData.salePrice}
                                        onChange={e => {
                                            const val = e.target.value.replace(/[^0-9.]/g, '');
                                            setReceptionData({ ...receptionData, salePrice: val });
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-200">
                                <span className="text-xs font-bold text-slate-500">Rentabilidad Calc.</span>
                                <span className={`text-lg font-bold ${margin < 30 ? 'text-red-500' : 'text-green-600'}`}>
                                    {margin.toFixed(1)}%
                                </span>
                            </div>

                            <label className="flex items-center gap-2 p-3 border border-blue-200 bg-blue-50/50 rounded-xl cursor-pointer hover:bg-blue-100/50 transition">
                                <input
                                    type="checkbox"
                                    className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                                    checked={receptionData.updateMasterPrice}
                                    onChange={e => setReceptionData({ ...receptionData, updateMasterPrice: e.target.checked })}
                                />
                                <span className="text-xs font-bold text-blue-800 leading-tight">
                                    Actualizar precio maestro con estos valores
                                </span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-3xl">
                    <button
                        onClick={() => setShowReceptionForm(false)}
                        className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleReceptionSubmit}
                        disabled={isCreatingBatch}
                        className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isCreatingBatch ? <Activity className="animate-spin" /> : <Save size={20} />}
                        Confirmar Recepción
                    </button>
                </div>
            </div>
        );
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

    // SEREMI Calculation - Uses formData which is now smartly populated
    const pricePerUnit = formData.price && formData.units_per_box
        ? Math.round(formData.price / formData.units_per_box)
        : 0;

    // Helper safe date
    const safeDateToISO = (dateVal: any) => {
        try {
            if (!dateVal) return new Date().toISOString().split('T')[0];
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
            return d.toISOString().split('T')[0];
        } catch (e) {
            return new Date().toISOString().split('T')[0];
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200 relative">
                {showReceptionForm && <BatchReceptionForm />}
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
                                    <div className="flex items-center pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition w-full">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                                checked={formData.is_bioequivalent || false}
                                                onChange={e => setFormData({ ...formData, is_bioequivalent: e.target.checked })}
                                            />
                                            <span className="text-sm font-bold text-slate-600">Es Bioequivalente</span>
                                        </label>
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
                                            value={formData.units_per_box || 1}
                                            onChange={e => setFormData({ ...formData, units_per_box: parseInt(e.target.value) || 1 })}
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
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                            <input
                                                type="text"
                                                className="w-full pl-6 p-3 border border-slate-200 rounded-xl font-mono"
                                                value={formatCLP(formData.price)}
                                                onChange={e => handleNumberChange(e.target.value, 'price')}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Costo Neto</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                            <input
                                                type="text"
                                                className="w-full pl-6 p-3 border border-slate-200 rounded-xl font-mono"
                                                value={formatCLP(formData.cost_net)}
                                                onChange={e => handleNumberChange(e.target.value, 'cost_net')}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 text-red-500 flex items-center gap-1">
                                            <AlertTriangle size={12} /> Stock Mínimo (Alerta)
                                        </label>
                                        <input
                                            type="number"
                                            className="w-full p-3 border border-red-100 rounded-xl font-mono bg-red-50 text-red-800 font-bold"
                                            value={formData.stock_min || 0}
                                            onChange={e => setFormData({ ...formData, stock_min: Number(e.target.value) })}
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
                                        onClick={handleOpenReception}
                                        disabled={isCreatingBatch}
                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                                    >
                                        <Truck size={14} />
                                        Recepcionar Lote
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
                                                        value={batch.lot_number || 'S/L'}
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
                                                        value={safeDateToISO(batch.expiry_date)}
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
