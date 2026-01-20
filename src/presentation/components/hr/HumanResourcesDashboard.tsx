'use client';

import { useState } from 'react';
import { Users, Activity, History, Search, Filter } from 'lucide-react';
import { EmployeeProfile } from '@/domain/types';
import { EmployeeModal } from './EmployeeModal';
import { updateUserSecure } from '@/actions/users-v2';
import { useRouter } from 'next/navigation';
// We will create specific sub-views

interface HumanResourcesDashboardProps {
    employees: any[]; // Full list from DB
    liveAttendance: any[]; // Real-time status
    initialHistory: any[]; // Recent logs
}

export default function HumanResourcesDashboard({
    employees,
    liveAttendance,
    initialHistory
}: HumanResourcesDashboardProps) {
    const [activeTab, setActiveTab] = useState<'directory' | 'monitor' | 'history'>('directory');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const router = useRouter();

    const handleEdit = (employee: any) => {
        setSelectedEmployee(employee);
        setIsModalOpen(true);
    };

    const handleSaveEmployee = async (data: Partial<EmployeeProfile>) => {
        if (!selectedEmployee) return;

        try {
            const result = await updateUserSecure({
                userId: selectedEmployee.id,
                name: data.name,
                email: data.email,
                role: data.role as any,
                job_title: data.job_title || undefined,
                contact_phone: data.contact_phone || undefined,
                base_salary: data.base_salary || undefined,
                pension_fund: data.pension_fund || undefined,
                health_system: data.health_system || undefined,
                weekly_hours: data.weekly_hours || undefined,
                assigned_location_id: data.assigned_location_id || undefined,
                allowed_modules: data.allowed_modules
            });

            if (result.success) {
                setIsModalOpen(false);
                router.refresh(); // Refresh server data
                // Ideally show toast
            } else {
                alert('Error al guardar: ' + result.error);
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Error inesperado al guardar');
        }
    };

    // Filter logic
    const filteredEmployees = employees.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.rut.includes(searchTerm)
    );

    const filteredLive = liveAttendance.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Tabs Header */}
            <div className="border-b border-slate-200">
                <nav className="flex -mb-px" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('directory')}
                        className={`w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'directory'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                    >
                        <Users size={18} />
                        DIRECTORIO & CREDENCIALES
                    </button>
                    <button
                        onClick={() => setActiveTab('monitor')}
                        className={`w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'monitor'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                    >
                        <Activity size={18} />
                        MONITOR EN VIVO
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'history'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                    >
                        <History size={18} />
                        HISTORIAL Y REPORTES
                    </button>
                </nav>
            </div>

            {/* Content Area */}
            <div className="p-6">
                {/* Search Bar (Shared for Directory and Monitor) */}
                {activeTab !== 'history' && (
                    <div className="mb-6">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-500 focus:outline-none focus:placeholder-slate-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="Buscar empleado por nombre o RUT..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'directory' && (
                    <DirectoryView
                        employees={filteredEmployees}
                        onEdit={handleEdit}
                    />
                )}

                {activeTab === 'monitor' && (
                    <LiveMonitorView employees={filteredLive} />
                )}

                {activeTab === 'history' && (
                    <HistoryView initialData={initialHistory} />
                )}
            </div>

            {/* Employee Edit Modal */}
            {
                isModalOpen && selectedEmployee && (
                    <EmployeeModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        employee={selectedEmployee}
                        onSave={handleSaveEmployee}
                    />
                )
            }
        </div >
    );
}

// --- Sub-components (can be extracted later) ---

function DirectoryView({ employees, onEdit }: { employees: any[], onEdit: (emp: any) => void }) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Empleado
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Cargo / Rol
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Horas Semanales
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Estado
                        </th>
                        <th scope="col" className="relative px-6 py-3">
                            <span className="sr-only">Acciones</span>
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                    {employees.map((employee) => (
                        <tr key={employee.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                    <div className="flex-shrink-0 h-10 w-10">
                                        <img className="h-10 w-10 rounded-full" src={employee.photoUrl || `https://ui-avatars.com/api/?name=${employee.name}&background=random`} alt="" />
                                    </div>
                                    <div className="ml-4">
                                        <div className="text-sm font-medium text-slate-900">{employee.name}</div>
                                        <div className="text-sm text-slate-500">{employee.rut}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-slate-900">{employee.job_title || 'N/A'}</div>
                                <div className="text-xs text-slate-500">{employee.role}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-slate-900">{employee.weekly_hours || 45} hrs</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${employee.isActive
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                    }`}>
                                    {employee.isActive ? 'ACTIVO' : 'INACTIVO'}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                    onClick={() => onEdit(employee)}
                                    className="text-blue-600 hover:text-blue-900 border border-slate-200 px-3 py-1 rounded hover:bg-slate-50"
                                >
                                    Editar
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LiveMonitorView({ employees }: { employees: any[] }) {
    // employees here is the 'liveAttendance' data
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {employees.map((emp) => (
                <div key={emp.id} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                            <span className={`inline-block h-12 w-12 rounded-full overflow-hidden bg-slate-100 ${emp.current_status === 'IN' ? 'ring-2 ring-green-500 ring-offset-2' : ''
                                }`}>
                                <img className="h-full w-full object-cover" src={`https://ui-avatars.com/api/?name=${emp.name}&background=random`} alt="" />
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                                {emp.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate mb-1">
                                {emp.job_title}
                            </p>

                            <div className="mt-2 flex items-center space-x-2">
                                <span className={`flex h-3 w-3 rounded-full ${emp.current_status === 'IN' ? 'bg-green-500' :
                                    emp.current_status === 'LUNCH' ? 'bg-yellow-500' : 'bg-red-500'
                                    }`} />
                                <span className="text-xs font-semibold text-slate-700">
                                    {emp.current_status === 'IN' ? 'EN TAREA' :
                                        emp.current_status === 'LUNCH' ? 'COLACIÓN' : 'FUERA'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Last Activity Info */}
                    <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex justify-between items-center bg-slate-50 -mx-4 -mb-4 px-4 py-2">
                        <span>
                            {emp.last_log_time ? new Date(emp.last_log_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                        <span className="truncate max-w-[120px]" title={emp.last_login_ip || 'N/A'}>
                            {emp.last_login_ip || 'Offline'}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}

function HistoryView({ initialData }: { initialData: any[] }) {
    return (
        <div>
            <div className="flex justify-end gap-2 mb-4">
                <button className="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 flex items-center gap-1">
                    Exportar PDF/Excel
                </button>
            </div>
            <div className="overflow-hidden border rounded-lg">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fecha / Hora</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Empleado</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Evento</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">IP / Red</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Observación</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {initialData.map((log) => (
                            <tr key={log.id}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-700">
                                    {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-slate-900">
                                    {log.user_name}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${log.type === 'CHECK_IN' ? 'bg-green-100 text-green-800' :
                                        log.type === 'CHECK_OUT' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {log.type}
                                    </span>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-500">
                                    {/* This field (IP) might need specific join in getApprovedAttendanceHistory or check method */}
                                    {log.method || 'N/A'}
                                </td>
                                <td className="px-4 py-2 text-sm text-slate-500 truncate max-w-xs">
                                    {log.observation || '-'}
                                </td>
                            </tr>
                        ))}
                        {initialData.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                                    No hay registros recientes.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
