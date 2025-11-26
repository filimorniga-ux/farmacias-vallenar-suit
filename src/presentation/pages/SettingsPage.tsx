import React, { useState } from 'react';
import { Settings, User, Shield, Save, Receipt } from 'lucide-react';
import SiiSettings from './settings/SiiSettings';

const SettingsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'users' | 'sii'>('users');

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-900">Configuración</h1>
                <p className="text-slate-500">Administración del Sistema</p>
            </header>

            {/* Tabs */}
            <div className="bg-white rounded-t-3xl shadow-sm border border-slate-200 overflow-hidden max-w-7xl">
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'users'
                                ? 'bg-cyan-50 text-cyan-700 border-b-2 border-cyan-600'
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <User size={20} />
                        Gestión de Usuarios
                    </button>
                    <button
                        onClick={() => setActiveTab('sii')}
                        className={`flex-1 py-4 px-6 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'sii'
                                ? 'bg-green-50 text-green-700 border-b-2 border-green-600'
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <Receipt size={20} />
                        Conexión SII
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Nombre Completo</label>
                            <input
                                type="text"
                                className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium"
                                placeholder="Ej: Juan Pérez"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">RUT</label>
                            <input
                                type="text"
                                className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium"
                                placeholder="11.111.111-1"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Rol</label>
                            <select className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium bg-white">
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
                                className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium tracking-widest"
                                placeholder="••••"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button className="px-8 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg flex items-center gap-2">
                            <Save size={20} /> Guardar Usuario
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'sii' && <SiiSettings />}
        </div>
    );
};

export default SettingsPage;
