import React, { useState } from 'react';
import { X, Truck, Package, ArrowRight, Search } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';
import { InventoryBatch } from '../../../domain/types';

interface ShipmentDispatchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ShipmentDispatchModal: React.FC<ShipmentDispatchModalProps> = ({ isOpen, onClose }) => {
    const { inventory, createDispatch } = usePharmaStore();
    const [step, setStep] = useState(1);
    const [destination, setDestination] = useState('');
    const [selectedItems, setSelectedItems] = useState<{ batch: InventoryBatch, quantity: number }[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [transportData, setTransportData] = useState({
        carrier: '',
        trackingNumber: '',
        packageCount: 1,
        driverName: ''
    });

    if (!isOpen) return null;

    const filteredInventory = inventory.filter(item =>
        item.stock_actual > 0 &&
        (item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.sku.includes(searchTerm))
    );

    const handleAddItem = (batch: InventoryBatch) => {
        const existing = selectedItems.find(i => i.batch.id === batch.id);
        if (existing) return;
        setSelectedItems([...selectedItems, { batch, quantity: 1 }]);
    };

    const handleUpdateQuantity = (batchId: string, qty: number) => {
        const newItems = selectedItems.map(i =>
            i.batch.id === batchId ? { ...i, quantity: Math.min(i.batch.stock_actual, Math.max(1, qty)) } : i
        );
        setSelectedItems(newItems);
    };

    const handleRemoveItem = (batchId: string) => {
        setSelectedItems(selectedItems.filter(i => i.batch.id !== batchId));
    };

    const handleSubmit = () => {
        if (!destination || selectedItems.length === 0 || !transportData.carrier) {
            toast.error('Complete todos los campos requeridos');
            return;
        }

        createDispatch({
            type: 'INTER_BRANCH',
            origin_location_id: 'SUCURSAL_CENTRO', // Should be dynamic based on user location
            destination_location_id: destination,
            transport_data: {
                carrier: transportData.carrier,
                tracking_number: transportData.trackingNumber,
                package_count: transportData.packageCount,
                driver_name: transportData.driverName
            },
            items: selectedItems.map(i => ({
                batchId: i.batch.id,
                sku: i.batch.sku,
                name: i.batch.name,
                quantity: i.quantity,
                condition: 'GOOD'
            })),
            documentation: { evidence_photos: [] },
            valuation: selectedItems.reduce((sum, i) => sum + (i.batch.cost_price * i.quantity), 0)
        });

        toast.success('Despacho creado exitosamente');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Truck className="text-blue-600" />
                        Nuevo Despacho Inter-Sucursal
                    </h2>
                    <button onClick={onClose}><X className="text-slate-400" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* Stepper */}
                    <div className="flex items-center justify-center mb-8">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>1</div>
                        <div className="w-12 h-1 bg-slate-100 mx-2"></div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>2</div>
                        <div className="w-12 h-1 bg-slate-100 mx-2"></div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>3</div>
                    </div>

                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <h3 className="font-bold text-lg">Seleccionar Destino</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {['SUCURSAL_NORTE', 'SUCURSAL_SUR', 'BODEGA_CENTRAL'].map(loc => (
                                    <button
                                        key={loc}
                                        onClick={() => setDestination(loc)}
                                        className={`p-6 rounded-xl border-2 text-left transition-all ${destination === loc ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                                    >
                                        <p className="font-bold text-slate-800">{loc}</p>
                                        <p className="text-sm text-slate-500">Sucursal Operativa</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 h-full flex flex-col">
                            <h3 className="font-bold text-lg">Selección de Productos (Picking)</h3>

                            <div className="flex gap-4 mb-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                    <input
                                        type="text"
                                        placeholder="Buscar productos..."
                                        className="w-full pl-10 p-3 border border-slate-200 rounded-xl"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
                                {/* Inventory List */}
                                <div className="border border-slate-200 rounded-xl overflow-y-auto max-h-[400px]">
                                    {filteredInventory.map(item => (
                                        <div key={item.id} className="p-3 border-b border-slate-100 hover:bg-slate-50 flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-sm">{item.name}</p>
                                                <p className="text-xs text-slate-500">SKU: {item.sku} | Stock: {item.stock_actual}</p>
                                            </div>
                                            <button
                                                onClick={() => handleAddItem(item)}
                                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200"
                                            >
                                                Agregar
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Selected Items */}
                                <div className="border border-slate-200 rounded-xl overflow-y-auto max-h-[400px] bg-slate-50 p-4">
                                    <h4 className="font-bold text-slate-700 mb-3">Items Seleccionados ({selectedItems.length})</h4>
                                    {selectedItems.length === 0 ? (
                                        <p className="text-slate-400 text-sm text-center py-8">No hay items seleccionados</p>
                                    ) : (
                                        selectedItems.map((item, idx) => (
                                            <div key={idx} className="bg-white p-3 rounded-lg shadow-sm mb-2">
                                                <div className="flex justify-between mb-2">
                                                    <span className="font-bold text-sm truncate">{item.batch.name}</span>
                                                    <button onClick={() => handleRemoveItem(item.batch.id)}><X size={14} className="text-red-400" /></button>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-slate-500">Cant:</span>
                                                    <input
                                                        type="number"
                                                        className="w-20 p-1 border rounded text-center font-bold text-sm"
                                                        value={item.quantity}
                                                        onChange={(e) => handleUpdateQuantity(item.batch.id, Number(e.target.value))}
                                                    />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <h3 className="font-bold text-lg">Datos de Transporte</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Empresa de Transporte</label>
                                    <select
                                        className="w-full p-3 border border-slate-200 rounded-xl"
                                        value={transportData.carrier}
                                        onChange={(e) => setTransportData({ ...transportData, carrier: e.target.value })}
                                    >
                                        <option value="">Seleccionar...</option>
                                        <option value="STARKEN">Starken</option>
                                        <option value="CHILEXPRESS">Chilexpress</option>
                                        <option value="BLUE_EXPRESS">Blue Express</option>
                                        <option value="FLOTA_PROPIA">Flota Propia</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Nº Orden Transporte (OT)</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border border-slate-200 rounded-xl"
                                        placeholder="Ej: 123456789"
                                        value={transportData.trackingNumber}
                                        onChange={(e) => setTransportData({ ...transportData, trackingNumber: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Cantidad de Bultos</label>
                                    <input
                                        type="number"
                                        className="w-full p-3 border border-slate-200 rounded-xl"
                                        value={transportData.packageCount}
                                        onChange={(e) => setTransportData({ ...transportData, packageCount: Number(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Chofer (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border border-slate-200 rounded-xl"
                                        placeholder="Juan Pérez"
                                        value={transportData.driverName}
                                        onChange={(e) => setTransportData({ ...transportData, driverName: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-100 flex justify-between">
                    {step > 1 ? (
                        <button onClick={() => setStep(step - 1)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50">Atrás</button>
                    ) : (
                        <div></div>
                    )}

                    {step < 3 ? (
                        <button
                            onClick={() => {
                                if (step === 1 && !destination) return toast.error('Seleccione un destino');
                                if (step === 2 && selectedItems.length === 0) return toast.error('Seleccione al menos un producto');
                                setStep(step + 1);
                            }}
                            className="px-6 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
                        >
                            Siguiente <ArrowRight size={20} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            className="px-6 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 flex items-center gap-2"
                        >
                            <Package size={20} />
                            Generar Despacho
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShipmentDispatchModal;
