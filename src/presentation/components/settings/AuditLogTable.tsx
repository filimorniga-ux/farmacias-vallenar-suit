import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, Download, RefreshCw, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { getAuditEvents } from '@/actions/audit-v2';
import { toast } from 'sonner';

interface AuditLog {
    id: number;
    usuario: string;
    accion: string;
    detalle: string;
    fecha: string; // ISO DB string
    ip?: string;
}

export const AuditLogTable: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [userFilter, setUserFilter] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [dateFilter, setDateFilter] = useState<{ start: string, end: string }>({
        start: new Date().toISOString().split('T')[0], // Today
        end: new Date().toISOString().split('T')[0]
    });

    const [selectedDetail, setSelectedDetail] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            // V2: Nuevo formato de llamada
            const res = await getAuditEvents({
                userName: userFilter && userFilter.trim() !== '' ? userFilter : undefined,
                actionType: actionFilter && actionFilter !== '' ? actionFilter : undefined,
                startDate: dateFilter.start,
                endDate: dateFilter.end,
                limit: 100
            });
            if (res.success && res.data) {
                // Mapear formato V2 a formato esperado por UI
                setLogs(res.data.map((e: any) => ({
                    id: e.id,
                    usuario: e.userId || 'Sistema',
                    accion: e.actionType || e.actionCategory || 'N/A',
                    detalle: JSON.stringify(e.newValues || {}),
                    fecha: e.createdAt,
                    ip: e.ipAddress
                })));
            } else {
                toast.error(res.error || 'Error cargando registros');
            }
        } catch (error) {
            toast.error('Error cargando registros de auditoría');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []); // Initial load

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchLogs();
    };

    const formatJSON = (jsonString: string) => {
        try {
            const obj = JSON.parse(jsonString);
            return <pre className="text-xs bg-slate-100 p-2 rounded overflow-auto max-h-40">{JSON.stringify(obj, null, 2)}</pre>;
        } catch (e) {
            return <span className="text-slate-500 italic">{jsonString}</span>;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Filters */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Usuario</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre..."
                                value={userFilter}
                                onChange={(e) => setUserFilter(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Acción</label>
                        <select
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                        >
                            <option value="">Todas</option>
                            <option value="LOGIN">LOGIN</option>
                            <option value="CREATE_PRODUCT">CREATE_PRODUCT</option>
                            <option value="UPDATE_PRODUCT">UPDATE_PRODUCT</option>
                            <option value="DELETE_PRODUCT">DELETE_PRODUCT</option>
                            <option value="UPDATE_STOCK">UPDATE_STOCK</option>
                            <option value="VOID_SALE">VOID_SALE</option>
                            <option value="OVERRIDE_PRICE">OVERRIDE_PRICE</option>
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Desde</label>
                            <input
                                type="date"
                                value={dateFilter.start}
                                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Hasta</label>
                            <input
                                type="date"
                                value={dateFilter.end}
                                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg disabled:opacity-50 flex items-center gap-2"
                    >
                        {loading ? <RefreshCw className="animate-spin" size={18} /> : <Filter size={18} />}
                        Filtrar
                    </button>
                </form>
            </div>

            {/* Logs Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 font-bold text-slate-600 text-sm">Fecha/Hora</th>
                                <th className="p-4 font-bold text-slate-600 text-sm">Usuario</th>
                                <th className="p-4 font-bold text-slate-600 text-sm">Acción</th>
                                <th className="p-4 font-bold text-slate-600 text-sm">IP</th>
                                <th className="p-4 font-bold text-slate-600 text-sm">Detalles</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400">
                                        No se encontraron registros para los filtros seleccionados
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50 transition">
                                        <td className="p-4 text-sm text-slate-600 whitespace-nowrap">
                                            {new Date(log.fecha).toLocaleString()}
                                        </td>
                                        <td className="p-4 text-sm font-bold text-slate-800">
                                            {log.usuario}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${log.accion.includes('DELETE') || log.accion.includes('VOID') ? 'bg-red-100 text-red-700' :
                                                log.accion.includes('UPDATE') ? 'bg-amber-100 text-amber-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                {log.accion}
                                            </span>
                                        </td>
                                        <td className="p-4 text-xs font-mono text-slate-500">
                                            {log.ip || '-'}
                                        </td>
                                        <td className="p-4 text-sm text-slate-600">
                                            <button
                                                onClick={() => setSelectedDetail(selectedDetail === String(log.id) ? null : String(log.id))}
                                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-bold underline"
                                            >
                                                {selectedDetail === String(log.id) ? 'Ocultar' : 'Ver JSON'}
                                            </button>

                                            {selectedDetail === String(log.id) && (
                                                <div className="mt-2">
                                                    {formatJSON(log.detalle)}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-center">
                    Mostrando últimos {logs.length} registros (Máx 500 por consulta)
                </div>
            </div>
        </div>
    );
};
