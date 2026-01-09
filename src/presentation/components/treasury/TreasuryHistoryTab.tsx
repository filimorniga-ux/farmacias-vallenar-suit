import React, { useState, useEffect } from 'react';
// V2: Funciones seguras con RBAC y auditoría
import { getRemittanceHistorySecure, RemittanceHistoryItem } from '@/actions/treasury-v2';
import { exportCashFlowSecure } from '@/actions/finance-export-v2';
import { usePharmaStore } from '@/presentation/store/useStore';
import { Download, RefreshCw, Filter, Calendar, Search } from 'lucide-react';
import { toast } from 'sonner';

export const TreasuryHistoryTab = () => {
    const { user, locations } = usePharmaStore();
    const [history, setHistory] = useState<RemittanceHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Filters
    const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchHistory = async () => {
        setLoading(true);
        try {
            // V2: getRemittanceHistorySecure con parámetros opcionales
            const locId = selectedLocation === 'ALL' ? undefined : selectedLocation;
            const res = await getRemittanceHistorySecure({
                locationId: locId,
                startDate: startDate || undefined,
                endDate: endDate || undefined
            });
            if (res.success && res.data) {
                setHistory(res.data);
            } else {
                toast.error(res.error || 'Error cargando historial');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [selectedLocation, startDate, endDate]);

    const handleExport = async () => {
        setExporting(true);
        try {
            // V2: exportCashFlowSecure
            const today = new Date().toISOString().split('T')[0];
            const res = await exportCashFlowSecure({
                startDate: startDate || today,
                endDate: endDate || today,
                locationId: selectedLocation === 'ALL' ? undefined : selectedLocation
            });

            if (res.success && res.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.data}`;
                link.download = res.filename || 'Reporte_Tesoreria.xlsx';
                link.click();
                toast.success('Reporte descargado correctamente');
            } else {
                toast.error(res.error || 'Error generando reporte');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error inesperado al exportar');
        } finally {
            setExporting(false);
        }
    };

    // Client-side filtering
    const filteredHistory = history.filter(item => {
        const term = searchTerm.toLowerCase();
        return (
            (selectedLocation === 'ALL' || item.location_id === selectedLocation) &&
            (
                (item.cashier_name?.toLowerCase().includes(term)) ||
                (item.terminal_name?.toLowerCase().includes(term)) ||
                (item.notes?.toLowerCase().includes(term))
            )
        );
    });

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4">

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4 items-center w-full">

                    {/* Search */}
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar cajero, terminal..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Location Filter */}
                    <div className="relative w-full md:w-64">
                        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <select
                            className="w-full pl-10 pr-8 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm appearance-none bg-white"
                            value={selectedLocation}
                            onChange={(e) => setSelectedLocation(e.target.value)}
                        >
                            <option value="ALL">Todas las Sucursales</option>
                            {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Filters */}
                    <div className="flex gap-2 w-full md:w-auto">
                        <input
                            type="date"
                            className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <input
                            type="date"
                            className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={fetchHistory}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
                        title="Actualizar"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={exporting || loading}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold text-sm shadow-lg shadow-green-100 transition whitespace-nowrap disabled:opacity-50"
                    >
                        {exporting ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
                        Exportar Excel
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase border-b border-gray-200">
                            <tr>
                                <th className="p-4">Fecha/Hora</th>
                                <th className="p-4">Sucursal / Terminal</th>
                                <th className="p-4">Cajero</th>
                                <th className="p-4 text-right">Monto Declarado</th>
                                <th className="p-4 text-right">Diferencia</th>
                                <th className="p-4 text-center">Estado</th>
                                <th className="p-4">Recibido Por</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredHistory.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                                        No hay registros encontrados
                                    </td>
                                </tr>
                            ) : (
                                filteredHistory.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-bold text-gray-800">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-medium text-gray-700">{item.location_name}</div>
                                            <div className="text-xs text-gray-500">{item.terminal_name}</div>
                                        </td>
                                        <td className="p-4 font-medium text-gray-700">
                                            {item.cashier_name}
                                        </td>
                                        <td className="p-4 text-right font-mono font-bold text-gray-800">
                                            ${Number(item.amount).toLocaleString('es-CL')}
                                        </td>
                                        <td className="p-4 text-right">
                                            {Number(item.cash_count_diff) === 0 ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">OK</span>
                                            ) : (
                                                <span className={`font-mono font-bold ${Number(item.cash_count_diff) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {Number(item.cash_count_diff) > 0 ? '+' : ''}{Number(item.cash_count_diff).toLocaleString('es-CL')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.status === 'RECEIVED'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                {item.status === 'RECEIVED' ? 'RECIBIDO' : 'PENDIENTE'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-600 text-xs">
                                            {item.receiver_name || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
