'use client';

/**
 * 📊 AUDIT LOG VIEWER V2
 * Dashboard mejorado de auditoría con:
 * - Paginación
 * - Filtros avanzados
 * - Badges de severidad
 * - Vista de diff (old/new values)
 * - Exportación a Excel
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    Shield, User, Bot, AlertTriangle, Search, FileText,
    ChevronLeft, ChevronRight, Download, Filter, X,
    AlertCircle, Info, AlertOctagon, Eye
} from 'lucide-react';
// V2: Funciones seguras
import {
    getAuditLogsSecure,
    getAuditActionTypesSecure,
    getAuditStatsSecure,
    exportAuditLogsSecure
} from '@/actions/audit-dashboard-v2';

// Tipo local para logs de auditoría (compatible con V2)
interface AuditLogEntry {
    id: string;
    timestamp: string;
    userId: string;
    userName: string;
    userRole: string;
    actionCode: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    entityType: string;
    entityId: string;
    justification?: string | null;
    locationName?: string | null;
    oldValues?: Record<string, any> | null;
    newValues?: Record<string, any> | null;
}

// =====================================================
// CONSTANTES Y TIPOS
// =====================================================

const SEVERITY_CONFIG = {
    LOW: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', icon: Info },
    MEDIUM: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', icon: AlertCircle },
    HIGH: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: AlertTriangle },
    CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', icon: AlertOctagon },
};

// =====================================================
// COMPONENTES AUXILIARES
// =====================================================

function SeverityBadge({ severity }: { severity: keyof typeof SEVERITY_CONFIG }) {
    const config = SEVERITY_CONFIG[severity];
    const Icon = config.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${config.bg} ${config.text} border ${config.border}`}>
            <Icon size={12} />
            {severity}
        </span>
    );
}

function DiffViewer({ oldValues, newValues }: { oldValues: any; newValues: any }) {
    if (!oldValues && !newValues) return <span className="text-slate-400">-</span>;

    const allKeys = new Set([
        ...Object.keys(oldValues || {}),
        ...Object.keys(newValues || {})
    ]);

    return (
        <div className="text-xs space-y-1 max-h-40 overflow-y-auto">
            {Array.from(allKeys).map(key => {
                const oldVal = oldValues?.[key];
                const newVal = newValues?.[key];
                const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);

                return (
                    <div key={key} className={`flex gap-2 ${changed ? 'bg-yellow-50 px-1 rounded' : ''}`}>
                        <span className="font-medium text-slate-600">{key}:</span>
                        {oldVal !== undefined && (
                            <span className="text-red-500 line-through">
                                {typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal)}
                            </span>
                        )}
                        {newVal !== undefined && (
                            <span className="text-green-600">
                                {typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal)}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function AuditLogViewer() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Paginación
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 25;

    // Filtros
    const [showFilters, setShowFilters] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [severityFilter, setSeverityFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Datos auxiliares
    const [actionTypes, setActionTypes] = useState<string[]>([]);
    const [stats, setStats] = useState<{ totalToday: number; criticalToday: number } | null>(null);

    // Modal de detalle
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

    // Exportando
    const [exporting, setExporting] = useState(false);

    // Cargar logs
    const loadLogs = useCallback(async () => {
        setLoading(true);
        setError(null);

        const res = await getAuditLogsSecure({
            page,
            limit,
            searchTerm: searchTerm || undefined,
            actionCode: actionFilter || undefined,
            severity: severityFilter,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        });

        if (res.success && res.data) {
            setLogs(res.data);
            setTotalPages(res.totalPages || 1);
            setTotal(res.total || 0);
        } else {
            setError(res.error || 'Error cargando logs');
        }
        setLoading(false);
    }, [page, searchTerm, actionFilter, severityFilter, startDate, endDate]);

    // Cargar datos iniciales
    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    useEffect(() => {
        // Cargar tipos de acción y estadísticas
        getAuditActionTypesSecure().then((res: any) => {
            if (res.success && res.data) setActionTypes(res.data);
        });
        getAuditStatsSecure().then((res: any) => {
            if (res.success && res.data) setStats(res.data);
        });
    }, []);

    // Resetear página al cambiar filtros
    useEffect(() => {
        setPage(1);
    }, [searchTerm, actionFilter, severityFilter, startDate, endDate]);

    // Exportar a Excel
    const handleExport = async () => {
        setExporting(true);
        const res = await exportAuditLogsSecure({
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            actionCode: actionFilter || undefined,
        });

        if (res.success && res.data) {
            const byteCharacters = atob(res.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.filename || `auditoria_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
        setExporting(false);
    };

    // Limpiar filtros
    const clearFilters = () => {
        setSearchTerm('');
        setActionFilter('');
        setSeverityFilter('ALL');
        setStartDate('');
        setEndDate('');
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header con estadísticas */}
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-700 rounded-lg text-white">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Centro de Auditoría de Seguridad</h3>
                            <p className="text-xs text-slate-500">
                                Registro inmutable de acciones • {total.toLocaleString()} eventos
                            </p>
                        </div>
                    </div>

                    {/* Stats rápidas */}
                    {stats && (
                        <div className="flex gap-4">
                            <div className="text-center px-4 py-2 bg-white rounded-lg border border-slate-200">
                                <div className="text-2xl font-bold text-slate-700">{stats.totalToday}</div>
                                <div className="text-xs text-slate-500">Hoy</div>
                            </div>
                            <div className="text-center px-4 py-2 bg-red-50 rounded-lg border border-red-200">
                                <div className="text-2xl font-bold text-red-600">{stats.criticalToday}</div>
                                <div className="text-xs text-red-500">Críticos</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Barra de herramientas */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
                {/* Búsqueda */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Buscar usuario, acción, detalle..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-400 outline-none"
                    />
                </div>

                {/* Botón filtros */}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${showFilters ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <Filter size={16} />
                    Filtros
                </button>

                {/* Exportar */}
                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                    <Download size={16} />
                    {exporting ? 'Exportando...' : 'Excel'}
                </button>
            </div>

            {/* Panel de filtros expandible */}
            {showFilters && (
                <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Acción</label>
                        <select
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                        >
                            <option value="">Todas las acciones</option>
                            {actionTypes.map(action => (
                                <option key={action} value={action}>{action}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Severidad</label>
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value as any)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                        >
                            <option value="ALL">Todas</option>
                            <option value="LOW">🟢 LOW</option>
                            <option value="MEDIUM">🟡 MEDIUM</option>
                            <option value="HIGH">🟠 HIGH</option>
                            <option value="CRITICAL">🔴 CRITICAL</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Desde</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                        />
                    </div>
                    <button
                        onClick={clearFilters}
                        className="md:col-span-4 flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
                    >
                        <X size={14} />
                        Limpiar filtros
                    </button>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 text-red-700 text-sm border-b border-red-200">
                    {error}
                </div>
            )}

            {/* Tabla de Logs */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th className="p-4">Fecha</th>
                            <th className="p-4">Usuario</th>
                            <th className="p-4">Acción</th>
                            <th className="p-4">Severidad</th>
                            <th className="p-4">Detalle</th>
                            <th className="p-4 w-16"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400">Cargando registros...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay registros que coincidan.</td></tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors text-sm">
                                    <td className="p-4 whitespace-nowrap text-slate-500 font-mono text-xs">
                                        {new Date(log.timestamp).toLocaleString('es-CL')}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            {log.userId === 'SYSTEM_BOT' ? (
                                                <span className="text-purple-600 font-bold text-xs px-2 py-0.5 bg-purple-100 rounded-full border border-purple-200">
                                                    <Bot size={12} className="inline mr-1" />
                                                    SISTEMA
                                                </span>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-slate-800">{log.userName}</span>
                                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">{log.userRole}</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                                            {log.actionCode}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <SeverityBadge severity={log.severity} />
                                    </td>
                                    <td className="p-4 text-slate-600 max-w-xs truncate" title={log.justification || ''}>
                                        {log.justification || log.entityType}
                                    </td>
                                    <td className="p-4">
                                        <button
                                            onClick={() => setSelectedLog(log)}
                                            className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                                            title="Ver detalles"
                                        >
                                            <Eye size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Paginación */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                    Página {page} de {totalPages} ({total.toLocaleString()} registros)
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Modal de detalle */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">Detalle del Evento</h3>
                            <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-700">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <label className="text-xs text-slate-500">Fecha</label>
                                    <div className="font-mono">{new Date(selectedLog.timestamp).toLocaleString('es-CL')}</div>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">Usuario</label>
                                    <div>{selectedLog.userName} ({selectedLog.userRole})</div>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">Acción</label>
                                    <div className="font-mono">{selectedLog.actionCode}</div>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">Severidad</label>
                                    <div><SeverityBadge severity={selectedLog.severity} /></div>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">Sucursal</label>
                                    <div>{selectedLog.locationName || '-'}</div>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">Entidad</label>
                                    <div>{selectedLog.entityType}: {selectedLog.entityId}</div>
                                </div>
                            </div>

                            {selectedLog.justification && (
                                <div>
                                    <label className="text-xs text-slate-500">Justificación</label>
                                    <div className="mt-1 p-2 bg-slate-50 rounded text-sm">{selectedLog.justification}</div>
                                </div>
                            )}

                            <div>
                                <label className="text-xs text-slate-500 mb-2 block">Cambios (Diff)</label>
                                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                                    <DiffViewer oldValues={selectedLog.oldValues} newValues={selectedLog.newValues} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
