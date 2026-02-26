import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowRight, ArrowRightLeft, Clock3, Package, RefreshCw, Route, ShieldCheck, User
} from 'lucide-react';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';
import { usePharmaStore } from '@/presentation/store/useStore';

type DirectionFilter = 'BOTH' | 'INCOMING' | 'OUTGOING';

interface ShipmentCard {
    id: string;
    source: 'SHIPMENT' | 'PO';
    type: string;
    status: string;
    origin_location_name?: string;
    destination_location_name?: string;
    created_at: number;
    created_by_name?: string;
    authorized_by_name?: string;
    received_by_name?: string;
    direction: DirectionFilter;
    items: Array<{
        id: string;
        sku: string;
        name: string;
        quantity: number;
    }>;
    payload?: Record<string, unknown>;
}

interface WMSTransitoTabProps {
    onReceiveShipment?: (shipmentId: string) => void;
    onReceivePurchaseOrder?: (order: Record<string, unknown>) => void;
}

const DIRECTION_META: Record<DirectionFilter, { label: string; badge: string }> = {
    BOTH: { label: 'Ambos sentidos', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
    INCOMING: { label: 'Entrante', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    OUTGOING: { label: 'Saliente', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
};

const getTypeLabel = (type: string) => {
    if (type === 'PO') return 'Orden Compra';
    if (type === 'INTER_BRANCH') return 'Traspaso';
    if (type === 'OUTBOUND') return 'Despacho';
    if (type === 'INBOUND') return 'Ingreso';
    if (type === 'RETURN') return 'Devolución';
    return type;
};

const TRANSIT_PO_STATUSES = new Set([
    'SENT',
    'ORDERED',
    'PARTIAL',
    'IN_TRANSIT',
    'PENDING_RECEIPT',
]);

const normalizeStatus = (status: unknown): string => {
    if (typeof status !== 'string') return '';
    return status.trim().replace(/[\s-]+/g, '_').toUpperCase();
};

interface TransferRouteMeta {
    originName?: string;
    originId?: string;
    destinationName?: string;
    destinationId?: string;
}

const extractTransferRouteMeta = (notes: unknown): TransferRouteMeta => {
    if (typeof notes !== 'string' || notes.length === 0) return {};

    const originMatch = notes.match(/ORIGEN:\s*([^|]+?)\(([^)]+)\)/i);
    const destinationMatch = notes.match(/DESTINO:\s*([^|]+?)\(([^)]+)\)/i);

    return {
        originName: originMatch?.[1]?.trim() || undefined,
        originId: originMatch?.[2]?.trim() || undefined,
        destinationName: destinationMatch?.[1]?.trim() || undefined,
        destinationId: destinationMatch?.[2]?.trim() || undefined,
    };
};

const resolveOrderDirection = (
    order: Record<string, unknown>,
    locationId: string
): DirectionFilter => {
    const route = extractTransferRouteMeta(order.notes);
    const rawOrderLocationId =
        typeof order.location_id === 'string'
            ? order.location_id
            : typeof order.destination_location_id === 'string'
                ? order.destination_location_id
                : '';

    if (route.originId && route.originId === locationId) return 'OUTGOING';
    if (route.destinationId && route.destinationId === locationId) return 'INCOMING';
    if (rawOrderLocationId && rawOrderLocationId === locationId) return 'INCOMING';
    return 'BOTH';
};

const toShipmentCardsFromPurchaseOrders = (
    purchaseOrders: unknown[],
    currentLocationId: string
): ShipmentCard[] => {
    return purchaseOrders.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];

        const order = raw as Record<string, unknown>;
        const normalizedStatus = normalizeStatus(order.status);
        if (!TRANSIT_PO_STATUSES.has(normalizedStatus)) return [];
        const route = extractTransferRouteMeta(order.notes);
        const rawItems = Array.isArray(order.items) ? order.items : [];
        const direction = resolveOrderDirection(order, currentLocationId);
        const destinationLocationName =
            route.destinationName ||
            (typeof order.location_name === 'string' ? order.location_name : undefined);

        const originLocationName =
            route.originName ||
            (typeof order.supplier_name === 'string' ? order.supplier_name : undefined) ||
            'Proveedor';

        return [{
            id: String(order.id || ''),
            source: 'PO' as const,
            type: 'PO',
            status: normalizedStatus || 'SENT',
            origin_location_name: originLocationName,
            destination_location_name: destinationLocationName || 'Destino',
            created_at: typeof order.created_at === 'number' ? order.created_at : Date.now(),
            created_by_name: typeof order.created_by_name === 'string' ? order.created_by_name : undefined,
            authorized_by_name: typeof order.approved_by_name === 'string' ? order.approved_by_name : undefined,
            received_by_name: typeof order.received_by_name === 'string' ? order.received_by_name : undefined,
            direction,
            items: rawItems.map((item, index) => {
                const row = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
                return {
                    id: `${String(order.id || 'po')}-${index}`,
                    sku: String(row.sku || '-'),
                    name: String(row.name || 'Producto'),
                    quantity: Number(row.quantity_ordered ?? row.quantity ?? 0),
                };
            }),
            payload: order,
        }];
    });
};

const formatDate = (value: number | null | undefined) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const WMSTransitoTab: React.FC<WMSTransitoTabProps> = ({
    onReceiveShipment,
    onReceivePurchaseOrder,
}) => {
    const {
        currentLocationId,
        shipments: storeShipments,
        purchaseOrders: storePurchaseOrders,
        refreshShipments,
        refreshPurchaseOrders,
    } = usePharmaStore();
    const [direction, setDirection] = useState<DirectionFilter>('BOTH');
    const [loading, setLoading] = useState(false);

    const fetchTransit = useCallback(async () => {
        if (!currentLocationId) {
            return;
        }

        setLoading(true);
        try {
            const [scopedShipments, scopedPurchaseOrders] = await Promise.allSettled([
                refreshShipments(currentLocationId),
                refreshPurchaseOrders(currentLocationId),
            ]);

            const scopedState = usePharmaStore.getState();
            const hasScopedEntries =
                scopedState.shipments.length > 0 || scopedState.purchaseOrders.length > 0;

            if (!hasScopedEntries) {
                await Promise.allSettled([
                    refreshShipments(undefined),
                    refreshPurchaseOrders(undefined),
                ]);
            }

            if (scopedShipments.status === 'rejected' && scopedPurchaseOrders.status === 'rejected') {
                toast.error('No se pudieron cargar los movimientos en tránsito');
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', tab: 'Transito', action: 'fetchTransit' },
                extra: { currentLocationId, direction },
            });
            toast.error('Error al consultar tránsito');
        } finally {
            setLoading(false);
        }
    }, [currentLocationId, direction, refreshPurchaseOrders, refreshShipments]);

    useEffect(() => {
        void fetchTransit();
    }, [fetchTransit]);

    const transitRows = useMemo(() => {
        if (!currentLocationId) return [] as ShipmentCard[];

        const shipmentRows = (Array.isArray(storeShipments) ? storeShipments : [])
            .filter((raw) => !!raw && typeof raw === 'object')
            .map((raw) => {
                const row = raw as unknown as Record<string, unknown>;
                const rowDirection: DirectionFilter =
                    row.destination_location_id === currentLocationId
                        ? 'INCOMING'
                        : row.origin_location_id === currentLocationId
                            ? 'OUTGOING'
                            : 'BOTH';

                return {
                    id: String(row.id || ''),
                    source: 'SHIPMENT' as const,
                    type: String(row.type || 'SHIPMENT'),
                    status: normalizeStatus(row.status),
                    origin_location_name: typeof row.origin_location_name === 'string' ? row.origin_location_name : undefined,
                    destination_location_name: typeof row.destination_location_name === 'string' ? row.destination_location_name : undefined,
                    created_at: typeof row.created_at === 'number' ? row.created_at : Date.now(),
                    created_by_name: typeof row.created_by_name === 'string' ? row.created_by_name : undefined,
                    authorized_by_name: typeof row.authorized_by_name === 'string' ? row.authorized_by_name : undefined,
                    received_by_name: typeof row.received_by_name === 'string' ? row.received_by_name : undefined,
                    direction: rowDirection,
                    items: Array.isArray(row.items)
                        ? row.items.map((item, index) => {
                            const itemRow = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                            return {
                                id: String(itemRow.id || `${String(row.id || 'shipment')}-${index}`),
                                sku: String(itemRow.sku || '-'),
                                name: String(itemRow.name || 'Producto'),
                                quantity: Number(itemRow.quantity ?? 0),
                            };
                        })
                        : [],
                    payload: row,
                } satisfies ShipmentCard;
            })
            .filter((row) => row.status === 'IN_TRANSIT');

        const purchaseOrderRows = toShipmentCardsFromPurchaseOrders(
            Array.isArray(storePurchaseOrders) ? storePurchaseOrders : [],
            currentLocationId
        );

        return [...shipmentRows, ...purchaseOrderRows]
            .filter((row) => direction === 'BOTH' || row.direction === direction)
            .sort((a, b) => b.created_at - a.created_at);
    }, [currentLocationId, direction, storePurchaseOrders, storeShipments]);

    const summary = useMemo(() => {
        const incoming = transitRows.filter(s => s.direction === 'INCOMING').length;
        const outgoing = transitRows.filter(s => s.direction === 'OUTGOING').length;
        return { incoming, outgoing, total: transitRows.length };
    }, [transitRows]);

    if (!currentLocationId) {
        return (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                <Route size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="font-semibold text-slate-700">No hay ubicación activa</p>
                <p className="text-sm text-slate-500 mt-1">Selecciona una sucursal o bodega para revisar tránsito.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <Route size={16} className="text-indigo-500" />
                            Mercancía En Tránsito
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Total: {summary.total} • Entrantes: {summary.incoming} • Salientes: {summary.outgoing}
                        </p>
                    </div>
                    <button
                        onClick={fetchTransit}
                        disabled={loading}
                        className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-60"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                </div>

                <div className="flex flex-wrap gap-2">
                    {(['BOTH', 'INCOMING', 'OUTGOING'] as DirectionFilter[]).map(value => (
                        <button
                            key={value}
                            onClick={() => setDirection(value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${direction === value
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            {DIRECTION_META[value].label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <RefreshCw size={26} className="animate-spin text-indigo-400" />
                </div>
            ) : transitRows.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                    <Package size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="font-semibold text-slate-700">Sin movimientos en tránsito</p>
                    <p className="text-sm text-slate-500 mt-1">No hay envíos para el filtro seleccionado.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {transitRows.map((shipment) => (
                        <div
                            key={`${shipment.source}-${shipment.id}`}
                            className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-indigo-200 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">
                                            {getTypeLabel(shipment.type)}
                                        </span>
                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${DIRECTION_META[shipment.direction].badge}`}>
                                            {DIRECTION_META[shipment.direction].label}
                                        </span>
                                        <span className="text-xs text-slate-400 font-mono">
                                            #{shipment.id.slice(0, 8)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <span>{shipment.origin_location_name || 'Origen'}</span>
                                        <ArrowRight size={14} className="text-slate-300 shrink-0" />
                                        <span>{shipment.destination_location_name || 'Destino'}</span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <Clock3 size={12} />
                                            {formatDate(shipment.created_at)}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Package size={12} />
                                            {shipment.items.length} SKU
                                        </span>
                                        {shipment.created_by_name && (
                                            <span className="flex items-center gap-1">
                                                <User size={12} />
                                                Creó: {shipment.created_by_name}
                                            </span>
                                        )}
                                        {shipment.authorized_by_name && (
                                            <span className="flex items-center gap-1">
                                                <ShieldCheck size={12} />
                                                Autorizó: {shipment.authorized_by_name}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {shipment.source === 'SHIPMENT' && shipment.direction === 'INCOMING' && onReceiveShipment && (
                                    <button
                                        onClick={() => onReceiveShipment(shipment.id)}
                                        className="shrink-0 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"
                                    >
                                        Recepcionar
                                        <ArrowRightLeft size={14} />
                                    </button>
                                )}
                                {shipment.source === 'PO' && shipment.direction === 'INCOMING' && onReceivePurchaseOrder && shipment.payload && (
                                    <button
                                        onClick={() => onReceivePurchaseOrder(shipment.payload!)}
                                        className="shrink-0 px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5"
                                    >
                                        Recepcionar
                                        <ArrowRightLeft size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WMSTransitoTab;
