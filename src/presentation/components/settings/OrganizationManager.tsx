'use client';

import React, { useState, useEffect } from 'react';
import { Location, Terminal, EmployeeProfile } from '@/domain/types';
import { MapPin, Warehouse, Monitor, Users, Plus, X, ChevronRight, Printer, UserPlus, CheckCircle } from 'lucide-react';
import { createLocation, createWarehouse, createTerminal, assignEmployeeToLocation } from '@/actions/network';
import { getTerminalsByLocation } from '@/actions/terminals';
import { getUsers } from '@/actions/users';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import LocationEditModal from './LocationEditModal';

interface OrganizationManagerProps {
    initialLocations: Location[];
}

export default function OrganizationManager({ initialLocations }: OrganizationManagerProps) {
    // --- State ---
    const [locations, setLocations] = useState<Location[]>(initialLocations);
    const [activeView, setActiveView] = useState<'STORES' | 'WAREHOUSES'>('STORES');
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

    const [editLocation, setEditLocation] = useState<Location | null>(null); // NEW: Edit State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Derived state
    const stores = locations.filter(l => l.type !== 'WAREHOUSE');
    const warehouses = locations.filter(l => l.type === 'WAREHOUSE');

    const router = useRouter();

    // Effect to sync props to state if needed (optional, but good if parent updates)
    useEffect(() => {
        setLocations(initialLocations);
    }, [initialLocations]);

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const name = formData.get('name') as string;
        const address = formData.get('address') as string;

        try {
            if (activeView === 'STORES') {
                const res = await createLocation({ name, address });
                if (res.success) {
                    toast.success('Sucursal creada');
                    setIsCreateModalOpen(false);
                    router.refresh();
                } else {
                    toast.error('Error al crear sucursal');
                }
            } else {
                const hqId = locations.find(l => l.type === 'HQ')?.id;
                const res = await createWarehouse(name, hqId);

                if (res.success) {
                    toast.success('Bodega creada');
                    setIsCreateModalOpen(false);
                    router.refresh();
                } else {
                    toast.error('Error al crear bodega');
                }
            }
        } catch (error) {
            toast.error('Error inesperado');
        }
    };

    // ... (rest of initializations)

    return (
        <div className="relative min-h-[600px] flex flex-col gap-6">

            {/* Top Navigation / Filter */}
            <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex gap-2">
                    <TabButton active={activeView === 'STORES'} onClick={() => setActiveView('STORES')} icon={<MapPin size={18} />} label="Sucursales" />
                    <TabButton active={activeView === 'WAREHOUSES'} onClick={() => setActiveView('WAREHOUSES')} icon={<Warehouse size={18} />} label="Bodegas Globales" />
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-sm font-medium"
                >
                    <Plus size={18} /> {activeView === 'STORES' ? 'Nueva Sucursal' : 'Nueva Bodega'}
                </button>
            </div>

            {/* Grid View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                {activeView === 'STORES' && stores.map((store: Location) => (
                    <LocationCard
                        key={store.id}
                        location={store}
                        warehouses={warehouses}
                        onOpenDetail={() => setSelectedLocation(store)}
                        onOpenEdit={() => setEditLocation(store)}
                    />
                ))}


                {activeView === 'WAREHOUSES' && warehouses.map((wh: Location) => (
                    <div
                        key={wh.id}
                        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all group"
                    >
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                                <Warehouse size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">{wh.name}</h3>
                                <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Bodega</span>
                            </div>
                        </div>

                        <div className="text-sm text-slate-500 border-t pt-4 mt-2">
                            <p>ID: <span className="font-mono text-xs">{wh.id.slice(0, 8)}...</span></p>
                            {/* Future: Show stock value or item count */}
                        </div>
                    </div>
                ))}
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <form onSubmit={handleCreate} className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">{activeView === 'STORES' ? 'Nueva Sucursal' : 'Nueva Bodega'}</h2>
                            <button type="button" onClick={() => setIsCreateModalOpen(false)}><X size={20} className="text-slate-400 hover:text-red-500" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-slate-700">Nombre</label>
                                <input name="name" required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none transition-all" placeholder={activeView === 'STORES' ? "Ej: Sucursal Centro" : "Ej: Bodega Central"} />
                            </div>
                            {activeView === 'STORES' && (
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-slate-700">Dirección</label>
                                    <input name="address" required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none transition-all" placeholder="Ej: Av. Matta 123" />
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-8">
                            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg">Cancelar</button>
                            <button type="submit" className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 shadow-lg shadow-slate-900/20">Crear</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Detail Drawer (Stores Only for now) */}
            {selectedLocation && (
                <LocationDetailDrawer
                    location={selectedLocation}
                    allLocations={locations}
                    onClose={() => setSelectedLocation(null)}
                />
            )}

            {/* Edit Modal */}
            {editLocation && (
                <LocationEditModal
                    location={editLocation}
                    onClose={() => setEditLocation(null)}
                    onUpdate={() => window.location.reload()}
                />
            )}
        </div>
    );
}

// --- Sub-Component: Detail Drawer ---
// Must import 'updateLocationConfig'
import { updateLocationConfig } from '@/actions/network';
import { AlertTriangle } from 'lucide-react';

function LocationDetailDrawer({ location, allLocations, onClose }: { location: Location, allLocations: Location[], onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<'CONFIG' | 'TERMINALS' | 'STAFF'>('CONFIG'); // Changed Warehouses to Config/General
    const [terminals, setTerminals] = useState<Terminal[]>([]);
    const [allUsers, setAllUsers] = useState<EmployeeProfile[]>([]);
    const [loading, setLoading] = useState(false);

    // Filter available warehouses for assignment
    const availableWarehouses = allLocations.filter(l => l.type === 'WAREHOUSE');
    const assignedWarehouse = availableWarehouses.find(w => w.id === location.default_warehouse_id);

    // Assign Modal
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const assignedStaff = allUsers.filter(u => u.assigned_location_id === location.id);

    // Fetch Logic
    React.useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                if (activeTab === 'TERMINALS') {
                    const res = await getTerminalsByLocation(location.id);
                    if (res.success && res.data) setTerminals(res.data);
                }
                if (activeTab === 'STAFF') {
                    const res = await getUsers();
                    if (res.success && res.data) setAllUsers(res.data);
                }
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [location.id, activeTab]);

    const handleUpdateConfig = async (warehouseId: string) => {
        toast.promise(updateLocationConfig(location.id, warehouseId), {
            loading: 'Actualizando configuración...',
            success: () => {
                // In a real app we might update local state, but reload ensures consistency here
                window.location.reload();
                return 'Bodega asignada correctamente';
            },
            error: 'Error al actualizar'
        });
    };

    return (
        <div className="fixed top-0 right-0 h-full w-full md:w-[600px] bg-white shadow-2xl z-50 border-l border-slate-100 flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">{location.name}</h2>
                    <p className="text-slate-500 text-sm">{location.address}</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6">
                <TabButton active={activeTab === 'CONFIG'} onClick={() => setActiveTab('CONFIG')} icon={<MapPin size={16} />} label="General" />
                <TabButton active={activeTab === 'TERMINALS'} onClick={() => setActiveTab('TERMINALS')} icon={<Monitor size={16} />} label="Terminales" />
                <TabButton active={activeTab === 'STAFF'} onClick={() => setActiveTab('STAFF')} icon={<Users size={16} />} label="Personal" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                {activeTab === 'CONFIG' && (
                    <div className="space-y-6">
                        {/* Warehouse Assignment Section */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <Warehouse size={20} className="text-amber-500" />
                                Abastecimiento
                            </h3>
                            <p className="text-sm text-slate-500 mb-4">
                                Seleccione la bodega desde donde esta sucursal descontará inventario para ventas.
                            </p>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase">Bodega Principal</label>
                                <select
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 transition-all font-medium text-slate-700"
                                    value={location.default_warehouse_id || ''}
                                    onChange={(e) => handleUpdateConfig(e.target.value)}
                                >
                                    <option value="" disabled>-- Seleccionar Bodega --</option>
                                    {availableWarehouses.map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>

                            {!assignedWarehouse && (
                                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2">
                                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                                    <p>Esta sucursal no tiene bodega asignada. Las ventas no podrán descontar stock correctamente.</p>
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-2">Detalles Técnicos</h3>
                            <div className="space-y-2 text-sm">
                                <p className="flex justify-between"><span className="text-slate-400">ID:</span> <span className="font-mono text-slate-600 select-all">{location.id}</span></p>
                                <p className="flex justify-between"><span className="text-slate-400">Tipo:</span> <span>{location.type}</span></p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'TERMINALS' && (
                    <div className="space-y-4">
                        <CreateButton label="Nuevo Terminal" onClick={() => {
                            const name = prompt("Nombre de la Caja (Ej: Caja 2):");
                            if (name) {
                                toast.promise(createTerminal({ name, location_id: location.id }), {
                                    loading: 'Creando...',
                                    success: () => { window.location.reload(); return 'Terminal creado'; },
                                    error: 'Error'
                                });
                            }
                        }} />
                        {loading && <p className="text-center text-slate-400 py-4">Cargando...</p>}
                        {!loading && terminals.length === 0 && <EmptyState text="No hay terminales activos." />}
                        {terminals.map(t => (
                            <div key={t.id} className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col gap-2 shadow-sm">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Monitor size={18} /></div>
                                        <span className="font-medium text-slate-700">{t.name}</span>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded ${t.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {t.status === 'OPEN' ? 'ABIERTO' : 'CERRADO'}
                                    </span>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button className="text-xs flex items-center gap-1 text-slate-400 hover:text-cyan-600"><Printer size={12} /> Configurar Impresoras</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'STAFF' && (
                    <div className="space-y-4">
                        <CreateButton label="Asignar Empleado" icon={<UserPlus size={16} />} onClick={() => setIsAssignModalOpen(true)} />
                        {loading ? <p className="text-center text-slate-400 py-4">Cargando...</p> : (
                            assignedStaff.length === 0 ? <EmptyState text="No hay personal asignado a esta sede." /> :
                                assignedStaff.map(u => (
                                    <div key={u.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                                {u.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-800">{u.name}</p>
                                                <p className="text-xs text-slate-400">{u.job_title} • {u.rut}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                )}
            </div>

            {/* Assign Employee Modal */}
            {isAssignModalOpen && (
                <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold">Asignar Empleado</h3>
                        <button onClick={() => setIsAssignModalOpen(false)}><X size={24} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {allUsers.map(user => {
                            const isAssignedHere = user.assigned_location_id === location.id;
                            return (
                                <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                                    <div>
                                        <p className="font-bold text-slate-700">{user.name}</p>
                                        <p className="text-xs text-slate-400">{user.job_title} {user.assigned_location_id ? (isAssignedHere ? '(Ya asignado)' : '(En otra sede)') : '(Sin asignar)'}</p>
                                    </div>
                                    {!isAssignedHere && (
                                        <button
                                            onClick={() => {
                                                toast.promise(assignEmployeeToLocation(user.id, location.id), {
                                                    loading: 'Asignando...',
                                                    success: () => {
                                                        setAllUsers(prev => prev.map(p => p.id === user.id ? { ...p, assigned_location_id: location.id } : p));
                                                        setIsAssignModalOpen(false);
                                                        return 'Asignado correctamente';
                                                    },
                                                    error: 'Error al asignar'
                                                });
                                            }}
                                            className="px-3 py-1 bg-slate-900 text-white rounded text-sm hover:bg-slate-700"
                                        >
                                            Asignar
                                        </button>
                                    )}
                                    {isAssignedHere && <CheckCircle size={20} className="text-green-500" />}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Sub-Component: Location Card (With Logic) ---
import { getLocationHealth } from '@/actions/network-stats';
import { Settings, AlertCircle, ShoppingBag, UserCheck } from 'lucide-react';

function LocationCard({
    location,
    warehouses,
    onOpenDetail,
    onOpenEdit
}: {
    location: Location,
    warehouses: Location[],
    onOpenDetail: () => void,
    onOpenEdit: () => void
}) {
    const assignedWarehouse = warehouses.find(w => w.id === location.default_warehouse_id);
    const legacyLinked = warehouses.filter(w => w.parent_id === location.id);

    // Stats State
    const [stats, setStats] = useState({ stockAlerts: 0, cashAlerts: 0, staffPresent: 0 });
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        getLocationHealth(location.id).then(res => {
            setStats(res);
            setLoadingStats(false);
        });
    }, [location.id]);

    return (
        <div
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-cyan-200 transition-all group relative overflow-hidden flex flex-col h-full"
        >
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-slate-50 to-transparent -mr-8 -mt-8 rounded-full pointer-events-none" />

            {/* Header */}
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div onClick={onOpenDetail} className="cursor-pointer p-3 bg-cyan-50 text-cyan-600 rounded-xl group-hover:bg-cyan-100 transition-colors">
                    <MapPin size={24} />
                </div>
                <div className="flex gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-bold h-fit ${location.type === 'HQ' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                        {location.type === 'HQ' ? 'Matriz' : 'Sucursal'}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenEdit(); }}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="Editar Configuración"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* Title & Address */}
            <div onClick={onOpenDetail} className="cursor-pointer mb-4 flex-1">
                <h3 className="text-xl font-bold text-slate-800 mb-1 leading-tight">{location.name}</h3>
                <p className="text-sm text-slate-500 flex items-center gap-1"><MapPin size={12} /> {location.address}</p>
            </div>

            {/* Live Stats */}
            <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-slate-100 mb-4">
                <div className="text-center" title="Alertas de Stock">
                    <p className={`text-xs font-bold ${stats.stockAlerts > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {loadingStats ? '-' : stats.stockAlerts}
                    </p>
                    <ShoppingBag size={14} className="mx-auto text-slate-300 mt-1" />
                </div>
                <div className="text-center" title="Cajas Abiertas > 12h">
                    <p className={`text-xs font-bold ${stats.cashAlerts > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                        {loadingStats ? '-' : stats.cashAlerts}
                    </p>
                    <Monitor size={14} className="mx-auto text-slate-300 mt-1" />
                </div>
                <div className="text-center" title="Personal Presente">
                    <p className="text-xs font-bold text-emerald-600">
                        {loadingStats ? '-' : stats.staffPresent}
                    </p>
                    <UserCheck size={14} className="mx-auto text-slate-300 mt-1" />
                </div>
            </div>

            {/* Footer / Warehouse Info */}
            <div className="flex flex-col gap-2 text-sm pt-2" onClick={onOpenDetail}>
                <div className="flex items-center justify-between cursor-pointer">
                    <span className="text-slate-400 text-xs">Abastecimiento:</span>
                    {assignedWarehouse ? (
                        <span className="text-emerald-600 font-bold flex items-center gap-1 text-xs">
                            <Warehouse size={12} /> {assignedWarehouse.name}
                        </span>
                    ) : (
                        <span className="text-red-400 font-bold text-xs flex items-center gap-1">
                            <AlertTriangle size={12} /> Sin Asignar
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ... existing code ...



// ... existing imports/helpers ...
function TabButton({ active, onClick, icon, label }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 py-2 px-4 rounded-lg transition-colors duration-200 ${active ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
        >
            {icon} <span className="text-sm font-bold">{label}</span>
        </button>
    );
}

function CreateButton({ label, onClick, icon }: any) {
    return (
        <button onClick={onClick} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-cyan-300 hover:text-cyan-600 hover:bg-cyan-50 transition-all flex items-center justify-center gap-2 text-sm font-bold">
            {icon || <Plus size={16} />} {label}
        </button>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="text-center py-8 text-slate-400 border border-slate-100 rounded-xl bg-slate-50/50">
            <p className="text-sm">{text}</p>
        </div>
    );
}
