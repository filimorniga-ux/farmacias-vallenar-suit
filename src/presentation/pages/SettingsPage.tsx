import React, { useState } from 'react';
import { Settings, User, Shield, Save, Receipt, Printer, ToggleLeft, ToggleRight, AlertTriangle, CreditCard, Star, Monitor, Building } from 'lucide-react';
import SiiSettings from './settings/SiiSettings';
import HardwarePage from './settings/HardwarePage';
import InventorySettings from './settings/InventorySettings';
import LoyaltySettings from './settings/LoyaltySettings';
import InfrastructureBillingPanel from '../components/settings/InfrastructureBillingPanel';
import { useSettingsStore } from '../store/useSettingsStore';
import { usePharmaStore } from '../store/useStore';
import { UsersList } from '../components/settings/UsersList';
import { UsersSettingsForm } from '../components/settings/UsersSettingsForm';
import { TerminalSettings } from '../components/settings/TerminalSettings';
import { EmployeeProfile } from '../../domain/types';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { AuditLogTable } from '../components/settings/AuditLogTable';
import { SecurityPolicyPanel } from '../components/settings/SecurityPolicyPanel';

const SettingsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'general' | 'users' | 'sii' | 'hardware' | 'inventory' | 'billing' | 'loyalty' | 'terminals' | 'backup' | 'audit'>('general');

    const { enable_sii_integration, toggleSiiIntegration } = useSettingsStore();
    const { user } = usePharmaStore();

    // Estado para gestión de usuarios
    const [usersView, setUsersView] = useState<'list' | 'form'>('list');
    const [selectedUser, setSelectedUser] = useState<EmployeeProfile | null>(null);

    const handleEditUser = (user: EmployeeProfile) => {
        setSelectedUser(user);
        setUsersView('form');
    };

    const handleCreateUser = () => {
        setSelectedUser(null);
        setUsersView('form');
    };

    const handleUserFormSuccess = () => {
        setUsersView('list');
        setSelectedUser(null);
    };

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900">Configuración</h1>
                    <p className="text-slate-500">Administración del Sistema</p>
                </div>

                {/* Global SII Toggle */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">Integración SII</p>
                        <p className="text-xs text-slate-500">{enable_sii_integration ? 'Modo Fiscal (Boleta)' : 'Modo Control Interno'}</p>
                    </div>
                    <button
                        onClick={toggleSiiIntegration}
                        className={`relative w-14 h-8 rounded-full transition-colors duration-300 ${enable_sii_integration ? 'bg-green-500' : 'bg-slate-300'}`}
                    >
                        <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${enable_sii_integration ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-white rounded-t-3xl shadow-sm border border-slate-200 overflow-hidden max-w-7xl">
                <div className="flex border-b border-slate-200 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'general'
                            ? 'bg-cyan-50 text-cyan-700 border-b-2 border-cyan-600'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <Building size={20} />
                        General
                    </button>

                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'users'
                            ? 'bg-cyan-50 text-cyan-700 border-b-2 border-cyan-600'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <User size={20} />
                        Gestión de Usuarios
                    </button>

                    <button
                        onClick={() => setActiveTab('terminals')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'terminals'
                            ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <Monitor size={20} />
                        Cajas / Terminales
                    </button>

                    <button
                        onClick={() => setActiveTab('sii')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'sii'
                            ? 'bg-green-50 text-green-700 border-b-2 border-green-600'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <Receipt size={20} />
                        Conexión SII
                    </button>
                    <button
                        onClick={() => setActiveTab('hardware')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'hardware'
                            ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <Printer size={20} />
                        Hardware & Impresión
                    </button>
                    <button
                        onClick={() => setActiveTab('inventory')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'inventory'
                            ? 'bg-red-50 text-red-700 border-b-2 border-red-600'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <AlertTriangle size={20} />
                        Mantenimiento
                    </button>

                    {/* Security Audit Tab (Manager Only) */}
                    {(user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                        <button
                            onClick={() => setActiveTab('audit')}
                            className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'audit'
                                ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                                : 'text-slate-500 hover:bg-slate-50'
                                }`}
                        >
                            <Shield size={20} />
                            Seguridad
                        </button>
                    )}

                    {/* Loyalty Tab (Manager Only) */}
                    {(user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                        <button
                            onClick={() => setActiveTab('loyalty')}
                            className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'loyalty'
                                ? 'bg-amber-50 text-amber-700 border-b-2 border-amber-600'
                                : 'text-slate-500 hover:bg-slate-50'
                                }`}
                        >
                            <Star size={20} />
                            Fidelización
                        </button>
                    )}

                    {/* Infrastructure Billing Tab (Manager Only) */}
                    {(user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                        <button
                            onClick={() => setActiveTab('billing')}
                            className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'billing'
                                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                                : 'text-slate-500 hover:bg-slate-50'
                                }`}
                        >
                            <CreditCard size={20} />
                            Suscripción & Pagos
                        </button>
                    )}
                    {/* Backup Tab */}
                    <button
                        onClick={() => setActiveTab('backup')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'backup'
                            ? 'bg-slate-100 text-slate-800 border-b-2 border-slate-600'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <Save size={20} />
                        Respaldo
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'general' && <GeneralSettings />}

            {activeTab === 'users' && (
                <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
                    {usersView === 'list' ? (
                        <UsersList
                            onEdit={handleEditUser}
                            onCreate={handleCreateUser}
                        />
                    ) : (
                        <UsersSettingsForm
                            initialData={selectedUser}
                            onCancel={() => setUsersView('list')}
                            onSuccess={handleUserFormSuccess}
                        />
                    )}
                </div>
            )}

            {activeTab === 'terminals' && <TerminalSettings />}

            {activeTab === 'sii' && (
                enable_sii_integration ? (
                    <SiiSettings />
                ) : (
                    <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 p-12 flex flex-col items-center text-center">
                        <div className="bg-slate-100 p-6 rounded-full mb-6">
                            <Receipt size={48} className="text-slate-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">Integración SII Desactivada</h2>
                        <p className="text-slate-500 max-w-md mb-8">
                            El sistema está operando en modo "Control Interno". Las ventas generarán comprobantes no válidos como boleta.
                            Active la integración en la parte superior para configurar certificados y folios.
                        </p>
                        <button
                            onClick={toggleSiiIntegration}
                            className="px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition shadow-lg"
                        >
                            Activar Integración SII
                        </button>
                    </div>
                )
            )}
            {activeTab === 'hardware' && <HardwarePage />}
            {activeTab === 'inventory' && <InventorySettings />}
            {/* Security Audit Tab (Manager Only) */}
            {(user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
                    {activeTab === 'audit' && (
                        <>
                            <SecurityPolicyPanel />
                            <AuditLogTable />
                        </>
                    )}
                </div>
            )}

            {/* Loyalty Tab Content */}
            {activeTab === 'loyalty' && <LoyaltySettings />}

            {/* Billing Tab Content */}
            {activeTab === 'billing' && (
                <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
                    <InfrastructureBillingPanel />
                </div>
            )}

            {/* Backup Tab Content */}
            {activeTab === 'backup' && (
                <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 p-8">
                    <div className="flex flex-col items-center max-w-2xl mx-auto text-center space-y-6">
                        <div className="bg-slate-100 p-6 rounded-full">
                            <Save size={48} className="text-slate-500" />
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">Respaldo Local y Descarga</h2>
                            <p className="text-slate-500 mt-2">
                                El sistema realiza copias automáticas cada 30 minutos.
                                En caso de emergencia, puede descargar una copia física (JSON) de todos los datos locales.
                            </p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-left w-full">
                            <h3 className="font-bold text-amber-800 flex items-center gap-2">
                                <AlertTriangle size={18} />
                                Importante
                            </h3>
                            <p className="text-sm text-amber-900 mt-1">
                                Este archivo contiene información sensible (Ventas, Inventario, Caja).
                                Guárdelo en un lugar seguro. Al descargar, se incluirán las ventas no sincronizadas.
                            </p>
                        </div>

                        <button
                            onClick={async () => {
                                const { autoBackupService } = await import('../../domain/services/AutoBackupService');
                                const success = await autoBackupService.downloadPhysicalBackup();
                                if (success) {
                                    import('sonner').then(({ toast }) => toast.success('Archivo descargado correctamente'));
                                } else {
                                    import('sonner').then(({ toast }) => toast.error('Error al generar respaldo'));
                                }
                            }}
                            className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition shadow-lg mt-4"
                        >
                            <Save size={20} />
                            Descargar Copia Local (.JSON)
                        </button>

                        <p className="text-xs text-slate-400">
                            Formato: JSON Estandarizado • Incluye: Ventas, Caja, Inventario
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};


export default SettingsPage;
