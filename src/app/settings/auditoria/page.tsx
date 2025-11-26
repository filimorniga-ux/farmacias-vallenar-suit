'use client';

import { useState, useEffect } from 'react';
import RouteGuard from '@/components/auth/RouteGuard';
import { Search, Filter, AlertCircle, Info, CheckCircle, XCircle } from 'lucide-react';
import { query } from '@/lib/db'; // We can't use this in client component directly. Need a server action or API route.

// Since I cannot create a new API route easily without more context on where they are, 
// I will create a Server Action for fetching logs in this file if using Next.js 14, 
// or a separate file. The prompt says "Create src/app/settings/auditoria/page.tsx".
// I will use a Server Component for the page and a client component for the table if needed, 
// or just a client component that calls a server action. 
// Let's make the page a Server Component that fetches initial data, but for filtering we might need client interaction.
// Actually, let's make it a Client Component that calls a Server Action for simplicity in filtering.

// Wait, I need to create the Server Action first or inline it if possible?
// Next.js allows Server Actions in separate files.
// Let's create `src/actions/audit.ts` first? Or just put it here if I can.
// I'll create a separate action file for cleanliness.

// Import server action
import { getAuditLogs } from '../../../actions/audit';

export default function AuditoriaPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [filter, setFilter] = useState('TODOS');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const data = await getAuditLogs();
            setLogs(data);
        } catch (error) {
            console.error('Error loading logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = logs.filter(log => {
        if (filter === 'TODOS') return true;
        return log.accion === filter;
    });

    const uniqueActions = Array.from(new Set(logs.map(log => log.accion)));

    return (
        <RouteGuard allowedRoles={['ADMIN']}>
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-8 flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                                👁️ Auditoría Interna
                            </h1>
                            <p className="text-gray-500 mt-1">Registro de actividad y seguridad del sistema.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <select
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                                >
                                    <option value="TODOS">Todos los eventos</option>
                                    {uniqueActions.map(action => (
                                        <option key={action} value={action}>{action}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalle</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                            Cargando registros...
                                        </td>
                                    </tr>
                                ) : filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                            No hay registros de auditoría.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(log.fecha).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs mr-3">
                                                        {log.usuario.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900">{log.usuario}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.accion === 'LOGIN' ? 'bg-green-100 text-green-800' :
                                                    log.accion.includes('ELIMINAR') ? 'bg-red-100 text-red-800' :
                                                        'bg-blue-100 text-blue-800'
                                                    }`}>
                                                    {log.accion}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {log.detalle}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </RouteGuard>
    );
}
