'use client';

import React, { useEffect, useState } from 'react';
import { Shield, User, Bot, AlertTriangle, CheckCircle, Search, FileText } from 'lucide-react';
import { getRecentAuditLogs } from '@/actions/audit';

// Tipos básicos para TS
interface Log {
    id: string;
    action: string;
    details: string;
    created_at: string;
    user_name: string;
    user_role?: string;
    user_id: string;
}

export function AuditLogViewer() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        const res = await getRecentAuditLogs(100); // Traemos los últimos 100
        if (res.success && res.data) {
            setLogs(res.data);
        }
        setLoading(false);
    };

    // Filtrado simple en cliente
    const filteredLogs = logs.filter(log =>
        log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Función auxiliar para determinar el estilo según la acción
    const getActionStyle = (action: string, userId: string) => {
        if (userId === 'SYSTEM_BOT') return { icon: <Bot size={18} />, color: 'bg-purple-100 text-purple-700 border-purple-200' };
        if (action.includes('FORCE')) return { icon: <AlertTriangle size={18} />, color: 'bg-red-100 text-red-700 border-red-200' };
        if (action.includes('LOGIN')) return { icon: <User size={18} />, color: 'bg-blue-50 text-blue-700 border-blue-200' };
        return { icon: <FileText size={18} />, color: 'bg-slate-50 text-slate-600 border-slate-200' };
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header del Panel */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-200 rounded-lg text-slate-700">
                        <Shield size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Auditoría de Seguridad</h3>
                        <p className="text-xs text-slate-500">Registro inmutable de acciones críticas</p>
                    </div>
                </div>

                {/* Buscador Rápido */}
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Buscar usuario, acción..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-400 outline-none"
                    />
                </div>
            </div>

            {/* Tabla de Logs */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th className="p-4">Hora</th>
                            <th className="p-4">Actor</th>
                            <th className="p-4">Acción</th>
                            <th className="p-4">Detalle</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-400">Cargando registros...</td></tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-400">No hay registros recientes.</td></tr>
                        ) : (
                            filteredLogs.map((log) => {
                                const style = getActionStyle(log.action, log.user_id);
                                return (
                                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors text-sm">
                                        <td className="p-4 whitespace-nowrap text-slate-500 font-mono text-xs">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                {log.user_id === 'SYSTEM_BOT' ? (
                                                    <span className="text-purple-600 font-bold text-xs px-2 py-0.5 bg-purple-100 rounded-full border border-purple-200">
                                                        🤖 SYSTEM_BOT
                                                    </span>
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-800">{log.user_name}</span>
                                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">{log.user_role || 'STAFF'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${style.color}`}>
                                                {style.icon}
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-600 max-w-md truncate" title={log.details}>
                                            {log.details}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400">
                Mostrando los últimos 100 eventos de seguridad
            </div>
        </div>
    );
}
