import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle, AlertTriangle, Calendar, Package } from 'lucide-react';
import { PurchaseOrder } from '../../../domain/types';
import { toast } from 'sonner';

interface PurchaseOrderReceivingModalProps {
    isOpen: boolean;
    order: PurchaseOrder | null;
    onReceive: (orderId: string, receivedItems: { sku: string; receivedQty: number; lotNumber?: string; expiryDate?: number }[]) => void;
    onClose: () => void;
}

interface ItemReceptionState {
    sku: string;
    expectedQty: number;
    receivedQty: number;
    lotNumber: string;
    expiryDate: string; // YYYY-MM-DD
}

export const PurchaseOrderReceivingModal: React.FC<PurchaseOrderReceivingModalProps> = ({ isOpen, order, onReceive, onClose }) => {
    const [items, setItems] = useState<ItemReceptionState[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (order) {
            setItems(order.items.map(item => ({
                sku: item.sku,
                expectedQty: item.quantity_ordered,
                receivedQty: item.quantity_ordered, // Pre-fill with expected
                lotNumber: '',
                expiryDate: ''
            })));
        }
    }, [order]);

    if (!isOpen || !order) return null;

    const handleItemChange = (index: number, field: keyof ItemReceptionState, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const handleSubmit = async () => {
        // Validate
        const invalidItems = items.filter(i => i.receivedQty > 0 && (!i.lotNumber || !i.expiryDate));
        if (invalidItems.length > 0) {
            toast.warning('Por favor ingrese Lote y Vencimiento para todos los ítems recibidos');
            return;
        }

        setIsSubmitting(true);
        try {
            const formattedItems = items.map(i => ({
                sku: i.sku,
                receivedQty: Number(i.receivedQty),
                lotNumber: i.lotNumber,
                expiryDate: i.expiryDate ? new Date(i.expiryDate).getTime() : undefined
            }));

            await onReceive(order.id, formattedItems);
            // onReceive in parent (SupplyChainPage) handles the store call and toasts
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Error al procesar la recepción');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalExpected = items.reduce((sum, i) => sum + i.expectedQty, 0);
    const totalReceived = items.reduce((sum, i) => sum + Number(i.receivedQty || 0), 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-900 p-5 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Truck size={24} className="text-emerald-400" />
                            Recepción de Orden #{order.id.slice(0, 8)}
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">Proveedor: {order.supplier_id} • Bodega Destino: {order.destination_location_id}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition bg-slate-800 p-2 rounded-lg hover:bg-slate-700">✕</button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                    <table className="w-full text-left bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                        <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold">
                            <tr>
                                <th className="p-4 w-1/3">Producto</th>
                                <th className="p-4 text-center">Esperado</th>
                                <th className="p-4 text-center w-24">Recibido</th>
                                <th className="p-4 w-32">Lote (Opcional)</th>
                                <th className="p-4 w-32">Vencimiento</th>
                                <th className="p-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map((item, idx) => {
                                const product = order.items.find(pi => pi.sku === item.sku);
                                const isMismatch = item.receivedQty !== item.expectedQty;

                                return (
                                    <tr key={item.sku} className="hover:bg-slate-50 transition">
                                        <td className="p-4">
                                            <div className="font-bold text-slate-800">{product?.name}</div>
                                            <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                                        </td>
                                        <td className="p-4 text-center font-medium text-slate-600">
                                            {item.expectedQty}
                                        </td>
                                        <td className="p-4">
                                            <input
                                                type="number"
                                                min="0"
                                                className={`w-full p-2 border rounded-lg font-bold text-center outline-none focus:ring-2 ${isMismatch ? 'border-amber-300 bg-amber-50 text-amber-700 focus:ring-amber-500' : 'border-slate-200 focus:ring-indigo-500'}`}
                                                value={item.receivedQty}
                                                onChange={(e) => handleItemChange(idx, 'receivedQty', Number(e.target.value))}
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <Package size={16} className="text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Lote..."
                                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                                                    value={item.lotNumber}
                                                    onChange={(e) => handleItemChange(idx, 'lotNumber', e.target.value)}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={16} className="text-slate-400" />
                                                <input
                                                    type="date"
                                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                                                    value={item.expiryDate}
                                                    onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            {item.receivedQty > 0 && (
                                                <CheckCircle size={20} className="text-emerald-500 mx-auto" />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Summary */}
                    <div className="mt-6 flex justify-end items-center gap-6 p-4 bg-white rounded-lg border border-slate-200">
                        <div className="text-right">
                            <p className="text-sm text-slate-500">Total Esperado</p>
                            <p className="text-xl font-bold text-slate-700">{totalExpected}</p>
                        </div>
                        <div className="h-10 w-px bg-slate-200"></div>
                        <div className="text-right">
                            <p className="text-sm text-slate-500">Total Recibido</p>
                            <p className={`text-xl font-bold ${totalReceived !== totalExpected ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {totalReceived}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || totalReceived === 0}
                        className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:shadow-none transition flex items-center gap-2"
                    >
                        {isSubmitting ? 'Procesando...' : (
                            <>
                                <CheckCircle size={20} /> Confirmar Recepción
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
