import React from 'react';
import { Shield, Clock, Lock, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { toast } from 'sonner';

export const SecurityPolicyPanel: React.FC = () => {
    const { security, updateSecurityConfig } = useSettingsStore();

    const handleSave = () => {
        // Here we would ideally persist to backend via API
        toast.success("Políticas de seguridad actualizadas localmente");
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
        </div>
    );
};
