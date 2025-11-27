import React, { useState, useMemo } from 'react';
import { X, Truck, MapPin, Package, CheckCircle, ArrowRight, Search, AlertTriangle, Barcode } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { useLocationStore } from '../../store/useLocationStore';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { toast } from 'sonner';
import { Shipment } from '../../../domain/types';

interface DispatchWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

const DispatchWizard: React.FC<DispatchWizardProps> = ({ isOpen, onClose }) => {
    const { inventory, createDispatch, user } = usePharmaStore();
    const { currentLocation } = useLocationStore();
    const [step, setStep] = useState(1);

    // Step 1: Route
    const [originId, setOriginId] = useState(currentLocation?.id || 'BODEGA_CENTRAL');
    const [destinationId, setDestinationId] = useState('');

    // Step 2: Picking
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItems, setSelectedItems] = useState<{ batchId: string; sku: string; name: string; quantity: number; max: number }[]>([]);

    // Step 3: Transport
    const [transportData, setTransportData] = useState({
        carrier: 'STARKEN',
        tracking_number: '',
        driver_name: '',
        package_count: 1
    });

    // Scanner
    const scannerInputRef = React.useRef<HTMLInputElement>(null);

    const handleScan = (code: string) => {
        // Find product in origin inventory
        // Try exact match on SKU or Barcode (assuming we add barcode later to inventory item)
        // For now, we match SKU or Name (partial) if code is long enough, but usually scanner sends exact SKU/EAN

        // In this mock, let's assume the code IS the SKU or part of the name
        const foundItem = originInventory.find(i => i.sku === code || i.id === code);

        if (foundItem) {
            // Check if already in selected items
            const existing = selectedItems.find(i => i.batchId === foundItem.id);

            if (existing) {
                if (existing.quantity < existing.max) {
                    handleUpdateQuantity(existing.batchId, existing.quantity + 1);
                    toast.success(`+1 ${foundItem.name}`);
                    // Play beep sound (simulated)
                } else {
                    toast.error('Stock insuficiente para agregar más');
                }
            } else {
                handleAddItem(foundItem);
                toast.success(`Agregado: ${foundItem.name}`);
            }
        } else {
            toast.error(`Producto no encontrado: ${code}`);
        }
    };

    useBarcodeScanner({
        onScan: handleScan,
        minLength: 3,
        targetInputRef: scannerInputRef
    });



    // Filter Inventory for Origin
    const originInventory = useMemo(() => {
        return inventory.filter(item => item.location_id === originId && item.stock_actual > 0);
    }, [inventory, originId]);

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return [];
        return originInventory.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku.includes(searchTerm)
        ).slice(0, 5);
    }, [originInventory, searchTerm]);

    const handleAddItem = (item: any) => {
        if (selectedItems.find(i => i.batchId === item.id)) return;
        setSelectedItems([...selectedItems, {
            batchId: item.id,
            sku: item.sku,
            name: item.name,
            quantity: 1,
            max: item.stock_actual
        }]);
        setSearchTerm('');
    };

    const handleUpdateQuantity = (batchId: string, qty: number) => {
        setSelectedItems(items => items.map(i => {
            if (i.batchId === batchId) {
                return { ...i, quantity: Math.min(Math.max(1, qty), i.max) };
            }
            return i;
        }));
    };

    const handleRemoveItem = (batchId: string) => {
        setSelectedItems(items => items.filter(i => i.batchId !== batchId));
    };

    const handleSubmit = () => {
        if (!destinationId) {
            toast.error('Selecciona un destino');
            return;
        }
        if (selectedItems.length === 0) {
            toast.error('Agrega al menos un producto');
            return;
        }
        if (!transportData.tracking_number) {
            toast.error('Ingresa el número de seguimiento (OT)');
            return;
        }

        const shipmentData: Omit<Shipment, 'id' | 'status' | 'created_at' | 'updated_at'> = {
            type: 'INTERNAL_TRANSFER',
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
                return sum + (item?.cost_price || 0) * i.quantity;
            }, 0)
        };

        createDispatch(shipmentData);
        toast.success('Despacho creado exitosamente');

        // Generate PDF (Mock)
        import('jspdf').then(async ({ default: jsPDF }) => {
            const doc = new jsPDF();
            doc.text(`GUÍA DE DESPACHO INTERNA`, 105, 20, { align: 'center' });
            doc.text(`OT: ${transportData.tracking_number}`, 20, 40);
            doc.text(`Origen: ${originId}`, 20, 50);
            doc.text(`Destino: ${destinationId}`, 20, 60);
            doc.save(`guia-${transportData.tracking_number}.pdf`);
        });

        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Truck className="text-blue-600" />
                            Nuevo Despacho
                        </h2>
                        <p className="text-sm text-gray-500">Asistente de creación de envíos</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Steps Indicator */}
                <div className="flex justify-between px-12 py-4 border-b border-gray-100 bg-white">
                    {[
                        { num: 1, label: 'Ruta', icon: MapPin },
                        { num: 2, label: 'Picking', icon: Package },
                        { num: 3, label: 'Transporte', icon: Truck },
                        { num: 4, label: 'Confirmar', icon: CheckCircle }
                    ].map((s) => (
                        <div key={s.num} className={`flex flex-col items-center gap-2 ${step >= s.num ? 'text-blue-600' : 'text-gray-300'}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step >= s.num ? 'bg-blue-100 ring-4 ring-blue-50' : 'bg-gray-100'
                                }`}>
                                <s.icon size={18} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider">{s.label}</span>
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
                    {step === 1 && (
                        <div className="max-w-xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Origen</label>
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
                            </div>

                            <div className="flex justify-center">
                                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                                    <ArrowRight size={24} className="rotate-90" />
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Destino</label>
                                <select
                                    value={destinationId}
                                    onChange={(e) => setDestinationId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 font-medium"
                                >
                                    <option value="">Seleccionar Sucursal...</option>
                                    <option value="SUCURSAL_CENTRO" disabled={originId === 'SUCURSAL_CENTRO'}>SUCURSAL_CENTRO</option>
                                    <option value="SUCURSAL_NORTE" disabled={originId === 'SUCURSAL_NORTE'}>SUCURSAL_NORTE</option>
                                    <option value="BODEGA_CENTRAL" disabled={originId === 'BODEGA_CENTRAL'}>BODEGA_CENTRAL</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            {/* Scanner Input */}
                            <div className="bg-blue-50 p-6 rounded-2xl border-2 border-blue-100 shadow-sm text-center">
                                <label className="block text-sm font-bold text-blue-800 mb-2 uppercase tracking-wider flex items-center justify-center gap-2">
                                    <Barcode size={18} /> Escanear Producto
                                </label>
                                <div className="relative max-w-lg mx-auto">
                                    <input
                                        ref={scannerInputRef}
                                        type="text"
                                        placeholder="Escanea aquí..."
                                        className="w-full px-6 py-4 rounded-xl border-2 border-blue-200 shadow-inner focus:ring-4 focus:ring-blue-100 focus:border-blue-500 text-2xl font-mono text-center outline-none transition-all"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        autoFocus
                                        onBlur={() => {
                                            // Optional: Keep focus if we want "always ready" mode, 
                                            // but might be annoying if user wants to click elsewhere.
                                            // setTimeout(() => scannerInputRef.current?.focus(), 100); 
                                        }}
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 animate-pulse">
                                        <Package size={24} />
                                    </div>
                                </div>
                                <p className="text-xs text-blue-400 mt-2 font-medium">
                                    Presiona Enter o usa la pistola para agregar
                                </p>
                            </div>

                            {/* Manual Search Results (Fallback) */}
                            {filteredProducts.length > 0 && searchTerm.length > 2 && (
                                <div className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-400 uppercase">Resultados de Búsqueda</div>
                                    {filteredProducts.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleAddItem(item)}
                                            className="w-full text-left px-6 py-3 hover:bg-blue-50 flex justify-between items-center border-b border-gray-50 last:border-0"
                                        >
                                            <div>
                                                <p className="font-bold text-gray-800">{item.name}</p>
                                                <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-blue-600">{item.stock_actual} unid.</p>
                                                <p className="text-xs text-gray-400">{item.location_id}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Selected Items List */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="flex justify-between items-center p-4 bg-gray-50 border-b border-gray-100">
                                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                        <CheckCircle size={18} className="text-green-500" />
                                        Items Seleccionados
                                    </h3>
                                    <div className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold">
                                        Total Unidades: {selectedItems.reduce((acc, item) => acc + item.quantity, 0)}
                                    </div>
                                </div>
                                <table className="w-full">
                                    <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold hidden">
                                        <tr>
                                            <th className="px-6 py-4 text-left">Producto</th>
                                            <th className="px-6 py-4 text-center">Cantidad</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {selectedItems.map(item => (
                                            <tr key={item.batchId} className="group hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-gray-800 text-lg">{item.name}</p>
                                                    <div className="flex gap-2 text-xs text-gray-500 font-mono mt-1">
                                                        <span className="bg-gray-100 px-2 py-0.5 rounded">SKU: {item.sku}</span>
                                                        <span className="bg-gray-100 px-2 py-0.5 rounded">Lote: {item.batchId}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center gap-3">
                                                        <button
                                                            onClick={() => handleUpdateQuantity(item.batchId, item.quantity - 1)}
                                                            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 flex items-center justify-center transition-colors"
                                                        >-</button>
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => handleUpdateQuantity(item.batchId, parseInt(e.target.value) || 1)}
                                                            className="w-20 text-center font-bold text-xl border-b-2 border-blue-100 focus:border-blue-500 outline-none bg-transparent"
                                                        />
                                                        <button
                                                            onClick={() => handleUpdateQuantity(item.batchId, item.quantity + 1)}
                                                            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 flex items-center justify-center transition-colors"
                                                        >+</button>
                                                    </div>
                                                    <p className="text-center text-xs text-gray-400 mt-1 font-medium">
                                                        Disponible: {item.max}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleRemoveItem(item.batchId)}
                                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Eliminar"
                                                    >
                                                        <X size={20} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {selectedItems.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-16 text-center text-gray-400">
                                                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                                        <Package className="w-10 h-10 text-gray-300" />
                                                    </div>
                                                    <p className="font-medium">Lista vacía</p>
                                                    <p className="text-sm opacity-60">Escanea productos para comenzar</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="max-w-xl mx-auto space-y-6">
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
                        </div>
                    )}

                    {step === 4 && (
                        <div className="max-w-2xl mx-auto space-y-6">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 text-center">
                                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-emerald-900 mb-2">Todo listo para despachar</h3>
                                <p className="text-emerald-700">Revisa los detalles antes de confirmar la operación.</p>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
                                <div className="p-6 grid grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Ruta</p>
                                        <div className="flex items-center gap-2 font-bold text-gray-800">
                                            {originId} <ArrowRight size={14} className="text-gray-400" /> {destinationId}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Transporte</p>
                                        <p className="font-bold text-gray-800">{transportData.carrier} - OT: {transportData.tracking_number}</p>
                                    </div>
                                </div>
                                <div className="p-6">
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-4">Resumen de Carga</p>
                                    <div className="space-y-2">
                                        {selectedItems.map(item => (
                                            <div key={item.batchId} className="flex justify-between text-sm">
                                                <span className="text-gray-600">{item.name}</span>
                                                <span className="font-bold text-gray-900">x{item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                                        <span className="font-bold text-gray-800">Total Items</span>
                                        <span className="text-xl font-bold text-blue-600">{selectedItems.reduce((a, b) => a + b.quantity, 0)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
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
                                if (step === 2 && selectedItems.length === 0) return toast.error('Agrega productos');
                                setStep(s => s + 1);
                            }}
                            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                        >
                            Siguiente <ArrowRight size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                        >
                            <CheckCircle size={18} /> Confirmar Despacho
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DispatchWizard;
