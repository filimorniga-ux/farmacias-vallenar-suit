
import React, { useState } from 'react';
import { Truck, Lock, Save } from 'lucide-react';
import { PurchaseOrder } from '../../../domain/types';

interface BlindReceptionModalProps {
    order: PurchaseOrder;
    onReceive: (order: PurchaseOrder, receivedItems: { sku: string; receivedQty: number }[]) => void;
    onClose: () => void;
}

const BlindReceptionModal: React.FC<BlindReceptionModalProps> = ({ order, onReceive, onClose }) => {
    const [receivedQuantities, setReceivedQuantities] = useState<{ [sku: string]: number }>({});

    const handleInputChange = (sku: string, value: string) => {
        setReceivedQuantities(prev => ({
            ...prev,
            [sku]: parseInt(value) || 0
        }));
    };

    const totalReceived = order.items.reduce((sum, item) => sum + (receivedQuantities[item.sku] || 0), 0);

    // Comprobar si todas las cantidades han sido ingresadas manualmente
    const isComplete = order.items.every(item => receivedQuantities[item.sku] !== undefined && receivedQuantities[item.sku] >= 0);

    const inputStyle = "w-full py-2 border-2 border-slate-400 rounded-lg text-center font-semibold text-lg text-slate-900";


    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl w-full max-w-2xl shadow-2xl">
                <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center">
                    <Truck className="mr-3" /> Recepción Ciega de Orden #{order.id}
                </h3>

                <p className="text-red-600 font-semibold mb-4 flex items-center">
                    <Lock size={18} className="mr-2" /> La cantidad esperada (Expected Qty) NO es visible. Debe contar manualmente.
                </p>

                <div className="max-h-80 overflow-y-auto space-y-4 pr-2">
                    {order.items.map((item) => (
                        <div key={item.sku} className="flex items-center justify-between border-b pb-3">
                            <p className="font-semibold text-slate-700 w-1/2">{item.name}</p>
                            <div className="w-1/3 ml-4">
                                <input
                                    type="number"
                                    placeholder="Cantidad Real Recibida"
                                    className={inputStyle}
                                    value={receivedQuantities[item.sku] || ''}
                                    onChange={(e) => handleInputChange(item.sku, e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 pt-4 border-t border-slate-200">
                    <p className="text-xl font-bold text-slate-900 mb-4">Total de Unidades Contadas: {totalReceived}</p>
                    <button
                        className="w-full py-3 bg-cyan-700 text-white font-bold rounded-xl hover:bg-cyan-800 transition disabled:opacity-50 flex items-center justify-center"
                        onClick={() => isComplete && onReceive(order, Object.entries(receivedQuantities).map(([sku, receivedQty]) => ({ sku, receivedQty })))}
                        disabled={!isComplete}
                    >
                        <Save size={20} className="mr-2" /> Confirmar Recepción Ciega
                    </button>
                    <button className="mt-2 w-full py-2 text-slate-600 hover:text-slate-900 transition" onClick={onClose}>Cancelar</button>
                </div>
            </div>
        </div>
    );
};

export default BlindReceptionModal;
