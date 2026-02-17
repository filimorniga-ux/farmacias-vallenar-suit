import React from 'react';
import { Package, Truck, CheckCircle, Trash2 } from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { toast } from 'sonner';
import { deletePurchaseOrderSecure, updatePurchaseOrderSecure } from '@/actions/supply-v2';

interface SupplyKanbanProps {
    onEditOrder: (order: any) => void;
    onReceiveOrder: (order: any) => void;
    direction?: 'row' | 'col';
}

const SupplyKanban: React.FC<SupplyKanbanProps> = ({ onEditOrder, onReceiveOrder, direction = 'col' }) => {
    const { purchaseOrders, suppliers, removePurchaseOrder, updatePurchaseOrder, user } = usePharmaStore();

    const KanbanColumn = ({ title, status, color, icon: Icon }: any) => {
        const orders = purchaseOrders.filter(po => po.status === status);

        const handleMarkAsSent = async (po: any) => {
            if (!confirm('¿Marcar esta orden como enviada al proveedor?')) return;
            try {
                // Ensure strictly serializable plain data for Server Action
                const mappedData = {
                    id: String(po.id),
                    supplierId: po.supplier_id ? String(po.supplier_id) : null,
                    targetWarehouseId: String(po.target_warehouse_id),
                    notes: String(po.notes || ''),
                    status: 'SENT' as const,
                    items: (po.items || []).map((item: any) => ({
                        sku: String(item.sku),
                        name: String(item.name || 'Producto'),
                        quantity: Number(item.quantity_ordered || item.quantity || 1),
                        cost: Number(item.cost_price || item.cost || 0),
                        productId: item.product_id ? String(item.product_id) : null
                    }))
                };

                const res = await updatePurchaseOrderSecure(mappedData.id, mappedData as any, user?.id || 'SYSTEM');

                if (res.success) {
                    updatePurchaseOrder(po.id, { ...po, status: 'SENT' });
                    toast.success('Orden marcada como enviada');
                } else {
                    toast.error(res.error || 'Error al actualizar');
                }
            } catch (err: any) {
                console.error('Failed to update PO:', err);
                toast.error('Error de red al conectar con el servidor');
            }
        };

        return (
            <div className={`flex-1 min-w-[300px] bg-slate-100 rounded-3xl p-4 flex flex-col ${direction === 'col' ? 'min-h-[200px] max-h-[500px]' : 'h-full max-h-[calc(100vh-180px)]'}`}>
                <div className={`flex items-center gap-2 mb-4 px-2 ${color}`}>
                    <Icon size={20} />
                    <h3 className="font-bold text-slate-700">{title}</h3>
                    <span className="ml-auto bg-white/50 px-2 py-1 rounded-full text-xs font-bold">{orders.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                    {orders.length === 0 ? (
                        <div className="h-16 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-[10px] font-medium">
                            Sin órdenes
                        </div>
                    ) : (
                        orders.map(po => (
                            <div
                                key={po.id}
                                className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all cursor-pointer relative group animate-in fade-in slide-in-from-bottom-2"
                            >
                                <div
                                    onClick={() => {
                                        if (status === 'DRAFT') {
                                            onEditOrder(po);
                                        }
                                    }}
                                >
                                    <div className="flex justify-between items-start mb-1.5">
                                        <span className="text-[9px] font-mono font-bold text-slate-300 truncate max-w-[100px]">{po.id}</span>
                                        <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded uppercase">
                                            {new Date(po.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-slate-800 text-xs mb-0.5 truncate leading-tight">
                                        {suppliers.find(s => s.id === po.supplier_id)?.fantasy_name || 'Proveedor Desconocido'}
                                    </h4>
                                    <p className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
                                        <Package size={10} /> {po.items.length} productos
                                    </p>
                                </div>

                                {(status === 'DRAFT' || status === 'APPROVED' || status === 'SENT') && (
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!confirm('¿Desea eliminar esta orden?')) return;
                                            try {
                                                const res = await deletePurchaseOrderSecure({ orderId: po.id, userId: user?.id || 'SYSTEM' });
                                                if (res.success) {
                                                    removePurchaseOrder(po.id);
                                                    toast.success('Orden eliminada correctamente');
                                                } else {
                                                    toast.error(res.error || 'Error al eliminar');
                                                }
                                            } catch (err) {
                                                toast.error('Error de conexión');
                                            }
                                        }}
                                        className="absolute top-1.5 right-1.5 p-1 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                                        title="Eliminar orden"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}

                                {status === 'APPROVED' && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleMarkAsSent(po); }}
                                        className="w-full py-2 mb-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-bold shadow-sm shadow-amber-200 transition-all active:scale-95"
                                    >
                                        MARCAR ENVIADA
                                    </button>
                                )}

                                {(status === 'SENT' || status === 'APPROVED') && (
                                    <button
                                        onClick={() => onReceiveOrder(po)}
                                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold shadow-sm shadow-blue-200 transition-all active:scale-95"
                                    >
                                        RECEPCIONAR
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={`flex flex-1 gap-4 ${direction === 'row' ? 'overflow-x-auto pb-4' : 'flex-col overflow-y-auto pr-2 scrollbar-hide'}`}>
            <KanbanColumn title="Borradores" status="DRAFT" color="text-slate-600" icon={Package} />
            <KanbanColumn title="Aprobadas" status="APPROVED" color="text-amber-600" icon={CheckCircle} />
            <KanbanColumn title="En Camino" status="SENT" color="text-blue-600" icon={Truck} />
            <KanbanColumn title="Recibidas" status="RECEIVED" color="text-green-600" icon={CheckCircle} />
        </div>
    );
};

export default SupplyKanban;
