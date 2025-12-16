import React, { useEffect, useState } from 'react';
import { Edit2, UserPlus, Loader2, Shield, User, Trash2, Power, AlertTriangle } from 'lucide-react';
import { getUsers, toggleUserStatus, deleteUser } from '../../../actions/users';
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

    const handleToggleStatus = async (user: EmployeeProfile) => {
        const newStatus = user.status !== 'ACTIVE';

        // Optimistic update
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus ? 'ACTIVE' : 'TERMINATED' } : u));

        const res = await toggleUserStatus(user.id, newStatus);

        if (res.success) {
            toast.success(`Usuario ${newStatus ? 'activado' : 'desactivado'} correcamente`);
        } else {
            // Revert
            setUsers(prev => prev.map(u => u.id === user.id ? user : u));
            toast.error(res.error || 'Error al cambiar estado');
        }
    };

    const handleDelete = async (targetUser: EmployeeProfile) => {
        if (!confirm(`¿Estás seguro de eliminar a ${targetUser.name}? Esta acción no se puede deshacer.`)) return;

        if (targetUser.id === currentUser?.id) {
            toast.error("No puedes eliminarte a ti mismo.");
            return;
        }

        const res = await deleteUser(targetUser.id);

        if (res.success) {
            setUsers(prev => prev.filter(u => u.id !== targetUser.id));
            toast.success('Usuario eliminado permanentemente');
        } else {
            toast.error(res.error || 'Error al eliminar');
        }
    };

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const result = await getUsers();
            if (result.success && result.data) {
                setUsers(result.data);
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
        </div>
    );
};
