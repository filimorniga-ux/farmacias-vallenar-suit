import React, { useState } from 'react';
import { Settings, User, Shield, Save, Receipt, Printer, ToggleLeft, ToggleRight, AlertTriangle, CreditCard, Star } from 'lucide-react';
import SiiSettings from './settings/SiiSettings';
import HardwarePage from './settings/HardwarePage';
import InventorySettings from './settings/InventorySettings';
import LoyaltySettings from './settings/LoyaltySettings';
import InfrastructureBillingPanel from '../components/settings/InfrastructureBillingPanel';
import { useSettingsStore } from '../store/useSettingsStore';
import { usePharmaStore } from '../store/useStore';

const SettingsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'users' | 'sii' | 'hardware' | 'inventory' | 'billing' | 'loyalty'>('users');
    const { enable_sii_integration, toggleSiiIntegration } = useSettingsStore();
    const { user } = usePharmaStore();

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
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
                    <form onSubmit={(e) => e.preventDefault()}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Nombre Completo</label>
                                <input
                                    type="text"
                                    autoComplete="name"
                                    className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium"
                                    placeholder="Ej: Juan Pérez"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">RUT</label>
                                <input
                                    type="text"
                                    autoComplete="off"
                                    className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium"
                                    placeholder="11.111.111-1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Rol</label>
                                <select autoComplete="off" className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium bg-white">
                                    <option>Cajero/a</option>
                                    <option>Químico Farmacéutico (QF)</option>
                                    <option>Administrador</option>
                                    <option>Bodega</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">PIN de Acceso (4 dígitos)</label>
                                <input
                                    type="password"
                                    maxLength={4}
                                    autoComplete="new-password"
                                    className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium tracking-widest"
                                    placeholder="••••"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button type="submit" className="px-8 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg flex items-center gap-2">
                                <Save size={20} /> Guardar Usuario
                            </button>
                        </div>
                    </form>
                </div>
            )}

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
            {activeTab === 'loyalty' && <LoyaltySettings />}

            {/* Billing Tab Content */}
            {activeTab === 'billing' && (
                <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
                    <InfrastructureBillingPanel />
                </div>
            )}
        </div>
    );
};


export default SettingsPage;
