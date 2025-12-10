import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Shield, Briefcase, Clock, FileText, Edit, Activity, Loader2 } from 'lucide-react';
import { usePharmaStore } from '../store/useStore';
import { ROLES } from '../../domain/security/roles';
import { EmployeeProfile } from '../../domain/types';
import AttendanceManager from './hr/AttendanceManager';
import { EmployeeModal } from '../components/hr/EmployeeModal';
import { toast } from 'sonner';
import { getUsers, createUser, updateUser } from '../../actions/users';

const HRPage = () => {
    const { user } = usePharmaStore(); // Mantenemos user logueado del store por ahora
    const [activeTab, setActiveTab] = useState<'DIRECTORY' | 'MONITOR' | 'HISTORY'>('DIRECTORY');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Estado local para empleados (desde DB)
    const [dbEmployees, setDbEmployees] = useState<EmployeeProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Cargar usuarios al montar
    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setIsLoading(true);
        const result = await getUsers();
        if (result.success && result.data) {
            setDbEmployees(result.data);
        } else {
            toast.error(result.error || 'Error al cargar empleados');
        }
        setIsLoading(false);
    };

    // --- Access Control ---
    if (!user || user.role !== 'MANAGER') {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Shield size={64} className="text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h2>
                <p>No tienes permisos para acceder al módulo de Recursos Humanos.</p>
                <p className="text-sm mt-2">Rol requerido: MANAGER</p>
            </div>
        );
    }

    const filteredEmployees = dbEmployees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.rut.includes(searchTerm)
    );

    const handleSaveEmployee = async (updatedEmployee: EmployeeProfile) => {
        console.log('📤 Enviando empleado a guardar:', updatedEmployee);
        const isNew = updatedEmployee.id.startsWith('EMP-') && !dbEmployees.find(e => e.id === updatedEmployee.id);

        let result;
        if (isNew) {
            // Crear
            // Remover ID temporal si es necesario o dejar que el backend lo ignore
            const { id, ...dataToCreate } = updatedEmployee;
            result = await createUser(dataToCreate);
        } else {
            // Actualizar
            console.log('🔄 Actualizando usuario ID:', updatedEmployee.id);
            result = await updateUser(updatedEmployee.id, updatedEmployee);
        }

        if (result.success && result.data) {
            toast.success(`Empleado ${isNew ? 'creado' : 'actualizado'} exitosamente`);
            setIsModalOpen(false);
            setSelectedEmployee(null);
            loadUsers(); // Recargar lista
        } else {
            toast.error(result.error || 'Error al guardar empleado');
        }
    };

    const handleNewEmployee = () => {
        setSelectedEmployee({
            id: `EMP-${Date.now()}`, // ID temporal para el formulario
            rut: '',
            name: '',
            role: 'CASHIER',
            access_pin: '',
            status: 'ACTIVE',
            current_status: 'OUT',
            job_title: 'CAJERO_VENDEDOR',
            allowed_modules: []
        } as EmployeeProfile);
        setIsModalOpen(true);
    };

    const handleEditEmployee = (emp: EmployeeProfile) => {
        setSelectedEmployee(emp);
        setIsModalOpen(true);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
            {/* Master Header & Tabs */}
            <div className="bg-white border-b border-slate-200 px-8 pt-8 pb-0 shadow-sm z-10">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                            <Users className="text-blue-600" size={32} />
                            Recursos Humanos
                        </h1>
                        <p className="text-slate-500 mt-1 text-lg">Gestión integral de personal y asistencia</p>
                    </div>

                    {activeTab === 'DIRECTORY' && (
                        <button
                            onClick={handleNewEmployee}
                            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-200 transform hover:scale-105 active:scale-95"
                        >
                            <UserPlus size={20} />
                            Nuevo Empleado
                        </button>
                    )}
                </div>

                <div className="flex gap-12">
                    <button
                        onClick={() => setActiveTab('DIRECTORY')}
                        className={`pb-6 px-4 font-bold text-base transition-all relative flex items-center gap-3 ${activeTab === 'DIRECTORY' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Users size={24} />
                        DIRECTORIO & CREDENCIALES
                        {activeTab === 'DIRECTORY' && <div className="absolute bottom-0 left-0 w-full h-1.5 bg-blue-600 rounded-t-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('MONITOR')}
                        className={`pb-6 px-4 font-bold text-base transition-all relative flex items-center gap-3 ${activeTab === 'MONITOR' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Activity size={24} />
                        MONITOR EN VIVO
                        {activeTab === 'MONITOR' && <div className="absolute bottom-0 left-0 w-full h-1.5 bg-blue-600 rounded-t-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('HISTORY')}
                        className={`pb-6 px-4 font-bold text-base transition-all relative flex items-center gap-3 ${activeTab === 'HISTORY' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <FileText size={24} />
                        HISTORIAL Y REPORTES
                        {activeTab === 'HISTORY' && <div className="absolute bottom-0 left-0 w-full h-1.5 bg-blue-600 rounded-t-full" />}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden bg-slate-50 p-6">
                {activeTab === 'DIRECTORY' && (
                    <div className="h-full flex flex-col max-w-7xl mx-auto">
                        {/* Search Bar */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex items-center gap-4">
                            <Search className="text-slate-400" size={20} />
                            <input
                                type="text"
                                placeholder="Buscar empleado por nombre o RUT..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="flex-1 bg-transparent outline-none text-slate-700 placeholder-slate-400"
                            />
                        </div>

                        {/* Employee Table */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
                            <div className="overflow-y-auto flex-1">
                                {isLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="animate-spin text-blue-600" size={48} />
                                    </div>
                                ) : (
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                            <tr>
                                                <th className="p-6 font-bold text-slate-500 text-sm uppercase tracking-wider">Empleado</th>
                                                <th className="p-6 font-bold text-slate-500 text-sm uppercase tracking-wider">Cargo / Rol</th>
                                                <th className="p-6 font-bold text-slate-500 text-sm uppercase tracking-wider">Estado</th>
                                                <th className="p-6 font-bold text-slate-500 text-sm uppercase tracking-wider text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredEmployees.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-12 text-center text-slate-400">
                                                        No se encontraron empleados.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredEmployees.map(emp => (
                                                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                                                        <td className="p-6">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${emp.status === 'ACTIVE' ? 'bg-blue-500' : 'bg-slate-400'}`}>
                                                                    {emp.name.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-slate-800 text-lg">{emp.name}</div>
                                                                    <div className="text-sm text-slate-400 font-mono">{emp.rut}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-6">
                                                            <div className="font-medium text-slate-700">{emp.job_title?.replace(/_/g, ' ')}</div>
                                                            <div className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full inline-block mt-1">
                                                                {(ROLES as Record<string, string>)[emp.role] || emp.role}
                                                            </div>
                                                        </td>
                                                        <td className="p-6">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${emp.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                {emp.status === 'ACTIVE' ? 'ACTIVO' : 'INACTIVO'}
                                                            </span>
                                                        </td>
                                                        <td className="p-6 text-right">
                                                            <button
                                                                onClick={() => handleEditEmployee(emp)}
                                                                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm flex items-center gap-2 ml-auto"
                                                            >
                                                                <Edit size={16} />
                                                                Editar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'MONITOR' && (
                    <div className="h-full max-w-7xl mx-auto">
                        <AttendanceManager viewMode="LIVE" />
                    </div>
                )}

                {activeTab === 'HISTORY' && (
                    <div className="h-full max-w-7xl mx-auto">
                        <AttendanceManager viewMode="HISTORY" />
                    </div>
                )}
            </div>

            {/* Employee Modal */}
            <EmployeeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                employee={selectedEmployee}
                onSave={handleSaveEmployee}
            />
        </div>
    );
};

export default HRPage;
