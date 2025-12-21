import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { X, User, DollarSign, Monitor, Lock, MapPin, LockKeyhole, ArrowRight, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { openTerminal, getAvailableTerminalsForShift, forceCloseTerminalShift } from '../../../actions/terminals';
import { Terminal } from '@/domain/types';

interface ShiftManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ShiftManagementModal: React.FC<ShiftManagementModalProps> = ({ isOpen, onClose }) => {
    const router = useRouter();
    const { employees, openShift, resumeShift, fetchLocations, locations, terminals, fetchTerminals, user } = usePharmaStore();

    const [selectedLocation, setSelectedLocation] = useState('');
    const [selectedTerminal, setSelectedTerminal] = useState('');
    const [selectedCashier, setSelectedCashier] = useState('');
    const [openingAmount, setOpeningAmount] = useState('');
    const [managerPin, setManagerPin] = useState('');
    const [step, setStep] = useState<'DETAILS' | 'AUTH'>('DETAILS');
    const [openableTerminals, setOpenableTerminals] = useState<Terminal[]>([]);
    const [isForceLoading, setIsForceLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchLocations();
        }
    }, [isOpen, fetchLocations]);

    // Auto-select user's location and restrict options
    useEffect(() => {
        const user = usePharmaStore.getState().user; // Get current user
        if (user && user.assigned_location_id) {
            setSelectedLocation(user.assigned_location_id);
        }
    }, [isOpen, employees]);

    const availableLocations = locations.filter(l => {
        // Exclude inactive locations
        if (l.is_active === false) return false;

        const user = usePharmaStore.getState().user;
        // If Manager/Admin of a specific branch, restrict. If Global, allow all.
        // Assuming 'assigned_location_id' dictates the restriction.
        if (user?.assigned_location_id) {
            return l.id === user.assigned_location_id;
        }
        return true;
    });

    useEffect(() => {
        if (selectedLocation) {
            // 1. Fetch truly available terminals from server (Active, Not Deleted, No Open Session) for Validation
            getAvailableTerminalsForShift(selectedLocation).then(res => {
                if (res.success && res.data) {
                    setOpenableTerminals(res.data as Terminal[]);
                } else {
                    setOpenableTerminals([]);
                    toast.error('Error cargando estado de terminales');
                }
            });

            // 2. Ensure Store has terminals for this location (Fallback for Dropdown) by re-fetching
            const storeTerminalsForLoc = terminals.filter(t => t.location_id === selectedLocation);
            if (storeTerminalsForLoc.length === 0) {
                console.log(`⚠️ No terminals in store for ${selectedLocation}, fetching...`);
                fetchTerminals(selectedLocation);
            }

            setSelectedTerminal(''); // Reset terminal when location changes
        } else {
            setOpenableTerminals([]);
        }
    }, [selectedLocation, terminals.length]);

    // Filter terminals from STORE for display (Show ALL, even occupied ones)
    const displayTerminals = terminals.filter(t => t.location_id === selectedLocation);

    // Check if selected terminal is "Zombie" (Exists but not in openable list)
    const isZombie = selectedTerminal && openableTerminals.length > 0 && !openableTerminals.some(t => t.id === selectedTerminal);


    const handleForceUnlock = async () => {
        if (!window.confirm('Esta caja tiene un turno abierto. ¿Deseas cerrarlo forzosamente para entrar?')) return;

        setIsForceLoading(true);
        try {
            const currentUserId = user?.id || 'SYSTEM_FORCE';
            const res = await forceCloseTerminalShift(selectedTerminal, currentUserId);
            if (res.success) {
                toast.success('Terminal liberada exitosamente');
                // Refresh list
                const refreshed = await getAvailableTerminalsForShift(selectedLocation);
                if (refreshed.success && refreshed.data) {
                    setOpenableTerminals(refreshed.data as Terminal[]);
                }
                // Also refresh main lists
                fetchTerminals(selectedLocation);
            } else {
                toast.error('Error al liberar: ' + res.error);
            }
        } catch (e) {
            toast.error('Error desconocido al liberar');
        } finally {
            setIsForceLoading(false);
        }
    };

    const selectedTerminalData = terminals.find(t => t.id === selectedTerminal);
    // Logic for Resilience & Concurrency
    const isActiveSession = selectedTerminalData?.status === 'OPEN';
    const isUserMatch = isActiveSession && selectedTerminalData?.current_cashier_id === user?.id;

    // Check Local Ownership (Zombie Check)
    const localSessionId = typeof window !== 'undefined' ? localStorage.getItem('pos_session_id') : null;
    const isLocalExistent = !!localSessionId;
    const isSessionMatch = selectedTerminalData?.session_id === localSessionId;

    // "My Session" means: IT's my User ID AND I have the session token locally.
    // If I match User ID but NOT token -> It's an orphan/ghost session (opened on another device or cache cleared).
    const isMySession = isUserMatch && isSessionMatch;

    const isGhostSession = isUserMatch && !isSessionMatch; // New State: It's me, but not THIS device.
    const isOtherSession = isActiveSession && !isUserMatch;

    const sessionOwner = isOtherSession
        ? (employees.find(e => e.id === selectedTerminalData?.current_cashier_id)?.name || 'Otro Usuario')
        : (isGhostSession ? 'TI (Otra Sesión/Dispositivo)' : 'Mí');

    const handleResumeSession = () => {
        if (!selectedTerminalData || !selectedTerminalData.session_id) {
            toast.error('Datos de sesión corruptos. Intente forzar cierre.');
            return;
        }

        resumeShift({
            id: selectedTerminalData.session_id,
            terminal_id: selectedTerminalData.id,
            user_id: user!.id,
            authorized_by: selectedTerminalData.authorized_by_name || 'UNKNOWN',
            start_time: selectedTerminalData.session_start_time || Date.now(),
            opening_amount: selectedTerminalData.session_opening_amount || 0,
            status: 'ACTIVE'
        });

        toast.success('Turno reanudado exitosamente');
        onClose();
        router.push('/pos');
    };

    if (!isOpen) return null;

    const cashiers = employees.filter(e => {
        const isRoleValid = ['CASHIER', 'QF', 'MANAGER', 'ADMIN'].includes(e.role);

        const isGlobal = ['MANAGER', 'ADMIN', 'QF'].includes(e.role); // Manager/Admin/QF roam
        const isLocalMatch = e.assigned_location_id === selectedLocation;

        return isRoleValid && (isGlobal || isLocalMatch);
    });

    const handleNext = () => {
        if (!selectedLocation || !selectedTerminal || !selectedCashier || !openingAmount) {
            toast.error('Complete todos los campos');
            return;
        }
        setStep('AUTH');
    };

    const handleOpenShift = async () => {
        // Verify Manager PIN
        const manager = employees.find(e => (e.role === 'MANAGER' || e.role === 'ADMIN') && e.access_pin === managerPin);

        if (!manager) {
            toast.error('PIN de Autorización inválido');
            return;
        }

        try {
            // 1. Persist to Backend
            const result = await openTerminal(selectedTerminal, selectedCashier, parseInt(openingAmount));

            if (!result.success) {
                if (result.error?.includes('already open')) {
                    // AUTO-RECOVERY LOGIC
                    const canAutoFix = ['ADMIN', 'MANAGER'].includes(user?.role || '');

                    if (canAutoFix) {
                        toast.warning('🔄 Detectado bloqueo de sistema. Reparando automáticamente...');
                        const fixRes = await forceCloseTerminalShift(selectedTerminal, user?.id || 'SYSTEM_AUTOFIX');

                        if (fixRes.success) {
                            toast.success('✅ Caja sincronizada. Por favor intente abrir nuevamente.');
                            // Refresh to reflect clean state
                            fetchTerminals(selectedLocation);
                            getAvailableTerminalsForShift(selectedLocation).then(res => {
                                if (res.success && res.data) setOpenableTerminals(res.data as Terminal[]);
                            });
                            return;
                        }
                    }

                    toast.error('⚠️ Sincronizando estado de caja... Intente nuevamente.');
                    // Force refresh to show the "Occupied" state and the Force Close button
                    fetchTerminals(selectedLocation);
                    getAvailableTerminalsForShift(selectedLocation).then(res => {
                        if (res.success && res.data) setOpenableTerminals(res.data as Terminal[]);
                    });
                    return;
                }
                toast.error('Error al abrir terminal: ' + result.error);
                return;
            }

            // 2. Update Local Store & Context
            openShift(parseInt(openingAmount), selectedCashier, manager.id, selectedTerminal, selectedLocation);

            toast.success('Turno abierto exitosamente');
            onClose();

            // Reset Form
            setStep('DETAILS');
            setManagerPin('');
            setOpeningAmount('');
            setSelectedTerminal('');
            setSelectedCashier('');
            setSelectedLocation('');

        } catch (error) {
            console.error(error);
            toast.error('Error de comunicación');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-slate-900 p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Monitor className="text-cyan-400" /> Apertura de Caja
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {step === 'DETAILS' && (
                        <>
                            {isActiveSession ? (
                                <div className="space-y-6 animate-in slide-in-from-right-4">
                                    <div className={`p-6 rounded-2xl border-2 ${isMySession ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-200'} `}>
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className={`p-3 rounded-full ${isMySession ? 'bg-cyan-100 text-cyan-600' : 'bg-red-100 text-red-600'}`}>
                                                {isMySession ? <RotateCcw size={32} /> : <LockKeyhole size={32} />}
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-slate-800">
                                                    {isMySession ? 'Continuar Sesión Activa' : 'Terminal Ocupada'}
                                                </h3>
                                                <p className="text-slate-600">
                                                    {isMySession
                                                        ? 'Ya tienes un turno abierto en esta caja.'
                                                        : `Caja ocupada por ${sessionOwner}`
                                                    }
                                                </p>
                                            </div>
                                        </div>

                                        {isMySession ? (
                                            <button
                                                onClick={handleResumeSession}
                                                className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02]"
                                            >
                                                REANUDAR TURNO <ArrowRight size={20} />
                                            </button>
                                        ) : (
                                            <div className="space-y-3">
                                                {/* GHOST / ZOMBIE SESSION WARNING */}
                                                {isGhostSession && (
                                                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-800 mb-2">
                                                        <div className="font-bold flex items-center gap-2">
                                                            <Monitor size={16} /> Sesión en otro dispositivo
                                                        </div>
                                                        <p className="text-xs mt-1 text-amber-700">
                                                            Esta caja figura abierta por ti, pero <strong>no en este dispositivo</strong>.
                                                            Si dejaste la sesión abierta en otro PC/Móvil, ciérrala allá.
                                                            Si es un error, libera la caja.
                                                        </p>
                                                    </div>
                                                )}

                                                {/* EMERGENCY MODE: Allow Force Close for authenticated users if things go wrong */}
                                                {user ? (
                                                    <button
                                                        onClick={handleForceUnlock}
                                                        disabled={isForceLoading}
                                                        className={`w-full py-4 text-white font-extrabold rounded-xl shadow-lg flex items-center justify-center gap-2 animate-pulse ${isGhostSession ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}
                                                    >
                                                        {isForceLoading ? 'LIBERANDO...' : (isGhostSession ? '🔓 LIBERAR MI CAJA' : '🔓 LIBERAR CAJA (ADMIN)')}
                                                    </button>
                                                ) : (
                                                    <p className="text-red-500 font-bold text-center">Inicie sesión para liberar</p>
                                                )}
                                                <p className="text-xs text-center text-slate-500">
                                                    Use esta opción si la caja quedó bloqueada por error.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setSelectedTerminal('')}
                                        className="w-full py-2 text-slate-400 hover:text-slate-600 font-bold text-sm"
                                    >
                                        Volver a Selección
                                    </button>
                                </div>
                            ) : (
                                // STANDARD OPEN FORM
                                <div className="space-y-4">
                                    {/* Location Select */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Sucursal</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                                            <select
                                                value={selectedLocation}
                                                onChange={(e) => setSelectedLocation(e.target.value)}
                                                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none appearance-none"
                                            >
                                                <option value="">Seleccione Sucursal...</option>
                                                {availableLocations.map(loc => (
                                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Terminal Select */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Terminal</label>
                                        <select
                                            value={selectedTerminal}
                                            onChange={(e) => setSelectedTerminal(e.target.value)}
                                            disabled={!selectedLocation}
                                            className={`w-full p-3 bg-slate-50 border rounded-xl focus:ring-2 outline-none disabled:opacity-50 ${isZombie ? 'border-red-500 text-red-600 font-bold bg-red-50' : 'border-slate-200 focus:ring-cyan-500'}`}
                                        >
                                            <option value="">
                                                {!selectedLocation ? 'Primero seleccione sucursal' : 'Seleccione Terminal...'}
                                            </option>
                                            {displayTerminals.map(t => {
                                                const isOpenable = openableTerminals.some(ot => ot.id === t.id);
                                                // If I have an active session here, I want to be able to select it to resume!
                                                // So openness check should allow if it is MY session (checked via store)
                                                // But openableTerminals (server) says it's unavailable.
                                                // We rely on 'displayTerminals' (store) to show it.

                                                const isMine = t.current_cashier_id === user?.id && t.status === 'OPEN';

                                                return (
                                                    <option key={t.id} value={t.id} className={!isOpenable && !isMine ? "text-red-500 font-bold" : (isMine ? "text-cyan-600 font-bold" : "")}>
                                                        {t.name}
                                                        {isMine ? ' 🟢 (Tu Turno Activo)' : (!isOpenable ? ' 🔴 (Ocupada)' : '')}
                                                    </option>
                                                );
                                            })}
                                        </select>

                                        {isZombie && !isActiveSession && ( // Only show Zombie warning if it's NOT a recognized active session we can handle
                                            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                                                <div className="flex-1 text-xs text-red-700">
                                                    <strong>⚠️ Acción Requerida:</strong> Inconsistencia de Estado detectada.
                                                </div>
                                                <button
                                                    onClick={handleForceUnlock}
                                                    disabled={isForceLoading}
                                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                                                >
                                                    {isForceLoading ? 'Fixing...' : 'REPARAR'}
                                                </button>
                                            </div>
                                        )}

                                        {/* GHOST MATCH in Dropdow Logic */}
                                        {isGhostSession && (
                                            <div className="mt-2 text-xs text-amber-600 font-bold text-center animate-pulse">
                                                ⚠️ Sesión zombi detectada en este terminal (Tuya, pero en otro dispositivo)
                                            </div>
                                        )}
                                    </div>

                                    {/* Cashier & Money (Only if not active session, which is handled by ternary above) */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Cajero Asignado</label>
                                        <select
                                            value={selectedCashier}
                                            onChange={(e) => setSelectedCashier(e.target.value)}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none"
                                        >
                                            <option value="">Seleccione Cajero...</option>
                                            {cashiers.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Fondo Inicial</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                type="number"
                                                value={openingAmount}
                                                onChange={(e) => setOpeningAmount(e.target.value)}
                                                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-mono"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleNext}
                                        className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-cyan-200 mt-4"
                                    >
                                        Continuar
                                    </button>

                                    {/* MAINTENANCE: Force Release for Admins in Standard View (Ghost State Fix) */}
                                    {['ADMIN', 'MANAGER'].includes(user?.role || '') && selectedTerminal && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                                            <button
                                                onClick={handleForceUnlock}
                                                disabled={isForceLoading}
                                                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-red-500 font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors"
                                            >
                                                🔧 Mantenimiento: Liberar Caja Bloqueada
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {step === 'AUTH' && (
                        <div className="text-center space-y-6">
                            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-600">
                                <Lock size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Autorización Requerida</h3>
                                <p className="text-sm text-slate-500">Ingrese PIN de Gerente para confirmar apertura</p>
                            </div>

                            <input
                                type="password"
                                value={managerPin}
                                onChange={(e) => setManagerPin(e.target.value)}
                                className="w-full text-center text-2xl tracking-[0.5em] p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                                placeholder="••••"
                                maxLength={4}
                                autoFocus
                            />

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep('DETAILS')}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleOpenShift}
                                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-amber-200"
                                >
                                    Autorizar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShiftManagementModal;
