
'use client';
import React, { useState } from 'react';
import { Package, Zap, DollarSign, Clock, CheckCircle } from 'lucide-react';
import { usePharmaStore } from '../store/useStore';
import { PurchasingAgent } from '../../../domain/logic/purchasingAgent';
import BlindReceptionModal from '../components/scm/BlindReceptionModal';
import { PurchaseOrder } from '../../../domain/types';

const SupplyChainPage: React.FC = () => {
    const { inventory, purchaseOrders, registerStockMovement } = usePharmaStore();
    const [suggestedOrders, setSuggestedOrders] = useState<PurchaseOrder[]>([]);
    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

    // Lógica para simular la ejecución del Agente AI
    const runAgent = () => {
        const suggestions = PurchasingAgent.analyzeStockAndSuggest(inventory);
        setSuggestedOrders(suggestions);
        alert(`Agente AI sugirió ${suggestions.length} órdenes.`);
    };

    // Simulación de recibir la orden y actualizar stock
    const handleReceive = (order: PurchaseOrder, receivedItems: { itemId: string; receivedQty: number }[]) => {
        receivedItems.forEach(item => {
            registerStockMovement(item.itemId, item.receivedQty);
        });
        // Lógica para actualizar el estado de la orden en el store
        alert(`Orden ${order.id} recibida. Stock actualizado.`);
        setIsReceptionModalOpen(false);
    };

    const orders = suggestedOrders.length > 0 ? suggestedOrders : [{ id: 'mock1', status: 'ORDERED', supplierId: 'LABCHILE', dateCreated: new Date().toISOString(), items: [{ itemId: 'A100', name: 'Paracetamol', quantity: 100, expectedQty: 100 }] }] as PurchaseOrder[];

    // Colores para Kanban
    const statusColors = { PENDING: 'bg-amber-100 border-amber-500', ORDERED: 'bg-blue-100 border-blue-500', RECEIVED: 'bg-emerald-100 border-emerald-500' };

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <h1 className="text-3xl font-bold text-cyan-700 mb-6 flex items-center">
                <Package className="mr-3" /> Cadena de Suministro
            </h1>

            {/* Control y Agente AI */}
            <div className="flex justify-between items-center mb-8 p-4 bg-white rounded-xl shadow-md">
                <p className="text-lg font-semibold text-slate-700">Heurística de Compra (Días de Cobertura)</p>
                <button
                    onClick={runAgent}
                    className="flex items-center py-2 px-4 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition"
                >
                    <Zap size={20} className="mr-2" /> Ejecutar Agente AI
                </button>
            </div>

            {/* Sugerencias del Agente (Mock) */}
            {suggestedOrders.length > 0 && (
                <div className="mb-6 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 rounded-lg">
                    Agente AI sugiere {suggestedOrders.length} pedidos por quiebre de stock. Revise y apruebe.
                </div>
            )}

            {/* Kanban (Órdenes Activas) */}
            <div className="grid grid-cols-3 gap-6">
                {orders.map(order => (
                    <div key={order.id} className={`p-4 rounded-xl shadow-lg border-t-4 ${statusColors[order.status] || 'bg-slate-100 border-slate-300'}`}>
                        <p className="text-sm text-slate-500 flex justify-between">
                            <span>{order.supplierId}</span>
                            <Clock size={14} className="text-slate-500" />
                        </p>
                        <h3 className="text-xl font-semibold text-slate-800 my-2">Orden #{order.id}</h3>
                        <p className="text-xs font-medium text-slate-600 mb-4">{order.status}</p>

                        <ul className="text-sm space-y-1">
                            {order.items.slice(0, 3).map(item => (
                                <li key={item.itemId} className="flex justify-between">
                                    <span>{item.name}</span>
                                    <span className="font-mono font-semibold">{item.quantity} Uds</span>
                                </li>
                            ))}
                            {order.items.length > 3 && <li className="text-xs text-slate-500">...{order.items.length - 3} más</li>}
                        </ul>

                        <button
                            onClick={() => { setSelectedOrder(order); setIsReceptionModalOpen(true); }}
                            className="mt-4 w-full py-2 bg-cyan-700 text-white text-sm rounded-lg hover:bg-cyan-800 transition disabled:opacity-50"
                            disabled={order.status !== 'ORDERED'}
                        >
                            Confirmar Recepción
                        </button>
                    </div>
                ))}
            </div>

            {selectedOrder && isReceptionModalOpen && (
                <BlindReceptionModal
                    order={selectedOrder}
                    onReceive={handleReceive}
                    onClose={() => setIsReceptionModalOpen(false)}
                />
            )}
        </div>
    );
};

export default SupplyChainPage;
