import React, { useEffect, useState } from 'react';
import {
    Download, Filter, History, Package, RefreshCw, SearchX, Truck, ArrowRight, ChevronRight, CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';
import { usePharmaStore } from '@/presentation/store/useStore';
import { exportSupplyChainHistorySecure, getSupplyChainHistorySecure } from '@/actions/supply-v2';
import { MovementDetailModal } from './MovementDetailModal';

type HistoryType = 'PO' | 'SHIPMENT' | '';

const formatDate = (value: string | number | Date) => {
    const date = new Date(value);
    return date.toLocaleDateString('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

const formatTime = (value: string | number | Date) => {
    const date = new Date(value);
    return date.toLocaleTimeString('es-CL', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const SupplyChainHistoryTab: React.FC = () => {
    const { currentLocationId } = usePharmaStore();
    const [history, setHistory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(15);
    const [isExporting, setIsExporting] = useState(false);

    const [typeFilter, setTypeFilter] = useState<HistoryType>('');
    const [statusFilter, setStatusFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [selectedMovement, setSelectedMovement] = useState<any>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const loadHistory = async () => {
        setIsLoading(true);
        try {
            const result = await getSupplyChainHistorySecure({
                locationId: currentLocationId || undefined,
                type: typeFilter || undefined,
                status: statusFilter || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                page,
                pageSize,
            });

            if (result.success) {
                setHistory(result.data || []);
                setTotal(result.total || 0);
            } else {
                toast.error(result.error || 'No se pudo cargar el historial');
            }
        } catch {
            toast.error('Error inesperado al cargar historial');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, typeFilter, statusFilter, startDate, endDate, currentLocationId]);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const result = await exportSupplyChainHistorySecure({
                locationId: currentLocationId || undefined,
                type: typeFilter || 'ALL',
                status: statusFilter || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                limit: 5000,
            });

            if (!result.success || !result.data) {
                toast.error(result.error || 'No se pudo exportar el historial');
                return;
            }

            const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = result.filename || `Historial_Logistica_${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(link);
            link.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(link);
            toast.success('Excel corporativo generado');
        } catch {
            toast.error('Error inesperado al exportar');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex flex-wrap gap-3 items-end justify-between">
                <div className="flex flex-wrap gap-2 items-end">
                    <div className="relative">
                        <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                            value={typeFilter}
                            onChange={(event) => { setTypeFilter(event.target.value as HistoryType); setPage(1); }}
                            className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 appearance-none"
                        >
                            <option value="">Todos los Tipos</option>
                            <option value="PO">Órdenes de Compra</option>
                            <option value="SHIPMENT">Traspasos / Despachos</option>
                        </select>
                    </div>

                    <div className="relative">
                        <History size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                            value={statusFilter}
                            onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
                            className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 appearance-none"
                        >
                            <option value="">Todos los Estados</option>
                            <option value="DRAFT">Borrador</option>
                            <option value="APPROVED">Aprobado</option>
                            <option value="IN_TRANSIT">En Tránsito</option>
                            <option value="RECEIVED">Recibido</option>
                            <option value="DELIVERED">Entregado</option>
                            <option value="CANCELLED">Cancelado</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(event) => { setStartDate(event.target.value); setPage(1); }}
                                className="pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>
                        <ArrowRight size={14} className="text-slate-300" />
                        <div className="relative">
                            <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(event) => { setEndDate(event.target.value); setPage(1); }}
                                className="pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-bold text-sm disabled:opacity-50"
                    >
                        {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                        Exportar Excel
                    </button>
                    <button
                        onClick={loadHistory}
                        disabled={isLoading}
                        className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading && history.length === 0 ? (
                    <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                        <RefreshCw className="animate-spin mb-4 text-sky-500" size={40} />
                        <p className="font-bold text-lg">Sincronizando historial...</p>
                    </div>
                ) : history.length === 0 ? (
                    <div className="p-20 flex flex-col items-center justify-center text-slate-400 text-center">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <SearchX size={40} className="text-slate-300" />
                        </div>
                        <h3 className="font-bold text-slate-800 text-lg">No se encontraron movimientos</h3>
                        <p className="text-sm max-w-[320px]">Prueba ajustando filtros de estado, tipo o rango de fechas.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo / ID</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Origen / Destino</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Responsables</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Items</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha</th>
                                    <th className="px-6 py-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {history.map(item => (
                                    <tr
                                        key={`${item.main_type}-${item.id}`}
                                        onClick={() => { setSelectedMovement(item); setIsModalOpen(true); }}
                                        className="group hover:bg-slate-50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${item.main_type === 'PO' ? 'bg-purple-50 text-purple-600' : 'bg-cyan-50 text-cyan-600'}`}>
                                                    {item.main_type === 'PO' ? <Package size={20} /> : <Truck size={20} />}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">
                                                        {item.main_type === 'PO' ? 'Orden de Compra' : 'Movimiento WMS'}
                                                    </div>
                                                    <div className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]">
                                                        {item.id}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.main_type === 'PO' ? (
                                                <div className="space-y-0.5">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Proveedor</div>
                                                    <div className="text-xs font-bold text-slate-700">{item.supplier_name || 'Sin proveedor'}</div>
                                                </div>
                                            ) : (
                                                <div className="space-y-0.5">
                                                    <div className="text-xs font-semibold text-slate-700">{item.origin_location_name || 'Origen'}</div>
                                                    <div className="text-[10px] text-slate-400">→ {item.location_name || 'Destino'}</div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${item.status === 'RECEIVED' || item.status === 'DELIVERED'
                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                : item.status === 'CANCELLED'
                                                    ? 'bg-red-50 text-red-600 border border-red-100'
                                                    : item.status === 'IN_TRANSIT'
                                                        ? 'bg-sky-50 text-sky-600 border border-sky-100'
                                                        : 'bg-amber-50 text-amber-600 border border-amber-100'
                                                }`}
                                            >
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-[11px] text-slate-600 space-y-0.5">
                                                <div>Creó: <strong className="text-slate-700">{item.created_by_name || 'Sistema'}</strong></div>
                                                <div>Autorizó: <strong className="text-slate-700">{item.authorized_by_name || '-'}</strong></div>
                                                <div>Recibió: <strong className="text-slate-700">{item.received_by_name || '-'}</strong></div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-700 text-sm">
                                                <Package size={14} className="text-slate-400" />
                                                {item.items_count} SKU
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-bold text-slate-700">{formatDate(item.created_at)}</div>
                                            <div className="text-[10px] text-slate-400">{formatTime(item.created_at)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="w-8 h-8 rounded-full bg-slate-50 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-all">
                                                <ChevronRight size={16} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {total > pageSize && (
                <div className="flex items-center justify-between px-2 text-sm">
                    <span className="text-slate-500 font-medium">Mostrando {history.length} de {total} movimientos</span>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={page === 1 || isLoading}
                            onClick={() => setPage(p => p - 1)}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            Anterior
                        </button>
                        <button
                            disabled={page * pageSize >= total || isLoading}
                            onClick={() => setPage(p => p + 1)}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}

            <MovementDetailModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                movement={selectedMovement}
            />
        </div>
    );
};

