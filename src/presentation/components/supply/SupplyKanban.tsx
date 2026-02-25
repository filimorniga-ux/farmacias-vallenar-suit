import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Package, RefreshCw, Trash2, Truck } from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useLocationStore } from '@/presentation/store/useLocationStore';
import { toast } from 'sonner';
import { deletePurchaseOrderSecure, getHistoryItemDetailsSecure, updatePurchaseOrderSecure } from '@/actions/supply-v2';
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
    onViewOrder?: (order: any) => void;
    onFinalizeReview?: (order: any) => void;
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
    onViewOrder?: (order: any) => void;
    onFinalizeReview?: (order: any) => void;
    removePurchaseOrder: (id: string) => void;
    updatePurchaseOrder: (id: string, data: any) => void;
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('es-CL');
}

function isPurchaseOrderEntry(entry: SupplyKanbanEntry): boolean {
    return entry.source === 'PO';
}

function resolveTargetWarehouseId(payload: Record<string, unknown>): string {
    const candidates: unknown[] = [
        payload.target_warehouse_id,
        payload.targetWarehouseId,
        payload.warehouse_id,
        payload.warehouseId,
    ];

    const resolved = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
    return typeof resolved === 'string' ? resolved.trim() : '';
}

function resolveOrderItems(payload: Record<string, unknown>): Record<string, unknown>[] {
    const candidates: unknown[] = [
        payload.items,
        payload.order_items,
        payload.line_items,
        payload.items_detail,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
        }
    }

    return [];
}

function buildViewPayload(entry: SupplyKanbanEntry): Record<string, unknown> {
    return {
        ...entry.payload,
        id: entry.id,
        status: entry.status,
        items_count: entry.itemCount,
        main_type: entry.source === 'PO' ? 'PO' : 'SHIPMENT',
        source_type: entry.source,
    };
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
    onViewOrder,
    onFinalizeReview,
    removePurchaseOrder,
    updatePurchaseOrder,
}) => {
    const columnEntries = entries.filter((entry) => entry.column === columnKey);
    const [submittingApproveId, setSubmittingApproveId] = useState<string | null>(null);
    const [pendingMarkAsSentId, setPendingMarkAsSentId] = useState<string | null>(null);
    const [submittingMarkAsSentId, setSubmittingMarkAsSentId] = useState<string | null>(null);

    const handleApproveDraft = async (entry: SupplyKanbanEntry) => {
        const po = entry.payload;
        if (submittingApproveId === entry.id) return;

        const targetWarehouseId = resolveTargetWarehouseId(po);
        if (!targetWarehouseId) {
            toast.error('La orden no tiene bodega de destino');
            return;
        }

        if (!isUuid(user?.id)) {
            toast.error('Sesión inválida para aprobar la orden');
            return;
        }

        try {
            setSubmittingApproveId(entry.id);
            let rawItems = resolveOrderItems(po);
            if (rawItems.length === 0) {
                const details = await getHistoryItemDetailsSecure(String(po.id), 'PO');
                if (details.success && Array.isArray(details.data)) {
                    rawItems = details.data.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
                }
            }

            if (rawItems.length === 0) {
                toast.error('La orden no tiene items para aprobar');
                return;
            }

            const mappedData = {
                id: String(po.id),
                supplierId: po.supplier_id ? String(po.supplier_id) : null,
                targetWarehouseId,
                notes: String(po.notes || ''),
                status: 'APPROVED' as const,
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
                updatePurchaseOrder(entry.id, { ...po, status: 'APPROVED' });
                toast.success('Solicitud aprobada');
            } else {
                toast.error(res.error || 'Error al aprobar solicitud');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error de red al conectar con el servidor');
        } finally {
            setSubmittingApproveId((current) => (current === entry.id ? null : current));
        }
    };

    const handleMarkAsSent = async (entry: SupplyKanbanEntry) => {
        const po = entry.payload;
        if (submittingMarkAsSentId === entry.id) return;

        const targetWarehouseId = resolveTargetWarehouseId(po);

        if (!targetWarehouseId) {
            toast.error('La orden no tiene bodega de destino');
            return;
        }

        if (!isUuid(user?.id)) {
            toast.error('Sesión inválida para actualizar la orden');
            return;
        }

        try {
            setSubmittingMarkAsSentId(entry.id);
            let rawItems = resolveOrderItems(po);

            if (rawItems.length === 0) {
                const details = await getHistoryItemDetailsSecure(String(po.id), 'PO');
                if (details.success && Array.isArray(details.data)) {
                    rawItems = details.data.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
                }
            }

            if (rawItems.length === 0) {
                toast.error('La orden no tiene items para enviar');
                return;
            }

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
                setPendingMarkAsSentId(null);
            } else {
                toast.error(res.error || 'Error al actualizar');
            }
        } catch (err: any) {
            toast.error(err?.message || 'Error de red al conectar con el servidor');
        } finally {
            setSubmittingMarkAsSentId((current) => (current === entry.id ? null : current));
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
                        const canApproveDraft = isPurchaseOrderEntry(entry) && columnKey === 'DRAFT';
                        const canDelete = isPurchaseOrderEntry(entry) && (columnKey === 'DRAFT' || columnKey === 'APPROVED' || columnKey === 'SENT');
                        const canMarkSent = isPurchaseOrderEntry(entry) && columnKey === 'APPROVED';
                        const canReceive = isPurchaseOrderEntry(entry) && columnKey === 'SENT';
                        const canFinalizeReview = isPurchaseOrderEntry(entry) && columnKey === 'REVIEW';
                        const canViewDetails = typeof onViewOrder === 'function';
                        const isPendingMarkAsSent = pendingMarkAsSentId === entry.id;
                        const isSubmittingMarkAsSent = submittingMarkAsSentId === entry.id;

                        return (
                            <div
                                key={`${entry.source}-${entry.id}`}
                                className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all relative group"
                            >
                                <div
                                    onClick={() => {
                                        if (canViewDetails) {
                                            onViewOrder?.(buildViewPayload(entry));
                                        }
                                    }}
                                    className={canViewDetails ? 'cursor-pointer' : 'cursor-default'}
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
                                    isPendingMarkAsSent ? (
                                        <div className="mb-2 p-2 rounded-xl border border-amber-200 bg-amber-50">
                                            <p className="text-[10px] font-semibold text-amber-800 mb-2">
                                                Confirmar envío a tránsito
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingMarkAsSentId(null);
                                                    }}
                                                    disabled={isSubmittingMarkAsSent}
                                                    className="py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-[10px] font-bold hover:bg-slate-50 disabled:opacity-50"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void handleMarkAsSent(entry);
                                                    }}
                                                    disabled={isSubmittingMarkAsSent}
                                                    className="py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold disabled:opacity-50"
                                                >
                                                    {isSubmittingMarkAsSent ? 'Enviando...' : 'Confirmar envío'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPendingMarkAsSentId(entry.id);
                                            }}
                                            className="w-full py-2 mb-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-bold shadow-sm shadow-amber-200 transition-all active:scale-95"
                                        >
                                            MARCAR EN TRÁNSITO
                                        </button>
                                    )
                                )}

                                {canApproveDraft && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void handleApproveDraft(entry);
                                        }}
                                        disabled={submittingApproveId === entry.id}
                                        className="w-full py-2 mb-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold shadow-sm shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {submittingApproveId === entry.id ? 'APROBANDO...' : 'APROBAR SOLICITUD'}
                                    </button>
                                )}

                                {canViewDetails && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onViewOrder?.(buildViewPayload(entry));
                                        }}
                                        className="w-full py-2 mb-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold transition-all active:scale-95"
                                    >
                                        VER DETALLE
                                    </button>
                                )}

                                {canEditDraft && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditOrder(entry.payload);
                                        }}
                                        className="w-full py-2 mb-2 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 rounded-xl text-[10px] font-bold transition-all active:scale-95"
                                    >
                                        EDITAR
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

                                {canFinalizeReview && (
                                    <button
                                        onClick={() => onFinalizeReview?.(entry.payload)}
                                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold shadow-sm shadow-emerald-200 transition-all active:scale-95"
                                    >
                                        VERIFICAR RECEPCIÓN
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

const SupplyKanban: React.FC<SupplyKanbanProps> = ({
    onEditOrder,
    onReceiveOrder,
    onViewOrder,
    onFinalizeReview,
    direction = 'col'
}) => {
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
    const scopedLocationId = isUuid(effectiveLocationId) ? effectiveLocationId : undefined;

    const refreshKanban = useCallback(async () => {
        setIsRefreshing(true);
        setLastError(null);
        try {
            const [shipmentsResult, purchaseOrdersResult] = await Promise.allSettled([
                refreshShipments(scopedLocationId),
                refreshPurchaseOrders(scopedLocationId),
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
                return;
            }

            const stateAfterScopedRefresh = usePharmaStore.getState();
            const hasEntriesWithScope = stateAfterScopedRefresh.shipments.length > 0 || stateAfterScopedRefresh.purchaseOrders.length > 0;

            if (scopedLocationId && !hasEntriesWithScope) {
                const [globalShipmentsResult, globalPurchaseOrdersResult] = await Promise.allSettled([
                    refreshShipments(undefined),
                    refreshPurchaseOrders(undefined),
                ]);
                const globalErrors: string[] = [];

                if (globalShipmentsResult.status === 'rejected') {
                    globalErrors.push(globalShipmentsResult.reason instanceof Error ? globalShipmentsResult.reason.message : 'Error cargando envíos globales');
                }
                if (globalPurchaseOrdersResult.status === 'rejected') {
                    globalErrors.push(globalPurchaseOrdersResult.reason instanceof Error ? globalPurchaseOrdersResult.reason.message : 'Error cargando órdenes globales');
                }

                if (globalErrors.length > 0) {
                    const globalMessage = globalErrors.join(' | ');
                    setLastError(globalMessage);
                    toast.error(globalMessage);
                    return;
                }
            }
        } catch (error: any) {
            const message = error?.message || 'No se pudo actualizar el tablero';
            setLastError(message);
            toast.error(message);
        } finally {
            setIsRefreshing(false);
        }
    }, [refreshPurchaseOrders, refreshShipments, scopedLocationId]);

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
        onViewOrder,
        onFinalizeReview,
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
                <KanbanColumn title="Revisión" columnKey="REVIEW" color="text-violet-600" icon={Package} {...sharedProps} />
                <KanbanColumn title="Recibidas" columnKey="RECEIVED" color="text-green-600" icon={CheckCircle} {...sharedProps} />
            </div>
        </div>
    );
};

export default SupplyKanban;
