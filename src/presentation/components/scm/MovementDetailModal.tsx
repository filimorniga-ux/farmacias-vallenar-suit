import React, { useEffect, useState } from 'react';
import { AlertCircle, Info, Package, RefreshCw, ShieldCheck, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { getHistoryItemDetailsSecure } from '@/actions/supply-v2';

interface MovementDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    movement: any;
}

const formatDateTime = (value?: string | number | Date | null) => {
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

interface TransferRouteMeta {
    originName?: string;
    destinationName?: string;
}

const extractTransferRouteMeta = (notes: unknown): TransferRouteMeta => {
    if (typeof notes !== 'string' || notes.length === 0) return {};

    const originMatch = notes.match(/ORIGEN:\s*([^|]+?)\(([^)]+)\)/i);
    const destinationMatch = notes.match(/DESTINO:\s*([^|]+?)\(([^)]+)\)/i);

    return {
        originName: originMatch?.[1]?.trim() || undefined,
        destinationName: destinationMatch?.[1]?.trim() || undefined,
    };
};

export const MovementDetailModal: React.FC<MovementDetailModalProps> = ({ isOpen, onClose, movement }) => {
    const [items, setItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !movement) return;

        const fetchDetails = async () => {
            setIsLoading(true);
            try {
                const result = await getHistoryItemDetailsSecure(movement.id, movement.main_type);
                if (result.success) {
                    setItems(result.data || []);
                } else {
                    toast.error(result.error || 'No se pudieron cargar los productos');
                }
            } catch {
                toast.error('Error inesperado al cargar detalle');
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [isOpen, movement]);

    if (!isOpen || !movement) return null;

    const isPO = movement.main_type === 'PO';
    const routeMeta = extractTransferRouteMeta(movement.notes);
    const routeOrigin =
        movement.origin_location_name ||
        routeMeta.originName ||
        (movement.supplier_name && movement.supplier_name !== 'Proveedor Desconocido'
            ? movement.supplier_name
            : 'Origen no especificado');
    const routeDestination =
        movement.location_name ||
        movement.destination_location_name ||
        routeMeta.destinationName ||
        'Destino no especificado';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Package className={isPO ? 'text-purple-600' : 'text-cyan-600'} size={20} />
                            <h2 className="text-xl font-bold text-slate-900">
                                {isPO ? 'Orden de Compra' : 'Traspaso / Despacho'}
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">ID: {movement.id}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
                    >
                        <X size={20} />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Estado</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${movement.status === 'RECEIVED' || movement.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : movement.status === 'CANCELLED'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                            >
                                {movement.status}
                            </span>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Creado</span>
                            <span className="text-sm font-bold text-slate-700">{formatDateTime(movement.created_at)}</span>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Creado por</span>
                            <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                <User size={13} className="text-slate-400" />
                                {movement.created_by_name || 'Sistema'}
                            </span>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Autorizado por</span>
                            <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                <ShieldCheck size={13} className="text-slate-400" />
                                {movement.authorized_by_name || '-'}
                            </span>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Recibido por</span>
                            <span className="text-sm font-bold text-slate-700">{movement.received_by_name || '-'}</span>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Fecha Recepción</span>
                            <span className="text-sm font-bold text-slate-700">{formatDateTime(movement.received_at)}</span>
                        </div>

                        {movement.supplier_name && (
                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 col-span-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Proveedor</span>
                                <span className="text-sm font-bold text-slate-700">{movement.supplier_name}</span>
                            </div>
                        )}

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 col-span-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Ruta</span>
                            <span className="text-sm font-bold text-slate-700">
                                {routeOrigin} → {routeDestination}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Info size={16} className="text-slate-400" />
                            Desglose de productos ({items.length})
                        </h3>

                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center p-10 text-slate-400">
                                <RefreshCw className="animate-spin mb-2" size={30} />
                                <p className="text-sm">Cargando detalle...</p>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="bg-slate-50 p-8 rounded-2xl border border-dashed border-slate-200 text-center">
                                <AlertCircle size={30} className="text-slate-300 mx-auto mb-2" />
                                <p className="text-sm text-slate-500 font-medium">No hay productos registrados</p>
                            </div>
                        ) : (
                            <div className="border border-slate-100 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase">
                                        <tr>
                                            <th className="px-4 py-2">Producto</th>
                                            <th className="px-4 py-2 text-right">Cantidad</th>
                                            <th className="px-4 py-2 text-right">{isPO ? 'Recibida' : 'Lote'}</th>
                                            {!isPO && <th className="px-4 py-2 text-right">Estado</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {items.map(item => (
                                            <tr key={item.id || `${item.sku}-${item.name}`} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-slate-800 text-xs">{item.name}</div>
                                                    <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-700">{item.quantity || 0}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-700">
                                                    {isPO ? (item.quantity_received || 0) : (item.lot_number || '-')}
                                                </td>
                                                {!isPO && (
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${item.condition === 'GOOD' || !item.condition
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-red-100 text-red-700'
                                                            }`}
                                                        >
                                                            {item.condition === 'DAMAGED' ? 'Dañado' : 'OK'}
                                                        </span>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {movement.notes && (
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                            <span className="text-[10px] font-bold text-amber-500 uppercase block mb-1">Notas</span>
                            <p className="text-xs text-amber-800 font-medium whitespace-pre-wrap">{movement.notes}</p>
                        </div>
                    )}
                </div>

                <footer className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition shadow-sm text-sm"
                    >
                        Cerrar
                    </button>
                </footer>
            </div>
        </div>
    );
};
