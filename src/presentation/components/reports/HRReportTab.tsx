import React, { useState, useEffect } from 'react';
import { Users, Clock, AlertTriangle, UserCheck, Calendar } from 'lucide-react';
import { DateRange } from '../bi/TimeFilter';
import { getAttendanceReportSecure, getAttendanceKPIsSecure } from '../../../actions/attendance-report-v2';
import { toast } from 'sonner';

interface HRReportTabProps {
    dateRange: DateRange;
    locationId?: string;
}

export const HRReportTab: React.FC<HRReportTabProps> = ({ dateRange, locationId }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any[]>([]);
    const [kpis, setKpis] = useState<{ present_today: number; total_staff: number; late_arrivals_month: number; total_overtime_hours: number } | null>(null);
    const [roleFilter, setRoleFilter] = useState<string>('ALL');

    useEffect(() => {
        const fetchHRData = async () => {
            setLoading(true);
            try {
                // V2: Usamos firmas de objeto seguras
                const [reportResult, kpiResult] = await Promise.all([
                    getAttendanceReportSecure({
                        startDate: dateRange.from.toISOString(),
                        endDate: dateRange.to.toISOString(),
                        locationId,
                        role: roleFilter !== 'ALL' ? roleFilter : undefined
                    }),
                    getAttendanceKPIsSecure(locationId)
                ]);

                if (reportResult.success && reportResult.data) {
                    setData(reportResult.data);
                }
                if (kpiResult.success && kpiResult.data) {
                    setKpis(kpiResult.data);
                }
            } catch (error) {
                console.error(error);
                toast.error('Error cargando datos de asistencia');
            } finally {
                setLoading(false);
            }
        };

        fetchHRData();
    }, [dateRange, locationId, roleFilter]);

    // KPI Cards
    const renderKPIs = () => {
        if (!kpis) return null;

        return (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-100 rounded-lg text-emerald-600">
                        <UserCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 uppercase">Personal Presente</p>
                        <p className="text-2xl font-bold text-emerald-700">
                            {kpis.present_today} <span className="text-sm text-emerald-400 font-medium">/ {kpis.total_staff}</span>
                        </p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-red-100 rounded-lg text-red-600">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 uppercase">Atrasos (Mes)</p>
                        <p className="text-2xl font-bold text-red-700">{kpis.late_arrivals_month}</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-500 uppercase">Horas Extra</p>
                        <p className="text-2xl font-bold text-blue-700">{kpis.total_overtime_hours} hrs</p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right-4">

            {/* KPI Section */}
            {renderKPIs()}

            {/* Controls */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users className="text-gray-400 w-5 h-5" />
                    <span className="font-bold text-gray-700 text-sm">Filtrar por Cargo:</span>
                    <select
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                    >
                        <option value="ALL">Todos los Cargos</option>
                        <option value="CASHIER">Cajero Vendedor</option>
                        <option value="WAREHOUSE">Bodeguero</option>
                        <option value="MANAGER">Farmacéutico (Manager)</option>
                    </select>
                </div>
                <div className="text-xs text-gray-400">
                    Mostrando {data.length} registros
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Colaborador</th>
                                <th className="px-4 py-3">Cargo</th>
                                <th className="px-4 py-3">Entrada</th>
                                <th className="px-4 py-3">Salida</th>
                                <th className="px-4 py-3 text-right">Horas</th>
                                <th className="px-4 py-3 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-400">
                                        Cargando asistencia...
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-400">
                                        No hay registros de asistencia en este período.
                                    </td>
                                </tr>
                            ) : (
                                data.map((row, idx) => (
                                    <tr key={`${row.user_id}-${row.date}-${idx}`} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono">
                                            {new Date(row.date).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            {row.user_name}
                                            <div className="text-xs text-gray-400">{row.rut}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">
                                            <span className="px-2 py-1 bg-slate-100 rounded-full">{filterRoleName(row.role)}</span>
                                        </td>
                                        <td className={`px-4 py-3 font-mono font-bold ${row.status === 'LATE' ? 'text-red-600' : 'text-emerald-700'}`}>
                                            {row.check_in ? new Date(row.check_in).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-gray-600">
                                            {row.check_out ? new Date(row.check_out).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-800">
                                            {row.hours_worked > 0 ? row.hours_worked.toFixed(1) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {row.status === 'LATE' ? (
                                                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs font-bold border border-red-200">
                                                    Atraso &gt; 9:10
                                                </span>
                                            ) : row.status === 'ABSENT' ? (
                                                <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-md text-xs font-bold">
                                                    Ausente
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold border border-emerald-200">
                                                    Puntual
                                                </span>
                                            )}
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

// Helper for prettier role names
const filterRoleName = (role: string) => {
    const map: any = {
        'MANAGER': 'Farmacéutico',
        'CASHIER': 'Cajero',
        'WAREHOUSE': 'Bodeguero',
        'ADMIN': 'Admin'
    };
    return map[role] || role;
};
