import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Package, Camera, FileText } from 'lucide-react';
import { Shipment } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';

interface UnifiedReceptionProps {
    isOpen: boolean;
    onClose: () => void;
    shipment: Shipment;
}

const UnifiedReception: React.FC<UnifiedReceptionProps> = ({ isOpen, onClose, shipment }) => {
    const { confirmReception } = usePharmaStore();
    const [receivedItems, setReceivedItems] = useState<{ batchId: string; quantity: number; condition: 'GOOD' | 'DAMAGED' }[]>([]);
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);

    useEffect(() => {
        if (shipment) {
            setReceivedItems(shipment.items.map(i => ({
                batchId: i.batchId,
                quantity: i.quantity, // Default to expected quantity
                condition: 'GOOD'
            })));
        }
    }, [shipment]);

    if (!isOpen) return null;

    const handleQuantityChange = (batchId: string, qty: number) => {
        setReceivedItems(items => items.map(i =>
            i.batchId === batchId ? { ...i, quantity: Math.max(0, qty) } : i
        ));
    };

    const handleConditionChange = (batchId: string, condition: 'GOOD' | 'DAMAGED') => {
        setReceivedItems(items => items.map(i =>
            i.batchId === batchId ? { ...i, condition } : i
        ));
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setPhotos([...photos, url]);
        }
    };

    const handleSubmit = () => {
        // Check for discrepancies
        const hasDiscrepancies = receivedItems.some(rec => {
            const original = shipment.items.find(i => i.batchId === rec.batchId);
            return original && (rec.quantity !== original.quantity || rec.condition === 'DAMAGED');
        });

        if (hasDiscrepancies && !notes) {
            toast.error('Debes agregar una observación si hay discrepancias');
            return;
        }

        confirmReception(shipment.id, {
            photos,
            notes,
            receivedItems
        });

        toast.success(hasDiscrepancies ? 'Recepción con observaciones registrada' : 'Recepción exitosa');
        onClose();
    };

    const totalExpected = shipment.items.reduce((a, b) => a + b.quantity, 0);
    const totalReceived = receivedItems.reduce((a, b) => a + b.quantity, 0);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <CheckCircle className="text-emerald-600" />
                            Recepción de Carga
                        </h2>
                        <p className="text-sm text-gray-500">
                            {shipment.type === 'INBOUND_PROVIDER' ? 'Proveedor' : 'Transferencia Interna'} • OT: {shipment.transport_data.tracking_number}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Summary Card */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex justify-between items-center">
                        <div className="flex gap-8">
                            <div>
                                <p className="text-xs font-bold text-blue-400 uppercase">Origen</p>
                                <p className="font-bold text-blue-900">{shipment.origin_location_id}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-blue-400 uppercase">Bultos</p>
                                <p className="font-bold text-blue-900">{shipment.transport_data.package_count}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-blue-400 uppercase">Progreso</p>
                            <p className={`text-2xl font-extrabold ${totalReceived !== totalExpected ? 'text-amber-500' : 'text-emerald-600'}`}>
                                {totalReceived} / {totalExpected}
                            </p>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
                                <tr>
                                    <th className="px-6 py-4 text-left">Producto</th>
                                    <th className="px-6 py-4 text-center">Esperado</th>
                                    <th className="px-6 py-4 text-center">Recibido</th>
                                    <th className="px-6 py-4 text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {shipment.items.map(item => {
                                    const received = receivedItems.find(r => r.batchId === item.batchId);
                                    if (!received) return null;

                                    return (
                                        <tr key={item.batchId} className={received.quantity !== item.quantity ? 'bg-amber-50/30' : ''}>
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-gray-800">{item.name}</p>
                                                <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                                            </td>
                                            <td className="px-6 py-4 text-center font-medium text-gray-600">
                                                {item.quantity}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <input
                                                    type="number"
                                                    value={received.quantity}
                                                    onChange={(e) => handleQuantityChange(item.batchId, parseInt(e.target.value) || 0)}
                                                    className={`w-20 text-center font-bold border rounded-lg py-1 focus:ring-2 outline-none ${received.quantity !== item.quantity
                                                            ? 'border-amber-300 text-amber-700 focus:ring-amber-200'
                                                            : 'border-gray-200 text-gray-800 focus:ring-blue-200'
                                                        }`}
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <select
                                                    value={received.condition}
                                                    onChange={(e) => handleConditionChange(item.batchId, e.target.value as any)}
                                                    className={`px-3 py-1 rounded-lg text-sm font-bold border outline-none ${received.condition === 'GOOD'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            : 'bg-red-50 text-red-700 border-red-200'
                                                        }`}
                                                >
                                                    <option value="GOOD">OK</option>
                                                    <option value="DAMAGED">DAÑADO</option>
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Evidence & Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Evidencia Fotográfica</label>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                <label className="flex-shrink-0 w-24 h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors bg-gray-50">
                                    <Camera size={24} className="mb-1" />
                                    <span className="text-[10px] font-bold uppercase">Agregar</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                </label>
                                {photos.map((url, idx) => (
                                    <div key={idx} className="flex-shrink-0 w-24 h-24 rounded-xl border border-gray-200 overflow-hidden relative group">
                                        <img src={url} alt="Evidence" className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                                            className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Observaciones</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Detalle cualquier anomalía o discrepancia..."
                                className="w-full h-24 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-white rounded-b-2xl flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                    >
                        <CheckCircle size={18} />
                        Confirmar Recepción
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UnifiedReception;
