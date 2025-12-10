'use client';

import React, { useState, useEffect } from 'react';
import { getAuditLogs } from '@/actions/security';
import { Loader2, ShieldAlert, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface AuditLog {
    id: string;
    timestamp: string; // ISODate from PG
    action: string;
    details: any;
    ip_address: string;
    user_name?: string;
    user_id?: string;
}

export function AuditLogViewer() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState('');

    const fetchLogs = async () => {
        setLoading(true);
        const res = await getAuditLogs(page, 50, { action: actionFilter || undefined });
        if (res.success && res.data) {
            setLogs(res.data);
        } else {
            toast.error('Error cargando logs');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
    }, [page, actionFilter]);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <ShieldAlert className="w-6 h-6 text-blue-600" />
                    Registro de Auditoría e Incidentes
                </h2>
                <button
                    onClick={fetchLogs}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    title="Recargar"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Filtrar por Acción (ej: LOGIN_BLOCKED, STOCK_LOSS)..."
                        className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                        <tr>
                            <th className="px-4 py-3">Fecha/Hora</th>
                            <th className="px-4 py-3">Usuario</th>
                            <th className="px-4 py-3">Acción</th>
                            <th className="px-4 py-3">Detalles</th>
                            <th className="px-4 py-3">Origen (IP)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-gray-500">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                    Cargando registros...
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-gray-500">
                                    No se encontraron registros de auditoría.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="border-b hover:bg-gray-50/50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                        {new Date(log.timestamp).toLocaleString('es-CL')}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                        {log.user_name || 'Desconocido/Sistema'}
                                        <div className="text-xs text-gray-400 font-mono">{log.user_id?.substring(0, 8)}...</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${log.action.includes('BLOCK') || log.action.includes('LOSS') || log.action.includes('difference')
                                                ? 'bg-red-100 text-red-700'
                                                : log.action.includes('DELETE')
                                                    ? 'bg-orange-100 text-orange-700'
                                                    : 'bg-blue-50 text-blue-600'
                                            }`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                                        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded text-gray-700">
                                            {JSON.stringify(log.details)}
                                        </code>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                                        {log.ip_address}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
                <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="hover:text-blue-600 disabled:opacity-50 disabled:hover:text-gray-500"
                >
                    &larr; Anterior
                </button>
                <span>Página {page}</span>
                <button
                    onClick={() => setPage(p => p + 1)}
                    className="hover:text-blue-600"
                >
                    Siguiente &rarr;
                </button>
            </div>
        </div>
    );
}
