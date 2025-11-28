import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, UserPlus, Search, Shield, Briefcase, FileText, Activity, Save, X, Lock } from 'lucide-react';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import { ROLES, Role, Permission } from '../../domain/security/roles';
import { EmployeeProfile } from '../../domain/types';
import { APP_MODULES, ROLE_PRESETS } from '../../domain/config/roles_presets';

const HRPage = () => {
    const { user, employees } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    // --- Access Control ---
    if (!user || user.role !== 'MANAGER') {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Shield size={64} className="text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Acceso Denegado</h2>
                <p>No tienes permisos para acceder al módulo de Recursos Humanos.</p>
                <p className="text-sm mt-2">Rol requerido: MANAGER</p>
            </div>
        );
    }

    const filteredEmployees = employees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.rut.includes(searchTerm)
    );

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        // Here we would call an updateEmployee action from the store
        console.log('Saving employee:', selectedEmployee);
        setIsEditing(false);
        setSelectedEmployee(null);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 p-6 overflow-hidden">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="text-blue-600" />
                        Recursos Humanos
                    </h1>
                    <p className="text-slate-500">Gestión de personal, contratos y permisos</p>
                </div>
                <button
                    onClick={() => {
                        setSelectedEmployee({
                            id: `EMP-${Date.now()}`,
                            rut: '',
                            name: '',
                            role: 'CASHIER',
                            access_pin: '',
                            status: 'ACTIVE',
                            current_status: 'OUT',
                            job_title: 'CAJERO_VENDEDOR', // Default
                            allowed_modules: []
                        } as EmployeeProfile);
                        setIsEditing(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-200"
                >
                    <UserPlus size={20} />
                    Nuevo Empleado
                </button>
            </header>

            <div className="flex gap-6 flex-1 overflow-hidden">
                {/* Employee List */}
                <div className="w-1/3 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o RUT..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {filteredEmployees.map(emp => (
                            <div
                                key={emp.id}
                                onClick={() => { setSelectedEmployee(emp); setIsEditing(true); }}
                                className={`p-3 rounded-xl cursor-pointer transition-all ${selectedEmployee?.id === emp.id ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300' : 'hover:bg-slate-50 border border-transparent'}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-slate-800">{emp.name}</h3>
                                        <p className="text-xs text-slate-500 font-bold">{emp.job_title?.replace(/_/g, ' ')}</p>
                                        <p className="text-[10px] text-slate-400">Rol: {ROLES[emp.role]}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${emp.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {emp.status}
                                    </span>
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                                    <Shield size={12} />
                                    <span>{emp.role}</span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                    <span>{emp.rut}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Employee Details Form */}
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    {selectedEmployee ? (
                        <form onSubmit={handleSave} className="flex flex-col h-full">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl">
                                        {selectedEmployee.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{selectedEmployee.name || 'Nuevo Empleado'}</h2>
                                        <p className="text-sm text-slate-500">{selectedEmployee.id}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedEmployee(null); setIsEditing(false); }}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-md shadow-blue-200"
                                    >
                                        <Save size={18} />
                                        Guardar Cambios
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Personal Information */}
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                                            <UserPlus size={18} className="text-blue-500" />
                                            Información Personal
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Completo</label>
                                                <input type="text" autoComplete="name" className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.name} onChange={e => setSelectedEmployee({ ...selectedEmployee, name: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">RUT</label>
                                                <input type="text" autoComplete="off" className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.rut} onChange={e => setSelectedEmployee({ ...selectedEmployee, rut: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono Contacto</label>
                                                <input type="text" autoComplete="tel" className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.contact_phone || ''} onChange={e => setSelectedEmployee({ ...selectedEmployee, contact_phone: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Estado</label>
                                                <select className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.status} onChange={e => setSelectedEmployee({ ...selectedEmployee, status: e.target.value as any })}>
                                                    <option value="ACTIVE">Activo</option>
                                                    <option value="ON_LEAVE">Licencia/Vacaciones</option>
                                                    <option value="TERMINATED">Desvinculado</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                            <h4 className="text-xs font-bold text-orange-800 mb-2 flex items-center gap-1">
                                                <Activity size={14} /> Contacto de Emergencia
                                            </h4>
                                            <div className="grid grid-cols-3 gap-2">
                                                <input type="text" placeholder="Nombre" className="p-2 border border-orange-200 rounded-lg text-xs" value={selectedEmployee.emergency_contact?.name || ''} onChange={e => setSelectedEmployee({ ...selectedEmployee, emergency_contact: { ...selectedEmployee.emergency_contact!, name: e.target.value } })} />
                                                <input type="text" placeholder="Relación" className="p-2 border border-orange-200 rounded-lg text-xs" value={selectedEmployee.emergency_contact?.relation || ''} onChange={e => setSelectedEmployee({ ...selectedEmployee, emergency_contact: { ...selectedEmployee.emergency_contact!, relation: e.target.value } })} />
                                                <input type="text" placeholder="Teléfono" autoComplete="tel" className="p-2 border border-orange-200 rounded-lg text-xs" value={selectedEmployee.emergency_contact?.phone || ''} onChange={e => setSelectedEmployee({ ...selectedEmployee, emergency_contact: { ...selectedEmployee.emergency_contact!, phone: e.target.value } })} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Contractual Data */}
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                                            <Briefcase size={18} className="text-purple-500" />
                                            Datos Contractuales
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Cargo Contractual</label>
                                                <select
                                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700"
                                                    value={selectedEmployee.job_title || ''}
                                                    onChange={e => setSelectedEmployee({ ...selectedEmployee, job_title: e.target.value as any })}
                                                >
                                                    <option value="">Seleccionar Cargo...</option>
                                                    <option value="QUIMICO_FARMACEUTICO">Químico Farmacéutico</option>
                                                    <option value="AUXILIAR_FARMACIA">Auxiliar de Farmacia</option>
                                                    <option value="CAJERO_VENDEDOR">Cajero Vendedor</option>
                                                    <option value="BODEGUERO">Bodeguero</option>
                                                    <option value="ASISTENTE_BODEGA">Asistente de Bodega</option>
                                                    <option value="ADMINISTRATIVO">Administrativo</option>
                                                    <option value="GERENTE_GENERAL">Gerente General</option>
                                                    <option value="DIRECTOR_TECNICO">Director Técnico</option>
                                                    <option value="ALUMNO_PRACTICA">Alumno en Práctica</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Sueldo Base (CLP)</label>
                                                <input type="number" className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.base_salary || 0} onChange={e => setSelectedEmployee({ ...selectedEmployee, base_salary: Number(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Horas Semanales</label>
                                                <input type="number" className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.weekly_hours || 45} onChange={e => setSelectedEmployee({ ...selectedEmployee, weekly_hours: Number(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">AFP</label>
                                                <select className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.pension_fund || ''} onChange={e => setSelectedEmployee({ ...selectedEmployee, pension_fund: e.target.value })}>
                                                    <option value="">Seleccionar...</option>
                                                    <option value="HABITAT">Habitat</option>
                                                    <option value="MODELO">Modelo</option>
                                                    <option value="CAPITAL">Capital</option>
                                                    <option value="PROVIDA">Provida</option>
                                                    <option value="CUPRUM">Cuprum</option>
                                                    <option value="PLANVITAL">Planvital</option>
                                                    <option value="UNO">Uno</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Sistema Salud</label>
                                                <select className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.health_system || ''} onChange={e => setSelectedEmployee({ ...selectedEmployee, health_system: e.target.value })}>
                                                    <option value="">Seleccionar...</option>
                                                    <option value="FONASA">Fonasa</option>
                                                    <option value="ISAPRE">Isapre</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">Mutual</label>
                                                <select className="w-full p-2 border border-slate-200 rounded-lg text-sm" value={selectedEmployee.mutual_safety || ''} onChange={e => setSelectedEmployee({ ...selectedEmployee, mutual_safety: e.target.value })}>
                                                    <option value="">Seleccionar...</option>
                                                    <option value="ACHS">ACHS</option>
                                                    <option value="MUTUAL">Mutual de Seguridad</option>
                                                    <option value="IST">IST</option>
                                                    <option value="ISL">ISL</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Security & Roles */}
                                    <div className="col-span-2 space-y-4 mt-4">
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                                            <Lock size={18} className="text-red-500" />
                                            Seguridad y Accesos
                                        </h3>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Rol del Sistema</label>
                                                    <select
                                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700"
                                                        value={selectedEmployee.role}
                                                        onChange={e => {
                                                            const newRole = e.target.value as Role;
                                                            const newPermissions = ROLE_PRESETS[newRole] || [];
                                                            setSelectedEmployee({
                                                                ...selectedEmployee,
                                                                role: newRole,
                                                                allowed_modules: newPermissions
                                                            });
                                                        }}
                                                    >
                                                        {Object.entries(ROLES).map(([key, label]) => (
                                                            <option key={key} value={key}>{label}</option>
                                                        ))}
                                                    </select>
                                                    <p className="text-[10px] text-slate-400 mt-1">Define los permisos base del usuario.</p>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">Sucursal Base</label>
                                                    <select
                                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                                                        value={selectedEmployee.base_location_id || ''}
                                                        onChange={e => setSelectedEmployee({ ...selectedEmployee, base_location_id: e.target.value })}
                                                    >
                                                        <option value="">Sin Asignar</option>
                                                        {useLocationStore.getState().locations.map(loc => (
                                                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">PIN de Acceso (4 dígitos)</label>
                                                    <input type="password" maxLength={4} autoComplete="new-password" className="w-full p-2 border border-slate-200 rounded-lg text-sm font-mono tracking-widest" value={selectedEmployee.access_pin} onChange={e => setSelectedEmployee({ ...selectedEmployee, access_pin: e.target.value })} />
                                                </div>
                                            </div>

                                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                                <h4 className="text-xs font-bold text-slate-700 mb-3">Permisos Adicionales (Módulos)</h4>
                                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                                    {['OPERATIVO', 'LOGISTICA', 'ADMIN', 'GERENCIA'].map(category => (
                                                        <div key={category}>
                                                            <h5 className="text-[10px] font-bold text-slate-400 uppercase mb-2 border-b border-slate-100 pb-1">{category}</h5>
                                                            <div className="space-y-2">
                                                                {APP_MODULES.filter(m => m.category === category).map(module => (
                                                                    <label key={module.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="rounded text-blue-600 focus:ring-blue-500"
                                                                            checked={selectedEmployee.allowed_modules?.includes(module.id)}
                                                                            onChange={e => {
                                                                                const current = selectedEmployee.allowed_modules || [];
                                                                                if (e.target.checked) {
                                                                                    setSelectedEmployee({ ...selectedEmployee, allowed_modules: [...current, module.id] });
                                                                                } else {
                                                                                    setSelectedEmployee({ ...selectedEmployee, allowed_modules: current.filter(m => m !== module.id) });
                                                                                }
                                                                            }}
                                                                        />
                                                                        <span className="text-sm text-slate-600">{module.label}</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Users size={64} className="mb-4 text-slate-200" />
                            <p className="text-lg font-medium">Selecciona un empleado para ver sus detalles</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HRPage;
