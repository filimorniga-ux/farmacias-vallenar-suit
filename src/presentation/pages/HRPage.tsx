import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Shield, Briefcase, Clock, FileText, Edit, Activity, Loader2 } from 'lucide-react';
import { usePharmaStore } from '../store/useStore';
import { ROLES } from '../../domain/security/roles';
import { EmployeeProfile } from '../../domain/types';
import AttendanceManager from './hr/AttendanceManager';
import { EmployeeModal } from '../components/hr/EmployeeModal';
import { toast } from 'sonner';
import { getUsersSecure, createUserSecure, updateUserSecure } from '../../actions/users-v2';

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
        console.log('🔄 [HRPage] Loading users...');
        const result = await getUsersSecure({ page: 1, pageSize: 100 });

        console.log('📥 [HRPage] Load result:', result);

        if (result.success && result.data) {
            console.log(`✅ [HRPage] Loaded ${result.data.users.length} users. Total in DB: ${result.data.total}`);
            const users = result.data.users;

            // Check for recently created users
            const recent = users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3);
            console.log('🆕 [HRPage] 3 Most recent users in fetch:', recent.map(u => `${u.name} (${u.role}) - ${u.created_at}`));

            setDbEmployees(result.data.users as any);
        } else {
            console.error('❌ [HRPage] Error loading:', result.error);
            toast.error(result.error || 'Error al cargar empleados');
        }
        setIsLoading(false);
    };

    // --- Access Control ---
    const ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'];

    if (!user || !ALLOWED_ROLES.includes(user.role)) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Shield size={64} className="text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h2>
                <p>No tienes permisos para acceder al módulo de Recursos Humanos.</p>
                <p className="text-sm mt-2">Roles permitidos: MANAGER, ADMIN, GERENTE, RRHH</p>
            </div>
        );
    }

    const filteredEmployees = dbEmployees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.rut.includes(searchTerm)
    );

    const handleSaveEmployee = async (updatedEmployee: EmployeeProfile) => {
        console.log('📤 Enviando empleado a guardar:', updatedEmployee);
        const isNew = updatedEmployee.id.startsWith('EMP-');

        let result;
        if (isNew) {
            // Crear nuevo usuario (incluye PIN inicial hash y rol desde el inicio)
            // Aseguramos que dataToCreate tenga la estructura esperada por createUserSecure
            const { id, ...dataToCreate } = updatedEmployee;
            result = await createUserSecure(dataToCreate as any);
        } else {
            // Actualizar usuario existente
            console.log('🔄 Actualizando usuario ID:', updatedEmployee.id);

            // 1. Actualizar datos básicos
            result = await updateUserSecure({ userId: updatedEmployee.id, ...updatedEmployee } as any);

            if (result.success) {
                // 2. Si se cambió el rol, llamar a changeUserRoleSecure
                const originalUser = dbEmployees.find(e => e.id === updatedEmployee.id);
                if (originalUser && originalUser.role !== updatedEmployee.role) {
                    const roleResult = await import('../../actions/users-v2').then(mod => mod.changeUserRoleSecure({
                        userId: updatedEmployee.id,
                        newRole: updatedEmployee.role as any,
                        justification: 'Cambio de rol desde panel RRHH'
                    }));
                    if (!roleResult.success) console.error('Error changing role:', roleResult.error);
                }

                // 3. Si se cambió el PIN (detectamos si access_pin tiene valor, aunque en UI a veces se maneja distinto)
                // Nota: EmployeeModal debería pasar 'access_pin' solo si se editó. Si viene lleno, intentamos resetear.
                if (updatedEmployee.access_pin && updatedEmployee.access_pin.length >= 4) {
                    const pinResult = await import('../../actions/users-v2').then(mod => mod.resetUserPinSecure({
                        userId: updatedEmployee.id,
                        newPin: updatedEmployee.access_pin!
                    }));
                    if (!pinResult.success) console.error('Error resetting PIN:', pinResult.error);
                }

                // 4. Si se desactivó/activó (Aunque updateUserSecure maneja 'is_active' si se pasa, deactivateUserSecure es para 'TERMINATED')
                if (updatedEmployee.status === 'INACTIVE' && originalUser?.status === 'ACTIVE') {
                    const deactivateResult = await import('../../actions/users-v2').then(mod => mod.deactivateUserSecure({
                        userId: updatedEmployee.id,
                        reason: 'Desactivado desde panel RRHH'
                    }));
                    if (!deactivateResult.success) console.error('Error deactivating user:', deactivateResult.error);
                }
            }
        }

        if (result?.success) {
            toast.success(`Empleado ${isNew ? 'creado' : 'actualizado'} exitosamente`);
            console.log('✨ [HRPage] Employee saved success. Triggering reload...');
            setIsModalOpen(false);
            setSelectedEmployee(null);

            // Force server revalidation AND client refresh
            const { useRouter } = await import('next/navigation');
            // Note: We can't use hooks here unconditionally, but this is an event handler.
            // Better to pull router from component scope.

            await loadUsers(); // Client fetch
        } else {
            console.error('❌ [HRPage] Verify Error:', result?.error);
            toast.error(result?.error || 'Error al guardar empleado');
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
        <div className="h-dvh flex flex-col bg-slate-50 overflow-hidden pb-safe">
            {/* Master Header & Tabs */}
            <div className="bg-white border-b border-slate-200 px-4 md:px-8 pt-8 pb-0 shadow-sm z-10 shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
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

                <div className="flex gap-6 md:gap-12 overflow-x-auto touch-pan-x no-scrollbar pb-1">
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
            <div className="flex-1 overflow-hidden bg-slate-50 p-4 md:p-6 flex flex-col">
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
                            <div className="overflow-auto touch-pan-x touch-pan-y flex-1 overscroll-contain">
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
