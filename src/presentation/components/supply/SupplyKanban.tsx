import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Package, RefreshCw, Trash2, Truck } from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useLocationStore } from '@/presentation/store/useLocationStore';
import { toast } from 'sonner';
import { deletePurchaseOrderSecure, updatePurchaseOrderSecure } from '@/actions/supply-v2';
import {
    buildSupplyKanbanEntries,
    SupplyKanbanColumnKey,
    SupplyKanbanEntry,
} from './supplyKanbanUtils';

function isUuid(value: string | undefined): boolean {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface SupplyKanbanProps {
    onEditOrder: (order: any) => void;
    onReceiveOrder: (order: any) => void;
    direction?: 'row' | 'col';
}

interface KanbanColumnProps {
    title: string;
    columnKey: SupplyKanbanColumnKey;
    color: string;
    icon: React.ElementType;
    direction: 'row' | 'col';
    entries: SupplyKanbanEntry[];
    user: any;
    onEditOrder: (order: any) => void;
    onReceiveOrder: (order: any) => void;
    removePurchaseOrder: (id: string) => void;
    updatePurchaseOrder: (id: string, data: any) => void;
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es-CL');
}

function isPurchaseOrderEntry(entry: SupplyKanbanEntry): boolean {
    return entry.source === 'PO';
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
    title,
    columnKey,
    color,
    icon: Icon,
    direction,
    entries,
    user,
    onEditOrder,
    onReceiveOrder,
    removePurchaseOrder,
    updatePurchaseOrder,
}) => {
    const columnEntries = entries.filter((entry) => entry.column === columnKey);

    const handleMarkAsSent = async (entry: SupplyKanbanEntry) => {
        const po = entry.payload;
        if (!confirm('¿Marcar esta orden como enviada al proveedor?')) return;

        const rawItems = Array.isArray(po.items) ? po.items : [];
        const targetWarehouseId = po.target_warehouse_id ? String(po.target_warehouse_id) : '';

        if (!targetWarehouseId) {
            toast.error('La orden no tiene bodega de destino');
            return;
        }

        if (!isUuid(user?.id)) {
            toast.error('Sesión inválida para actualizar la orden');
            return;
        }

        try {
            const mappedData = {
                id: String(po.id),
                supplierId: po.supplier_id ? String(po.supplier_id) : null,
                targetWarehouseId,
                notes: String(po.notes || ''),
                status: 'SENT' as const,
                items: rawItems.map((item: any) => ({
                    sku: String(item.sku),
                    name: String(item.name || 'Producto'),
                    quantity: Number(item.quantity_ordered || item.quantity || 1),
                    cost: Number(item.cost_price || item.cost || 0),
                    productId: item.product_id ? String(item.product_id) : null,
                })),
            };

            const res = await updatePurchaseOrderSecure(mappedData.id, mappedData as any, String(user.id));

            if (res.success) {
                updatePurchaseOrder(entry.id, { ...po, status: 'SENT' });
                toast.success('Orden marcada como enviada');
            } else {
                toast.error(res.error || 'Error al actualizar');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error de red al conectar con el servidor');
        }
    };

    return (
        <div className={`bg-slate-100 rounded-3xl p-4 flex flex-col min-w-0 ${direction === 'col' ? 'min-h-[220px] max-h-[500px]' : 'min-h-[280px]'}`}>
            <div className={`flex items-center gap-2 mb-4 px-2 ${color}`}>
                <Icon size={20} />
                <h3 className="font-bold text-slate-700">{title}</h3>
                <span className="ml-auto bg-white/60 px-2 py-1 rounded-full text-xs font-bold">{columnEntries.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                {columnEntries.length === 0 ? (
                    <div className="h-16 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-[10px] font-medium">
                        Sin movimientos
                    </div>
                ) : (
                    columnEntries.map((entry) => {
                        const canEditDraft = isPurchaseOrderEntry(entry) && columnKey === 'DRAFT';
                        const canDelete = isPurchaseOrderEntry(entry) && (columnKey === 'DRAFT' || columnKey === 'APPROVED' || columnKey === 'SENT');
                        const canMarkSent = isPurchaseOrderEntry(entry) && columnKey === 'APPROVED';
                        const canReceive = isPurchaseOrderEntry(entry) && (columnKey === 'SENT' || columnKey === 'APPROVED');

                        return (
                            <div
                                key={`${entry.source}-${entry.id}`}
                                className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all relative group"
                            >
                                <div
                                    onClick={() => {
                                        if (canEditDraft) {
                                            onEditOrder(entry.payload);
                                        }
                                    }}
                                    className={canEditDraft ? 'cursor-pointer' : 'cursor-default'}
                                >
                                    <div className="flex justify-between items-start mb-1.5 gap-2">
                                        <span className="text-[9px] font-mono font-bold text-slate-300 truncate max-w-[140px]">{entry.id}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded uppercase">
                                                {entry.source}
                                            </span>
                                            <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded uppercase">
                                                {formatDate(entry.createdAt)}
                                            </span>
                                        </div>
                                    </div>

                                    <h4 className="font-bold text-slate-800 text-xs mb-0.5 truncate leading-tight">
                                        {entry.title}
                                    </h4>
                                    <p className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
                                        <Package size={10} /> {entry.itemCount} productos · {entry.subtitle}
                                    </p>
                                    {entry.notes && (
                                        <p className="text-[10px] text-slate-400 truncate">{entry.notes}</p>
                                    )}
                                </div>

                                {canDelete && (
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!confirm('¿Desea eliminar esta orden?')) return;
                                            if (!isUuid(user?.id)) {
                                                toast.error('Sesión inválida para eliminar la orden');
                                                return;
                                            }
                                            try {
                                                const res = await deletePurchaseOrderSecure({ orderId: entry.id, userId: String(user.id) });
                                                if (res.success) {
                                                    removePurchaseOrder(entry.id);
                                                    toast.success('Orden eliminada correctamente');
                                                } else {
                                                    toast.error(res.error || 'Error al eliminar');
                                                }
                                            } catch (error: any) {
                                                toast.error(error?.message || 'Error de conexión');
                                            }
                                        }}
                                        className="absolute top-1.5 right-1.5 p-1 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                                        title="Eliminar orden"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}

                                {canMarkSent && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); void handleMarkAsSent(entry); }}
                                        className="w-full py-2 mb-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-bold shadow-sm shadow-amber-200 transition-all active:scale-95"
                                    >
                                        MARCAR ENVIADA
                                    </button>
                                )}

                                {canReceive && (
                                    <button
                                        onClick={() => onReceiveOrder(entry.payload)}
                                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold shadow-sm shadow-blue-200 transition-all active:scale-95"
                                    >
                                        RECEPCIONAR
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

const SupplyKanban: React.FC<SupplyKanbanProps> = ({ onEditOrder, onReceiveOrder, direction = 'col' }) => {
    const {
        currentLocationId,
        purchaseOrders,
        shipments,
        suppliers,
        removePurchaseOrder,
        updatePurchaseOrder,
        refreshShipments,
        refreshPurchaseOrders,
        user,
    } = usePharmaStore();

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const locationStoreCurrentId = useLocationStore((state) => state.currentLocation?.id);
    const [localStorageLocationId, setLocalStorageLocationId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const contextId = localStorage.getItem('context_location_id');
            const preferredId = localStorage.getItem('preferred_location_id');
            setLocalStorageLocationId(contextId || preferredId || null);
        } catch {
            setLocalStorageLocationId(null);
        }
    }, []);

    const effectiveLocationId = currentLocationId || locationStoreCurrentId || localStorageLocationId || undefined;

    const refreshKanban = useCallback(async () => {
        setIsRefreshing(true);
        setLastError(null);
        try {
            const [shipmentsResult, purchaseOrdersResult] = await Promise.allSettled([
                refreshShipments(effectiveLocationId),
                refreshPurchaseOrders(effectiveLocationId),
            ]);
            const errors: string[] = [];

            if (shipmentsResult.status === 'rejected') {
                errors.push(shipmentsResult.reason instanceof Error ? shipmentsResult.reason.message : 'Error cargando envíos');
            }
            if (purchaseOrdersResult.status === 'rejected') {
                errors.push(purchaseOrdersResult.reason instanceof Error ? purchaseOrdersResult.reason.message : 'Error cargando órdenes');
            }

            if (errors.length > 0) {
                const message = errors.join(' | ');
                setLastError(message);
                toast.error(message);
            }
        } catch (error: any) {
            const message = error?.message || 'No se pudo actualizar el tablero';
            setLastError(message);
            toast.error(message);
        } finally {
            setIsRefreshing(false);
        }
    }, [effectiveLocationId, refreshPurchaseOrders, refreshShipments]);

    useEffect(() => {
        void refreshKanban();
    }, [refreshKanban]);

    const entries = useMemo(() => buildSupplyKanbanEntries({
        purchaseOrders,
        shipments,
        suppliers,
    }), [purchaseOrders, shipments, suppliers]);

    const sharedProps = {
        direction,
        entries,
        user,
        onEditOrder,
        onReceiveOrder,
        removePurchaseOrder,
        updatePurchaseOrder,
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium">
                    Kanban unificado: Órdenes de Compra + Movimientos WMS
                </p>
                <button
                    onClick={() => void refreshKanban()}
                    disabled={isRefreshing}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50 flex items-center gap-1.5"
                >
                    <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                    Actualizar
                </button>
            </div>

            {lastError && (
                <div className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium">
                    {lastError}
                </div>
            )}

            <div className={direction === 'row'
                ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4'
                : 'flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-hide'
            }>
                <KanbanColumn title="Borradores" columnKey="DRAFT" color="text-slate-600" icon={Package} {...sharedProps} />
                <KanbanColumn title="Aprobadas" columnKey="APPROVED" color="text-amber-600" icon={CheckCircle} {...sharedProps} />
                <KanbanColumn title="En Camino" columnKey="SENT" color="text-blue-600" icon={Truck} {...sharedProps} />
                <KanbanColumn title="Recibidas" columnKey="RECEIVED" color="text-green-600" icon={CheckCircle} {...sharedProps} />
            </div>
        </div>
    );
};

export default SupplyKanban;
