import React, { useEffect, useState } from 'react';
import { Edit2, UserPlus, Loader2, Shield, User } from 'lucide-react';
import { getUsers } from '../../../actions/users';
import { EmployeeProfile } from '../../../domain/types';
import { toast } from 'sonner';

interface UsersListProps {
    onEdit: (user: EmployeeProfile) => void;
    onCreate: () => void;
}

export const UsersList: React.FC<UsersListProps> = ({ onEdit, onCreate }) => {
    const [users, setUsers] = useState<EmployeeProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                        {user.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <button
                                        onClick={() => onEdit(user)}
                                        className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg transition"
                                        title="Editar Usuario"
                                    >
                                        <Edit2 size={18} />
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
