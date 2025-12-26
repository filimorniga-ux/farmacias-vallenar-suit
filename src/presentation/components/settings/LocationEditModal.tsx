'use client';

import React, { useState, useEffect } from 'react';
import { Location, EmployeeProfile } from '@/domain/types';
import { updateLocationDetails } from '@/actions/network';
import { deactivateLocationSecure } from '@/actions/locations-v2';
import { getUsersSecure } from '@/actions/users-v2';
import { X, Save, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface LocationEditModalProps {
    location: Location;
    onClose: () => void;
    onUpdate: () => void; // Trigger reload or state update
}

// Location Editing Modal
export default function LocationEditModal({ location, onClose, onUpdate }: LocationEditModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [managers, setManagers] = useState<EmployeeProfile[]>([]);

    // Form State (could use FormData but state is easier for pre-filling)
    const [form, setForm] = useState({
        name: location.name,
        address: location.address,
        phone: (location as any).phone || '', // Cast to any if type is not updated yet in frontend types
        email: (location as any).email || '',
        manager_id: (location as any).manager_id || '',
        is_active: location.is_active !== false // Default to true
    });

    useEffect(() => {
        // Load Potential Managers using V2
        getUsersSecure({ page: 1, pageSize: 100, role: undefined }).then(res => {
            if (res.success && res.data) {
                // Filter only Managers or Admins
                const admins = res.data.users.filter((u: any) => u.role === 'MANAGER' || u.role === 'ADMIN' || u.role === 'GERENTE_GENERAL');
                setManagers(admins as any);
            }
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await updateLocationDetails(location.id, form);
            if (res.success) {
                toast.success('Sucursal actualizada correctamente');
                onUpdate();
                onClose();
            } else {
                toast.error(res.error || 'Error actualizando sucursal');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        const reason = prompt('Ingrese la razón de desactivación (mínimo 10 caracteres):');
        if (!reason || reason.length < 10) {
            toast.error('Razón inválida (mínimo 10 caracteres)');
            return;
        }

        if (!confirm('PELIGRO: ¿Estás seguro de DESACTIVAR esta sucursal?')) return;

        setIsLoading(true);
        try {
            const res = await deactivateLocationSecure(location.id, reason);
            if (res.success) {
                toast.success('Sucursal desactivada correctamente');
                onUpdate();
                onClose();
            } else {
                toast.error(res.error || 'No se pudo desactivar');
            }
        } catch (e) {
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800">Editar {location.type === 'WAREHOUSE' ? 'Bodega' : 'Sucursal'}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">

                    <form id="edit-form" onSubmit={handleSubmit} className="space-y-4">

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Nombre</label>
                            <input
                                type="text"
                                required
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        {location.type === 'STORE' && (
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Dirección</label>
                                <input
                                    type="text"
                                    required
                                    value={form.address}
                                    onChange={e => setForm({ ...form, address: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Teléfono</label>
                                <input
                                    type="tel"
                                    value={form.phone}
                                    onChange={e => setForm({ ...form, phone: e.target.value })}
                                    placeholder="+56 9..."
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value })}
                                    placeholder="contacto@sucursal.cl"
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Gerente / Responsable</label>
                            <select
                                value={form.manager_id}
                                onChange={e => setForm({ ...form, manager_id: e.target.value })}
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                                <option value="">-- Seleccionar --</option>
                                {managers.map(m => (
                                    <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                                ))}
                            </select>
                            <p className="text-xs text-slate-500 mt-1">Solo usuarios con rol MANAGER o ADMIN.</p>
                        </div>

                        {/* Status Toggle */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                                <label className="block text-sm font-bold text-slate-700">Estado de Sucursal</label>
                                <p className="text-xs text-slate-500">Desactiva para ocultar sin eliminar datos.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setForm({ ...form, is_active: !form.is_active })}
                                className={`w-12 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${form.is_active ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                    </form>

                    {/* Danger Zone */}
                    <div className="pt-6 border-t border-slate-100 flex flex-col gap-2">
                        <h4 className="text-xs font-bold text-red-600 uppercase flex items-center gap-1">
                            <AlertTriangle size={12} /> Zona de Peligro
                        </h4>
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="w-full py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                            <Trash2 size={16} /> Eliminar Sucursal Permanentemente
                        </button>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onClick={onClose} disabled={isLoading} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors">
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="edit-form"
                        disabled={isLoading}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-900/20 disabled:opacity-50 flex items-center gap-2 transition-all transform active:scale-95"
                    >
                        {isLoading ? 'Guardando...' : <><Save size={18} /> Guardar Cambios</>}
                    </button>
                </div>
            </div >
        </div >
    );
}
