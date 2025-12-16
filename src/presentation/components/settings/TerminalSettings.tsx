import React, { useState, useEffect } from 'react';
import { Monitor, Plus, MapPin, Users, Edit, Trash, X, Save, Check, RefreshCw } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { Terminal } from '../../../domain/types';
import { motion, AnimatePresence } from 'framer-motion';

export const TerminalSettings: React.FC = () => {
    const {
        terminals,
        locations,
        employees,
        addTerminal,
        updateTerminal,
        fetchLocations,
        fetchTerminals,
        isLoading
    } = usePharmaStore();

    const activeLocations = locations.filter(l => l.is_active !== false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTerminal, setEditingTerminal] = useState<Terminal | null>(null);

    // Filter/View State
    // Initialize from localStorage to persist selection across reloads
    const [selectedViewLocationId, setSelectedViewLocationId] = useState<string>(() => {
        return localStorage.getItem('settings_view_location_id') || '';
    });

    // Form State
    const [name, setName] = useState('');
    const [locationId, setLocationId] = useState('');
    const [allowedUsers, setAllowedUsers] = useState<string[]>([]); // Array of IDs

    // Initial Load
    useEffect(() => {
        const load = async () => {
            await fetchLocations();
        };
        load();
    }, []);

    // Set default view location and fetch terminals when locations load
    useEffect(() => {
        if (locations.length > 0) {
            if (!selectedViewLocationId) {
                // If nothing in localstorage, default to first active
                const defaultLoc = activeLocations[0]?.id;
                // Only set if we actually found one
                if (defaultLoc) {
                    setSelectedViewLocationId(defaultLoc);
                }
            } else {
                // FORCE: If stored location is already valid, force FETCH now.
                // The previous logic relied on the 'persistence' effect, but that only triggers if 'selectedViewLocationId' *changes* or on mount.
                // If it's the same as default state, it might not fire. Or if hydration is tricky.
                console.log('🔄 Initial Load: Fetching terminals for', selectedViewLocationId);
                fetchTerminals(selectedViewLocationId);
            }
        }
    }, [locations]); // Run when locations load

    // Persist to LocalStorage and Fetch whenever it changes
    useEffect(() => {
        if (selectedViewLocationId) {
            localStorage.setItem('settings_view_location_id', selectedViewLocationId);
            console.log('🔄 View Location Changed: Fetching terminals for', selectedViewLocationId);
            fetchTerminals(selectedViewLocationId);
        }
    }, [selectedViewLocationId]);

    const openCreateModal = () => {
        setEditingTerminal(null);
        setName('');
        // Default to the currently viewing location, or fallback to the first active one
        setLocationId(selectedViewLocationId || activeLocations[0]?.id || '');
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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingTerminal) {
            await updateTerminal(editingTerminal.id, {
                name,
                location_id: locationId,
                allowed_users: allowedUsers
            });
        } else {
            await addTerminal({
                name,
                location_id: locationId,
                status: 'CLOSED', // Default
                allowed_users: allowedUsers,
                printer_config: undefined // Optional
            });
        }
        setIsModalOpen(false);

        // Auto-switch view to the location where we just created the terminal
        if (locationId !== selectedViewLocationId) {
            setSelectedViewLocationId(locationId);
        }
    };

    const toggleUser = (userId: string) => {
        setAllowedUsers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    // 🕵️‍♂️ DEBUG: Frontend Rendering Check
    console.log('--- DEBUG RENDER ---');
    console.log('Selected Location:', selectedViewLocationId);
    console.log('Terminals in State:', terminals);
    console.log('Is Loading:', isLoading);

    return (
        <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 overflow-hidden max-w-7xl p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div className="flex items-center gap-3">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Cajas y Terminales</h2>
                        <p className="text-slate-500">Administra los puntos de venta y sus permisos.</p>
                    </div>
                    <button
                        onClick={() => {
                            if (selectedViewLocationId) {
                                console.log('🔄 Manual Refresh requested for:', selectedViewLocationId);
                                fetchTerminals(selectedViewLocationId);
                            }
                        }}
                        className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-blue-600 transition-colors"
                        title="Refrescar lista"
                    >
                        <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    {/* Location Filter */}
                    <div className="relative">
                        <select
                            value={selectedViewLocationId}
                            onChange={(e) => setSelectedViewLocationId(e.target.value)}
                            className="appearance-none pl-4 pr-10 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 min-w-[220px] font-medium text-slate-700 cursor-pointer hover:border-blue-400 transition-colors"
                        >
                            {activeLocations.length === 0 && <option value="">Cargando sucursales...</option>}
                            {activeLocations.map(loc => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                        </select>
                        <MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>

                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-bold shadow-lg whitespace-nowrap"
                    >
                        <Plus size={20} />
                        Nueva Caja
                    </button>
                </div>
            </div>

            {/* Empty State */}
            {!isLoading && terminals.length === 0 && (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                    <Monitor size={48} className="mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-bold text-slate-600">No hay cajas en esta sucursal</h3>
                    <p className="text-slate-500 mb-4">Selecciona otra sucursal o crea una nueva caja.</p>
                </div>
            )}

            {isLoading && terminals.length === 0 && (
                <div className="text-center py-12">
                    <RefreshCw className="animate-spin mx-auto text-blue-500 mb-2" size={32} />
                    <p className="text-slate-500">Cargando cajas...</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {terminals.map(terminal => {
                    const locationName = locations.find(l => l.id === terminal.location_id)?.name || 'Sucursal Desconocida';
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
                                    <button
                                        onClick={() => {
                                            if (window.confirm('¿Estás seguro de eliminar esta caja? Esta acción no se puede deshacer.')) {
                                                usePharmaStore.getState().deleteTerminal(terminal.id);
                                            }
                                        }}
                                        className="p-2 bg-white text-slate-600 hover:text-red-600 rounded-lg shadow-sm border border-slate-100"
                                        title="Eliminar Caja"
                                    >
                                        <Trash size={16} />
                                    </button>

                                    {terminal.status === 'OPEN' && (
                                        <button
                                            onClick={() => {
                                                if (window.confirm('¿FORZAR CIERRE DE CAJA? Esto cerrará la caja sin cuadratura y liberará al cajero. Úsalo solo si la caja quedó "pegada".')) {
                                                    usePharmaStore.getState().forceCloseTerminal(terminal.id);
                                                }
                                            }}
                                            className="p-2 bg-white text-slate-600 hover:text-orange-600 rounded-lg shadow-sm border border-slate-100"
                                            title="Forzar Cierre Administrativo"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                        </button>
                                    )}
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
                                            {activeLocations.map(loc => (
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
