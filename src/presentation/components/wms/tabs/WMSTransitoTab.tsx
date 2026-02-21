import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowRight, ArrowRightLeft, Clock3, Package, RefreshCw, Route, ShieldCheck, User
} from 'lucide-react';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';
import { getShipmentsSecure } from '@/actions/wms-v2';
import { usePharmaStore } from '@/presentation/store/useStore';

type DirectionFilter = 'BOTH' | 'INCOMING' | 'OUTGOING';

interface ShipmentCard {
    id: string;
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
}

interface WMSTransitoTabProps {
    onReceiveShipment?: (shipmentId: string) => void;
}

const DIRECTION_META: Record<DirectionFilter, { label: string; badge: string }> = {
    BOTH: { label: 'Ambos sentidos', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
    INCOMING: { label: 'Entrante', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    OUTGOING: { label: 'Saliente', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
};

const getTypeLabel = (type: string) => {
    if (type === 'INTER_BRANCH') return 'Traspaso';
    if (type === 'OUTBOUND') return 'Despacho';
    if (type === 'INBOUND') return 'Ingreso';
    if (type === 'RETURN') return 'Devolución';
    return type;
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

export const WMSTransitoTab: React.FC<WMSTransitoTabProps> = ({ onReceiveShipment }) => {
    const { currentLocationId } = usePharmaStore();
    const [direction, setDirection] = useState<DirectionFilter>('BOTH');
    const [loading, setLoading] = useState(false);
    const [shipments, setShipments] = useState<ShipmentCard[]>([]);

    const fetchTransit = useCallback(async () => {
        if (!currentLocationId) {
            setShipments([]);
            return;
        }

        setLoading(true);
        try {
            const result = await getShipmentsSecure({
                locationId: currentLocationId,
                status: 'IN_TRANSIT',
                direction,
                page: 1,
                pageSize: 100,
            });

            if (result.success && result.data) {
                setShipments(result.data.shipments as ShipmentCard[]);
            } else {
                toast.error(result.error || 'No se pudieron cargar los envíos en tránsito');
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
    }, [currentLocationId, direction]);

    useEffect(() => {
        fetchTransit();
    }, [fetchTransit]);

    const summary = useMemo(() => {
        const incoming = shipments.filter(s => s.direction === 'INCOMING').length;
        const outgoing = shipments.filter(s => s.direction === 'OUTGOING').length;
        return { incoming, outgoing, total: shipments.length };
    }, [shipments]);

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
            ) : shipments.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                    <Package size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="font-semibold text-slate-700">Sin movimientos en tránsito</p>
                    <p className="text-sm text-slate-500 mt-1">No hay envíos para el filtro seleccionado.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {shipments.map((shipment) => (
                        <div
                            key={shipment.id}
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

                                {shipment.direction === 'INCOMING' && onReceiveShipment && (
                                    <button
                                        onClick={() => onReceiveShipment(shipment.id)}
                                        className="shrink-0 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"
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
