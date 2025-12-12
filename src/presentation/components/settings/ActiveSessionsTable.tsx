'use client';

import React, { useEffect, useState } from 'react';
import { getActiveSessions, revokeSession, ActiveSession } from '@/actions/security';
import { usePharmaStore } from '@/presentation/store/useStore';
import { toast } from 'sonner';
import { User, Globe, Clock, Power, RefreshCw } from 'lucide-react';

export function ActiveSessionsTable() {
    const { user } = usePharmaStore();
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [loading, setLoading] = useState(false);

    // Auto Refresh every 30s
    useEffect(() => {
        loadSessions();
        const interval = setInterval(loadSessions, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadSessions = async () => {
        setLoading(true);
        const res = await getActiveSessions();
        if (res.success && res.data) {
            setSessions(res.data);
        }
        setLoading(false);
    };

    const handleRevoke = async (targetUserId: string, targetName: string) => {
        if (!confirm(`¿Estás seguro de cerrar la sesión de ${targetName}?`)) return;

        const toastId = toast.loading('Cerrando sesión remota...');
        const res = await revokeSession(targetUserId, user?.id || 'admin');

        if (res.success) {
            toast.success('Sesión revocada exitosamente', { id: toastId });
            loadSessions();
        } else {
            toast.error(res.error || 'Error al cerrar sesión', { id: toastId });
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Globe size={20} className="text-indigo-600" />
                        Sesiones Activas
                    </h3>
                    <p className="text-xs text-slate-500">Usuarios conectados en los últimos 30 minutos.</p>
                </div>
                <button
                    onClick={loadSessions}
                    className={`p-2 rounded-lg text-slate-500 hover:bg-white hover:text-indigo-600 transition-colors ${loading ? 'animate-spin' : ''}`}
                    title="Actualizar Lista"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-xs">
                        <tr>
                            <th className="p-4">Usuario</th>
                            <th className="p-4">Ubicación / Contexto</th>
                            <th className="p-4">Última Actividad</th>
                            <th className="p-4">Estado</th>
                            <th className="p-4 text-center">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sessions.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                                    No hay sesiones activas (excepto tú quizás).
                                </td>
                            </tr>
                        ) : (
                            sessions.map((session) => (
                                <tr key={session.user_id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                                                {session.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800">{session.name}</p>
                                                <p className="text-xs text-slate-400">{session.role}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-700">
                                                {session.current_context?.location_id || 'N/A'}
                                            </span>
                                            {session.current_context?.ip && (
                                                <span className="text-[10px] text-slate-400 font-mono">{session.current_context.ip}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-slate-500">
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={14} />
                                            {new Date(session.last_active_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${session.status === 'ONLINE'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                : session.status === 'AWAY'
                                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                    : 'bg-slate-50 text-slate-500 border-slate-100'
                                            }`}>
                                            <span className={`w-2 h-2 rounded-full ${session.status === 'ONLINE' ? 'bg-emerald-500 animate-pulse' :
                                                    session.status === 'AWAY' ? 'bg-amber-500' : 'bg-slate-400'
                                                }`} />
                                            {session.status === 'ONLINE' ? 'En Línea' : session.status === 'AWAY' ? 'Ausente' : 'Desconectado'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {session.user_id !== user?.id && (
                                            <button
                                                onClick={() => handleRevoke(session.user_id, session.name)}
                                                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all"
                                                title="Cerrar Sesión Remotamente"
                                            >
                                                <Power size={18} />
                                            </button>
                                        )}
                                        {session.user_id === user?.id && (
                                            <span className="text-xs text-indigo-400 font-bold bg-indigo-50 px-2 py-1 rounded">Tú</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
