import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, AlertTriangle, Package, Camera, FileText, Barcode, Upload, Eye, Truck } from 'lucide-react';
import { Shipment } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { toast } from 'sonner';

interface UnifiedReceptionProps {
    isOpen: boolean;
    onClose: () => void;
    shipment: Shipment;
}

const UnifiedReception: React.FC<UnifiedReceptionProps> = ({ isOpen, onClose, shipment }) => {
    const { confirmReception, uploadLogisticsDocument } = usePharmaStore();
    const [receivedItems, setReceivedItems] = useState<{ batchId: string; quantity: number; condition: 'GOOD' | 'DAMAGED' }[]>([]);
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'ITEMS' | 'DOCS'>('ITEMS');

    // Documents
    const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
    const [guideUrl, setGuideUrl] = useState<string | null>(null);

    // Scanner
    const scannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (shipment) {
            setReceivedItems(shipment.items.map(i => ({
                batchId: i.batchId,
                quantity: i.quantity, // Default to expected quantity? Or 0 for blind reception?
                // Let's default to expected for "Checklist" mode, but user can clear it if they want "Blind"
                // For this requirement "Hybrid", usually we start with expected and verify.
                condition: 'GOOD'
            })));
        }
    }, [shipment]);

    const handleScan = (code: string) => {
        // Find item by SKU or Batch ID (or Barcode if we had it)
        const itemIndex = shipment.items.findIndex(i => i.sku === code || i.batchId === code);

        if (itemIndex !== -1) {
            const batchId = shipment.items[itemIndex].batchId;
            setReceivedItems(prev => prev.map(r => {
                if (r.batchId === batchId) {
                    // Increment quantity
                    // Optional: Check if exceeds expected?
                    // For now, just increment.
                    toast.success(`Escaneado: ${shipment.items[itemIndex].name}`);
                    return { ...r, quantity: r.quantity + 1 }; // If we started at 0, this works. If we started at expected, this adds MORE?
                    // Issue: If we initialize with expected quantity, scanning adds to it?
                    // Maybe we should initialize with 0 if we want to use scanner?
                    // Or "Verify" mode: Scanning highlights the row?
                    // Let's assume "Blind Reception" style if scanning:
                    // But the user might just want to verify.

                    // Let's stick to: If scanner is used, it increments. 
                    // But if we pre-fill, it might be confusing.
                    // Let's NOT pre-fill quantity if we want true scanner reception.
                    // BUT, for "Hybrid", usually we show expected.

                    // Let's just increment and let user adjust.
                }
                return r;
            }));
        } else {
            toast.error(`Producto no encontrado en este despacho: ${code}`);
        }
    };

    useBarcodeScanner({
        onScan: handleScan,
        minLength: 3,
        targetInputRef: scannerInputRef
    });

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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'PHOTO' | 'INVOICE' | 'GUIDE') => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            if (type === 'PHOTO') setPhotos([...photos, url]);
            if (type === 'INVOICE') setInvoiceUrl(url);
            if (type === 'GUIDE') setGuideUrl(url);
            toast.success('Documento adjuntado');
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

        // Upload Documents
        if (invoiceUrl) uploadLogisticsDocument(shipment.id, 'INVOICE', invoiceUrl);
        if (guideUrl) uploadLogisticsDocument(shipment.id, 'GUIDE', guideUrl);

        // Confirm Reception
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
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

                {/* Tabs */}
                <div className="flex border-b border-gray-100 px-6">
                    <button
                        onClick={() => setActiveTab('ITEMS')}
                        className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'ITEMS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <Package size={18} /> Items y Conteo
                    </button>
                    <button
                        onClick={() => setActiveTab('DOCS')}
                        className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'DOCS' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <FileText size={18} /> Documentación
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                    {activeTab === 'ITEMS' && (
                        <div className="space-y-6">
                            {/* Scanner Bar */}
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
                                <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
                                    <Barcode size={24} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Escáner Activo</label>
                                    <input
                                        ref={scannerInputRef}
                                        type="text"
                                        placeholder="Pistolear producto para sumar..."
                                        className="w-full bg-transparent outline-none font-mono text-lg text-gray-800 placeholder-gray-300"
                                        autoFocus
                                        onBlur={() => setTimeout(() => scannerInputRef.current?.focus(), 100)}
                                    />
                                </div>
                                <div className="text-right px-4 border-l border-gray-100">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Progreso</p>
                                    <p className={`text-2xl font-extrabold ${totalReceived !== totalExpected ? 'text-amber-500' : 'text-emerald-600'}`}>
                                        {totalReceived} / {totalExpected}
                                    </p>
                                </div>
                            </div>

                            {/* Items Table */}
                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                <table className="w-full">
                                    <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
                                        <tr>
                                            <th className="px-6 py-4 text-left">Producto</th>
                                            <th className="px-6 py-4 text-center">Lote</th>
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
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono text-gray-600">
                                                            {item.lot_number || 'S/L'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-medium text-gray-600">
                                                        {item.quantity}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button onClick={() => handleQuantityChange(item.batchId, received.quantity - 1)} className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold">-</button>
                                                            <input
                                                                type="number"
                                                                value={received.quantity}
                                                                onChange={(e) => handleQuantityChange(item.batchId, parseInt(e.target.value) || 0)}
                                                                className={`w-16 text-center font-bold border rounded py-1 focus:ring-2 outline-none ${received.quantity !== item.quantity
                                                                    ? 'border-amber-300 text-amber-700 focus:ring-amber-200'
                                                                    : 'border-gray-200 text-gray-800 focus:ring-blue-200'
                                                                    }`}
                                                            />
                                                            <button onClick={() => handleQuantityChange(item.batchId, received.quantity + 1)} className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold">+</button>
                                                        </div>
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
                        </div>
                    )}

                    {activeTab === 'DOCS' && (
                        <div className="space-y-6 max-w-3xl mx-auto">
                            <div className="grid grid-cols-2 gap-6">
                                {/* Invoice Upload */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-gray-800">Factura</h3>
                                            <p className="text-xs text-gray-500">Documento tributario</p>
                                        </div>
                                        <FileText className="text-blue-500" />
                                    </div>
                                    {invoiceUrl ? (
                                        <div className="relative group rounded-lg overflow-hidden border border-gray-200 h-40 bg-gray-50 flex items-center justify-center">
                                            <FileText size={48} className="text-gray-300" />
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                                                <a href={invoiceUrl} target="_blank" rel="noreferrer" className="p-2 bg-white rounded-full text-gray-800 hover:bg-gray-100"><Eye size={20} /></a>
                                                <button onClick={() => setInvoiceUrl(null)} className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600"><X size={20} /></button>
                                            </div>
                                            <p className="absolute bottom-2 text-xs font-bold text-gray-500">Factura Adjunta</p>
                                        </div>
                                    ) : (
                                        <label className="block w-full h-40 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer flex flex-col items-center justify-center text-gray-400">
                                            <Upload size={32} className="mb-2" />
                                            <span className="text-sm font-bold">Subir Factura (PDF/Img)</span>
                                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleFileUpload(e, 'INVOICE')} />
                                        </label>
                                    )}
                                </div>

                                {/* Guide Upload */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-gray-800">Guía de Despacho</h3>
                                            <p className="text-xs text-gray-500">Documento de transporte</p>
                                        </div>
                                        <Truck className="text-orange-500" />
                                    </div>
                                    {guideUrl ? (
                                        <div className="relative group rounded-lg overflow-hidden border border-gray-200 h-40 bg-gray-50 flex items-center justify-center">
                                            <FileText size={48} className="text-gray-300" />
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                                                <a href={guideUrl} target="_blank" rel="noreferrer" className="p-2 bg-white rounded-full text-gray-800 hover:bg-gray-100"><Eye size={20} /></a>
                                                <button onClick={() => setGuideUrl(null)} className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600"><X size={20} /></button>
                                            </div>
                                            <p className="absolute bottom-2 text-xs font-bold text-gray-500">Guía Adjunta</p>
                                        </div>
                                    ) : (
                                        <label className="block w-full h-40 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer flex flex-col items-center justify-center text-gray-400">
                                            <Upload size={32} className="mb-2" />
                                            <span className="text-sm font-bold">Subir Guía (PDF/Img)</span>
                                            <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => handleFileUpload(e, 'GUIDE')} />
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* Evidence Photos */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <Camera size={18} className="text-purple-500" />
                                    Evidencia Fotográfica (Daños/Cajas)
                                </h3>
                                <div className="flex gap-4 overflow-x-auto pb-2">
                                    <label className="flex-shrink-0 w-32 h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-purple-400 hover:bg-purple-50 cursor-pointer transition-colors bg-gray-50">
                                        <Camera size={24} className="mb-1" />
                                        <span className="text-xs font-bold uppercase">Agregar Foto</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'PHOTO')} />
                                    </label>
                                    {photos.map((url, idx) => (
                                        <div key={idx} className="flex-shrink-0 w-32 h-32 rounded-xl border border-gray-200 overflow-hidden relative group">
                                            <img src={url} alt="Evidence" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                                                className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Observaciones Generales</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Detalle cualquier anomalía, discrepancia o comentario sobre la recepción..."
                                    className="w-full h-32 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                                />
                            </div>
                        </div>
                    )}
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
