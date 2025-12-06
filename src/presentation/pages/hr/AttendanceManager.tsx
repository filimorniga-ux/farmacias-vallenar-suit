import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { EmployeeProfile, AttendanceLog, AttendanceStatus } from '../../../domain/types';
import { Clock, Calendar, Search, FileText, Download, AlertCircle, CheckCircle, Coffee, ArrowRight, Edit, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { PrinterService } from '../../../infrastructure/services/PrinterService';
import { exportAttendanceReport } from '@/actions/attendance-export';

interface AttendanceManagerProps {
    viewMode?: 'LIVE' | 'HISTORY';
}

const AttendanceManager: React.FC<AttendanceManagerProps> = ({ viewMode = 'LIVE' }) => {
    const { employees, attendanceLogs } = usePharmaStore();
    const [internalTab, setInternalTab] = useState<'LIVE' | 'HISTORY'>(viewMode);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState<'TODAY' | 'WEEK' | 'MONTH'>('TODAY');

    // Sync prop with internal state if it changes
    React.useEffect(() => {
        setInternalTab(viewMode);
    }, [viewMode]);

    const activeTab = internalTab;

    // --- LIVE VIEW LOGIC ---
    const activeEmployees = useMemo(() => employees.filter(e => e.status === 'ACTIVE'), [employees]);

    const getStatusColor = (status: AttendanceStatus) => {
        switch (status) {
            case 'IN': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'LUNCH': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'ON_PERMISSION': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'OUT': return 'bg-slate-100 text-slate-500 border-slate-200';
            default: return 'bg-slate-100 text-slate-500';
        }
    };

    const getLastLog = (employeeId: string) => {
        return attendanceLogs
            .filter(l => l.employee_id === employeeId)
            .sort((a, b) => b.timestamp - a.timestamp)[0];
    };

    // --- HISTORY LOGIC ---
    const getFilteredLogs = () => {
        const now = new Date();
        let startTime = 0;

        if (dateRange === 'TODAY') {
            startTime = new Date(now.setHours(0, 0, 0, 0)).getTime();
        } else if (dateRange === 'WEEK') {
            const firstDay = now.getDate() - now.getDay() + 1; // Monday
            startTime = new Date(now.setDate(firstDay)).setHours(0, 0, 0, 0);
        } else if (dateRange === 'MONTH') {
            startTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        }

        return attendanceLogs
            .filter(l => l.timestamp >= startTime)
            .sort((a, b) => b.timestamp - a.timestamp);
    };

    const filteredLogs = getFilteredLogs();

    const handleExportPDF = () => {
        const data = filteredLogs.map(log => {
            const emp = employees.find(e => e.id === log.employee_id);
            return {
                date: new Date(log.timestamp).toLocaleDateString(),
                time: new Date(log.timestamp).toLocaleTimeString(),
                employeeName: emp?.name || 'Desconocido',
                type: log.type,
                observation: log.observation || '-'
            };
        });

        PrinterService.printAttendanceReport(data, dateRange);
        toast.success('Generando reporte PDF...');
    };

    const handleExportExcel = async () => {
        const now = new Date();
        let startDate: Date;

        if (dateRange === 'TODAY') {
            startDate = new Date(now.setHours(0, 0, 0, 0));
        } else if (dateRange === 'WEEK') {
            const firstDay = now.getDate() - now.getDay() + 1;
            startDate = new Date(now.setDate(firstDay));
            startDate.setHours(0, 0, 0, 0);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const toastId = toast.loading('Generando Excel...');
        const result = await exportAttendanceReport({
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
            userRole: 'MANAGER' // Assuming manager view
        });

        if (result.success && result.data) {
            const byteCharacters = atob(result.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename || 'reporte.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.dismiss(toastId);
            toast.success('Reporte descargado');
        } else {
            toast.dismiss(toastId);
            toast.error('Error al exportar: ' + result.error);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
            {/* Header Tabs */}
            {/* Header Tabs - Only show if we want internal navigation, but for now we keep it simple or hide it based on design. 
                The user asked for 3 Master Tabs in HRPage, so AttendanceManager might just render the content.
                Let's hide the internal tabs if we are in a specific mode, or just keep them as sub-tabs? 
                The prompt says "Tab 2: Monitor", "Tab 3: History". So HRPage controls this. 
                We should probably hide the internal tab switcher if we are being controlled.
            */}
            {/* <div className="flex items-center justify-between p-6 pb-0 border-b border-slate-200 bg-white"> ... </div> */}

            {/* We will render the header only for actions like Export PDF, but hide the tab switcher if we assume HRPage handles it. 
               Actually, let's keep the Export button but maybe hide the tab switcher? 
               Let's just hide the whole header if we want to rely on HRPage, BUT we need the Export button for History.
            */}

            {activeTab === 'HISTORY' && (
                <div className="flex justify-end p-6 pb-0 bg-white gap-3">
                    <button
                        onClick={handleExportPDF}
                        className="mb-4 px-4 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-slate-900 transition"
                    >
                        <FileText size={16} />
                        PDF
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="mb-4 px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 transition"
                    >
                        <Download size={16} />
                        Excel
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'LIVE' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {activeEmployees.map(emp => {
                            const lastLog = getLastLog(emp.id);
                            return (
                                <div key={emp.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${emp.current_status === 'IN' ? 'bg-emerald-500' :
                                            emp.current_status === 'LUNCH' ? 'bg-orange-500' :
                                                emp.current_status === 'ON_PERMISSION' ? 'bg-amber-500' : 'bg-slate-400'
                                            }`}>
                                            {emp.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800">{emp.name}</h3>
                                            <p className="text-xs text-slate-500">{emp.job_title?.replace(/_/g, ' ')}</p>
                                        </div>
                                    </div>

                                    <div className={`p-3 rounded-xl border flex items-center justify-between ${getStatusColor(emp.current_status)}`}>
                                        <span className="font-bold text-sm">
                                            {emp.current_status === 'IN' ? '🟢 TRABAJANDO' :
                                                emp.current_status === 'LUNCH' ? '🍔 EN COLACIÓN' :
                                                    emp.current_status === 'ON_PERMISSION' ? '⚠️ PERMISO' : '🔴 FUERA'}
                                        </span>
                                        {lastLog && (
                                            <span className="text-xs font-mono">
                                                {new Date(lastLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>

                                    {emp.current_status === 'LUNCH' && lastLog && (
                                        <div className="text-xs text-center text-orange-600 font-bold bg-orange-50 p-2 rounded-lg">
                                            Tiempo transcurrido: {Math.floor((Date.now() - lastLog.timestamp) / 1000 / 60)} min
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center gap-4">
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setDateRange('TODAY')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${dateRange === 'TODAY' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Hoy
                                </button>
                                <button
                                    onClick={() => setDateRange('WEEK')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${dateRange === 'WEEK' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Esta Semana
                                </button>
                                <button
                                    onClick={() => setDateRange('MONTH')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${dateRange === 'MONTH' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Este Mes
                                </button>
                            </div>
                        </div>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                <tr>
                                    <th className="p-4">Fecha / Hora</th>
                                    <th className="p-4">Empleado</th>
                                    <th className="p-4">Evento</th>
                                    <th className="p-4">Evidencia</th>
                                    <th className="p-4">Observación</th>
                                    <th className="p-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLogs.map(log => {
                                    const emp = employees.find(e => e.id === log.employee_id);
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50 transition">
                                            <td className="p-4">
                                                <div className="font-bold text-slate-700">{new Date(log.timestamp).toLocaleDateString()}</div>
                                                <div className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-bold text-slate-700">{emp?.name || 'Desconocido'}</div>
                                                <div className="text-xs text-slate-400">{emp?.rut}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${log.type === 'CHECK_IN' ? 'bg-emerald-100 text-emerald-700' :
                                                    log.type === 'CHECK_OUT' ? 'bg-red-100 text-red-700' :
                                                        log.type.includes('BREAK') ? 'bg-orange-100 text-orange-700' :
                                                            'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {log.type}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                {log.evidence_photo_url ? (
                                                    <div className="group relative flex items-center justify-center w-8 h-8 bg-slate-100 rounded-full cursor-help">
                                                        <Eye size={16} className="text-slate-500" />
                                                        {/* Tooltip Image */}
                                                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-white p-2 rounded-lg shadow-xl border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                            <img src={log.evidence_photo_url} alt="Evidencia" className="w-full h-auto rounded" />
                                                            <div className="text-[10px] text-center mt-1 text-slate-400">Foto Capturada</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-slate-500 italic">
                                                {log.observation || '-'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition">
                                                    <Edit size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredLogs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-slate-400">
                                            No hay registros para este periodo.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttendanceManager;
