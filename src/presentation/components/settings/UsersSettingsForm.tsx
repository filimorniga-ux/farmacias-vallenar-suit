import React, { useState, useEffect } from 'react';
import { Save, Loader2, Info, X } from 'lucide-react';
import { createUser, updateUser } from '../../../actions/users';
import { toast } from 'sonner';
import { Role, JobTitle, EmployeeProfile } from '../../../domain/types';
import { formatRut } from '../../../lib/utils';

interface UsersSettingsFormProps {
    initialData?: EmployeeProfile | null;
    onCancel?: () => void;
    onSuccess?: () => void;
}

export const UsersSettingsForm: React.FC<UsersSettingsFormProps> = ({ initialData, onCancel, onSuccess }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        rut: '',
        role: 'CASHIER' as Role,
        job_title: 'CAJERO_VENDEDOR' as JobTitle,
        access_pin: ''
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name,
                rut: initialData.rut,
                role: initialData.role,
                job_title: initialData.job_title || 'CAJERO_VENDEDOR',
                access_pin: initialData.access_pin || ''
            });
        }
    }, [initialData]);

    const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatRut(e.target.value);
        setFormData({ ...formData, rut: formatted });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        let result;
        if (initialData?.id) {
            // Update
            result = await updateUser(initialData.id, {
                ...formData,
                status: initialData.status
            });
        } else {
            // Create
            result = await createUser({
                ...formData,
                status: 'ACTIVE',
            });
        }

        if (result.success) {
            toast.success(initialData ? 'Usuario actualizado exitosamente' : 'Usuario creado exitosamente');
            if (!initialData) {
                setFormData({
                    name: '',
                    rut: '',
                    role: 'CASHIER',
                    job_title: 'CAJERO_VENDEDOR',
                    access_pin: ''
                });
            }
            if (onSuccess) onSuccess();
        } else {
            toast.error(result.error || 'Error al guardar usuario');
        }
        setIsLoading(false);
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">
                    {initialData ? 'Editar Usuario' : 'Nuevo Usuario'}
                </h3>
                {onCancel && (
                    <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Nombre Completo</label>
                    <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium"
                        placeholder="Ej: Juan Pérez"
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">RUT</label>
                    <input
                        type="text"
                        required
                        value={formData.rut}
                        onChange={handleRutChange}
                        maxLength={12}
                        className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium"
                        placeholder="11.111.111-1"
                    />
                </div>

                {/* Selección de Cargo (Contrato) */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        Cargo (Contrato)
                        <div className="group relative">
                            <Info size={16} className="text-slate-400 cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                El cargo define la posición contractual del empleado en la empresa.
                            </div>
                        </div>
                    </label>
                    <select
                        value={formData.job_title}
                        onChange={e => setFormData({ ...formData, job_title: e.target.value as JobTitle })}
                        className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium bg-white"
                    >
                        <option value="CAJERO_VENDEDOR">Cajero Vendedor</option>
                        <option value="QUIMICO_FARMACEUTICO">Químico Farmacéutico</option>
                        <option value="AUXILIAR_FARMACIA">Auxiliar de Farmacia</option>
                        <option value="BODEGUERO">Bodeguero</option>
                        <option value="ADMINISTRATIVO">Administrativo</option>
                        <option value="GERENTE_GENERAL">Gerente General</option>
                        <option value="DIRECTOR_TECNICO">Director Técnico</option>
                        <option value="ASISTENTE_BODEGA">Asistente de Bodega</option>
                        <option value="ALUMNO_PRACTICA">Alumno en Práctica</option>
                    </select>
                </div>

                {/* Selección de Rol (Sistema) */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        Rol (Sistema)
                        <div className="group relative">
                            <Info size={16} className="text-slate-400 cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                El rol define los permisos y módulos a los que tiene acceso dentro del software.
                            </div>
                        </div>
                    </label>
                    <select
                        value={formData.role}
                        onChange={e => setFormData({ ...formData, role: e.target.value as Role })}
                        className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium bg-white"
                    >
                        <option value="CASHIER">Cajero (Ventas)</option>
                        <option value="QF">Químico Farmacéutico (Validación)</option>
                        <option value="MANAGER">Gerente (Acceso Total)</option>
                        <option value="WAREHOUSE">Bodega (Inventario)</option>
                        <option value="ADMIN">Administrador (Configuración)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">PIN de Acceso (4 dígitos)</label>
                    <input
                        type="password"
                        maxLength={4}
                        autoComplete="new-password"
                        value={formData.access_pin}
                        onChange={e => setFormData({ ...formData, access_pin: e.target.value })}
                        className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-cyan-600 focus:outline-none font-medium tracking-widest"
                        placeholder="••••"
                    />
                </div>
            </div>

            <div className="flex justify-end gap-4">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition"
                    >
                        Cancelar
                    </button>
                )}
                <button
                    type="submit"
                    disabled={isLoading}
                    className="px-8 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg flex items-center gap-2 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    {initialData ? 'Actualizar Usuario' : 'Guardar Usuario'}
                </button>
            </div>
        </form>
    );
};
