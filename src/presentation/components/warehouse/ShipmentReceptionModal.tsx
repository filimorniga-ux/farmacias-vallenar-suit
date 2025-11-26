import React, { useState } from 'react';
import { X, Camera, FileText, CheckCircle, AlertTriangle, Package } from 'lucide-react';
import { Shipment } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';

interface ShipmentReceptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    shipment: Shipment;
}

const ShipmentReceptionModal: React.FC<ShipmentReceptionModalProps> = ({ isOpen, onClose, shipment }) => {
    const { confirmReception, uploadLogisticsDocument } = usePharmaStore();
    const [receivedItems, setReceivedItems] = useState(
        shipment.items.map(item => ({ ...item, receivedQty: item.quantity, condition: 'GOOD' as 'GOOD' | 'DAMAGED' }))
    );
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        confirmReception(shipment.id, {
            photos,
            notes,
            receivedItems: receivedItems.map(i => ({
                batchId: i.batchId,
                quantity: i.receivedQty,
                condition: i.condition
            }))
        });
        toast.success('Recepción confirmada exitosamente');
        onClose();
    };

    const handlePhotoUpload = () => {
        // Mock upload
        const mockUrl = `https://fake-url.com/photo-${Date.now()}.jpg`;
        setPhotos([...photos, mockUrl]);
        uploadLogisticsDocument(shipment.id, 'PHOTO', mockUrl);
        toast.success('Foto subida (simulado)');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <CheckCircle className="text-emerald-500" />
                            Recepción de Carga
                        </h2>
                        <p className="text-sm text-slate-500">OT: {shipment.transport_data.tracking_number} | Origen: {shipment.origin_location_id}</p>
                    </div>
                    <button onClick={onClose}><X className="text-slate-400" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* Items Table */}
                    <table className="w-full mb-6">
                        <thead className="bg-slate-50 text-xs text-slate-500 font-bold uppercase">
                            <tr>
                                <th className="px-4 py-3 text-left">Producto</th>
                                <th className="px-4 py-3 text-center">Enviado</th>
                                <th className="px-4 py-3 text-center">Recibido</th>
                                <th className="px-4 py-3 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {receivedItems.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="px-4 py-3">
                                        <p className="font-bold text-slate-700">{item.name}</p>
                                        <p className="text-xs text-slate-400">{item.sku}</p>
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono">{item.quantity}</td>
                                    <td className="px-4 py-3 text-center">
                                        <input
                                            type="number"
                                            className="w-16 p-1 border rounded text-center font-bold"
                                            value={item.receivedQty}
                                            onChange={(e) => {
                                                const newItems = [...receivedItems];
                                                newItems[idx].receivedQty = Number(e.target.value);
                                                setReceivedItems(newItems);
                                            }}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <select
                                            className={`p-1 rounded text-xs font-bold ${item.condition === 'GOOD' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                                            value={item.condition}
                                            onChange={(e) => {
                                                const newItems = [...receivedItems];
                                                newItems[idx].condition = e.target.value as 'GOOD' | 'DAMAGED';
                                                setReceivedItems(newItems);
                                            }}
                                        >
                                            <option value="GOOD">CONFORME</option>
                                            <option value="DAMAGED">DAÑADO</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Evidence & Notes */}
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Observaciones</label>
                            <textarea
                                className="w-full p-3 border border-slate-200 rounded-xl h-32 resize-none"
                                placeholder="Ej: Caja 2 llegó mojada..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Evidencia Fotográfica</label>
                            <div className="grid grid-cols-3 gap-2 mb-2">
                                {photos.map((url, i) => (
                                    <div key={i} className="aspect-square bg-slate-100 rounded-lg overflow-hidden relative">
                                        <img src={url} alt="Evidence" className="w-full h-full object-cover" />
                                    </div>
                                ))}
                                <button
                                    onClick={handlePhotoUpload}
                                    className="aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-cyan-500 hover:text-cyan-500 transition-colors"
                                >
                                    <Camera size={24} />
                                    <span className="text-xs font-bold mt-1">Subir</span>
                                </button>
                            </div>
                            <button className="w-full py-2 bg-slate-100 text-slate-600 font-bold rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-slate-200">
                                <FileText size={16} /> Escanear Factura/Guía
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                    <button
                        onClick={handleConfirm}
                        className="px-6 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 flex items-center gap-2"
                    >
                        <CheckCircle size={20} />
                        Confirmar Recepción
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShipmentReceptionModal;
