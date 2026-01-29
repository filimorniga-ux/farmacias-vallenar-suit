import React, { useEffect, useState } from 'react';
import { Shield, Key, Lock, AlertTriangle, Clock, UserCheck, ExternalLink } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { toast } from 'sonner';
import { ActiveSessionsTable } from './ActiveSessionsTable';
import { Link } from 'react-router-dom';

export const SecurityPolicyPanel: React.FC = () => {
    const { security, updateSecurityConfig } = useSettingsStore();
    const [localSettings, setLocalSettings] = useState(security);

    useEffect(() => {
        setLocalSettings(security);
    }, [security]);

    const handleSave = () => {
        updateSecurityConfig(localSettings);
        toast.success("Políticas de seguridad actualizadas localmente");
    };

    const handleChange = (field: string, value: number) => {
        setLocalSettings(prev => ({
            ...prev,
            [field]: value
        }));
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-red-100 rounded-xl">
                    <Shield className="text-red-600" size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Políticas de Acceso y Bloqueo</h3>
                    <p className="text-slate-500 text-sm">Configuración de umbrales de seguridad y auto-bloqueo</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Idle Timeout */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-700 font-bold">
                        <Clock size={18} />
                        Bloqueo por Inactividad
                    </div>
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <div className="flex justify-between mb-2">
                            <span className="text-3xl font-bold text-slate-800">{security.idle_timeout_minutes}</span>
                            <span className="text-slate-500 self-end mb-1">minutos</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="30"
                            step="1"
                            value={security.idle_timeout_minutes}
                            onChange={(e) => updateSecurityConfig({ idle_timeout_minutes: parseInt(e.target.value) })}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                        />
                        <p className="text-xs text-slate-400 mt-3">
                            El sistema se bloqueará automáticamente tras este tiempo sin actividad.
                        </p>
                    </div>
                </div>

                {/* Max Attempts */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-700 font-bold">
                        <AlertTriangle size={18} />
                        Intentos Máximos PIN
                    </div>
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <div className="flex justify-between mb-2">
                            <span className="text-3xl font-bold text-slate-800">{security.max_login_attempts}</span>
                            <span className="text-slate-500 self-end mb-1">intentos</span>
                        </div>
                        <input
                            type="range"
                            min="3"
                            max="10"
                            step="1"
                            value={security.max_login_attempts}
                            onChange={(e) => updateSecurityConfig({ max_login_attempts: parseInt(e.target.value) })}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <p className="text-xs text-slate-400 mt-3">
                            Número de intentos fallidos antes de bloquear al usuario.
                        </p>
                    </div>
                </div>

                {/* Lockout Duration */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-700 font-bold">
                        <Lock size={18} />
                        Tiempo de Castigo
                    </div>
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                        <div className="flex justify-between mb-2">
                            <span className="text-3xl font-bold text-slate-800">{security.lockout_duration_minutes}</span>
                            <span className="text-slate-500 self-end mb-1">minutos</span>
                        </div>
                        <input
                            type="number"
                            min="1"
                            max="60"
                            value={security.lockout_duration_minutes}
                            onChange={(e) => updateSecurityConfig({ lockout_duration_minutes: parseInt(e.target.value) })}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-bold text-center"
                        />
                        <p className="text-xs text-slate-400 mt-3">
                            Duración del bloqueo temporal tras exceder intentos.
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition"
                >
                    Guardar Políticas
                </button>
            </div>
            {/* Active Sessions Monitoring */}
            <div className="mt-8">
                <ActiveSessionsTable />
            </div>

            {/* Kiosko de Asistencia */}
            <div className="mt-8 bg-gradient-to-br from-cyan-50 to-sky-50 p-6 rounded-2xl border border-cyan-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-cyan-100 rounded-xl">
                            <UserCheck className="text-cyan-600" size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Control Horario Kiosko</h3>
                            <p className="text-slate-500 text-sm">Terminal de marcaje de asistencia para empleados</p>
                        </div>
                    </div>
                    <Link
                        to="/kiosk"
                        className="flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg"
                    >
                        <ExternalLink size={18} />
                        Abrir Kiosko
                    </Link>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white/60 p-4 rounded-xl">
                        <p className="text-xs text-slate-500 font-bold uppercase">Funcionalidades</p>
                        <ul className="text-sm text-slate-700 mt-2 space-y-1">
                            <li>• Entrada / Salida</li>
                            <li>• Inicio / Fin Colación</li>
                            <li>• Validación por PIN</li>
                        </ul>
                    </div>
                    <div className="bg-white/60 p-4 rounded-xl">
                        <p className="text-xs text-slate-500 font-bold uppercase">PIN Maestro</p>
                        <p className="text-sm text-slate-700 mt-2">
                            El PIN maestro permite activar el kiosko.
                            Actualmente está configurado como un valor fijo.
                        </p>
                    </div>
                    <div className="bg-white/60 p-4 rounded-xl">
                        <p className="text-xs text-slate-500 font-bold uppercase">Ubicación</p>
                        <p className="text-sm text-slate-700 mt-2">
                            El kiosko filtra empleados por la sucursal seleccionada actualmente.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
