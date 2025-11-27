import React, { useState, useEffect, useRef } from 'react';
import { X, ScanBarcode, Save, Package, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';

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

    // New Product Fields
    const [newProductData, setNewProductData] = useState<Partial<InventoryBatch>>({});

    const scanInputRef = useRef<HTMLInputElement>(null);
    const lotInputRef = useRef<HTMLInputElement>(null);
    const expiryInputRef = useRef<HTMLInputElement>(null);
    const qtyInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            resetFlow();
        }
    }, [isOpen]);

    const resetFlow = () => {
        setStep('SCAN');
        setScannedSku('');
        setSelectedProduct(null);
        setLot('');
        setExpiry('');
        setQuantity('');
        setNewProductData({});
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
            setNewProductData({ sku: scannedSku });
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

    const handleNewProductSave = (e: React.FormEvent) => {
        e.preventDefault();
        // Validate mandatory fields
        if (!newProductData.name || !newProductData.dci || !newProductData.isp_register) {
            toast.error('Faltan campos obligatorios');
            return;
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
            is_bioequivalent: newProductData.bioequivalent || false,

            // Legacy / Aliases
            active_ingredient: newProductData.dci!,
            unit_format_string: newProductData.unit_format_string || 'Unidad',
            units_per_package: Number(newProductData.units_per_package) || 1,
            bioequivalent: newProductData.bioequivalent || false,
            bioequivalent_status: newProductData.bioequivalent ? 'BIOEQUIVALENTE' : 'NO_BIOEQUIVALENTE',

            price: Number(newProductData.price) || 0,
            cost_price: Number(newProductData.cost_price) || 0,

            // Advanced Financials
            cost_net: Number(newProductData.cost_price) || 0,
            tax_percent: 19,
            price_sell_box: Number(newProductData.price) || 0,
            price_sell_unit: Number(newProductData.price_sell_unit) || 0,

            stock_actual: Number(quantity) || 0,
            stock_min: 10,
            stock_max: 100,
            expiry_date: Date.now(), // Should parse expiry
            location_id: 'BODEGA_CENTRAL',
            condition: 'VD',
            category: newProductData.category || 'MEDICAMENTO',
            allows_commission: false,
            active_ingredients: [newProductData.dci!],
            is_generic: false,
            concentration: newProductData.concentration || '',
            unit_count: Number(newProductData.units_per_package) || 1,
            aisle: newProductData.aisle || '' // Added Location/Aisle
        };

        addNewProduct(newProduct);
        toast.success('Producto Creado e Ingresado');
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
                        </div>
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
                        <form onSubmit={handleNewProductSave} className="space-y-8">
                            {/* 1. Identificación & Ubicación */}
                            <section>
                                <h4 className="text-sm font-bold text-cyan-600 uppercase tracking-wider mb-4 border-b border-cyan-100 pb-2">
                                    1. Identificación y Ubicación
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Comercial *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-3 border border-slate-200 rounded-xl font-bold text-lg focus:border-cyan-500 outline-none"
                                            value={newProductData.name || ''}
                                            onChange={e => setNewProductData({ ...newProductData, name: e.target.value })}
                                            placeholder="Ej: PARACETAMOL 500MG"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                                        <input
                                            list="categories"
                                            className="w-full p-3 border border-slate-200 rounded-xl focus:border-cyan-500 outline-none"
                                            value={newProductData.category || ''}
                                            onChange={e => setNewProductData({ ...newProductData, category: e.target.value })}
                                            placeholder="Seleccionar o Escribir..."
                                        />
                                        <datalist id="categories">
                                            <option value="MEDICAMENTO" />
                                            <option value="INSUMO_MEDICO" />
                                            <option value="RETAIL_BELLEZA" />
                                            <option value="SUPLEMENTO" />
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Ubicación Física *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-3 border border-slate-200 rounded-xl focus:border-cyan-500 outline-none"
                                            value={newProductData.aisle || ''}
                                            onChange={e => setNewProductData({ ...newProductData, aisle: e.target.value })}
                                            placeholder="Ej: Estante A1 / Pasillo 3"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* 2. Datos Sanitarios */}
                            <section>
                                <h4 className="text-sm font-bold text-cyan-600 uppercase tracking-wider mb-4 border-b border-cyan-100 pb-2">
                                    2. Datos Sanitarios (Seremi)
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Principio Activo (DCI) *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-3 border border-slate-200 rounded-xl focus:border-cyan-500 outline-none"
                                            value={newProductData.dci || ''}
                                            onChange={e => setNewProductData({ ...newProductData, dci: e.target.value })}
                                            placeholder="Ej: PARACETAMOL"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Laboratorio</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-slate-200 rounded-xl"
                                            value={newProductData.laboratory || ''}
                                            onChange={e => setNewProductData({ ...newProductData, laboratory: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Registro ISP *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-3 border border-slate-200 rounded-xl font-mono"
                                            value={newProductData.isp_register || ''}
                                            onChange={e => setNewProductData({ ...newProductData, isp_register: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* 3. Precios y Costos */}
                            <section>
                                <h4 className="text-sm font-bold text-cyan-600 uppercase tracking-wider mb-4 border-b border-cyan-100 pb-2">
                                    3. Estructura de Precios
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Precio Venta (Caja)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                            <input
                                                type="number"
                                                className="w-full pl-6 p-3 border border-slate-200 rounded-xl font-bold text-lg"
                                                value={newProductData.price || ''}
                                                onChange={e => {
                                                    const price = parseInt(e.target.value) || 0;
                                                    const units = newProductData.units_per_package || 1;
                                                    setNewProductData({
                                                        ...newProductData,
                                                        price,
                                                        price_sell_box: price,
                                                        price_sell_unit: Math.round(price / units)
                                                    });
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Unidades por Caja</label>
                                        <input
                                            type="number"
                                            className="w-full p-3 border border-slate-200 rounded-xl"
                                            value={newProductData.units_per_package || ''}
                                            onChange={e => {
                                                const units = parseInt(e.target.value) || 1;
                                                const price = newProductData.price || 0;
                                                setNewProductData({
                                                    ...newProductData,
                                                    units_per_package: units,
                                                    price_sell_unit: Math.round(price / units)
                                                });
                                            }}
                                            placeholder="1"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <div className="p-3 bg-slate-100 rounded-xl flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-500">Costo Unitario Calculado:</span>
                                            <span className="font-mono font-bold text-slate-700">
                                                ${(newProductData.price_sell_unit || 0).toLocaleString()} c/u
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* 4. Lote Inicial */}
                            <section>
                                <h4 className="text-sm font-bold text-cyan-600 uppercase tracking-wider mb-4 border-b border-cyan-100 pb-2">
                                    4. Lote Inicial (Opcional)
                                </h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">N° Lote</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-slate-200 rounded-xl"
                                            value={lot}
                                            onChange={e => setLot(e.target.value)}
                                            placeholder="LOTE-001"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Vencimiento</label>
                                        <input
                                            type="text"
                                            className="w-full p-3 border border-slate-200 rounded-xl"
                                            value={expiry}
                                            onChange={e => setExpiry(e.target.value)}
                                            placeholder="DDMMAA"
                                            maxLength={6}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Stock Inicial</label>
                                        <input
                                            type="number"
                                            className="w-full p-3 border border-slate-200 rounded-xl font-bold"
                                            value={quantity}
                                            onChange={e => setQuantity(e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </section>

                            <button
                                type="submit"
                                className="w-full py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 flex items-center justify-center gap-2"
                            >
                                <Save size={20} /> Crear Producto Maestro
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StockEntryModal;
