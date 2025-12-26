'use client';

import React, { useEffect, useState } from 'react';
import { Save, Mail, Building } from 'lucide-react';
import { getPrivateSettingSecure, updateSettingSecure } from '../../../actions/settings-v2';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';

export const GeneralSettings: React.FC = () => {
    const { user } = usePharmaStore();
    const [adminEmail, setAdminEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            setLoading(true);
            try {
                // V2: Nuevo formato
                const res = await getPrivateSettingSecure('ADMIN_EMAIL');
                if (res.success && res.value) setAdminEmail(res.value);
            } catch (error) {
                console.error('Failed to load settings', error);
                toast.error('Error al cargar configuración');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            // V2: Nuevo formato (sin userId, usa sesión server-side)
            const res = await updateSettingSecure('ADMIN_EMAIL', adminEmail);
            if (res.success) {
                toast.success('Configuración guardada');
            } else {
                toast.error(res.error || 'Error al guardar');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error inesperado al guardar');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Cargando configuración...</div>;

    return (
        <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 p-8">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Building className="text-cyan-600" />
                        Configuración General de Empresa
                    </h2>
                    <p className="text-slate-500 mt-1">Parámetros globales que afectan a toda la organización.</p>
                </div>

                <div className="grid grid-cols-1 gap-8">
                    {/* Admin Email Section */}
                    <section className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Mail size={20} className="text-slate-500" />
                            Correo Maestro de Recuperación
                        </h3>
                        <p className="text-sm text-slate-500 mb-4">
                            Este correo recibirá todas las alertas de seguridad y solicitudes de recuperación de PIN de los cajeros.
                        </p>

                        <div className="flex gap-4 items-center">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Correo Electrónico</label>
                                <input
                                    type="email"
                                    value={adminEmail}
                                    onChange={(e) => setAdminEmail(e.target.value)}
                                    placeholder="ej: gerencia@farmaciasvallenar.cl"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-cyan-500 outline-none transition"
                                />
                            </div>
                        </div>
                    </section>
                </div>

                {/* Footer / Actions */}
                <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save size={20} />
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
};
