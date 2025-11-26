import React, { useState } from 'react';
import { useLocationStore } from '../store/useLocationStore';
import { MapPin, Warehouse, Store, Plus, Tablet, QrCode, Settings, CheckCircle, XCircle } from 'lucide-react';
import { Location } from '../../domain/types';

const NetworkPage = () => {
    const { locations, kiosks, currentLocation, addLocation, switchLocation, generatePairingCode } = useLocationStore();
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [newLocation, setNewLocation] = useState<Partial<Location>>({ type: 'STORE', name: '', address: '' });
    const [pairingCode, setPairingCode] = useState<string | null>(null);

    const handleCreateLocation = () => {
        if (!newLocation.name || !newLocation.address) return;

        const location: Location = {
            id: `LOC-${Date.now()}`,
            type: newLocation.type as any,
            name: newLocation.name!,
            address: newLocation.address!,
            associated_kiosks: []
        };

        addLocation(location);
        setIsWizardOpen(false);
        setNewLocation({ type: 'STORE', name: '', address: '' });
    };

    const handleGenerateCode = (kioskId: string) => {
        const code = generatePairingCode(kioskId);
        setPairingCode(code);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 p-6 overflow-hidden">
            <header className="flex justify-between items-center mb-6">
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
            <div className="bg-slate-800 text-white p-4 rounded-xl mb-6 flex justify-between items-center shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg">
                        {currentLocation?.type === 'WAREHOUSE' ? <Warehouse size={24} /> : <Store size={24} />}
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Ubicación Actual (Contexto)</p>
                        <h2 className="text-xl font-bold">{currentLocation?.name}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Cambiar vista:</span>
                    <select
                        className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-sm font-bold focus:outline-none focus:border-cyan-500"
                        value={currentLocation?.id}
                        onChange={(e) => switchLocation(e.target.value)}
                    >
                        {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Locations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-20">
                {locations.map(location => (
                    <div key={location.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-md transition-all">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                            <div className="flex items-start gap-3">
                                <div className={`p-3 rounded-xl ${location.type === 'WAREHOUSE' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {location.type === 'WAREHOUSE' ? <Warehouse size={24} /> : <Store size={24} />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg">{location.name}</h3>
                                    <p className="text-xs text-slate-500 font-medium">{location.type === 'HQ' ? 'Casa Matriz' : location.type === 'WAREHOUSE' ? 'Bodega' : 'Sucursal'}</p>
                                </div>
                            </div>
                            <button className="text-slate-300 hover:text-slate-600 transition-colors">
                                <Settings size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Dirección</p>
                                <p className="text-sm text-slate-600 flex items-center gap-1">
                                    <MapPin size={14} /> {location.address}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Kioscos Asociados</p>
                                <div className="space-y-2">
                                    {location.associated_kiosks.length > 0 ? (
                                        location.associated_kiosks.map(kioskId => {
                                            const kiosk = kiosks.find(k => k.id === kioskId);
                                            return (
                                                <div key={kioskId} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                    <div className="flex items-center gap-2">
                                                        <Tablet size={14} className="text-slate-400" />
                                                        <span className="text-xs font-bold text-slate-700">{kioskId}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${kiosk?.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                                        <button
                                                            onClick={() => handleGenerateCode(kioskId)}
                                                            className="text-cyan-600 hover:bg-cyan-50 p-1 rounded"
                                                            title="Vincular"
                                                        >
                                                            <QrCode size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p className="text-xs text-slate-400 italic">No hay dispositivos vinculados.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-500">ID: {location.id}</span>
                            {currentLocation?.id === location.id && (
                                <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                                    <CheckCircle size={12} /> Activo
                                </span>
                            )}
                        </div>
                    </div>
                ))}
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
        </div>
    );
};

export default NetworkPage;
