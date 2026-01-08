
import { useState, useEffect } from 'react';
import { X, Calendar, Search, AlertTriangle, Monitor, User, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePharmaStore } from '../../store/useStore';
import { ShiftDetailModal } from './ShiftDetailModal';

interface ShiftHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ShiftHistoryModal: React.FC<ShiftHistoryModalProps> = ({ isOpen, onClose }) => {
    const { user } = usePharmaStore();
    const [history, setHistory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

    // Filtros
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    useEffect(() => {
        if (isOpen) {
            loadHistory();
        }
    }, [isOpen, dateFrom, dateTo, statusFilter]);

    const loadHistory = async () => {
        setIsLoading(true);
        try {
            // Importación dinámica para evitar errores de compilación si el archivo no existe aún
            const { getShiftHistory } = await import('../../../actions/history-v2');

            // Convertir fechas a timestamps
            const startTimestamp = dateFrom ? new Date(dateFrom).getTime() : undefined;
            const endTimestamp = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : undefined;

            const res = await getShiftHistory({
                locationId: user?.assigned_location_id || undefined,
                startDate: startTimestamp || undefined,
                endDate: endTimestamp || undefined,
                status: (statusFilter === '' ? undefined : statusFilter) as any,
                limit: 20
            });

            if (res.success && res.data) {
                setHistory(res.data);
            } else {
                toast.error('Error cargando historial: ' + res.error);
            }
        } catch (e) {
            console.error(e);
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-slate-900 p-6 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Monitor className="text-cyan-400" /> Historial de Turnos
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Filters */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 shrink-0 items-end">
                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Desde</label>
                        <input
                            type="date"
                            className="p-2 border rounded-lg text-sm"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Hasta</label>
                        <input
                            type="date"
                            className="p-2 border rounded-lg text-sm"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Estado</label>
                        <select
                            className="p-2 border rounded-lg text-sm bg-white"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="">Todos</option>
                            <option value="OPEN">Abierto</option>
                            <option value="CLOSED">Cerrado Normal</option>
                            <option value="CLOSED_FORCE">Cierre Forzado</option>
                            <option value="CLOSED_AUTO">Auto-Cierre</option>
                        </select>
                    </div>
                    <button
                        onClick={loadHistory}
                        className="p-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
                    >
                        <Search size={20} />
                    </button>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto p-4">
                    {isLoading ? (
                        <div className="flex justify-center p-8 text-slate-400 animate-pulse">Cargando...</div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="p-3 rounded-tl-lg">Estado</th>
                                    <th className="p-3">Terminal</th>
                                    <th className="p-3">Usuario</th>
                                    <th className="p-3">Apertura</th>
                                    <th className="p-3">Cierre</th>
                                    <th className="p-3">Diferencia</th>
                                    <th className="p-3 rounded-tr-lg">Detalles</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                                            No se encontraron registros
                                        </td>
                                    </tr>
                                ) : (
                                    history.map((item: any) => {
                                        const isForced = item.status === 'CLOSED_FORCE';
                                        const isAuto = item.status === 'CLOSED_AUTO';
                                        const isOpen = item.status === 'OPEN';

                                        let statusColor = 'bg-slate-100 text-slate-600';
                                        let statusIcon = null;

                                        if (isOpen) {
                                            statusColor = 'bg-green-100 text-green-700 border border-green-200';
                                            statusIcon = '🟢';
                                        } else if (isForced) {
                                            statusColor = 'bg-red-100 text-red-700 border border-red-200';
                                            statusIcon = <AlertTriangle size={14} />;
                                        } else if (isAuto) {
                                            statusColor = 'bg-amber-50 text-amber-700 border border-amber-200';
                                            statusIcon = <AlertCircle size={14} />;
                                        } else {
                                            statusColor = 'bg-blue-50 text-blue-700 border border-blue-200';
                                            statusIcon = '✅';
                                        }

                                        return (
                                            <tr
                                                key={item.id}
                                                className="hover:bg-slate-50 transition-colors cursor-pointer group"
                                                onClick={() => setSelectedSessionId(item.id)}
                                            >
                                                <td className="p-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                                                        {statusIcon} {item.status}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-medium text-slate-800">
                                                    {item.terminal_name}
                                                </td>
                                                <td className="p-3 text-slate-600">
                                                    <div className="flex items-center gap-1">
                                                        <User size={14} className="text-slate-400" />
                                                        {item.user_name}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-slate-500 text-xs">
                                                    {formatDate(item.opened_at)}
                                                    <div className="text-slate-400 font-mono mt-0.5">
                                                        {formatCurrency(item.opening_amount)}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-slate-500 text-xs">
                                                    {item.closed_at ? formatDate(item.closed_at) : '-'}
                                                    {item.closing_amount !== null && (
                                                        <div className="text-slate-400 font-mono mt-0.5">
                                                            {formatCurrency(item.closing_amount)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    {item.difference !== null ? (
                                                        <span className={`font-mono font-bold ${item.difference < 0 ? 'text-red-600' : (item.difference > 0 ? 'text-green-600' : 'text-slate-400')}`}>
                                                            {item.difference > 0 ? '+' : ''}{formatCurrency(item.difference)}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td className="p-3 max-w-[200px]">
                                                    {item.notes ? (
                                                        <div className="text-xs text-slate-600 italic truncate group-hover:text-slate-800 transition-colors" title={item.notes}>
                                                            "{item.notes}"
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Shift Detail Modal */}
            <ShiftDetailModal
                isOpen={!!selectedSessionId}
                sessionId={selectedSessionId}
                onClose={() => setSelectedSessionId(null)}
            />
        </div>
    );
};
