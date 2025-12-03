import React, { useState, useEffect, useRef } from 'react';
import { X, ScanBarcode, Save, Package, Calendar, AlertTriangle, CheckCircle2, Camera } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';
import CameraScanner from '../ui/CameraScanner';

interface StockEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const StockEntryModal: React.FC<StockEntryModalProps> = ({ isOpen, onClose }) => {
    const { inventory, updateStock, addNewProduct } = usePharmaStore();
    const [activeTab, setActiveTab] = useState<'SCAN' | 'CREATE'>('SCAN');
    const [step, setStep] = useState<'SCAN' | 'DETAILS' | 'NEW_PRODUCT'>('SCAN');
    const [scannedSku, setScannedSku] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<InventoryBatch | null>(null);

    // Agile Fields
    const [lot, setLot] = useState('');
    const [expiry, setExpiry] = useState('');
    const [quantity, setQuantity] = useState('');

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

    useEffect(() => {
        if (isOpen) {
            resetFlow();
        }
    }, [isOpen]);

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
        setNewProductData({
            condition: 'VD',
            category: 'MEDICAMENTO',
            stock_min: 5,
            stock_max: 100,
            is_bioequivalent: false,
            format: 'Comprimidos',
            unit_format_string: 'Unidad'
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

    const handleQuickSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct || !quantity) return;

        // Parse Expiry (DDMMAA -> Timestamp)
        let expiryTimestamp = Date.now();
        if (expiry.length === 6) {
            const day = parseInt(expiry.substring(0, 2));
            const month = parseInt(expiry.substring(2, 4)) - 1;
            const year = 2000 + parseInt(expiry.substring(4, 6));
            expiryTimestamp = new Date(year, month, day).getTime();
        }

        // Update Stock (In a real app, this would create a batch entry)
        updateStock(selectedProduct.id, parseInt(quantity));

        toast.success(`Ingresadas ${quantity} un. de ${selectedProduct.name}`);
        resetFlow();
    };

    const calculateMargin = () => {
        const cost = Number(newProductData.cost_net) || 0;
        const price = Number(newProductData.price_sell_box) || 0;
        if (price === 0) return 0;
        return Math.round(((price - cost) / price) * 100);
    };

    const handleNewProductSave = (e: React.FormEvent) => {
        e.preventDefault();
        // Validate mandatory fields
        if (!newProductData.name || !newProductData.dci || !newProductData.isp_register) {
            toast.error('Faltan campos obligatorios (Nombre, DCI, Registro ISP)');
            return;
        }

        // Parse Expiry for Initial Lot
        let expiryTimestamp = Date.now() + 31536000000; // Default +1 year
        if (expiry.length === 6) {
            const day = parseInt(expiry.substring(0, 2));
            const month = parseInt(expiry.substring(2, 4)) - 1;
            const year = 2000 + parseInt(expiry.substring(4, 6));
            expiryTimestamp = new Date(year, month, day).getTime();
        }

        const newProduct: InventoryBatch = {
            id: `BATCH-${Date.now()}`,
            sku: scannedSku,
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

            location_id: 'BODEGA_CENTRAL', // Default
            aisle: newProductData.aisle || '',

            condition: (newProductData.condition as any) || 'VD',
            category: newProductData.category || 'MEDICAMENTO',
            allows_commission: false,
            active_ingredients: [newProductData.dci!],
            is_generic: false,
            concentration: newProductData.concentration || '',
            unit_count: Number(newProductData.units_per_package) || 1,
        };

        addNewProduct(newProduct);
        toast.success('Producto Maestro Creado y Stock Inicial Ingresado');
        resetFlow();
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
                        onClick={() => { setActiveTab('SCAN'); resetFlow(); }}
                        className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'SCAN' ? 'text-cyan-600 border-b-2 border-cyan-600 bg-cyan-50' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        Escaneo Rápido (Stock)
                    </button>
                    <button
                        onClick={() => { setActiveTab('CREATE'); setStep('NEW_PRODUCT'); }}
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
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Vencimiento (DDMMAA)</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border border-slate-200 rounded-xl font-mono"
                                        value={expiry}
                                        onChange={e => setExpiry(e.target.value)}
                                        placeholder="311225"
                                        maxLength={6}
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
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Ubicación Física *</label>
                                        <input
                                            type="text"
                                            required
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
                                        <label className="block text-xs font-bold text-cyan-700 mb-1">Vencimiento</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border border-cyan-200 rounded-lg text-sm bg-white font-mono"
                                            value={expiry}
                                            onChange={e => setExpiry(e.target.value)}
                                            placeholder="DDMMAA"
                                            maxLength={6}
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
                                className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition shadow-lg flex items-center justify-center gap-2"
                            >
                                <Save size={20} /> Crear Ficha e Ingresar Stock
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StockEntryModal;
