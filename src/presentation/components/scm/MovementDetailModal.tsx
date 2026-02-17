import React, { useEffect, useState } from 'react';
import { X, Package, Hash, Calendar, AlertCircle, Info, RefreshCw } from 'lucide-react';
import { getHistoryItemDetailsSecure } from '@/actions/supply-v2';
import { toast } from 'sonner';

interface MovementDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    movement: any; // { id, main_type, status, ... }
}

export const MovementDetailModal: React.FC<MovementDetailModalProps> = ({ isOpen, onClose, movement }) => {
    const [items, setItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && movement) {
            fetchDetails();
        }
    }, [isOpen, movement]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const res = await getHistoryItemDetailsSecure(movement.id, movement.main_type);
            if (res.success) {
                setItems(res.data || []);
            } else {
                toast.error(res.error || 'Error al cargar detalles');
            }
        } catch (error) {
            toast.error('Error inesperado al cargar detalles');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen || !movement) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {movement.main_type === 'PO' ? (
                                <Package className="text-purple-600" size={20} />
                            ) : (
                                <Package className="text-cyan-600" size={20} />
                            )}
                            <h2 className="text-xl font-bold text-slate-900">
                                {movement.main_type === 'PO' ? 'Orden de Compra' : 'Despacho/Envío'}
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">ID: {movement.id}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                        <X size={20} />
                    </button>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Info Card */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Estado</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${movement.status === 'RECEIVED' || movement.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : movement.status === 'CANCELLED'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                {movement.status}
                            </span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Fecha</span>
                            <span className="text-sm font-bold text-slate-700">
                                {new Date(movement.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        {movement.supplier_name && (
                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 col-span-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Proveedor</span>
                                <span className="text-sm font-bold text-slate-700">{movement.supplier_name}</span>
                            </div>
                        )}
                        {movement.origin_location_name && (
                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Origen</span>
                                <span className="text-sm font-bold text-slate-700">{movement.origin_location_name}</span>
                            </div>
                        )}
                        {movement.location_name && (
                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                <span className="text-[10px) font-bold text-slate-400 uppercase tracking-wider block mb-1">Destino</span>
                                <span className="text-sm font-bold text-slate-700">{movement.location_name}</span>
                            </div>
                        )}
                    </div>

                    {/* Items List */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Info size={16} className="text-slate-400" />
                            Artículos en este movimiento ({items.length})
                        </h3>

                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center p-12 text-slate-400 animate-pulse">
                                <RefreshCw className="animate-spin mb-2" size={32} />
                                <p className="text-sm">Cargando desglose...</p>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="bg-slate-50 p-8 rounded-2xl border border-dashed border-slate-200 text-center">
                                <Package size={32} className="text-slate-300 mx-auto mb-2" />
                                <p className="text-sm text-slate-500 font-medium">No hay items registrados</p>
                            </div>
                        ) : (
                            <div className="border border-slate-100 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase">
                                        <tr>
                                            <th className="px-4 py-2">Producto</th>
                                            <th className="px-4 py-2 text-center">Cant.</th>
                                            {movement.main_type === 'PO' ? (
                                                <th className="px-4 py-2 text-center text-emerald-600">Recibida</th>
                                            ) : (
                                                <th className="px-4 py-2">Estado</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-slate-800 text-xs">{item.name}</div>
                                                    <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="font-bold text-slate-700 text-sm">{item.quantity}</span>
                                                </td>
                                                {movement.main_type === 'PO' ? (
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`font-bold text-sm ${item.quantity_received >= item.quantity ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                            {item.quantity_received || 0}
                                                        </span>
                                                    </td>
                                                ) : (
                                                    <td className="px-4 py-2">
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${item.condition === 'GOOD' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                                            }`}>
                                                            {item.condition === 'GOOD' ? 'OK' : 'Daño'}
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
                        <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block mb-1">Notas</span>
                            <p className="text-xs text-amber-800 font-medium whitespace-pre-wrap">{movement.notes}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
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

// Simple RefreshCw icon component

