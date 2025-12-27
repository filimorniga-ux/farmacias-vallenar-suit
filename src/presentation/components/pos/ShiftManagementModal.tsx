import { useState, useEffect } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { X, User, DollarSign, Monitor, Lock, MapPin, LockKeyhole, ArrowRight, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
// V2: Funciones atómicas seguras
import { openTerminalAtomic, openTerminalWithPinValidation, forceCloseTerminalShift, getTerminalStatusAtomic, getTerminalsByLocationSecure } from '../../../actions/terminals-v2';
import { useTerminalSession } from '../../../hooks/useTerminalSession';
import { Terminal } from '@/domain/types';

interface ShiftManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ShiftManagementModal: React.FC<ShiftManagementModalProps> = ({ isOpen, onClose }) => {
    const router = useRouter();
    const { employees, openShift, resumeShift, fetchLocations, locations, terminals, fetchTerminals, user } = usePharmaStore();
    const { saveSession } = useTerminalSession(); // Hook para persistencia local segura

    const [selectedLocation, setSelectedLocation] = useState('');
    const [selectedTerminal, setSelectedTerminal] = useState('');
    const [selectedCashier, setSelectedCashier] = useState('');
    const [openingAmount, setOpeningAmount] = useState('');
    const [managerPin, setManagerPin] = useState('');
    const [step, setStep] = useState<'DETAILS' | 'AUTH'>('DETAILS');
    const [openableTerminals, setOpenableTerminals] = useState<Terminal[]>([]);
    const [isForceLoading, setIsForceLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false); // Estado de carga para evitar doble clic

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
            // V2: getTerminalsByLocationSecure para obtener terminales disponibles
            getTerminalsByLocationSecure(selectedLocation).then((res) => {
                if (res.success && res.data) {
                    const available = res.data.filter((t: any) => t.status !== 'OPEN');
                    setOpenableTerminals(available as Terminal[]);
                } else {
                    setOpenableTerminals([]);
                }
            }).catch(() => {
                setOpenableTerminals([]);
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


    // --- AUTO-HEAL: GHOST SESSION DETECTION & FIX ---
    useEffect(() => {
        const healGhosts = async () => {
            if (!locations || !selectedLocation) return;
            const currentTerminals = terminals.filter(t => t.location_id === selectedLocation);

            // Definition of "Ghost":
            // 1. Status is OPEN
            // 2. BUT missing cashier_id OR session_id (Critical Integrity Fail)
            const ghosts = currentTerminals.filter(t =>
                t.status === 'OPEN' && (!t.current_cashier_id || !t.session_id)
            );

            if (ghosts.length > 0) {
                // If user is Admin/Manager, or we just want to keep system clean?
                // Ideally only Admins/Managers should trigger this to avoid chaos, 
                // OR we do it silently if it's clearly a data corruption (missing ID).
                // Let's do it safely: Only if user has permissions or if it's blatant corruption.
                const canHeal = ['ADMIN', 'MANAGER'].includes(user?.role || '') || ghosts.every(g => !g.current_cashier_id);

                if (canHeal) {
                    toast.warning(`🧹 Detectadas ${ghosts.length} sesiones fantasmas. Reparando...`);

                    for (const ghost of ghosts) {
                        try {
                            console.log(`🔧 Auto-healing terminal ${ghost.name} (${ghost.id})...`);
                            await forceCloseTerminalShift(ghost.id, 'SYSTEM_AUTOHEAL', 'Auto-healing ghost session');
                        } catch (e) {
                            console.error('Failed to auto-heal', ghost.id, e);
                        }
                    }

                    toast.success('✅ Sistema optimizado: Sesiones fantasmas cerradas.');
                    // Refresh data
                    fetchTerminals(selectedLocation);
                    getTerminalsByLocationSecure(selectedLocation).then((res) => {
                        if (res.success && res.data) {
                            const available = res.data.filter((t: any) => t.status !== 'OPEN');
                            setOpenableTerminals(available as Terminal[]);
                        }
                    });
                }
            }
        };

        healGhosts();
    }, [selectedLocation, terminals.length, user?.role]);
    // Dependency on terminals.length ensures we run when list updates
    // ------------------------------------------------


    const handleForceUnlock = async () => {
        if (!window.confirm('Esta caja tiene un turno abierto. ¿Deseas cerrarlo forzosamente para entrar?')) return;

        setIsForceLoading(true);
        try {
            const currentUserId = user?.id || 'SYSTEM_FORCE';
            const res = await forceCloseTerminalShift(selectedTerminal, currentUserId, 'Cierre forzado por usuario');
            if (res.success) {
                toast.success('Terminal liberada exitosamente');
                // Refresh list - V2
                const refreshed = await getTerminalsByLocationSecure(selectedLocation);
                if (refreshed.success && refreshed.data) {
                    const available = refreshed.data.filter((t: any) => t.status !== 'OPEN');
                    setOpenableTerminals(available as Terminal[]);
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
        if (isSubmitting) return; // Prevención de doble envío en Frontend

        // SECURITY FIX: No más logs con datos sensibles
        // La validación del PIN ahora se hace en el servidor

        if (!managerPin || managerPin.length < 4) {
            toast.error('Ingrese un PIN válido');
            return;
        }

        setIsSubmitting(true);

        try {
            // SECURITY FIX: Validación de PIN en el servidor (no en cliente)
            // La función openTerminalWithPinValidation valida el PIN con bcrypt en el backend
            const result = await openTerminalWithPinValidation(
                selectedTerminal,
                selectedCashier,
                parseInt(openingAmount),
                managerPin  // PIN enviado al servidor para validación segura
            );

            if (!result.success) {
                // Manejo de Errores Robustos que vienen del Backend Atómico
                if (result.error?.includes('ocupado')) {
                    toast.error('La terminal fue ocupada por otro usuario hace un instante.');
                    // Recargar datos para mostrar estado real
                    fetchTerminals(selectedLocation);
                } else if (result.error?.includes('PIN') || result.error?.includes('autorización')) {
                    toast.error('PIN de autorización inválido');
                } else {
                    toast.error(`Error al abrir: ${result.error}`);
                }
                setIsSubmitting(false);
                return;
            }

            // ÉXITO: Sincronizar Estado Local y Persistencia

            // A. Guardar sesión en localStorage (vía Hook) para validación offline/recarga
            if (result.sessionId) {
                const terminalData = terminals.find(t => t.id === selectedTerminal);
                saveSession({
                    sessionId: result.sessionId,
                    terminalId: selectedTerminal,
                    terminalName: terminalData?.name || 'Terminal',
                    userId: selectedCashier,
                    openedAt: Date.now(),
                    openingAmount: parseInt(openingAmount)
                });
            }

            // B. Actualizar Store Global (Zustand) para la UI inmediata
            // Usamos el authorizedById retornado por el servidor (validado con bcrypt)
            openShift(
                parseInt(openingAmount),
                selectedCashier,
                result.authorizedById || 'SYSTEM',
                selectedTerminal,
                selectedLocation
            );

            toast.success('Turno abierto correctamente');
            onClose();

            // C. Resetear Formulario
            setStep('DETAILS');
            setManagerPin('');
            setOpeningAmount('');
            setSelectedTerminal('');
            setSelectedCashier('');

            // D. Redirigir al POS
            router.push('/pos');

        } catch (error) {
            console.error('Error en apertura de turno:', error);
            toast.error('Error crítico de comunicación');
        } finally {
            setIsSubmitting(false);
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

                                    {/* Terminal Select - GOD LEVEL UX */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Terminal</label>
                                        <select
                                            value={selectedTerminal}
                                            onChange={(e) => setSelectedTerminal(e.target.value)}
                                            disabled={!selectedLocation}
                                            className={`w-full p-3 border rounded-xl focus:ring-2 outline-none disabled:opacity-50 transition-colors bg-slate-50
                                                ${selectedTerminalData?.status === 'OPEN'
                                                    ? (isMySession ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-red-300 bg-red-50 text-red-800')
                                                    : 'border-slate-200 focus:ring-cyan-500'
                                                }
                                            `}
                                        >
                                            <option value="">
                                                {!selectedLocation ? 'Primero seleccione sucursal' : 'Seleccione Terminal...'}
                                            </option>
                                            {displayTerminals.map(t => {
                                                // Lógica simplificada: usar status directamente
                                                const isMine = t.current_cashier_id === user?.id && t.status === 'OPEN';
                                                // Una terminal está ocupada si está OPEN y NO es mía
                                                const isOccupied = t.status === 'OPEN' && !isMine;
                                                // Disponible si está CLOSED o si no tiene cajero asignado
                                                const isAvailable = t.status === 'CLOSED' || t.status !== 'OPEN';

                                                // Icon/Text Logic
                                                let statusLabel = '';
                                                if (isMine) statusLabel = '🟠 (Tu Turno)';
                                                else if (isOccupied) statusLabel = '🔴 (Ocupada)';
                                                else statusLabel = '🟢 (Disponible)';

                                                return (
                                                    <option
                                                        key={t.id}
                                                        value={t.id}
                                                        className={isMine ? "text-amber-600 font-bold" : (isOccupied ? "text-red-500 font-bold" : "text-slate-700")}
                                                    >
                                                        {t.name} {statusLabel}
                                                    </option>
                                                );
                                            })}
                                        </select>

                                        {/* UX INTELLIGENTE: Contextual Help & Actions */}
                                        {selectedTerminal && (
                                            <div className="mt-2 animate-in fade-in slide-in-from-top-1">

                                                {/* CASE A: MY SESSION */}
                                                {isMySession && (
                                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                                                        <div className="text-xs text-amber-800">
                                                            <strong>🟠 Retomar Turno:</strong> Ya tienes una sesión activa aquí.
                                                        </div>
                                                    </div>
                                                )}

                                                {/* CASE B: OCCUPIED BY OTHER / ZOMBIE */}
                                                {(isActiveSession && !isMySession) && (
                                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex flex-col gap-2">
                                                        <div className="flex items-start gap-2">
                                                            <div className="mt-0.5"><Lock size={14} className="text-red-500" /></div>
                                                            <div className="flex-1 text-xs text-red-800">
                                                                <strong>🔴 Caja Ocupada:</strong>
                                                                <br />
                                                                Sesión abierta por <span className="font-bold">{sessionOwner}</span>.
                                                            </div>
                                                        </div>

                                                        {/* GOD MODE ACTION: Allow Managers/Admins to liberate instantly */}
                                                        {['ADMIN', 'MANAGER'].includes(user?.role || '') && (
                                                            <button
                                                                onClick={handleForceUnlock}
                                                                disabled={isForceLoading}
                                                                className="w-full mt-1 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs rounded shadow-sm transition-colors flex items-center justify-center gap-2"
                                                            >
                                                                {isForceLoading ? 'Liberando...' : '🔓 FORZAR LIBERACIÓN (ADMIN)'}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* CASE C: ZOMBIE (Server says occupied, Local says closed?? Or vice versa) */}
                                                {/* If terminal is NOT in openable list, but local status says CLOSED, it's a Server-Side Zombie */}
                                                {!openableTerminals.some(ot => ot.id === selectedTerminal) && !isActiveSession && (
                                                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg flex flex-col gap-2">
                                                        <div className="text-xs text-slate-600">
                                                            <strong>⚠️ Estado Inconsistente:</strong> El servidor reporta ocupación.
                                                        </div>
                                                        <button
                                                            onClick={handleForceUnlock}
                                                            disabled={isForceLoading}
                                                            className="w-full py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded"
                                                        >
                                                            🔧 REPARAR ESTADO
                                                        </button>
                                                    </div>
                                                )}

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
                                    disabled={isSubmitting}
                                    className={`flex-1 py-3 ${isSubmitting ? 'bg-slate-400' : 'bg-amber-500 hover:bg-amber-600'} text-white font-bold rounded-xl transition-colors shadow-lg shadow-amber-200 flex justify-center items-center gap-2`}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Procesando...
                                        </>
                                    ) : (
                                        'Autorizar Apertura'
                                    )}
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
