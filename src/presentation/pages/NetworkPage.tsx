import React, { useState } from 'react';
import { useLocationStore } from '../store/useLocationStore';
import { usePharmaStore } from '../store/useStore';
// V2: Secure functions
import { createLocationSecure } from '@/actions/locations-v2';
import { updateUserSecure } from '@/actions/users-v2';
import { MapPin, Warehouse, Store, Plus, Tablet, QrCode, Settings, CheckCircle, Users, Shield, ArrowRightLeft, Monitor } from 'lucide-react';
import { Location, EmployeeProfile } from '../../domain/types';
import LocationEditModal from '../components/settings/LocationEditModal';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const NetworkPage = () => {
    const { locations, kiosks, currentLocation, addLocation, switchLocation, generatePairingCode } = useLocationStore();
    const { employees, user } = usePharmaStore(); // Need employees for Team Mgmt
    const [activeTab, setActiveTab] = useState<'BRANCHES' | 'TEAMS' | 'DEVICES'>('BRANCHES');

    // Wizard State
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [newLocation, setNewLocation] = useState<Partial<Location>>({ type: 'STORE', name: '', address: '' });
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [editingLocation, setEditingLocation] = useState<Location | null>(null);

    // Device Wizard State
    const [isDeviceWizardOpen, setIsDeviceWizardOpen] = useState(false);
    const [newDevice, setNewDevice] = useState<{ name: string; type: 'QUEUE' | 'ATTENDANCE'; locationId: string }>({
        name: '',
        type: 'QUEUE',
        locationId: ''
    });
    const { registerKiosk } = useLocationStore();



    const handleCreateLocation = async () => {
        if (!newLocation.name || !newLocation.address) return;

        try {
            // V2: createLocationSecure
            const res = await createLocationSecure({
                name: newLocation.name,
                address: newLocation.address,
                type: newLocation.type as any
            });

            if (res.success && res.data) {
                toast.success('Ubicación creada exitosamente');
                addLocation(res.data); // Update local store
                setIsWizardOpen(false);
                setNewLocation({ type: 'STORE', name: '', address: '' });
            } else {
                toast.error(res.error || 'Error al crear ubicación');
            }
        } catch (error) {
            toast.error('Error de conexión');
        }
    };

    const handleCreateDevice = () => {
        if (!newDevice.name || !newDevice.locationId) {
            toast.error('Nombre y ubicación requeridos');
            return;
        }

        const kioskId = `K-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        registerKiosk({
            id: kioskId,
            type: newDevice.type,
            location_id: newDevice.locationId,
            status: 'INACTIVE', // Starts inactive until paired
            pairing_code: generatePairingCode(kioskId)
        });

        toast.success(`Dispositivo ${kioskId} creado`);
        setIsDeviceWizardOpen(false);
        setNewDevice({ name: '', type: 'QUEUE', locationId: '' });
        // Optionally show pairing code immediately
        handleGenerateCode(kioskId);
    };

    const handleGenerateCode = (kioskId: string) => {
        const code = generatePairingCode(kioskId);
        setPairingCode(code);
    };

    const handleMoveEmployee = async (employee: EmployeeProfile, targetLocationId: string | null) => {
        if (!currentLocation && targetLocationId) return;

        try {
            // V2: updateUserSecure con assigned_location_id
            const res = await updateUserSecure({
                userId: employee.id,
                assigned_location_id: targetLocationId || undefined
            });

            if (res.success) {
                toast.success('Personal reasignado');
                // Refresh Employees
                usePharmaStore.getState().syncData();
            } else {
                toast.error('Error al mover personal: ' + res.error);
            }
        } catch (_error) {
            toast.error('Error de conexión');
        }
    };


    // --- RENDERERS ---

    const renderBranches = () => (
        <div className="h-full overflow-y-auto pb-20">
            {locations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400">
                    <Store size={48} className="mb-4 text-slate-200" />
                    <h3 className="text-lg font-bold text-slate-600 mb-2">No hay sucursales registradas</h3>
                    <p className="text-sm mb-6 text-center max-w-xs">Comienza creando tu primera sucursal o bodega para operar la red.</p>
                    <button
                        onClick={() => setIsWizardOpen(true)}
                        className="bg-cyan-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-cyan-700 transition w-fit"
                    >
                        Crear Primera Sucursal
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {locations.filter(l => l.is_active !== false).map(location => (
                        <div key={location.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-md transition-all">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                                <div className="flex items-start gap-3">
                                    <div className={`p-3 rounded-xl ${location.type === 'WAREHOUSE' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {location.type === 'WAREHOUSE' ? <Warehouse size={24} /> : <Store size={24} />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                            {location.name}
                                            {location.is_active === false && (
                                                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full uppercase tracking-wider">Cerrado</span>
                                            )}
                                        </h3>
                                        <p className="text-xs text-slate-500 font-medium">{location.type === 'HQ' ? 'Casa Matriz' : location.type === 'WAREHOUSE' ? 'Bodega' : 'Sucursal'}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setEditingLocation(location)}
                                    className="text-slate-300 hover:text-slate-600 transition-colors"
                                >
                                    <Settings size={18} />
                                </button>
                            </div>

                            {/* KPIs */}
                            <div className="flex items-center justify-center gap-6 p-4 border-b border-slate-100 bg-slate-50/50">
                                <div className="text-center">
                                    <p className="text-xs text-slate-400 font-bold">PERSONAL</p>
                                    <p className="text-lg font-bold text-slate-700">
                                        {employees.filter(e => e.assigned_location_id === location.id || (!e.assigned_location_id && e.base_location_id === location.id)).length}
                                    </p>
                                </div>
                                <div className="text-center border-l border-slate-200 pl-6">
                                    <p className="text-xs text-slate-400 font-bold">TERMINALES</p>
                                    <p className="text-lg font-bold text-slate-700">
                                        {location.associated_kiosks?.length || 0}
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 space-y-3">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Dirección</p>
                                    <p className="text-sm text-slate-600 flex items-center gap-1">
                                        <MapPin size={14} /> {location.address || 'Sin dirección'}
                                    </p>
                                </div>
                                {location.phone && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Teléfono</p>
                                        <p className="text-sm text-slate-600 flex items-center gap-1">
                                            📞 {location.phone}
                                        </p>
                                    </div>
                                )}
                                {location.email && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Correo</p>
                                        <p className="text-sm text-slate-600 flex items-center gap-1">
                                            ✉️ {location.email}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-500">ID: {location.id}</span>
                                {currentLocation?.id === location.id && (
                                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                                        <CheckCircle size={12} /> Contexto Activo
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderTeams = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
            {/* Source: Available / Other Locations */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Users className="text-slate-400" /> Personal Disponible (Global)
                </h3>
                <div className="flex-1 overflow-y-auto space-y-3">
                    {employees.map(emp => (
                        <div key={emp.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-cyan-200 transition-colors group">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">
                                    {emp.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-700">{emp.name}</p>
                                    <p className="text-xs text-slate-500">{emp.job_title}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-slate-400">{locations.find(l => l.id === emp.assigned_location_id)?.name || 'Sin Asignar'}</p>
                                {currentLocation && (
                                    <button
                                        onClick={() => handleMoveEmployee(emp, currentLocation.id)}
                                        className="text-xs text-cyan-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                                    >
                                        Mover a {currentLocation.name}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Target: Current Location */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col border-l-4 border-l-cyan-500">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <MapPin className="text-cyan-600" /> En {currentLocation?.name}
                </h3>
                <div className="flex-1 overflow-y-auto space-y-3">
                    {employees.filter(e => e.assigned_location_id === currentLocation?.id).length > 0 ? (
                        employees.filter(e => e.assigned_location_id === currentLocation?.id).map(emp => (
                            <div key={emp.id} className="flex justify-between items-center p-3 bg-cyan-50 rounded-xl border border-cyan-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-cyan-200 flex items-center justify-center font-bold text-cyan-700">
                                        {emp.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-700">{emp.name}</p>
                                        <p className="text-xs text-slate-500">{emp.job_title}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleMoveEmployee(emp, null)}
                                    title="Desvincular (Enviar a Global)"
                                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <ArrowRightLeft size={16} />
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-slate-400">
                            <p>No hay personal asignado hoy.</p>
                            <p className="text-xs">Arrastra o selecciona personal de la izquierda.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderDevices = () => (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Monitor className="text-slate-400" /> Kioscos & Dispositivos
                </h3>
                <button
                    onClick={() => setIsDeviceWizardOpen(true)}
                    className="text-sm font-bold text-cyan-600 hover:bg-cyan-50 px-3 py-1 rounded-lg transition"
                >
                    + Vincular Nuevo
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {kiosks.map(kiosk => (
                    <div key={kiosk.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-slate-100 rounded-lg">
                                {kiosk.type === 'QUEUE' ? <Tablet size={20} className="text-slate-600" /> : <Users size={20} className="text-slate-600" />}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${kiosk.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                {kiosk.status}
                            </span>
                        </div>
                        <h4 className="font-bold text-slate-800">{kiosk.id}</h4>
                        <p className="text-xs text-slate-500 mb-4">{kiosk.type === 'QUEUE' ? 'Totem de Filas' : 'Reloj Control'}</p>

                        <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-50 p-2 rounded-lg">
                            <span>Ubicación:</span>
                            <span className="font-bold text-slate-600">{locations.find(l => l.id === kiosk.location_id)?.name || 'Desconocida'}</span>
                        </div>

                        <button
                            onClick={() => handleGenerateCode(kiosk.id)}
                            className="w-full mt-4 py-2 border border-cyan-200 text-cyan-600 font-bold rounded-lg hover:bg-cyan-50 transition flex items-center justify-center gap-2"
                        >
                            <QrCode size={16} /> Generar Código
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );



    return (
        <div className="h-dvh flex flex-col bg-slate-50 p-4 md:p-6 overflow-hidden pb-safe">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <MapPin className="text-cyan-600" />
                        Gestión de Red
                    </h1>
                    <p className="text-slate-500">Administra sucursales, bodegas y puntos de atención.</p>
                </div>
                <button
                    onClick={() => setIsWizardOpen(true)}
                    className="bg-cyan-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-cyan-700 transition-colors flex items-center gap-2 shadow-lg shadow-cyan-200"
                >
                    <Plus size={20} />
                    Nueva Sucursal
                </button>
            </header>

            {/* Current Context Banner */}
            <div className="bg-slate-800 text-white p-4 rounded-xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-lg shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg">
                        {currentLocation?.type === 'WAREHOUSE' ? <Warehouse size={24} /> : <Store size={24} />}
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Ubicación Actual (Contexto)</p>
                        <h2 className="text-xl font-bold">{currentLocation?.name}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <span className="text-xs text-slate-400 whitespace-nowrap">Cambiar vista:</span>
                    <select
                        className="bg-white text-slate-800 border border-slate-300 rounded-lg px-3 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 shadow-sm"
                        value={currentLocation?.id}
                        onChange={(e) => switchLocation(e.target.value)}
                    >
                        {locations.filter(l => l.is_active !== false).map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-slate-200 overflow-x-auto touch-pan-x no-scrollbar shrink-0">
                <button
                    onClick={() => setActiveTab('BRANCHES')}
                    className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${activeTab === 'BRANCHES' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Sucursales
                </button>
                <button
                    onClick={() => setActiveTab('TEAMS')}
                    className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${activeTab === 'TEAMS' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Equipos
                </button>
                <button
                    onClick={() => setActiveTab('DEVICES')}
                    className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${activeTab === 'DEVICES' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Dispositivos
                </button>

            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'BRANCHES' && renderBranches()}
                {activeTab === 'TEAMS' && renderTeams()}
                {activeTab === 'DEVICES' && renderDevices()}

            </div>

            {/* New Location Wizard Modal */}
            {isWizardOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <h3 className="text-xl font-bold text-slate-800 mb-4">Nueva Ubicación</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Tipo</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setNewLocation({ ...newLocation, type: 'STORE' })}
                                        className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${newLocation.type === 'STORE' ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-400'}`}
                                    >
                                        Sucursal
                                    </button>
                                    <button
                                        onClick={() => setNewLocation({ ...newLocation, type: 'WAREHOUSE' })}
                                        className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${newLocation.type === 'WAREHOUSE' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-400'}`}
                                    >
                                        Bodega
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium"
                                    placeholder="Ej: Sucursal Norte"
                                    value={newLocation.name}
                                    onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Dirección</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium"
                                    placeholder="Ej: Av. Matta 550"
                                    value={newLocation.address}
                                    onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-6">
                                <button
                                    onClick={() => setIsWizardOpen(false)}
                                    className="py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateLocation}
                                    className="py-3 rounded-xl font-bold bg-cyan-600 text-white hover:bg-cyan-700"
                                >
                                    Crear Ubicación
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* New Device Wizard Modal */}
            {isDeviceWizardOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <h3 className="text-xl font-bold text-slate-800 mb-4">Vincular Nuevo Dispositivo</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Tipo de Dispositivo</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setNewDevice({ ...newDevice, type: 'QUEUE' })}
                                        className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${newDevice.type === 'QUEUE' ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-400'}`}
                                    >
                                        <div className="flex flex-col items-center">
                                            <Tablet size={24} className="mb-2" />
                                            Kiosco / Filas
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setNewDevice({ ...newDevice, type: 'ATTENDANCE' })}
                                        className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${newDevice.type === 'ATTENDANCE' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-400'}`}
                                    >
                                        <div className="flex flex-col items-center">
                                            <Users size={24} className="mb-2" />
                                            Reloj Control
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Nombre del Dispositivo</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium"
                                    placeholder="Ej: Kiosco Entrada Principal"
                                    value={newDevice.name}
                                    onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Ubicación Asignada</label>
                                <select
                                    className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium"
                                    value={newDevice.locationId}
                                    onChange={(e) => setNewDevice({ ...newDevice, locationId: e.target.value })}
                                >
                                    <option value="">Seleccionar Sucursal...</option>
                                    {locations.filter(l => l.is_active !== false).map(loc => (
                                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-6">
                                <button
                                    onClick={() => setIsDeviceWizardOpen(false)}
                                    className="py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateDevice}
                                    className="py-3 rounded-xl font-bold bg-cyan-600 text-white hover:bg-cyan-700"
                                >
                                    Crear Dispositivo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Pairing Code Modal */}
            {pairingCode && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center animate-in fade-in zoom-in duration-200">
                        <QrCode size={48} className="mx-auto text-slate-800 mb-4" />
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Código de Vinculación</h3>
                        <p className="text-sm text-slate-500 mb-6">Ingresa este código en la Tablet para asignarla a esta sucursal.</p>

                        <div className="bg-slate-100 p-4 rounded-2xl mb-6">
                            <span className="text-4xl font-mono font-bold text-slate-900 tracking-widest">{pairingCode}</span>
                        </div>

                        <button
                            onClick={() => setPairingCode(null)}
                            className="w-full py-3 rounded-xl font-bold bg-slate-900 text-white hover:bg-slate-800"
                        >
                            Listo
                        </button>
                    </div>
                </div>
            )}
            {/* Edit Modal */}
            {editingLocation && (
                <LocationEditModal
                    location={editingLocation}
                    onClose={() => setEditingLocation(null)}
                    onUpdate={() => {
                        // Optimistic update handled in modal
                        // const { fetchLocations } = useLocationStore.getState();
                        // fetchLocations(true);
                    }}
                />
            )}
        </div>
    );
};

export default NetworkPage;
