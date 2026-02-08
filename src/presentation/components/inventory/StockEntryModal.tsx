import React, { useState, useEffect, useRef } from 'react';
import { X, ScanBarcode, Save, Package, Calendar, AlertTriangle, CheckCircle2, Camera, Receipt, Truck } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { toast } from 'sonner';
import CameraScanner from '../ui/CameraScanner';

import { useQueryClient } from '@tanstack/react-query';


interface StockEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialProduct?: InventoryBatch | null;
}

const StockEntryModal: React.FC<StockEntryModalProps> = ({ isOpen, onClose, initialProduct }) => {
    const queryClient = useQueryClient();
    const {
        inventory,
        updateStock,
        addNewProduct,
        currentLocationId,
        currentWarehouseId,
        user,
        locations,
        fetchLocations,
        suppliers
    } = usePharmaStore();
    const { isOnline } = useNetworkStatus();
    const [activeTab, setActiveTab] = useState<'SCAN' | 'CREATE'>('SCAN');
    const [step, setStep] = useState<'SCAN' | 'DETAILS' | 'NEW_PRODUCT'>('SCAN');
    const [scannedSku, setScannedSku] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<InventoryBatch | null>(null);

    // Agile Fields
    const [lot, setLot] = useState('');
    const [expiry, setExpiry] = useState('');
    const [quantity, setQuantity] = useState('');

    // Enhanced Batch Fields
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceDate, setInvoiceDate] = useState('');
    const [supplierId, setSupplierId] = useState('');

    // New Product Fields - Comprehensive State
    const [newProductData, setNewProductData] = useState<Partial<InventoryBatch>>({
        condition: 'VD',
        category: 'MEDICAMENTO',
        stock_min: 5,
        stock_max: 100,
        is_bioequivalent: false,
        format: 'Comprimidos',
        unit_format_string: 'Unidad'
    });

    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const scanInputRef = useRef<HTMLInputElement>(null);
    const lotInputRef = useRef<HTMLInputElement>(null);
    const expiryInputRef = useRef<HTMLInputElement>(null);
    const qtyInputRef = useRef<HTMLInputElement>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            resetFlow();
            if (initialProduct) {
                setSelectedProduct(initialProduct);
                setStep('DETAILS');
                setTimeout(() => lotInputRef.current?.focus(), 100);
            }
            if (locations.length === 0) {
                fetchLocations();
            }
        }
    }, [isOpen, locations.length, fetchLocations, initialProduct]);


    const handleCameraScan = (decodedText: string) => {
        setScannedSku(decodedText);
        const product = inventory.find(p => p.sku === decodedText);
        if (product) {
            setSelectedProduct(product);
            setStep('DETAILS');
            setTimeout(() => lotInputRef.current?.focus(), 100);
            toast.success('Producto Identificado');
        } else {
            setNewProductData(prev => ({ ...prev, sku: decodedText }));
            setStep('NEW_PRODUCT');
            toast.info('Producto Nuevo Detectado');
        }
        setIsScannerOpen(false);
    };

    const resetFlow = () => {
        setStep('SCAN');
        setScannedSku('');
        setSelectedProduct(null);
        setLot('');
        setExpiry('');
        setQuantity('');
        setInvoiceNumber('');
        setInvoiceDate('');
        setSupplierId('');

        setNewProductData({
            condition: 'VD',
            category: 'MEDICAMENTO',
            stock_min: 5,
            stock_max: 100,
            is_bioequivalent: false,
            format: 'Comprimidos',
            unit_format_string: 'Unidad',
            location_id: currentLocationId || ''
        });
        if (activeTab === 'SCAN') {
            setTimeout(() => scanInputRef.current?.focus(), 100);
        }
    };

    const handleScan = (e: React.FormEvent) => {
        e.preventDefault();
        if (!scannedSku) return;

        const product = inventory.find(p => p.sku === scannedSku);
        if (product) {
            setSelectedProduct(product);
            setStep('DETAILS');
            setTimeout(() => lotInputRef.current?.focus(), 100);
            toast.success('Producto Identificado');
        } else {
            setNewProductData(prev => ({ ...prev, sku: scannedSku }));
            setStep('NEW_PRODUCT');
            toast.info('Producto Nuevo Detectado');
        }
    };

    const handleQuickSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct || !quantity) return;
        if (isSubmitting) return;

        setIsSubmitting(true);

        try {
            // Parse Expiry (MM/YYYY -> Date Object)
            let expiryDate: Date | undefined = undefined;
            const cleanExpiry = expiry.replace(/\//g, '');
            if (cleanExpiry.length === 6) {
                const month = parseInt(cleanExpiry.substring(0, 2)) - 1;
                const year = parseInt(cleanExpiry.substring(2, 6));
                const lastDay = new Date(year, month + 1, 0).getDate();
                expiryDate = new Date(year, month, lastDay);
            }

            // Parse Invoice Date (YYYY-MM-DD -> Date Object)
            let parsedInvoiceDate: Date | undefined = undefined;
            if (invoiceDate) {
                parsedInvoiceDate = new Date(invoiceDate);
            }

            const { createBatchSecure } = await import('../../../actions/inventory-v2');

            const result = await createBatchSecure({
                productId: selectedProduct.id,
                sku: selectedProduct.sku,
                name: selectedProduct.name,
                locationId: currentLocationId || (locations[0]?.id) || 'BODEGA_CENTRAL',
                quantity: parseInt(quantity),
                expiryDate: expiryDate,
                lotNumber: lot || undefined,
                unitCost: selectedProduct.cost_net, // Maintain current cost/price
                salePrice: selectedProduct.price_sell_box,
                userId: user?.id || '00000000-0000-0000-0000-000000000000',
                supplierId: supplierId || undefined,
                invoiceNumber: invoiceNumber || undefined,
                invoiceDate: parsedInvoiceDate
            });

            if (result.success) {
                toast.success(`Ingresadas ${quantity} un. de ${selectedProduct.name}`);
                await queryClient.invalidateQueries({ queryKey: ['inventory', currentLocationId] });
                resetFlow();
            } else {
                toast.error('Error al ingresar stock: ' + result.error);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error inesperado al ingresar stock');
        } finally {
            setIsSubmitting(false);
        }
    };

    const calculateMargin = () => {
        const cost = Number(newProductData.cost_net) || 0;
        const price = Number(newProductData.price_sell_box) || 0;
        if (price === 0) return 0;
        return Math.round(((price - cost) / price) * 100);
    };

    const handleNewProductSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        // Validate mandatory fields
        if (!newProductData.name || !newProductData.dci || !newProductData.isp_register) {
            toast.error('Faltan campos obligatorios (Nombre, DCI, Registro ISP)');
            return;
        }

        if (newProductData.name.length > 200) {
            toast.error('El nombre es muy largo (máx 200 caracteres)');
            return;
        }

        if (scannedSku && scannedSku.length > 50) {
            toast.error('El SKU es muy largo (máx 50 caracteres)');
            return;
        }

        setIsSubmitting(true);
        try {

            // Parse Expiry for Initial Lot (MM/YYYY format like "08/2026")
            let expiryTimestamp = Date.now() + 31536000000; // Default +1 year
            const cleanExpiry = expiry.replace(/\//g, ''); // Remove slash
            if (cleanExpiry.length === 6) {
                const month = parseInt(cleanExpiry.substring(0, 2)) - 1; // Month (0-indexed)
                const year = parseInt(cleanExpiry.substring(2, 6)); // Full year (2026)
                // Set to last day of the month
                const lastDay = new Date(year, month + 1, 0).getDate();
                expiryTimestamp = new Date(year, month, lastDay).getTime();
            }

            const effectiveSku = (scannedSku || newProductData.sku || '').trim();

            const selectedLocationId =
                newProductData.location_id ||
                currentLocationId ||
                currentWarehouseId ||
                (locations.length > 0 ? locations[0].id : 'BODEGA_CENTRAL');

            // Use Nil UUID if user is missing to pass Zod validation, but audit will show unknown
            const validUserId = user?.id || '00000000-0000-0000-0000-000000000000';

            const newProduct: InventoryBatch = {
                id: `BATCH-${Date.now()}`,
                sku: effectiveSku,
                name: newProductData.name!,
                dci: newProductData.dci!,
                laboratory: newProductData.laboratory || 'GENERICO',
                isp_register: newProductData.isp_register!,
                format: newProductData.format || 'Comprimido',
                units_per_box: Number(newProductData.units_per_package) || 1,
                is_bioequivalent: newProductData.is_bioequivalent || false,

                // Legacy / Aliases
                active_ingredient: newProductData.dci!,
                unit_format_string: newProductData.unit_format_string || 'Unidad',
                units_per_package: Number(newProductData.units_per_package) || 1,
                bioequivalent: newProductData.is_bioequivalent || false,
                bioequivalent_status: newProductData.is_bioequivalent ? 'BIOEQUIVALENTE' : 'NO_BIOEQUIVALENTE',

                // Financials
                price: Number(newProductData.price_sell_box) || 0,
                cost_price: Number(newProductData.cost_net) || 0,
                cost_net: Number(newProductData.cost_net) || 0,
                tax_percent: 19,
                price_sell_box: Number(newProductData.price_sell_box) || 0,
                price_sell_unit: Number(newProductData.price_sell_unit) || 0,

                // Logistics & Stock
                stock_actual: Number(quantity) || 0, // Initial Stock
                stock_min: Number(newProductData.stock_min) || 5,
                stock_max: Number(newProductData.stock_max) || 100,
                expiry_date: expiryTimestamp,
                lot_number: lot || 'S/L', // Initial Lot

                location_id: selectedLocationId,
                aisle: newProductData.aisle || '',

                condition: (newProductData.condition as any) || 'VD',
                category: newProductData.category || 'MEDICAMENTO',
                allows_commission: false,
                active_ingredients: [newProductData.dci!],
                is_generic: false,
                concentration: newProductData.concentration || '',
                unit_count: Number(newProductData.units_per_package) || 1,
            };

            const payload = {
                sku: newProduct.sku,
                name: newProduct.name,
                dci: newProduct.dci || newProductData.dci,
                laboratory: newProduct.laboratory || newProductData.laboratory,
                isp_register: newProduct.isp_register || newProductData.isp_register,
                format: newProduct.format || newProductData.format,
                units_per_box: Number(newProduct.units_per_box) || Number(newProductData.units_per_package) || 1,
                is_bioequivalent: newProduct.is_bioequivalent || newProductData.is_bioequivalent || false,
                condicion_venta: (newProduct.condition || newProductData.condition || 'VD') as 'VD' | 'R' | 'RR' | 'RCH',
                description: '',
                price: Number(newProduct.price_sell_box) || 0,
                priceCost: Number(newProduct.cost_net) || 0,
                minStock: Number(newProduct.stock_min) || 0,
                maxStock: Number(newProduct.stock_max) || 0,
                requiresPrescription: false,
                isColdChain: false,
                userId: validUserId,
                initialStock: Number(newProduct.stock_actual) || 0,
                initialLot: lot || newProduct.lot_number || 'S/L',
                initialExpiry: expiryTimestamp ? new Date(expiryTimestamp) : new Date(newProduct.expiry_date),
                initialLocation: newProduct.location_id
            };

            if (!isOnline) {
                addNewProduct(newProduct);
                import('../../../lib/store/outboxStore').then(({ useOutboxStore }) => {
                    useOutboxStore.getState().addToOutbox('PRODUCT_CREATE', payload);
                });
                toast.warning('Producto guardado localmente (sin conexión)');
                resetFlow();
                return;
            }

            const { createProductSecure } = await import('../../../actions/products-v2');
            const result = await createProductSecure(payload as any);
            if (result.success) {
                toast.success('Producto guardado correctamente');
                await queryClient.invalidateQueries({ queryKey: ['inventory', currentLocationId] });
                resetFlow();
            } else {
                toast.error('Error al guardar producto: ' + (result as any).error);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error inesperado al crear producto');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                    <div className="flex items-center gap-3">
                        <Package className="text-cyan-400" size={28} />
                        <div>
                            <h2 className="text-xl font-bold">Ingreso Rápido de Stock</h2>
                            <p className="text-slate-400 text-sm">WMS Ágil - Bodega Central</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100">
                    <button
                        onClick={() => {
                            setActiveTab('SCAN');
                            if (step === 'NEW_PRODUCT') {
                                setStep('SCAN');
                                setScannedSku('');
                            }
                            // If in DETAILS, stay in DETAILS
                        }}
                        className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'SCAN' ? 'text-cyan-600 border-b-2 border-cyan-600 bg-cyan-50' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        Escaneo Rápido (Stock)
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab('CREATE');
                            setStep('NEW_PRODUCT');
                            // Preserve scanned SKU if we were scanning a new product
                            if (!newProductData.sku && scannedSku) {
                                setNewProductData(prev => ({ ...prev, sku: scannedSku }));
                            }
                        }}
                        className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'CREATE' ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        Crear Producto Maestro
                    </button>
                </div>
                {/* Content */}
                <div className="p-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    {step === 'SCAN' && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-24 h-24 bg-cyan-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <ScanBarcode className="text-cyan-500" size={48} />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 mb-2">Escanea un Producto</h3>
                            <p className="text-slate-500 mb-8 text-center max-w-xs">
                                Escanea el código de barras o escribe el SKU para identificar o crear un producto.
                            </p>

                            <form onSubmit={handleScan} className="w-full max-w-md relative">
                                <input
                                    ref={scanInputRef}
                                    type="text"
                                    className="w-full pl-6 pr-12 py-4 text-xl font-mono bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-cyan-500 focus:outline-none transition-all text-center uppercase"
                                    placeholder="EAN / SKU..."
                                    value={scannedSku}
                                    onChange={e => setScannedSku(e.target.value.toUpperCase())}
                                />
                                <button
                                    type="submit"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 transition"
                                >
                                    <ScanBarcode size={20} />
                                </button>
                            </form>

                            <button
                                onClick={() => setIsScannerOpen(true)}
                                className="mt-6 md:hidden flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full font-bold shadow-lg active:scale-95 transition-transform"
                            >
                                <Camera size={20} />
                                Escanear con Cámara
                            </button>
                        </div>
                    )}

                    {isScannerOpen && (
                        <CameraScanner
                            onScan={handleCameraScan}
                            onClose={() => setIsScannerOpen(false)}
                        />
                    )}

                    {step === 'DETAILS' && selectedProduct && (
                        <div className="space-y-6">
                            <div className="bg-cyan-50 p-4 rounded-2xl border border-cyan-100 flex gap-4 items-center">
                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                    <Package className="text-cyan-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg">{selectedProduct.name}</h3>
                                    <p className="text-slate-500 text-sm font-mono">{selectedProduct.sku}</p>
                                </div>
                            </div>

                            <form onSubmit={handleQuickSave} className="grid grid-cols-2 gap-4">

                                {/* New Fields: Supplier & Invoice */}
                                <div className="col-span-2 grid grid-cols-12 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <div className="col-span-12 md:col-span-6">
                                        <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                                            <Truck size={14} className="text-cyan-600" /> Proveedor
                                        </label>
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                            value={supplierId}
                                            onChange={e => setSupplierId(e.target.value)}
                                        >
                                            <option value="">-- Sin Proveedor --</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>{s.name || s.business_name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="col-span-6 md:col-span-3">
                                        <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                                            <Receipt size={14} className="text-cyan-600" /> N° Factura
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={invoiceNumber}
                                            onChange={e => setInvoiceNumber(e.target.value)}
                                            placeholder="Opcional"
                                        />
                                    </div>

                                    <div className="col-span-6 md:col-span-3">
                                        <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                                            <Calendar size={14} className="text-cyan-600" /> Fecha Doc.
                                        </label>
                                        <input
                                            type="date"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={invoiceDate}
                                            onChange={e => setInvoiceDate(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Cantidad a Ingresar</label>
                                    <input
                                        ref={qtyInputRef}
                                        type="number"
                                        className="w-full p-4 text-2xl font-bold text-center border-2 border-slate-200 rounded-xl focus:border-cyan-500 outline-none"
                                        value={quantity}
                                        onChange={e => setQuantity(e.target.value)}
                                        placeholder="0"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">N° Lote (Opcional)</label>
                                    <input
                                        ref={lotInputRef}
                                        type="text"
                                        className="w-full p-3 border border-slate-200 rounded-xl"
                                        value={lot}
                                        onChange={e => setLot(e.target.value)}
                                        placeholder="LOTE-001"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Vencimiento (MM/AAAA)</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border border-slate-200 rounded-xl font-mono"
                                        value={expiry}
                                        onChange={e => {
                                            let value = e.target.value.replace(/\D/g, '');
                                            if (value.length >= 2) {
                                                value = value.slice(0, 2) + '/' + value.slice(2, 6);
                                            }
                                            setExpiry(value);
                                        }}
                                        placeholder="08/2026"
                                        maxLength={7}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="col-span-2 py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition flex items-center justify-center gap-2 mt-4"
                                >
                                    <Save size={20} /> Confirmar Ingreso
                                </button>
                            </form>
                        </div>
                    )}

                    {step === 'NEW_PRODUCT' && (
                        <form onSubmit={handleNewProductSave} className="space-y-6">

                            {/* SECTION A: Identificación y Norma */}
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                                    A. Identificación y Norma
                                </h4>
                                <div className="grid grid-cols-12 gap-3">
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">SKU / Código Barra</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                className="w-full p-2 pl-8 border border-slate-200 rounded-lg font-mono text-sm uppercase focus:border-cyan-500 outline-none"
                                                value={scannedSku || ''}
                                                onChange={e => setScannedSku(e.target.value.toUpperCase())}
                                                placeholder="Generar Automático"
                                            />
                                            <ScanBarcode className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        </div>
                                    </div>
                                    <div className="col-span-8">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Comercial *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-2 border border-slate-200 rounded-lg font-bold text-slate-700 focus:border-cyan-500 outline-none uppercase"
                                            value={newProductData.name || ''}
                                            onChange={e => setNewProductData({ ...newProductData, name: e.target.value.toUpperCase() })}
                                            placeholder="Ej: PARACETAMOL 500MG"
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Registro ISP *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase"
                                            value={newProductData.isp_register || ''}
                                            onChange={e => setNewProductData({ ...newProductData, isp_register: e.target.value.toUpperCase() })}
                                            placeholder="F-1234/20"
                                        />
                                    </div>
                                    <div className="col-span-6">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Principio Activo (DCI) *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm uppercase"
                                            value={newProductData.dci || ''}
                                            onChange={e => setNewProductData({ ...newProductData, dci: e.target.value.toUpperCase() })}
                                            placeholder="PARACETAMOL"
                                        />
                                    </div>
                                    <div className="col-span-6">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Laboratorio</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm uppercase"
                                            value={newProductData.laboratory || ''}
                                            onChange={e => setNewProductData({ ...newProductData, laboratory: e.target.value.toUpperCase() })}
                                            placeholder="MINTLAB"
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Formato</label>
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                            value={newProductData.format || 'Comprimidos'}
                                            onChange={e => setNewProductData({ ...newProductData, format: e.target.value })}
                                        >
                                            <option value="Comprimidos">Comprimidos</option>
                                            <option value="Jarabe">Jarabe</option>
                                            <option value="Inyectable">Inyectable</option>
                                            <option value="Crema">Crema</option>
                                            <option value="Gotas">Gotas</option>
                                            <option value="Supositorios">Supositorios</option>
                                        </select>
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Condición Venta</label>
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white font-bold text-slate-700"
                                            value={newProductData.condition || 'VD'}
                                            onChange={e => setNewProductData({ ...newProductData, condition: e.target.value as any })}
                                        >
                                            <option value="VD">Venta Directa</option>
                                            <option value="R">Receta Simple</option>
                                            <option value="RR">Receta Retenida</option>
                                            <option value="RCH">Receta Cheque</option>
                                        </select>
                                    </div>
                                    <div className="col-span-4 flex items-center pt-5">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                                checked={newProductData.is_bioequivalent || false}
                                                onChange={e => setNewProductData({ ...newProductData, is_bioequivalent: e.target.checked })}
                                            />
                                            <span className="text-xs font-bold text-slate-600">Bioequivalente</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION B: Datos Financieros */}
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                    B. Datos Financieros
                                </h4>
                                <div className="grid grid-cols-12 gap-3">
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Costo Neto (Compra)</label>
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                            <input
                                                type="number"
                                                className="w-full pl-5 p-2 border border-slate-200 rounded-lg text-sm"
                                                value={newProductData.cost_net || ''}
                                                onChange={e => setNewProductData({ ...newProductData, cost_net: parseInt(e.target.value) || 0 })}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Precio Venta (Caja)</label>
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                            <input
                                                type="number"
                                                className="w-full pl-5 p-2 border border-slate-200 rounded-lg font-bold text-slate-800 text-sm"
                                                value={newProductData.price_sell_box || ''}
                                                onChange={e => {
                                                    const price = parseInt(e.target.value) || 0;
                                                    const units = newProductData.units_per_package || 1;
                                                    setNewProductData({
                                                        ...newProductData,
                                                        price_sell_box: price,
                                                        price_sell_unit: Math.round(price / units)
                                                    });
                                                }}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Unidades x Caja</label>
                                        <input
                                            type="number"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={newProductData.units_per_package || ''}
                                            onChange={e => {
                                                const units = parseInt(e.target.value) || 1;
                                                const price = newProductData.price_sell_box || 0;
                                                setNewProductData({
                                                    ...newProductData,
                                                    units_per_package: units,
                                                    price_sell_unit: Math.round(price / units)
                                                });
                                            }}
                                            placeholder="1"
                                        />
                                    </div>
                                    <div className="col-span-12 flex gap-4 mt-2">
                                        <div className="bg-white px-3 py-2 rounded-lg border border-slate-100 shadow-sm flex-1 flex justify-between items-center">
                                            <span className="text-xs text-slate-400 font-medium">Costo Unitario</span>
                                            <span className="text-sm font-mono font-bold text-slate-600">
                                                ${(newProductData.price_sell_unit || 0).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="bg-white px-3 py-2 rounded-lg border border-slate-100 shadow-sm flex-1 flex justify-between items-center">
                                            <span className="text-xs text-slate-400 font-medium">Margen Est.</span>
                                            <span className={`text-sm font-mono font-bold ${calculateMargin() >= 30 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {calculateMargin()}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION C: Logística y Ubicación */}
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                                    C. Logística y Ubicación
                                </h4>
                                <div className="grid grid-cols-12 gap-3">
                                    <div className="col-span-6">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                                        <input
                                            list="categories"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={newProductData.category || ''}
                                            onChange={e => setNewProductData({ ...newProductData, category: e.target.value })}
                                            placeholder="Seleccionar..."
                                        />
                                        <datalist id="categories">
                                            <option value="MEDICAMENTO" />
                                            <option value="INSUMO_MEDICO" />
                                            <option value="RETAIL_BELLEZA" />
                                            <option value="SUPLEMENTO" />
                                        </datalist>
                                    </div>
                                    <div className="col-span-6">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Ubicación (Sucursal) *</label>
                                        <select
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                                            value={newProductData.location_id || currentLocationId}
                                            onChange={e => setNewProductData({ ...newProductData, location_id: e.target.value })}
                                        >
                                            {locations.map(loc => (
                                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                                            ))}
                                            {locations.length === 0 && currentLocationId && (
                                                <option value={currentLocationId}>Sucursal actual</option>
                                            )}
                                            {locations.length === 0 && !currentLocationId && (
                                                <option value="BODEGA_CENTRAL">Bodega Central</option>
                                            )}
                                        </select>
                                    </div>
                                    <div className="col-span-6">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Pasillo / Estante</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={newProductData.aisle || ''}
                                            onChange={e => setNewProductData({ ...newProductData, aisle: e.target.value })}
                                            placeholder="Ej: Estante A1"
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Stock Mínimo</label>
                                        <input
                                            type="number"
                                            className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                            value={newProductData.stock_min || ''}
                                            onChange={e => setNewProductData({ ...newProductData, stock_min: parseInt(e.target.value) })}
                                            placeholder="5"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECTION D: Ingreso Primer Lote */}
                            <div className="bg-cyan-50 p-4 rounded-2xl border border-cyan-100">
                                <h4 className="text-xs font-bold text-cyan-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-cyan-600 rounded-full"></span>
                                    D. Ingreso Primer Lote (Stock Inicial)
                                </h4>
                                <div className="grid grid-cols-12 gap-3">
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-cyan-700 mb-1">N° Lote</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border border-cyan-200 rounded-lg text-sm bg-white"
                                            value={lot}
                                            onChange={e => setLot(e.target.value.toUpperCase())}
                                            placeholder="LOTE-001"
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-cyan-700 mb-1">Vencimiento (MM/AAAA)</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border border-cyan-200 rounded-lg text-sm bg-white font-mono"
                                            value={expiry}
                                            onChange={e => {
                                                let value = e.target.value.replace(/\D/g, '');
                                                if (value.length >= 2) {
                                                    value = value.slice(0, 2) + '/' + value.slice(2, 6);
                                                }
                                                setExpiry(value);
                                            }}
                                            placeholder="08/2026"
                                            maxLength={7}
                                        />
                                    </div>
                                    <div className="col-span-4">
                                        <label className="block text-xs font-bold text-cyan-700 mb-1">Cantidad Inicial</label>
                                        <input
                                            type="number"
                                            className="w-full p-2 border border-cyan-200 rounded-lg text-sm bg-white font-bold text-cyan-900"
                                            value={quantity}
                                            onChange={e => setQuantity(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition shadow-lg flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-50 cursor-wait' : ''}`}
                            >
                                <Save size={20} /> {isSubmitting ? 'Guardando...' : 'Crear Ficha e Ingresar Stock'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StockEntryModal;
