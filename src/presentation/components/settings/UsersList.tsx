import React, { useEffect, useState } from 'react';
import { Edit2, UserPlus, Loader2, Shield, User, Trash2, Power, KeyRound } from 'lucide-react';
import { getUsersSecure, deactivateUserSecure } from '../../../actions/users-v2';
import { requestPinReset } from '../../../actions/pin-recovery-v2';
import { EmployeeProfile } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';

interface UsersListProps {
    onEdit: (user: EmployeeProfile) => void;
    onCreate: () => void;
}

export const UsersList: React.FC<UsersListProps> = ({ onEdit, onCreate }) => {
    const { user: currentUser } = usePharmaStore();
    const [users, setUsers] = useState<EmployeeProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pinResetTarget, setPinResetTarget] = useState<EmployeeProfile | null>(null);
    const [adminPin, setAdminPin] = useState('');
    const [isSendingPinReset, setIsSendingPinReset] = useState(false);

    const handleToggleStatus = async (user: EmployeeProfile) => {
        const reason = prompt('Ingrese razón del cambio de estado:');
        if (!reason) return;

        const newStatus = user.status !== 'ACTIVE';

        // Optimistic update
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus ? 'ACTIVE' : 'TERMINATED' } : u));

        // V2: Solo deactivar, no toggle
        if (!newStatus) {
            const res = await deactivateUserSecure({ userId: user.id, reason });
            if (res.success) {
                toast.success('Usuario desactivado correctamente');
            } else {
                setUsers(prev => prev.map(u => u.id === user.id ? user : u));
                toast.error(res.error || 'Error al cambiar estado');
            }
        } else {
            toast.info('Para reactivar usuarios, contacte a un administrador');
            setUsers(prev => prev.map(u => u.id === user.id ? user : u));
        }
    };

    const handleDelete = async (targetUser: EmployeeProfile) => {
        const reason = prompt('Ingrese razón de la desactivación:');
        if (!reason) return;

        if (targetUser.id === currentUser?.id) {
            toast.error("No puedes eliminarte a ti mismo.");
            return;
        }

        // V2: Usar deactivate en lugar de delete
        const res = await deactivateUserSecure({ userId: targetUser.id, reason });

        if (res.success) {
            setUsers(prev => prev.filter(u => u.id !== targetUser.id));
            toast.success('Usuario desactivado');
        } else {
            toast.error(res.error || 'Error al desactivar');
        }
    };

    const handlePinReset = async () => {
        if (!pinResetTarget || !adminPin) return;
        setIsSendingPinReset(true);
        try {
            const result = await requestPinReset(pinResetTarget.id, adminPin);
            if (result.success) {
                toast.success(`✅ PIN temporal enviado al Correo Maestro para ${pinResetTarget.name}`);
                setPinResetTarget(null);
                setAdminPin('');
            } else {
                toast.error(result.error || 'Error al resetear PIN');
            }
        } finally {
            setIsSendingPinReset(false);
        }
    };

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            // V2: Nuevo formato de llamada
            const result = await getUsersSecure({ page: 1, pageSize: 100 });
            if (result.success && result.data) {
                setUsers(result.data.users as any);
            } else {
                console.error('Error loading users:', result.error);
                toast.error(`Error: ${result.error || 'No se pudieron cargar los usuarios'}`);
            }
        } catch (err) {
            console.error('Exception loading users:', err);
            toast.error('Error de conexión al cargar usuarios');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="animate-spin text-cyan-600" size={32} />
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Usuarios del Sistema</h3>
                <button
                    onClick={onCreate}
                    className="px-4 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition flex items-center gap-2"
                >
                    <UserPlus size={18} />
                    Nuevo Usuario
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th className="py-3 px-4 font-bold text-slate-600 text-sm">Nombre</th>
                            <th className="py-3 px-4 font-bold text-slate-600 text-sm">RUT</th>
                            <th className="py-3 px-4 font-bold text-slate-600 text-sm">Cargo</th>
                            <th className="py-3 px-4 font-bold text-slate-600 text-sm">Rol</th>
                            <th className="py-3 px-4 font-bold text-slate-600 text-sm">Estado</th>
                            <th className="py-3 px-4 font-bold text-slate-600 text-sm text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="py-3 px-4 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                                        <User size={16} />
                                    </div>
                                    <span className="font-medium text-slate-800">{user.name}</span>
                                </td>
                                <td className="py-3 px-4 text-slate-600 font-mono text-sm">{user.rut}</td>
                                <td className="py-3 px-4 text-slate-600 text-sm">{user.job_title?.replace(/_/g, ' ')}</td>
                                <td className="py-3 px-4">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${user.role === 'MANAGER' ? 'bg-purple-100 text-purple-700' :
                                        user.role === 'QF' ? 'bg-blue-100 text-blue-700' :
                                            'bg-slate-100 text-slate-600'
                                        }`}>
                                        {user.role === 'MANAGER' && <Shield size={12} />}
                                        {user.role}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    <button
                                        onClick={() => handleToggleStatus(user)}
                                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 ${user.status === 'ACTIVE'
                                            ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                                            : 'bg-slate-200 text-slate-500 hover:bg-green-100 hover:text-green-700'
                                            }`}
                                        title={user.status === 'ACTIVE' ? "Click para DESACTIVAR" : "Click para ACTIVAR"}
                                    >
                                        <div className="flex items-center gap-1">
                                            <Power size={12} />
                                            {user.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                                        </div>
                                    </button>
                                </td>
                                <td className="py-3 px-4 text-right flex items-center justify-end gap-2">
                                    <button
                                        onClick={() => onEdit(user)}
                                        className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg transition"
                                        title="Editar Usuario"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => { setPinResetTarget(user); setAdminPin(''); }}
                                        className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition"
                                        title="Enviar PIN Temporal al Correo Maestro"
                                        disabled={currentUser?.id === user.id}
                                    >
                                        <KeyRound size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(user)}
                                        className={`p-2 rounded-lg transition ${currentUser?.id === user.id ? 'text-slate-300 cursor-not-allowed' : 'text-red-500 hover:bg-red-50'}`}
                                        title="Eliminar Usuario"
                                        disabled={currentUser?.id === user.id}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal: Confirmar Reset de PIN */}
            {pinResetTarget && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                                <KeyRound size={20} className="text-amber-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-base">Resetear PIN de Acceso</h3>
                                <p className="text-slate-500 text-xs">{pinResetTarget?.name}</p>
                            </div>
                        </div>

                        <p className="text-slate-600 text-sm mb-4">
                            Se enviará un PIN temporal de 6 dígitos al <strong>Correo Maestro de Recuperación</strong>.
                            El usuario deberá crear un nuevo PIN al primer inicio de sesión.
                        </p>

                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Tu PIN de Admin</label>
                            <input
                                type="password"
                                value={adminPin}
                                onChange={e => setAdminPin(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handlePinReset()}
                                placeholder="Ingresa tu PIN"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500"
                                maxLength={6}
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => { setPinResetTarget(null); setAdminPin(''); }}
                                className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold text-sm"
                                disabled={isSendingPinReset}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handlePinReset}
                                disabled={!adminPin || isSendingPinReset}
                                className="flex-1 py-2 rounded-lg bg-amber-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSendingPinReset ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                                Enviar PIN
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
