import React, { useState, useEffect } from 'react';
import { X, Save, UserPlus, Briefcase, FileText, Lock, Shield, Fingerprint } from 'lucide-react';
import { EmployeeProfile } from '../../../domain/types';
import { ROLES, Role } from '../../../domain/security/roles';
import { APP_MODULES, ROLE_PRESETS } from '../../../domain/config/roles_presets';
import { WebAuthnService } from '../../../infrastructure/biometrics/WebAuthnService';
import { toast } from 'sonner';
import { formatRut } from '../../../lib/utils';
import { useLocationStore } from '../../store/useLocationStore';
import { MapPin } from 'lucide-react';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: EmployeeProfile | null;
    onSave: (employee: EmployeeProfile) => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({ isOpen, onClose, employee, onSave }) => {
    const [formData, setFormData] = useState<EmployeeProfile | null>(null);
    const { locations } = useLocationStore();
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (employee) {
            console.log('Employee Data Loaded:', employee);
            setFormData({ ...employee });
        }
        setIsSubmitting(false);
    }, [employee, isOpen]);

    if (!isOpen || !formData) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSave(formData);
        } catch (error) {
            console.error('Error submitting form:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        {formData.id.startsWith('EMP-') && !formData.rut ? <UserPlus className="text-blue-600" /> : <Briefcase className="text-blue-600" />}
                        {formData.id.startsWith('EMP-') && !formData.rut ? 'Nuevo Empleado' : 'Editar Empleado'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors" disabled={isSubmitting}>
                        <X size={24} className="text-slate-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8">
                    <form id="employee-form" onSubmit={handleSubmit} className="space-y-8">

                        {/* Security Section - Highlighted */}
                        <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Lock size={120} className="text-red-500" />
                            </div>

                            <h3 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2 relative z-10">
                                <Shield className="fill-red-100" />
                                🔐 Llaves de Acceso (Kiosco)
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                                <div>
                                    <label className="block text-sm font-bold text-red-800 mb-2">PIN de Acceso (4-6 dígitos)</label>
                                    <input
                                        type="password"
                                        maxLength={6}
                                        autoComplete="new-password"
                                        value={formData.access_pin}
                                        onChange={e => setFormData({ ...formData, access_pin: e.target.value })}
                                        className="w-full p-4 bg-white border-2 border-red-200 rounded-xl focus:ring-4 focus:ring-red-200 focus:border-red-500 outline-none font-mono text-center text-2xl tracking-[0.5em] text-red-900 placeholder-red-200"
                                        placeholder="••••••"
                                        disabled={isSubmitting}
                                    />
                                    <p className="text-xs text-red-600 mt-2 font-medium">
                                        * Este PIN es el que el empleado usará en el Totem de entrada.
                                    </p>
                                </div>

                                <div className="bg-white/50 rounded-xl p-4 border border-red-100">
                                    <label className="block text-sm font-bold text-red-800 mb-2">Biometría</label>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Fingerprint className="text-red-400" />
                                            <span className="text-sm font-medium text-slate-600">
                                                {formData.biometric_credentials?.length ? '✅ Huella Vinculada' : '⚠️ No configurada'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={async () => {
                                            try {
                                                toast.info('Iniciando registro biométrico...');
                                                const credential = await WebAuthnService.registerCredential(formData.id, formData.name);
                                                if (credential) {
                                                    const currentCreds = formData.biometric_credentials || [];
                                                    setFormData({
                                                        ...formData,
                                                        biometric_credentials: [...currentCreds, credential.id]
                                                    });
                                                    toast.success('Biometría registrada exitosamente');
                                                }
                                            } catch (error) {
                                                toast.error('Error al registrar biometría');
                                            }
                                        }}
                                        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-200 disabled:opacity-50"
                                    >
                                        <span className="text-xl">🖐️</span>
                                        Enrolar Huella Digital
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Personal Info */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <FileText size={16} />
                                    Información Personal
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Completo</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">RUT</label>
                                            <input
                                                type="text"
                                                value={formData.rut}
                                                onChange={e => setFormData({ ...formData, rut: formatRut(e.target.value) })}
                                                maxLength={12}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                disabled={isSubmitting}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Teléfono</label>
                                            <input
                                                type="text"
                                                value={formData.contact_phone || ''}
                                                onChange={e => setFormData({ ...formData, contact_phone: e.target.value })}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                disabled={isSubmitting}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Estado</label>
                                        <select
                                            value={formData.status || ''}
                                            onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            disabled={isSubmitting}
                                        >
                                            <option value="ACTIVE">Activo</option>
                                            <option value="ON_LEAVE">Licencia/Vacaciones</option>
                                            <option value="TERMINATED">Desvinculado</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Contract Info */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <Briefcase size={16} />
                                    Contrato y Rol
                                </h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Cargo</label>
                                            <select
                                                value={formData.job_title || ''}
                                                onChange={e => setFormData({ ...formData, job_title: e.target.value as any })}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                disabled={isSubmitting}
                                            >
                                                <option value="QUIMICO_FARMACEUTICO">Químico Farmacéutico</option>
                                                <option value="AUXILIAR_FARMACIA">Auxiliar de Farmacia</option>
                                                <option value="CAJERO_VENDEDOR">Cajero Vendedor</option>
                                                <option value="BODEGUERO">Bodeguero</option>
                                                <option value="ADMINISTRATIVO">Administrativo</option>
                                                <option value="GERENTE_GENERAL">Gerente General</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Rol Sistema</label>
                                            <select
                                                value={formData.role || ''}
                                                onChange={(e) => {
                                                    const newRole = e.target.value as Role;
                                                    // Auto-Select Permissions from PRESET
                                                    const presetModules = ROLE_PRESETS[newRole] || [];
                                                    console.log(`🔄 Switching Role to ${newRole}: Applying presets`, presetModules);

                                                    setFormData({
                                                        ...formData,
                                                        role: newRole,
                                                        allowed_modules: [...presetModules]
                                                    });
                                                }}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                disabled={isSubmitting}
                                            >
                                                {Object.entries(ROLES).map(([key, label]) => (
                                                    <option key={key} value={key}>{label}</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-blue-600 mt-1 font-medium">
                                                * Al cambiar el rol, los permisos se asignarán automáticamente.
                                            </p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
                                            <MapPin size={14} className="text-slate-400" />
                                            Lugar de Trabajo Asignado
                                        </label>
                                        <select
                                            value={formData.assigned_location_id || ''}
                                            onChange={e => setFormData({ ...formData, assigned_location_id: e.target.value || undefined })}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            disabled={isSubmitting}
                                        >
                                            <option value="">-- Sin Asignación (Global) --</option>
                                            {locations
                                                .filter(loc => loc.is_active !== false || loc.id === formData.assigned_location_id)
                                                .map(loc => (
                                                    <option key={loc.id} value={loc.id}>
                                                        {loc.name} ({loc.type}) {loc.is_active === false ? '(Inactivo)' : ''}
                                                    </option>
                                                ))}
                                        </select>
                                        <p className="text-xs text-slate-400 mt-1">
                                            * Define dónde marca asistencia este empleado.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Sueldo Base</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-3 text-slate-400">$</span>
                                            <input
                                                type="number"
                                                value={formData.base_salary || ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    base_salary: parseInt(e.target.value) || 0
                                                })}
                                                className="w-full pl-8 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                disabled={isSubmitting}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">AFP</label>
                                            <select
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={formData.pension_fund || ''}
                                                onChange={e => setFormData({ ...formData, pension_fund: e.target.value })}
                                                disabled={isSubmitting}
                                            >
                                                <option value="">Seleccionar...</option>
                                                <option value="HABITAT">Habitat</option>
                                                <option value="MODELO">Modelo</option>
                                                <option value="PLANVITAL">Planvital</option>
                                                <option value="PROVIDA">Provida</option>
                                                <option value="CAPITAL">Capital</option>
                                                <option value="CUPRUM">Cuprum</option>
                                                <option value="UNO">Uno</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Salud</label>
                                            <select
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={formData.health_system || ''}
                                                onChange={e => setFormData({ ...formData, health_system: e.target.value })}
                                                disabled={isSubmitting}
                                            >
                                                <option value="">Seleccionar...</option>
                                                <option value="FONASA">Fonasa</option>
                                                <option value="ISAPRE_CONSALUD">Consalud</option>
                                                <option value="ISAPRE_CRUZBLANCA">Cruz Blanca</option>
                                                <option value="ISAPRE_COLMENA">Colmena</option>
                                                <option value="ISAPRE_BANMEDICA">Banmédica</option>
                                                <option value="ISAPRE_VIDATRES">Vida Tres</option>
                                                <option value="ISAPRE_NUEVAMASVIDA">Nueva Masvida</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Module Permissions */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-3">Permisos Adicionales (Módulos)</label>
                            <div className="grid grid-cols-2 gap-4">
                                {['OPERATIVO', 'LOGISTICA', 'ADMIN', 'GERENCIA'].map(category => (
                                    <div key={category} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">{category}</h4>
                                        <div className="space-y-2">
                                            {APP_MODULES.filter(m => m.category === category).map(module => (
                                                <label key={module.id} className="flex items-center gap-2 cursor-pointer group">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.allowed_modules?.includes(module.id) ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                                                        {formData.allowed_modules?.includes(module.id) && <CheckCircle size={12} className="text-white" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={formData.allowed_modules?.includes(module.id) || false}
                                                        onChange={(e) => {
                                                            const currentModules = formData.allowed_modules || [];
                                                            if (e.target.checked) {
                                                                setFormData({
                                                                    ...formData,
                                                                    allowed_modules: [...currentModules, module.id]
                                                                });
                                                            } else {
                                                                setFormData({
                                                                    ...formData,
                                                                    allowed_modules: currentModules.filter(m => m !== module.id)
                                                                });
                                                            }
                                                        }}
                                                        disabled={isSubmitting}
                                                    />
                                                    <span className={`text-sm ${formData.allowed_modules?.includes(module.id) ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                                                        {module.label}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="employee-form"
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <span className="animate-spin text-white mr-2">⏳</span>
                                Guardando...
                            </>
                        ) : (
                            <>
                                <Save size={20} />
                                Guardar Cambios
                            </>
                        )}
                    </button>
                </div>
            </div >
        </div >
    );
};

function CheckCircle({ size, className }: { size: number, className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}
