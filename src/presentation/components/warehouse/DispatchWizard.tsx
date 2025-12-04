import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Truck, MapPin, Package, CheckCircle, ArrowRight, Search, Barcode, ShoppingCart, RotateCcw, Camera, PlusCircle } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { useLocationStore } from '../../store/useLocationStore';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { toast } from 'sonner';
import { Shipment, PurchaseOrder, InventoryBatch } from '../../../domain/types';
import CameraScanner from '../ui/CameraScanner';

interface DispatchWizardProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'DISPATCH' | 'RETURN' | 'PURCHASE';
}

const DispatchWizard: React.FC<DispatchWizardProps> = ({ isOpen, onClose, mode = 'DISPATCH' }) => {
    const { inventory, createDispatch, addPurchaseOrder, user, suppliers } = usePharmaStore();
    const { currentLocation } = useLocationStore();

    // Step 1: Route
    const [originId, setOriginId] = useState(() => {
        if (mode === 'PURCHASE') return '';
        return currentLocation?.id || 'BODEGA_CENTRAL';
    });
    const [destinationId, setDestinationId] = useState(() => {
        if (mode === 'PURCHASE') return currentLocation?.id || 'BODEGA_CENTRAL';
        return '';
    });

    // Step 2: Picking
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItems, setSelectedItems] = useState<{ batchId: string; sku: string; name: string; quantity: number; max: number; expiry?: number; lot?: string }[]>([]);

    // Step 3: Transport
    const [transportData, setTransportData] = useState({
        carrier: 'STARKEN',
        tracking_number: '',
        driver_name: '',
        package_count: 1
    });

    const [step, setStep] = useState(1);
    const scannerInputRef = useRef<HTMLInputElement>(null);
    const [now] = useState(() => Date.now()); // Stable reference for render
    const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

    // Initial State Setup (Handled by Remounting)
    useEffect(() => {
        console.log("WMS Inventory Count:", inventory.length); // Debug log
        // Focus scanner on mount
        if (isOpen) {
            setTimeout(() => scannerInputRef.current?.focus(), 100);
        }
    }, [isOpen, inventory]);

    // Filter Inventory
    const originInventory = useMemo(() => {
        if (mode === 'PURCHASE') {
            const uniqueProducts = new Map<string, InventoryBatch>();
            inventory.forEach(item => {
                if (!uniqueProducts.has(item.sku)) {
                    uniqueProducts.set(item.sku, item);
                }
            });
            return Array.from(uniqueProducts.values());
        }
        // GLOBAL INVENTORY ACCESS: We load everything to allow finding products anywhere
        // We filter by originId ONLY for stock validation, not for visibility
        return inventory;
    }, [inventory, mode]);

    // Sound Effect
    const playBeep = () => {
        const audio = new Audio('/sounds/beep.mp3');
        audio.play().catch(() => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = ctx.createOscillator();
                osc.connect(ctx.destination);
                osc.frequency.value = 1000;
                osc.start();
                setTimeout(() => osc.stop(), 100);
            } catch (e) {
                console.error("Audio not supported", e);
            }
        });
    };

    const handleScan = (code: string) => {
        // Find product globally
        const matchingBatches = originInventory.filter(i => i.sku === code || i.id === code);

        if (matchingBatches.length > 0) {
            // Prioritize batch in current location if exists, otherwise pick any to show product info
            const bestBatch = matchingBatches.find(b => b.location_id === originId) || matchingBatches[0];

            // Calculate stock specifically for the origin location
            const stockInOrigin = matchingBatches
                .filter(b => b.location_id === originId)
                .reduce((sum, b) => sum + b.stock_actual, 0);

            const existing = selectedItems.find(i => i.sku === bestBatch.sku);

            if (existing) {
                if (mode === 'PURCHASE' || existing.quantity < stockInOrigin) {
                    handleUpdateQuantity(existing.batchId, existing.quantity + 1);
                    playBeep();
                    toast.success(`+1 ${bestBatch.name}`);
                } else {
                    toast.error(`Stock insuficiente en origen (Max: ${stockInOrigin})`);
                }
            } else {
                if (mode === 'PURCHASE' || stockInOrigin > 0) {
                    handleAddItem(bestBatch, stockInOrigin); // Pass calculated stock
                    playBeep();
                    toast.success(`Agregado: ${bestBatch.name}`);
                } else {
                    toast.error(`Producto sin stock en ${originId}`);
                }
            }
        } else {
            toast.error(`Producto no encontrado: ${code}`);
        }
    };

    // ... (Scanner hook remains same)

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return [];

        console.log("🔍 WMS Search - Term:", searchTerm, "| Inventory items:", inventory.length);

        // Search in GLOBAL inventory (all locations)
        const matches = inventory.filter(item =>
            (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.dci || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.lot_number || '').toLowerCase().includes(searchTerm.toLowerCase())
        );

        console.log("📦 WMS Search - Matches found:", matches.length);

        // Group by SKU and show all locations with stock
        const productMap = new Map<string, {
            sku: string;
            name: string;
            dci?: string;
            locations: Array<{
                location_id: string;
                stock: number;
                batchId: string;
                lot_number?: string;
                expiry_date?: number;
            }>;
            totalStock: number;
        }>();

        matches.forEach(item => {
            if (!productMap.has(item.sku)) {
                productMap.set(item.sku, {
                    sku: item.sku,
                    name: item.name,
                    dci: item.dci,
                    locations: [],
                    totalStock: 0
                });
            }

            const product = productMap.get(item.sku)!;
            product.locations.push({
                location_id: item.location_id,
                stock: item.stock_actual,
                batchId: item.id,
                lot_number: item.lot_number,
                expiry_date: item.expiry_date
            });
            product.totalStock += item.stock_actual;
        });

        return Array.from(productMap.values()).slice(0, 10);
    }, [inventory, searchTerm]);

    const handleAddItem = (item: InventoryBatch, knownStock?: number) => {
        if (selectedItems.find(i => i.sku === item.sku)) return; // Check by SKU to avoid duplicates

        // If stock not passed, calculate it
        const stockInOrigin = knownStock ?? originInventory
            .filter(b => b.sku === item.sku && b.location_id === originId)
            .reduce((sum, b) => sum + b.stock_actual, 0);

        setSelectedItems([...selectedItems, {
            batchId: item.id,
            sku: item.sku,
            name: item.name,
            quantity: 1,
            max: mode === 'PURCHASE' ? 9999 : stockInOrigin,
            expiry: item.expiry_date,
            lot: item.lot_number
        }]);
        setSearchTerm('');
    };

    const handleUpdateQuantity = (batchId: string, qty: number) => {
        setSelectedItems(items => items.map(i => {
            if (i.batchId === batchId) {
                if (mode !== 'PURCHASE' && qty > i.max) {
                    toast.error(`Stock insuficiente (Max: ${i.max})`);
                    return i;
                }
                return { ...i, quantity: Math.min(Math.max(1, qty), i.max) };
            }
            return i;
        }));
    };

    const handleRemoveItem = (batchId: string) => {
        setSelectedItems(items => items.filter(i => i.batchId !== batchId));
    };

    const handleSubmit = () => {
        if (!destinationId && mode !== 'PURCHASE') {
            toast.error('Selecciona un destino');
            return;
        }
        if (!originId && mode === 'PURCHASE') {
            toast.error('Selecciona un proveedor');
            return;
        }
        if (selectedItems.length === 0) {
            toast.error('Agrega al menos un producto');
            return;
        }

        if (mode === 'PURCHASE') {
            const newPO: PurchaseOrder = {
                id: `PO-${Date.now()}`,
                supplier_id: originId,
                created_at: Date.now(),
                status: 'SENT',
                items: selectedItems.map(i => ({
                    sku: i.sku,
                    name: i.name,
                    quantity: i.quantity,
                    cost_price: 0 // TODO: Fetch real cost
                })),
                total_estimated: 0
            };
            addPurchaseOrder(newPO);
            toast.success('Pedido a Proveedor creado exitosamente');
        } else {
            if (!transportData.tracking_number) {
                toast.error('Ingresa el número de seguimiento (OT)');
                return;
            }

            const shipmentData: Omit<Shipment, 'id' | 'status' | 'created_at' | 'updated_at'> = {
                type: mode === 'RETURN' ? 'RETURN' : 'INTERNAL_TRANSFER',
                origin_location_id: originId,
                destination_location_id: destinationId,
                transport_data: transportData,
                documentation: { evidence_photos: [] },
                items: selectedItems.map(i => ({
                    batchId: i.batchId,
                    sku: i.sku,
                    name: i.name,
                    quantity: i.quantity,
                    condition: 'GOOD'
                })),
                valuation: selectedItems.reduce((sum, i) => {
                    const item = originInventory.find(inv => inv.id === i.batchId);
                    return sum + (item?.cost_net || 0) * i.quantity;
                }, 0)
            };

            createDispatch(shipmentData);
            toast.success(mode === 'RETURN' ? 'Devolución creada exitosamente' : 'Despacho creado exitosamente');
        }

        onClose();
    };

    if (!isOpen) return null;

    const getModeColor = () => {
        if (mode === 'RETURN') return 'amber';
        if (mode === 'PURCHASE') return 'purple';
        return 'blue';
    };

    const color = getModeColor();

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
                <div className={`p-6 border-b border-gray-100 flex justify-between items-center rounded-t-2xl bg-${color}-50`}>
                    <div>
                        <h2 className={`text-xl font-bold text-gray-800 flex items-center gap-2`}>
                            {mode === 'RETURN' ? <RotateCcw className={`text-${color}-600`} /> :
                                mode === 'PURCHASE' ? <ShoppingCart className={`text-${color}-600`} /> :
                                    <Truck className={`text-${color}-600`} />}
                            {mode === 'RETURN' ? 'Nueva Devolución' :
                                mode === 'PURCHASE' ? 'Nuevo Pedido Express' :
                                    'Nuevo Despacho'}
                        </h2>
                        <p className="text-sm text-gray-500">
                            {mode === 'RETURN' ? 'Gestión de Logística Inversa' :
                                mode === 'PURCHASE' ? 'Creación rápida de orden de compra' :
                                    'Asistente de creación de envíos'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex justify-between px-12 py-4 border-b border-gray-100 bg-white">
                    {[
                        { num: 1, label: mode === 'PURCHASE' ? 'Proveedor' : 'Ruta', icon: MapPin },
                        { num: 2, label: 'Selección', icon: Package },
                        { num: 3, label: mode === 'PURCHASE' ? 'Detalles' : 'Transporte', icon: Truck },
                        { num: 4, label: 'Confirmar', icon: CheckCircle }
                    ].map((s) => (
                        <div key={s.num} className={`flex flex-col items-center gap-2 ${step >= s.num ? `text-${color}-600` : 'text-gray-300'}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step >= s.num ? `bg-${color}-100 ring-4 ring-${color}-50` : 'bg-gray-100'
                                }`}>
                                <s.icon size={18} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider">{s.label}</span>
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
                    {step === 1 && (
                        <div className="max-w-xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <label className="block text-sm font-bold text-gray-700 mb-2">{mode === 'PURCHASE' ? 'Proveedor' : 'Origen'}</label>
                                {mode === 'PURCHASE' ? (
                                    <select
                                        value={originId}
                                        onChange={(e) => setOriginId(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium"
                                    >
                                        <option value="">Seleccionar Proveedor...</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.fantasy_name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <select
                                        value={originId}
                                        onChange={(e) => setOriginId(e.target.value)}
                                        disabled={user?.role !== 'MANAGER'}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-gray-50 font-medium"
                                    >
                                        <option value="BODEGA_CENTRAL">BODEGA_CENTRAL</option>
                                        <option value="SUCURSAL_CENTRO">SUCURSAL_CENTRO</option>
                                        <option value="SUCURSAL_NORTE">SUCURSAL_NORTE</option>
                                    </select>
                                )}
                            </div>

                            <div className="flex justify-center">
                                <div className={`bg-${color}-100 text-${color}-600 p-2 rounded-full`}>
                                    <ArrowRight size={24} className="rotate-90" />
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <label className="block text-sm font-bold text-gray-700 mb-2">{mode === 'PURCHASE' ? 'Destino (Recepción)' : 'Destino'}</label>
                                <select
                                    value={destinationId}
                                    onChange={(e) => setDestinationId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 font-medium"
                                >
                                    <option value="">Seleccionar Destino...</option>
                                    {mode === 'RETURN' ? (
                                        <>
                                            <option value="BODEGA_CENTRAL">BODEGA_CENTRAL (Devolución Interna)</option>
                                            <option value="PROVEEDOR_EXTERNO">PROVEEDOR (Devolución Compra)</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="SUCURSAL_CENTRO" disabled={originId === 'SUCURSAL_CENTRO'}>SUCURSAL_CENTRO</option>
                                            <option value="SUCURSAL_NORTE" disabled={originId === 'SUCURSAL_NORTE'}>SUCURSAL_NORTE</option>
                                            <option value="BODEGA_CENTRAL" disabled={originId === 'BODEGA_CENTRAL'}>BODEGA_CENTRAL</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 h-full flex flex-col">
                            <div className={`bg-gradient-to-r ${mode === 'RETURN' ? 'from-amber-600 to-orange-700' : mode === 'PURCHASE' ? 'from-purple-600 to-indigo-700' : 'from-blue-600 to-indigo-700'} p-6 rounded-2xl shadow-lg text-white text-center shrink-0 relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Barcode size={120} />
                                </div>
                                <label className="block text-sm font-bold text-white/90 mb-2 uppercase tracking-wider flex items-center justify-center gap-2 relative z-10">
                                    <Barcode size={18} /> Pistolear para agregar 1 unidad
                                </label>
                                <div className="relative max-w-lg mx-auto z-10">
                                    <input
                                        ref={scannerInputRef}
                                        type="text"
                                        placeholder="Escanea aquí..."
                                        className="w-full px-6 py-4 rounded-xl border-2 border-white/30 bg-white/10 text-white placeholder-white/50 shadow-inner focus:ring-4 focus:ring-white/30 focus:border-white text-2xl font-mono text-center outline-none transition-all backdrop-blur-sm"
                                        autoFocus
                                        onBlur={(e) => e.target.focus()}
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 animate-pulse">
                                        <Package size={24} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-6 flex-1 overflow-hidden">
                                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                            <Search size={18} /> Búsqueda Manual
                                        </h3>
                                        <span className="text-xs text-gray-400">Si el escáner falla</span>
                                    </div>

                                    <div className="p-4 border-b border-gray-100">
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar por nombre o SKU..."
                                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                            {/* Camera Scanner Button (Mobile Only) */}
                                            <button
                                                onClick={() => setIsCameraScannerOpen(true)}
                                                className="md:hidden flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-bold whitespace-nowrap"
                                                title="Escanear con cámara"
                                            >
                                                <Camera size={20} />
                                                <span className="text-sm">📷</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-y-auto flex-1 p-2 space-y-2">
                                        {filteredProducts.length === 0 && searchTerm && (
                                            <div className="text-center py-8 text-gray-400">
                                                <Package size={48} className="mx-auto mb-2 opacity-30" />
                                                <p>No se encontraron productos</p>
                                                <p className="text-xs mt-1">Intenta con otro término</p>
                                            </div>
                                        )}

                                        {filteredProducts.map((product: any) => (
                                            <div key={product.sku} className="bg-white border-2 border-gray-100 rounded-xl p-4 hover:border-blue-300 transition-all">
                                                {/* Product Header */}
                                                <div className="mb-3">
                                                    <p className="font-bold text-gray-900 text-lg">{product.name}</p>
                                                    <p className="text-xs text-gray-500 font-mono">SKU: {product.sku}</p>
                                                    {product.dci && (
                                                        <p className="text-xs text-gray-400 mt-1">DCI: {product.dci}</p>
                                                    )}
                                                </div>

                                                {/* Stock Total */}
                                                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
                                                    <Package size={16} className="text-blue-600" />
                                                    <span className="font-bold text-blue-600">Stock Total: {product.totalStock}</span>
                                                </div>

                                                {/* Locations */}
                                                <div className="space-y-2 mb-3">
                                                    <p className="text-xs font-bold text-gray-400 uppercase">Ubicaciones:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {product.locations.map((loc: any, idx: number) => (
                                                            <div
                                                                key={idx}
                                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 ${loc.stock > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
                                                                    }`}
                                                            >
                                                                <MapPin size={14} className={loc.stock > 0 ? 'text-emerald-600' : 'text-gray-400'} />
                                                                <span className={`text-xs font-bold ${loc.stock > 0 ? 'text-emerald-900' : 'text-gray-500'}`}>
                                                                    {loc.location_id}
                                                                </span>
                                                                <span className={`text-xs font-bold ${loc.stock > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                                    ({loc.stock})
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Add Button */}
                                                <button
                                                    onClick={() => {
                                                        // Find first location with stock
                                                        const availableLoc = product.locations.find((l: any) => l.stock > 0);
                                                        if (!availableLoc) {
                                                            toast.error('Sin stock disponible');
                                                            return;
                                                        }
                                                        // Create a fake batch object for handleAddItem
                                                        const fakeItem: any = {
                                                            id: availableLoc.batchId,
                                                            sku: product.sku,
                                                            name: product.name,
                                                            stock_actual: availableLoc.stock,
                                                            location_id: availableLoc.location_id,
                                                            lot_number: availableLoc.lot_number,
                                                            expiry_date: availableLoc.expiry_date
                                                        };
                                                        handleAddItem(fakeItem, availableLoc.stock);
                                                    }}
                                                    disabled={product.totalStock <= 0}
                                                    className={`w-full py-2.5 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                                                        ${mode === 'RETURN' ? 'bg-amber-500 text-white hover:bg-amber-600' :
                                                            mode === 'PURCHASE' ? 'bg-purple-500 text-white hover:bg-purple-600' :
                                                                'bg-blue-500 text-white hover:bg-blue-600'}
                                                    `}
                                                >
                                                    <PlusCircle size={18} />
                                                    {product.totalStock > 0 ? 'Agregar a Despacho' : 'Sin Stock'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                            <CheckCircle size={18} className="text-green-500" />
                                            Seleccionados
                                        </h3>
                                        <span className={`${mode === 'RETURN' ? 'bg-amber-600' : mode === 'PURCHASE' ? 'bg-purple-600' : 'bg-blue-600'} text-white px-2 py-0.5 rounded text-xs font-bold`}>
                                            {selectedItems.reduce((acc, item) => acc + item.quantity, 0)}
                                        </span>
                                    </div>

                                    <div className="overflow-y-auto flex-1 p-2 space-y-2">
                                        {selectedItems.map(item => (
                                            <div key={item.batchId} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                                <div className="flex justify-between items-start mb-2">
                                                    <p className="font-bold text-gray-800 text-sm line-clamp-1">{item.name}</p>
                                                    <button onClick={() => handleRemoveItem(item.batchId)} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
                                                </div>
                                                <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-1">
                                                    <button onClick={() => handleUpdateQuantity(item.batchId, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded">-</button>
                                                    <span className="font-bold text-gray-800">{item.quantity}</span>
                                                    <button onClick={() => handleUpdateQuantity(item.batchId, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded">+</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="max-w-xl mx-auto space-y-6">
                            {mode === 'PURCHASE' ? (
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center">
                                    <h3 className="text-lg font-bold text-gray-800 mb-4">Detalles del Pedido</h3>
                                    <p className="text-gray-500 mb-6">Este pedido se generará con estado PENDING.</p>
                                    <div className="bg-purple-50 p-4 rounded-lg inline-block">
                                        <ShoppingCart size={48} className="text-purple-500 mx-auto mb-2" />
                                        <p className="font-bold text-purple-900">{selectedItems.length} Productos</p>
                                        <p className="text-purple-700">{selectedItems.reduce((a, b) => a + b.quantity, 0)} Unidades Totales</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Empresa de Transporte</label>
                                        <select
                                            value={transportData.carrier}
                                            onChange={(e) => setTransportData({ ...transportData, carrier: e.target.value })}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 font-medium"
                                        >
                                            <option value="STARKEN">Starken</option>
                                            <option value="CHILEXPRESS">Chilexpress</option>
                                            <option value="BLUE_EXPRESS">Blue Express</option>
                                            <option value="FLOTA_PROPIA">Flota Propia</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Número de Seguimiento / OT</label>
                                        <input
                                            type="text"
                                            value={transportData.tracking_number}
                                            onChange={(e) => setTransportData({ ...transportData, tracking_number: e.target.value })}
                                            placeholder="Ej: 123456789"
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 font-medium"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Conductor (Opcional)</label>
                                            <input
                                                type="text"
                                                value={transportData.driver_name}
                                                onChange={(e) => setTransportData({ ...transportData, driver_name: e.target.value })}
                                                placeholder="Nombre Chofer"
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Cantidad de Bultos</label>
                                            <input
                                                type="number"
                                                value={transportData.package_count}
                                                onChange={(e) => setTransportData({ ...transportData, package_count: parseInt(e.target.value) || 1 })}
                                                min={1}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 font-medium"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 4 && (
                        <div className="max-w-2xl mx-auto space-y-6">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 text-center">
                                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-emerald-900 mb-2">Todo listo para {mode === 'PURCHASE' ? 'generar pedido' : 'despachar'}</h3>
                                <p className="text-emerald-700">Revisa los detalles antes de confirmar la operación.</p>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
                                <div className="p-6 grid grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">{mode === 'PURCHASE' ? 'Detalles' : 'Ruta'}</p>
                                        <div className="flex items-center gap-2 font-bold text-gray-800">
                                            {mode === 'PURCHASE' ? (
                                                <>Prov: {suppliers.find(s => s.id === originId)?.fantasy_name || originId} <ArrowRight size={14} className="text-gray-400" /> {destinationId}</>
                                            ) : (
                                                <>{originId} <ArrowRight size={14} className="text-gray-400" /> {destinationId}</>
                                            )}
                                        </div>
                                    </div>
                                    {mode !== 'PURCHASE' && (
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase mb-1">Transporte</p>
                                            <p className="font-bold text-gray-800">{transportData.carrier} - OT: {transportData.tracking_number}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="p-6">
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-4">Resumen de {mode === 'PURCHASE' ? 'Pedido' : 'Carga'}</p>
                                    <div className="space-y-2">
                                        {selectedItems.map(item => (
                                            <div key={item.batchId} className="flex justify-between text-sm">
                                                <div>
                                                    <span className="text-gray-600 block">{item.name}</span>
                                                    <span className="text-xs text-gray-400">SKU: {item.sku}</span>
                                                </div>
                                                <span className="font-bold text-gray-900">x{item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                                        <span className="font-bold text-gray-800">Total Items</span>
                                        <span className={`text-xl font-bold text-${color}-600`}>{selectedItems.reduce((a, b) => a + b.quantity, 0)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-white rounded-b-2xl flex justify-between">
                    <button
                        onClick={() => setStep(s => Math.max(1, s - 1))}
                        disabled={step === 1}
                        className="px-6 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                    >
                        Atrás
                    </button>

                    {step < 4 ? (
                        <button
                            onClick={() => {
                                if (step === 1 && !destinationId) return toast.error('Selecciona destino');
                                if (step === 1 && mode === 'PURCHASE' && !originId) return toast.error('Selecciona proveedor');
                                if (step === 2 && selectedItems.length === 0) return toast.error('Agrega productos');
                                setStep(s => s + 1);
                            }}
                            className={`px-8 py-3 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2
                                ${mode === 'RETURN' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' :
                                    mode === 'PURCHASE' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200' :
                                        'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}
                            `}
                        >
                            Siguiente <ArrowRight size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                        >
                            <CheckCircle size={18} /> Confirmar {mode === 'RETURN' ? 'Devolución' : mode === 'PURCHASE' ? 'Pedido' : 'Despacho'}
                        </button>
                    )}
                </div>
            </div>

            {/* Camera Scanner Modal */}
            {isCameraScannerOpen && (
                <CameraScanner
                    onScan={(code) => {
                        handleScan(code);
                        setIsCameraScannerOpen(false);
                    }}
                    onClose={() => setIsCameraScannerOpen(false)}
                />
            )}
        </div>
    );
};

export default DispatchWizard;
