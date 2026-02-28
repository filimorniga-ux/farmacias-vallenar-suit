'use client';
/**
 * BackupManager — UI para gestión de backups SQLite en Electron.
 *
 * Solo visible en entorno Electron. Muestra lista de backups,
 * permite crear un backup manual y restaurar desde un backup existente.
 */

import React, { useState } from 'react';
import {
    HardDrive,
    Download,
    Upload,
    Loader2,
    Archive,
    RefreshCw,
    CheckCircle,
    AlertTriangle,
    Clock,
    FileArchive,
    X,
} from 'lucide-react';
import { useBackups, isElectronEnv } from '../../../hooks/useOfflineDB';

const BackupManager: React.FC = () => {
    const {
        backups,
        isLoading,
        isElectron,
        refresh,
        createBackup,
        restoreBackup,
        getBackupDir,
    } = useBackups();

    const [isCreating, setIsCreating] = useState(false);
    const [isRestoring, setIsRestoring] = useState<string | null>(null);
    const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    if (!isElectron) return null; // Only show in Electron

    const handleCreate = async () => {
        setIsCreating(true);
        setFeedback(null);
        try {
            const result = await createBackup();
            if (result) {
                setFeedback({ type: 'success', message: `Backup creado: ${result.filename}` });
            } else {
                setFeedback({ type: 'error', message: 'Error al crear backup' });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Error inesperado al crear backup' });
        } finally {
            setIsCreating(false);
            setTimeout(() => setFeedback(null), 5000);
        }
    };

    const handleRestore = async (filename: string) => {
        setIsRestoring(filename);
        setConfirmRestore(null);
        setFeedback(null);
        try {
            const success = await restoreBackup(filename);
            if (success) {
                setFeedback({ type: 'success', message: `Base de datos restaurada desde ${filename}. Se recomienda reiniciar la aplicación.` });
            } else {
                setFeedback({ type: 'error', message: `Error al restaurar desde ${filename}` });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Error inesperado al restaurar' });
        } finally {
            setIsRestoring(null);
            await refresh();
        }
    };

    const handleOpenDir = async () => {
        const dir = await getBackupDir();
        if (dir && (window as any).electronAPI?.shell?.openPath) {
            (window as any).electronAPI.shell.openPath(dir);
        }
    };

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleString('es-CL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return iso;
        }
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                        <HardDrive size={20} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Backups Locales</h3>
                        <p className="text-xs text-gray-500">
                            {backups.length} backups • Automático cada 30 min
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refresh()}
                        disabled={isLoading}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Actualizar lista"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {isCreating ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Download size={14} />
                        )}
                        Crear Backup
                    </button>
                </div>
            </div>

            {/* Feedback */}
            {feedback && (
                <div className={`mx-5 mt-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${feedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                    {feedback.type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                    {feedback.message}
                    <button onClick={() => setFeedback(null)} className="ml-auto p-0.5 hover:opacity-70">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmRestore && (
                <div className="mx-5 mt-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-amber-800">¿Restaurar base de datos?</p>
                            <p className="text-xs text-amber-700 mt-1">
                                Se reemplazará la BD actual con <span className="font-mono">{confirmRestore}</span>.
                                Los datos no sincronizados se perderán.
                            </p>
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => handleRestore(confirmRestore)}
                                    className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-md hover:bg-amber-700"
                                >
                                    Sí, restaurar
                                </button>
                                <button
                                    onClick={() => setConfirmRestore(null)}
                                    className="px-3 py-1 bg-white text-gray-700 text-xs font-medium rounded-md border hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Backup List */}
            <div className="max-h-80 overflow-y-auto">
                {backups.length === 0 && !isLoading ? (
                    <div className="px-5 py-8 text-center text-gray-400 text-sm">
                        <Archive size={32} className="mx-auto mb-2 opacity-50" />
                        No hay backups aún. Se crean automáticamente.
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                        {backups.slice(0, 20).map((backup) => (
                            <li key={backup.filename} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 min-w-0">
                                        {backup.compressed ? (
                                            <FileArchive size={16} className="text-gray-400 flex-shrink-0" />
                                        ) : (
                                            <HardDrive size={16} className="text-blue-500 flex-shrink-0" />
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                                {backup.filename}
                                            </p>
                                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                                                <span className="flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {formatDate(backup.createdAt)}
                                                </span>
                                                <span>{backup.sizeMB} MB</span>
                                                {backup.compressed && (
                                                    <span className="px-1 py-0.5 bg-gray-100 text-gray-500 rounded text-[9px]">
                                                        GZ
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setConfirmRestore(backup.filename)}
                                        disabled={isRestoring === backup.filename}
                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors disabled:opacity-50"
                                        title="Restaurar este backup"
                                    >
                                        {isRestoring === backup.filename ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Upload size={12} />
                                        )}
                                        Restaurar
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Footer */}
            {backups.length > 0 && (
                <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <p className="text-[10px] text-gray-400">
                        Rotación: máx. 48 backups • Compresión después de 2h
                    </p>
                    <button
                        onClick={handleOpenDir}
                        className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline"
                    >
                        Abrir carpeta
                    </button>
                </div>
            )}
        </div>
    );
};

export default BackupManager;
