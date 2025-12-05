import React, { useState } from 'react';
import { Monitor, Plus, MapPin, Users, Edit, Trash, X, Save, Check } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { Terminal } from '../../../domain/types';
import { motion, AnimatePresence } from 'framer-motion';

const LOCATIONS = [
    { id: 'LOC-001', name: 'Sucursal Centro' },
    { id: 'LOC-002', name: 'Sucursal Norte' },
    { id: 'LOC-003', name: 'Kiosco' }
];

export const TerminalSettings: React.FC = () => {
    const { terminals, addTerminal, updateTerminal, employees } = usePharmaStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTerminal, setEditingTerminal] = useState<Terminal | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [locationId, setLocationId] = useState('LOC-001');
    const [allowedUsers, setAllowedUsers] = useState<string[]>([]); // Array of IDs

    const openCreateModal = () => {
        setEditingTerminal(null);
        setName('');
        setLocationId('LOC-001');
        setAllowedUsers([]);
        setIsModalOpen(true);
    };

    const openEditModal = (t: Terminal) => {
        setEditingTerminal(t);
        setName(t.name);
        setLocationId(t.location_id);
        setAllowedUsers(t.allowed_users || []);
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingTerminal) {
            updateTerminal(editingTerminal.id, {
                name,
                location_id: locationId,
                allowed_users: allowedUsers
            });
        } else {
            addTerminal({
                name,
                location_id: locationId,
                status: 'CLOSED', // Default
                allowed_users: allowedUsers
            });
        }
        setIsModalOpen(false);
    };

    const toggleUser = (userId: string) => {
        setAllowedUsers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    return (
        <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Cajas y Terminales</h2>
                    <p className="text-slate-500">Administra los puntos de venta y sus permisos.</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-bold shadow-lg"
                >
                    <Plus size={20} />
                    Nueva Caja
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {terminals.map(terminal => {
                    const locationName = LOCATIONS.find(l => l.id === terminal.location_id)?.name || terminal.location_id;
                    const authorizedCount = terminal.allowed_users?.length || 0;

                    return (
                        <div key={terminal.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 relative group hover:shadow-md transition">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-white rounded-xl shadow-sm">
                                    <Monitor className="text-blue-600" size={24} />
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEditModal(terminal)}
                                        className="p-2 bg-white text-slate-600 hover:text-blue-600 rounded-lg shadow-sm border border-slate-100"
                                    >
                                        <Edit size={16} />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-lg font-bold text-slate-800 mb-1">{terminal.name}</h3>
                            <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                                <MapPin size={14} />
                                <span>{locationName}</span>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                                <div className="flex items-center gap-2 text-xs font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">
                                    <Users size={14} />
                                    {authorizedCount === 0 ? 'Todos acceden' : `${authorizedCount} autorizados`}
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-lg font-bold ${terminal.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                                    {terminal.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
                        >
                            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <Monitor size={20} />
                                    <span className="font-bold">{editingTerminal ? 'Editar Caja' : 'Nueva Caja'}</span>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleSave} className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Nombre de Caja</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="Ej: Caja 1"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Sucursal</label>
                                        <select
                                            value={locationId}
                                            onChange={e => setLocationId(e.target.value)}
                                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        >
                                            {LOCATIONS.map(loc => (
                                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Usuarios Autorizados
                                        <span className="ml-2 text-xs font-normal text-slate-500">(Si no seleccionas ninguno, todos pueden usarla)</span>
                                    </label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                                        {employees.map(emp => {
                                            const isSelected = allowedUsers.includes(emp.id);
                                            return (
                                                <div
                                                    key={emp.id}
                                                    onClick={() => toggleUser(emp.id)}
                                                    className={`cursor-pointer p-3 rounded-lg border flex items-center justify-between transition-all ${isSelected
                                                            ? 'bg-blue-50 border-blue-500 shadow-sm'
                                                            : 'bg-white border-slate-200 hover:border-blue-300'
                                                        }`}
                                                >
                                                    <div className="truncate">
                                                        <div className="text-sm font-bold text-slate-800 truncate">{emp.name}</div>
                                                        <div className="text-xs text-slate-500">{emp.role}</div>
                                                    </div>
                                                    {isSelected && <Check size={16} className="text-blue-600" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4 border-t border-slate-100">
                                    <button
                                        type="submit"
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2"
                                    >
                                        <Save size={18} />
                                        Guardar Caja
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
