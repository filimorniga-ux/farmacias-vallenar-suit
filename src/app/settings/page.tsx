'use client';

import { useState } from 'react';
import RouteGuard from '@/components/auth/RouteGuard';
import { Save, Upload, Plus, Trash2, Edit, CheckCircle, AlertCircle, Building, Users, FileText, Shield, Activity, AlertTriangle, Building2, Bot } from 'lucide-react';
import { useAuthStore, Role } from '@/lib/store/useAuthStore';
import { autoBackupService } from '@/domain/services/AutoBackupService';
import { toast } from 'sonner';
import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';
import InventoryDuplicates from '@/presentation/components/settings/InventoryDuplicates';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<'sii' | 'users' | 'general' | 'backup' | 'diagnostic'>('sii');

    const handleHardReset = async () => {
        if (!confirm('⚠️ ¿Estás seguro? Esto borrará todos los datos locales y reiniciará la aplicación.')) return;

        try {
            const loadingId = toast.loading('Restableciendo sistema...');

            // 1. Clear Storage
            localStorage.clear();
            sessionStorage.clear();

            // 2. Clear IndexedDB (Tiger Data)
            try {
                const dbs = await window.indexedDB.databases();
                for (const db of dbs) {
                    if (db.name) await window.indexedDB.deleteDatabase(db.name);
                }
            } catch (e) {
                console.warn('Failed to clear IndexedDB:', e);
            }

            toast.success('Sistema restablecido', { id: loadingId });

            // 3. Force Reload
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } catch (e) {
            console.error('Reset failed', e);
            toast.error('Error al restablecer');
            window.location.reload();
        }
    };

    // Mock Data for Users
    const [users, setUsers] = useState([
        { id: 1, name: 'Administrador', username: 'admin', role: 'ADMIN' as Role },
        { id: 2, name: 'Químico Farmacéutico', username: 'qf', role: 'QF' as Role },
        { id: 3, name: 'Vendedor de Caja', username: 'caja', role: 'VENDEDOR' as Role },
    ]);

    // Mock Data for SII
    const [siiStatus, setSiiStatus] = useState<'connected' | 'disconnected'>('disconnected');

    const handleSaveSii = (e: React.FormEvent) => {
        e.preventDefault();
        // Simulate API call
        setTimeout(() => setSiiStatus('connected'), 1000);
    };

    const handleRoleChange = (userId: number, newRole: Role) => {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    };

    return (
        <RouteGuard allowedRoles={['ADMIN']}>
            <div className="min-h-screen bg-gray-50 p-8">
                <div className="max-w-5xl mx-auto">
                    <div className="mb-8 flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                                <Shield className="text-blue-600" />
                                Configuración del Sistema
                            </h1>
                            <p className="text-gray-500 mt-1">Gestión centralizada de Farmacias Vallenar.</p>
                        </div>
                        <SyncStatusBadge />
                    </div>

                    {/* Tabs */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                        <div className="flex border-b border-gray-200">
                            <button
                                onClick={() => setActiveTab('sii')}
                                className={`flex-1 py-4 text-sm font-medium text-center flex items-center justify-center gap-2 transition-colors ${activeTab === 'sii' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <FileText size={18} />
                                Configuración SII
                            </button>
                            <button
                                onClick={() => setActiveTab('users')}
                                className={`flex-1 py-4 text-sm font-medium text-center flex items-center justify-center gap-2 transition-colors ${activeTab === 'users' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <Users size={18} />
                                Gestión de Usuarios
                            </button>
                            <button
                                onClick={() => setActiveTab('general')}
                                className={`flex-1 py-4 text-sm font-medium text-center flex items-center justify-center gap-2 transition-colors ${activeTab === 'general' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <Building size={18} />
                                General
                            </button>
                            <button
                                onClick={() => setActiveTab('backup')}
                                className={`flex-1 py-4 text-sm font-medium text-center flex items-center justify-center gap-2 transition-colors ${activeTab === 'backup' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <Save size={18} />
                                Respaldos
                            </button>
                            <button
                                onClick={() => setActiveTab('diagnostic')}
                                className={`flex-1 py-4 text-sm font-medium text-center flex items-center justify-center gap-2 transition-colors ${activeTab === 'diagnostic' ? 'bg-red-50 text-red-600 border-b-2 border-red-600' : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <Activity size={18} />
                                Diagnóstico
                            </button>
                            <button
                                onClick={() => window.location.href = '/settings/ai'}
                                className="flex-1 py-4 text-sm font-medium text-center flex items-center justify-center gap-2 transition-colors text-gray-500 hover:bg-purple-50 hover:text-purple-600"
                            >
                                <Bot size={18} />
                                Inteligencia Artificial
                            </button>
                        </div>

                        <div className="p-8">
                            {/* SII Tab */}
                            {activeTab === 'sii' && (
                                <form onSubmit={handleSaveSii} className="space-y-6">
                                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <div>
                                            <h3 className="font-semibold text-gray-900">Estado de Conexión SII</h3>
                                            <p className="text-sm text-gray-500">Verificación de certificado digital</p>
                                        </div>
                                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${siiStatus === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {siiStatus === 'connected' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                            {siiStatus === 'connected' ? 'Conectado' : 'Desconectado'}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">RUT Empresa</label>
                                            <input type="text" placeholder="76.xxx.xxx-x" className="w-full" required autoComplete="off" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
                                            <input type="text" placeholder="Farmacias Vallenar SpA" className="w-full" required autoComplete="off" />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Giro Comercial</label>
                                            <input type="text" placeholder="Venta al por menor de productos farmacéuticos..." className="w-full" required autoComplete="off" />
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-200 pt-6">
                                        <h3 className="text-lg font-medium text-gray-900 mb-4">Certificado Digital</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Archivo .pfx</label>
                                                <div className="flex items-center gap-2">
                                                    <label className="flex-1 cursor-pointer bg-white border-2 border-gray-400 border-dashed rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
                                                        <Upload className="mx-auto h-6 w-6 text-gray-400" />
                                                        <span className="mt-2 block text-sm font-medium text-gray-600">Subir certificado</span>
                                                        <input type="file" className="hidden" accept=".pfx" />
                                                    </label>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña del Certificado</label>
                                                <input type="password" placeholder="••••••••" className="w-full" autoComplete="new-password" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button type="submit" className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm">
                                            <Save size={18} />
                                            Guardar Credenciales
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Users Tab */}
                            {activeTab === 'users' && (
                                <div>
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-lg font-medium text-gray-900">Usuarios del Sistema</h3>
                                        <button className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm">
                                            <Plus size={18} />
                                            Nuevo Usuario
                                        </button>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {users.map((user) => (
                                                    <tr key={user.id}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.username}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            <select
                                                                value={user.role}
                                                                onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                                                                className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                                            >
                                                                <option value="ADMIN">Admin</option>
                                                                <option value="QF">QF</option>
                                                                <option value="VENDEDOR">Vendedor</option>
                                                            </select>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button className="text-blue-600 hover:text-blue-900 mr-3"><Edit size={18} /></button>
                                                            <button className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* General Tab */}
                            {activeTab === 'general' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Fantasía</label>
                                            <input type="text" defaultValue="Farmacias Vallenar" className="w-full" autoComplete="off" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección Sucursal</label>
                                            <input type="text" defaultValue="Calle Principal 123, Vallenar" className="w-full" autoComplete="off" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Logo de la Empresa</label>
                                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:bg-gray-50 transition-colors cursor-pointer">
                                            <div className="space-y-1 text-center">
                                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                                <div className="flex text-sm text-gray-600">
                                                    <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                                        <span>Subir un archivo</span>
                                                        <input type="file" className="sr-only" />
                                                    </label>
                                                    <p className="pl-1">o arrastrar y soltar</p>
                                                </div>
                                                <p className="text-xs text-gray-500">PNG, JPG, GIF hasta 10MB</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm">
                                            <Save size={18} />
                                            Guardar Cambios
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Backup Tab */}
                            {activeTab === 'backup' && (
                                <div className="space-y-8">
                                    {/* Manual Backup */}
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                                                <Save size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-lg font-bold text-blue-900">Respaldo Manual</h3>
                                                <p className="text-blue-700 mt-1 mb-4">
                                                    Descarga una copia completa de las ventas, inventario y movimientos de caja en formato JSON.
                                                    Guarda este archivo en un lugar seguro (USB o Disco Externo).
                                                </p>
                                                <button
                                                    onClick={() => {
                                                        autoBackupService.downloadPhysicalBackup();
                                                        toast.success('Respaldo descargado correctamente');
                                                    }}
                                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition shadow-sm flex items-center gap-2"
                                                >
                                                    <Save size={18} />
                                                    Descargar Copia de Seguridad
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Restore */}
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-amber-100 rounded-lg text-amber-600">
                                                <Upload size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-lg font-bold text-amber-900">Restaurar Datos</h3>
                                                <p className="text-amber-800 mt-1 mb-4">
                                                    Recupera el sistema desde un archivo de respaldo previo.
                                                </p>

                                                <div className="bg-white border-l-4 border-amber-400 p-4 mb-6 shadow-sm">
                                                    <div className="flex items-start gap-3">
                                                        <AlertCircle className="text-amber-500 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="font-bold text-amber-900 text-sm">⚠️ ADVERTENCIA DE SEGURIDAD</p>
                                                            <p className="text-amber-700 text-sm mt-1">
                                                                Al restaurar, <strong>se reemplazarán todos los datos locales actuales</strong> (ventas, stock, caja) con los del archivo.
                                                                Esta acción no se puede deshacer. Asegúrate de estar cargando el archivo correcto.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <label className="block w-full">
                                                    <span className="sr-only">Elegir archivo de respaldo</span>
                                                    <input
                                                        type="file"
                                                        accept=".json"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;

                                                            if (confirm('¿Estás seguro de que deseas restaurar los datos? Se perderá cualquier cambio no guardado actual.')) {
                                                                const loadingIdx = toast.loading('Restaurando sistema...');

                                                                const result = await autoBackupService.restoreFromBackupFile(file);

                                                                if (result.success) {
                                                                    toast.success(result.message, { id: loadingIdx });
                                                                    // Force reload to apply changes
                                                                    setTimeout(() => {
                                                                        window.location.reload();
                                                                    }, 1500);
                                                                } else {
                                                                    toast.error(result.message, { id: loadingIdx });
                                                                }
                                                            } else {
                                                                e.target.value = ''; // Reset input
                                                            }
                                                        }}
                                                        className="block w-full text-sm text-slate-500
                                                        file:mr-4 file:py-2 file:px-4
                                                        file:rounded-full file:border-0
                                                        file:text-sm file:font-semibold
                                                        file:bg-amber-100 file:text-amber-700
                                                        hover:file:bg-amber-200 cursor-pointer"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Diagnostic Tab */}
                            {activeTab === 'diagnostic' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                                    <InventoryDuplicates />

                                    <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-red-100 rounded-lg text-red-600">
                                                <AlertTriangle size={24} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-lg font-bold text-red-900">Zona de Peligro</h3>
                                                <p className="text-red-700 mt-1 mb-4">
                                                    Si experimentas errores graves o inconsistencias en los datos que no se resuelven sincronizando,
                                                    puedes restablecer la aplicación a su estado original.
                                                </p>

                                                <div className="bg-white border-l-4 border-red-500 p-4 mb-6 shadow-sm">
                                                    <p className="text-red-800 text-sm">
                                                        <strong>Nota:</strong> Esta acción eliminará:
                                                        <ul className="list-disc pl-5 mt-1 space-y-1">
                                                            <li>Credenciales de sesión</li>
                                                            <li>Caché de inventario y ventas local</li>
                                                            <li>Configuraciones temporales</li>
                                                        </ul>
                                                        No eliminará datos que ya estén sincronizados en el servidor central.
                                                    </p>
                                                </div>

                                                <button
                                                    onClick={handleHardReset}
                                                    className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition shadow-sm flex items-center gap-2"
                                                >
                                                    <Trash2 size={18} />
                                                    Restablecer Aplicación (Hard Reset)
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </RouteGuard>
    );
}
