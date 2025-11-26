import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { PurchasingAgent } from '../../domain/logic/purchasingAgent';
import { Package, Truck, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import BlindReceptionModal from '../components/scm/BlindReceptionModal';

const SupplyChainPage: React.FC = () => {
    const { inventory, suppliers, purchaseOrders, addPurchaseOrder, receivePurchaseOrder } = usePharmaStore();
    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    // Run Purchasing Agent on mount
    useEffect(() => {
        const suggestions = PurchasingAgent.generateSuggestions(inventory, suppliers);
        // In a real app, we would diff this with existing POs to avoid duplicates
        // For MVP, we just log them or add them if empty
        if (purchaseOrders.length === 0 && suggestions.length > 0) {
            suggestions.forEach(po => addPurchaseOrder(po));
        }
    }, []);

    const KanbanColumn = ({ title, status, color, icon: Icon }: any) => {
        const orders = purchaseOrders.filter(po => po.status === status);

        return (
            <div className="flex-1 min-w-[300px] bg-slate-100 rounded-3xl p-4 flex flex-col h-full">
                <div className={`flex items-center gap-2 mb-4 px-2 ${color}`}>
                    <Icon size={20} />
                    <h3 className="font-bold text-slate-700">{title}</h3>
                    <span className="ml-auto bg-white/50 px-2 py-1 rounded-full text-xs font-bold">{orders.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3">
                    {orders.map(po => (
                        <div key={po.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all cursor-pointer">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono text-slate-400">{po.id}</span>
                                <span className="text-xs font-bold text-slate-600">{new Date(po.created_at).toLocaleDateString()}</span>
                            </div>
                            <h4 className="font-bold text-slate-800 mb-1">{suppliers.find(s => s.id === po.supplier_id)?.fantasy_name || 'Proveedor Desconocido'}</h4>
                            <p className="text-sm text-slate-500 mb-3">{po.items.length} Items</p>

                            {status === 'SENT' && (
                                <button
                                    onClick={() => { setSelectedOrder(po); setIsReceptionModalOpen(true); }}
                                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                                >
                                    RECEPCIONAR
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="h-screen p-6 bg-slate-50 flex flex-col">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900">Cadena de Suministro</h1>
                    <p className="text-slate-500">Gestión Inteligente de Abastecimiento</p>
                </div>
                <button className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition shadow-lg">
                    <Plus size={20} /> Nueva Orden Manual
                </button>
            </header>

            <div className="flex-1 flex gap-6 overflow-x-auto pb-4">
                <KanbanColumn title="Sugerido (IA)" status="SUGGESTED" color="text-purple-600" icon={AlertCircle} />
                <KanbanColumn title="Borrador" status="DRAFT" color="text-slate-600" icon={Package} />
                <KanbanColumn title="Enviado" status="SENT" color="text-blue-600" icon={Truck} />
                <KanbanColumn title="Completado" status="COMPLETED" color="text-emerald-600" icon={CheckCircle} />
            </div>

            {isReceptionModalOpen && selectedOrder && (
                <BlindReceptionModal
                    order={selectedOrder}
                    onClose={() => setIsReceptionModalOpen(false)}
                    onReceive={(order, items) => {
                        receivePurchaseOrder(order.id, items.map(i => ({ sku: i.sku, received_qty: i.receivedQty })));
                        setIsReceptionModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default SupplyChainPage;
