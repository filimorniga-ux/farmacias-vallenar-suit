import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, User, Clock, Fingerprint, LogOut, CheckCircle, AlertTriangle, Coffee, ArrowRight, X, Loader2, RefreshCw, Home, Delete, ChevronLeft, Stethoscope, FileText, Ambulance, Undo2, Siren } from 'lucide-react';
import { WebAuthnService } from '../../infrastructure/biometrics/WebAuthnService';
import { EmployeeProfile, AttendanceStatus } from '../../domain/types';
import { getUsersForLoginSecure } from '../../actions/sync-v2';
import { validateEmployeePinSecure, getEmployeeStatusForKiosk, registerAttendanceSecure, getBatchEmployeeStatusForKiosk, validateKioskExitPin } from '../../actions/attendance-v2';
import { NumericKeypad } from '../components/kiosk/NumericKeypad';
import { ExitKioskModal } from '../components/kiosk/ExitKioskModal';

const AttendanceKioskPage: React.FC = () => {
    const navigate = useNavigate();
    const { registerAttendance, currentLocationId } = usePharmaStore();
    const [isLocked, setIsLocked] = useState(true);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [authMethod, setAuthMethod] = useState<'PIN' | 'BIOMETRIC' | null>(null);
    const [pin, setPin] = useState('');
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    // Local employees state - fetched directly from DB for standalone kiosk mode
    const [localEmployees, setLocalEmployees] = useState<EmployeeProfile[]>([]);
    const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
    // Mapa de estados reales de empleados
    const [employeeStatuses, setEmployeeStatuses] = useState<Record<string, { status: 'OUT' | 'IN' | 'LUNCH' | 'ON_PERMISSION'; lastTime?: string }>>({});
    // Estado del reloj en tiempo real
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Modal de confirmación para salir
    const [showExitModal, setShowExitModal] = useState(false);

    const handleExitClick = () => {
        setShowExitModal(true);
    };

    // Función para cargar estados de empleados
    const loadEmployeeStatuses = useCallback(async (employees: EmployeeProfile[]) => {
        if (employees.length === 0) return;
        const ids = employees.map(e => e.id);
        console.log('[Kiosk] Loading statuses for:', ids);
        const result = await getBatchEmployeeStatusForKiosk(ids);
        console.log('[Kiosk] Status result:', JSON.stringify(result, null, 2));
        if (result.success) {
            setEmployeeStatuses(result.statuses);
        }
    }, []);

    // Función de refresh manual
    const handleRefresh = async () => {
        if (localEmployees.length === 0 || isRefreshing) return;
        setIsRefreshing(true);
        await loadEmployeeStatuses(localEmployees);
        setIsRefreshing(false);
    };

    // Fetch employees from DB on unlock, filtered by current location
    useEffect(() => {
        if (!isLocked && localEmployees.length === 0) {
            setIsLoadingEmployees(true);
            getUsersForLoginSecure(currentLocationId || undefined)
                .then(async (result: { success: boolean; data?: any[]; error?: string }) => {
                    if (result.success && result.data) {
                        const emps = result.data as unknown as EmployeeProfile[];
                        setLocalEmployees(emps);
                        // Cargar estados reales
                        await loadEmployeeStatuses(emps);
                    }
                })
                .catch(console.error)
                .finally(() => setIsLoadingEmployees(false));
        }
    }, [isLocked, localEmployees.length, currentLocationId, loadEmployeeStatuses]);

    // Auto-refresh de estados cada 30 segundos
    useEffect(() => {
        if (isLocked || localEmployees.length === 0) return;

        const interval = setInterval(() => {
            loadEmployeeStatuses(localEmployees);
        }, 30000); // 30 segundos

        return () => clearInterval(interval);
    }, [isLocked, localEmployees, loadEmployeeStatuses]);

    // Actualizar reloj en tiempo real
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);


    // --- Activation Logic ---
    const handleUnlock = (adminPin: string) => {
        // Master PIN allows direct unlock without employee lookup
        const isMasterPin = adminPin === '1213';

        if (isMasterPin) {
            setIsLocked(false);
            setMessage({ text: 'Terminal activado ✓', type: 'success' });
            setTimeout(() => setMessage(null), 3000);
        } else {
            // For non-master PIN, we need employees loaded first
            // This handles admin/manager PIN validation
            setMessage({ text: 'PIN no autorizado', type: 'error' });
            setTimeout(() => setMessage(null), 3000);
        }
    };


    // --- Authentication Logic ---
    const [isValidating, setIsValidating] = useState(false);

    const handlePinSubmit = async () => {
        if (!selectedEmployee || isValidating) return;

        setIsValidating(true);
        try {
            // Validar PIN en backend (seguro con bcrypt)
            const result = await validateEmployeePinSecure(selectedEmployee.id, pin);

            if (result.valid) {
                onAuthSuccess();
            } else {
                setMessage({ text: result.error || 'PIN Incorrecto', type: 'error' });
                setPin('');
            }
        } catch (error) {
            setMessage({ text: 'Error de conexión', type: 'error' });
            setPin('');
        } finally {
            setIsValidating(false);
        }
    };




    const handleBiometricAuth = async () => {
        if (!selectedEmployee) return;

        // Verificar si tiene credenciales biométricas registradas
        if (!selectedEmployee.biometric_credentials || selectedEmployee.biometric_credentials.length === 0) {
            setMessage({ text: 'No tiene biometría registrada. Use PIN.', type: 'error' });
            return;
        }

        setMessage({ text: 'Coloque su dedo en el sensor...', type: 'success' });

        try {
            const credential = await WebAuthnService.authenticateCredential(selectedEmployee.biometric_credentials);
            if (credential) {
                handleAttendanceAction();
            } else {
                setMessage({ text: 'Autenticación fallida', type: 'error' });
            }
        } catch (error: any) {
            // Manejar errores específicos de WebAuthn
            if (error?.name === 'NotAllowedError') {
                setMessage({ text: 'Operación cancelada o tiempo agotado', type: 'error' });
            } else if (error?.name === 'SecurityError') {
                setMessage({ text: 'Error de seguridad. Intente con PIN.', type: 'error' });
            } else {
                setMessage({ text: 'Error biométrico. Use PIN.', type: 'error' });
            }
            console.error('[Biometric Auth Error]', error);
        }
    };

    const handleAttendanceAction = () => {
        if (!selectedEmployee) return;

        let action: 'CHECK_IN' | 'CHECK_OUT' | 'LUNCH_START' | 'LUNCH_END' = 'CHECK_IN';
        const status = selectedEmployee.current_status || 'OUT';

        // Determine next logical action
        if (status === 'OUT') action = 'CHECK_IN';
        if (status === 'IN') {
            // Ask user preference in a real app, here we toggle for simplicity or show options
            // For this MVP, if IN, we show options in the UI before this function is called, 
            // BUT since we are inside the auth flow, let's assume we need to know what they want to do.
            // Let's simplify: If IN, default to CHECK_OUT, but we should probably have selected the action BEFORE auth.
            // REFACTOR: Let's select action AFTER auth for security, or select action THEN auth.
            // Standard Kiosk: Select User -> Auth -> Select Action (if multiple available) or Auto-Action.
        }

        // Since we need to support multiple actions from IN state (Lunch vs Out), 
        // we will show an Action Selection screen AFTER successful auth.
        setAuthMethod(null); // Close auth modal
        // We need a new state for "Authenticated Employee"
    };

    // Refactored Flow:
    // 1. Select Employee
    // 2. Authenticate (PIN/Bio)
    // 3. Show Actions based on current status

    const [authenticatedEmployee, setAuthenticatedEmployee] = useState<EmployeeProfile | null>(null);
    const [employeeStatus, setEmployeeStatus] = useState<'OUT' | 'IN' | 'LUNCH' | 'ON_PERMISSION'>('OUT');
    const [showSpecialMenu, setShowSpecialMenu] = useState(false);
    const [isLoadingStatus, setIsLoadingStatus] = useState(false);

    const onAuthSuccess = async () => {
        if (!selectedEmployee) return;

        // Obtener estado actual del backend
        setIsLoadingStatus(true);
        try {
            const statusResult = await getEmployeeStatusForKiosk(selectedEmployee.id);
            setEmployeeStatus(statusResult.status);
        } catch (e) {
            setEmployeeStatus('OUT'); // Default si falla
        }
        setIsLoadingStatus(false);
        setShowSpecialMenu(false); // Reset menu

        setAuthenticatedEmployee(selectedEmployee);
        setSelectedEmployee(null);
        setAuthMethod(null);
        setPin('');
        setMessage(null);
    };

    const processAction = async (type: 'CHECK_IN' | 'CHECK_OUT' | 'LUNCH_START' | 'LUNCH_END' | 'PERMISSION_START' | 'PERMISSION_END' | 'MEDICAL_LEAVE' | 'EMERGENCY') => {
        if (!authenticatedEmployee || !currentLocationId) return;

        // Map UI actions to Domain Types
        let attendanceType: any = type;
        if (type === 'LUNCH_START') attendanceType = 'BREAK_START';
        if (type === 'LUNCH_END') attendanceType = 'BREAK_END';

        try {
            const result = await registerAttendanceSecure({
                userId: authenticatedEmployee.id,
                type: attendanceType,
                locationId: currentLocationId,
                method: 'PIN',
                overtimeMinutes: 0
            });

            if (result.success) {
                const now = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                const actionLabels: Record<string, string> = {
                    'CHECK_IN': `✅ Entrada registrada a las ${now}`,
                    'CHECK_OUT': `🏠 Salida registrada a las ${now}`,
                    'LUNCH_START': `☕ Colación iniciada a las ${now}`,
                    'CHECK_IN': `✅ Entrada registrada a las ${now}`,
                    'CHECK_OUT': `🏠 Salida registrada a las ${now}`,
                    'LUNCH_START': `☕ Colación iniciada a las ${now}`,
                    'LUNCH_END': `🔙 Vuelta registrada a las ${now}`,
                    'PERMISSION_START': `📋 Permiso iniciado a las ${now}`,
                    'PERMISSION_END': `🔙 Retorno de permiso a las ${now}`,
                    'MEDICAL_LEAVE': `🏥 Salida médica registrada a las ${now}`,
                    'EMERGENCY': `🚨 Salida de emergencia a las ${now}`
                };
                setMessage({ text: actionLabels[type] || 'Marcaje registrado', type: 'success' });

                // Refrescar estados de todos los empleados
                await loadEmployeeStatuses(localEmployees);
            } else {
                setMessage({ text: result.error || 'Error al registrar', type: 'error' });
            }
        } catch (error) {
            setMessage({ text: 'Error de conexión', type: 'error' });
        }

        setTimeout(() => {
            setAuthenticatedEmployee(null);
            setEmployeeStatus('OUT');
            setMessage(null);
        }, 3000);
    };

    // --- Renders ---
    if (isLocked) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none touch-manipulation">
                {/* Background Ambience */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none opacity-50">
                    <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-sky-200/40 rounded-full blur-[100px]" />
                    <div className="absolute bottom-[10%] right-[20%] w-[500px] h-[500px] bg-teal-100/30 rounded-full blur-[100px]" />
                </div>

                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white/80 backdrop-blur-xl p-8 rounded-[40px] shadow-2xl border border-white/50 w-full max-w-md relative z-10"
                >
                    <div className="flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-gradient-to-tr from-sky-400 to-indigo-500 rounded-[28px] flex items-center justify-center text-white mb-6 shadow-lg shadow-sky-200">
                            <Lock size={32} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-2">Kiosco de Asistencia</h1>
                        <p className="text-slate-500 font-medium mb-8">
                            Terminal bloqueado. Se requiere <span className="text-sky-600 font-bold">PIN de activación</span>.
                        </p>

                        {/* PIN Display */}
                        <div className="flex justify-center gap-4 mb-8">
                            {[0, 1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-sky-500 scale-125' : 'bg-slate-200'
                                        }`}
                                />
                            ))}
                        </div>

                        {/* Keypad */}
                        <NumericKeypad
                            onDigit={(d) => {
                                if (pin.length < 4) {
                                    const newPin = pin + d;
                                    setPin(newPin);
                                    if (newPin.length === 4) {
                                        // Small delay for UX
                                        setTimeout(() => {
                                            handleUnlock(newPin);
                                            setPin('');
                                        }, 300);
                                    }
                                }
                            }}
                            onDelete={() => setPin(prev => prev.slice(0, -1))}
                            disabled={pin.length === 4}
                        />

                        {/* Error Message */}
                        {message && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`mt-6 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${message.type === 'success'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-red-100 text-red-700'
                                    }`}
                            >
                                {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                                {message.text}
                            </motion.div>
                        )}

                    </div>

                    <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col items-center gap-4">
                        <button
                            onClick={handleExitClick}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-all"
                        >
                            <Home size={16} />
                            Volver al Inicio
                        </button>
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Farmacias Vallenar Suit v2.1</p>
                    </div>
                </motion.div>
            </div>
        );
    }

    if (authenticatedEmployee) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                {/* Background Ambience */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none opacity-50">
                    <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-sky-200/40 rounded-full blur-[100px]" />
                    <div className="absolute bottom-[10%] right-[20%] w-[500px] h-[500px] bg-teal-100/30 rounded-full blur-[100px]" />
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="z-10 bg-white p-10 rounded-[40px] shadow-2xl shadow-sky-900/10 max-w-lg w-full text-center border border-slate-100"
                >
                    <div className="w-24 h-24 bg-sky-50 rounded-[32px] flex items-center justify-center mx-auto mb-6 text-sky-600 font-black text-3xl border border-sky-100">
                        {authenticatedEmployee.name.charAt(0)}
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Hola, {authenticatedEmployee.name}</h2>
                    <p className="text-slate-500 mb-10 font-medium">Selecciona la acción para tu marcaje de hoy</p>

                    <div className="grid gap-4">
                        {employeeStatus === 'OUT' && (
                            <button
                                onClick={() => processAction('CHECK_IN')}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-4 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] group"
                            >
                                <div className="p-2 bg-emerald-400 rounded-xl group-hover:scale-110 transition-transform">
                                    <LogOut className="rotate-180" size={24} />
                                </div>
                                <span>INICIAR JORNADA</span>
                            </button>
                        )}

                        {(employeeStatus === 'IN' || employeeStatus === 'LUNCH') && !showSpecialMenu && (
                            <>
                                {employeeStatus === 'IN' && (
                                    <>
                                        <button
                                            onClick={() => processAction('LUNCH_START')}
                                            className="bg-amber-500 hover:bg-amber-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-4 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] group"
                                        >
                                            <div className="p-2 bg-amber-400 rounded-xl group-hover:scale-110 transition-transform">
                                                <Coffee size={24} />
                                            </div>
                                            <span>SALIDA A COLACIÓN</span>
                                        </button>

                                        <button
                                            onClick={() => setShowSpecialMenu(true)}
                                            className="bg-slate-700 hover:bg-slate-800 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-4 transition-all shadow-lg shadow-slate-500/20 active:scale-[0.98] group"
                                        >
                                            <div className="p-2 bg-slate-600 rounded-xl group-hover:scale-110 transition-transform">
                                                <FileText size={24} />
                                            </div>
                                            <span>SALIDA ESPECIAL / PERMISO</span>
                                        </button>
                                    </>
                                )}

                                {employeeStatus === 'LUNCH' && (
                                    <button
                                        onClick={() => processAction('LUNCH_END')}
                                        className="bg-sky-500 hover:bg-sky-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-4 transition-all shadow-lg shadow-sky-500/20 active:scale-[0.98] group"
                                    >
                                        <div className="p-2 bg-sky-400 rounded-xl group-hover:scale-110 transition-transform">
                                            <ArrowRight size={24} />
                                        </div>
                                        <span>VUELTA DE COLACIÓN</span>
                                    </button>
                                )}

                                {employeeStatus === 'IN' && (
                                    <button
                                        onClick={() => processAction('CHECK_OUT')}
                                        className="bg-red-500 hover:bg-red-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-4 transition-all shadow-lg shadow-red-500/20 active:scale-[0.98] group"
                                    >
                                        <div className="p-2 bg-red-400 rounded-xl group-hover:scale-110 transition-transform">
                                            <LogOut size={24} />
                                        </div>
                                        <span>FINALIZAR JORNADA</span>
                                    </button>
                                )}
                            </>
                        )}

                        {/* Special Menu Items */}
                        {showSpecialMenu && (
                            <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                <button
                                    onClick={() => processAction('MEDICAL_LEAVE')}
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white p-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
                                >
                                    <Stethoscope size={24} />
                                    <span>TRÁMITE MÉDICO</span>
                                </button>
                                <button
                                    onClick={() => processAction('PERMISSION_START')}
                                    className="bg-violet-500 hover:bg-violet-600 text-white p-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-lg shadow-violet-500/20 active:scale-[0.98]"
                                >
                                    <FileText size={24} />
                                    <span>PERMISO PERSONAL</span>
                                </button>
                                <button
                                    onClick={() => processAction('EMERGENCY')}
                                    className="bg-rose-600 hover:bg-rose-700 text-white p-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-lg shadow-rose-600/20 active:scale-[0.98]"
                                >
                                    <Siren size={24} />
                                    <span>EMERGENCIA</span>
                                </button>
                                <button
                                    onClick={() => setShowSpecialMenu(false)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 mt-2 transition-colors"
                                >
                                    <Undo2 size={20} />
                                    Volver
                                </button>
                            </div>
                        )}

                        {/* Return from Permission */}
                        {employeeStatus === 'ON_PERMISSION' && (
                            <>
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-center">
                                    <p className="text-amber-800 font-bold flex items-center justify-center gap-2">
                                        <Clock size={20} />
                                        Estás en Salida Especial
                                    </p>
                                    <p className="text-amber-600 text-sm mt-1">Marca tu retorno para continuar la jornada</p>
                                </div>

                                <button
                                    onClick={() => processAction('PERMISSION_END')}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-4 transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] group"
                                >
                                    <div className="p-2 bg-emerald-500 rounded-xl group-hover:scale-110 transition-transform">
                                        <ArrowRight size={24} />
                                    </div>
                                    <span>RETORNO DE PERMISO</span>
                                </button>

                                <button
                                    onClick={() => processAction('CHECK_OUT')}
                                    className="bg-slate-200 hover:bg-slate-300 text-slate-600 p-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 mt-4 transition-all"
                                >
                                    <LogOut size={20} />
                                    <span>FINALIZAR JORNADA (YA NO VUELVO)</span>
                                </button>
                            </>
                        )}
                    </div>


                    <button
                        onClick={() => setAuthenticatedEmployee(null)}
                        className="mt-10 text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest text-xs"
                    >
                        Volver a la Grilla
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* Header */}
            <div className="bg-white p-8 border-b border-slate-100 flex justify-between items-center shadow-sm relative z-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600 border border-sky-100">
                        <Clock size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Reloj Control</h1>
                        <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">
                            {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <p className="text-3xl font-black text-slate-800 tabular-nums leading-none">
                            {currentTime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-sky-600 font-black uppercase tracking-widest mt-1">Conectado a Sucursal</p>
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition-all border border-sky-100 disabled:opacity-50"
                        title="Refrescar estados"
                    >
                        <RefreshCw size={22} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setIsLocked(true)}
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-500 transition-all border border-slate-100"
                        title="Bloquear terminal"
                    >
                        <Lock size={22} />
                    </button>
                    <button
                        onClick={handleExitClick}
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-500 transition-all border border-slate-100"
                        title="Volver al inicio"
                    >
                        <Home size={22} />
                    </button>
                </div>
            </div>

            {/* Employee Grid */}
            <div className="flex-1 p-8 overflow-y-auto">
                {isLoadingEmployees ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <Loader2 className="w-12 h-12 text-sky-500 animate-spin" />
                        <p className="text-slate-500 font-medium">Cargando empleados...</p>
                    </div>
                ) : localEmployees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <AlertTriangle className="w-12 h-12 text-amber-500" />
                        <p className="text-slate-500 font-medium">No se encontraron empleados</p>
                        <p className="text-sm text-slate-400">Verifique la conexión con la base de datos</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 max-w-7xl mx-auto">
                        {localEmployees.map(emp => {
                            const status = employeeStatuses[emp.id]?.status || 'OUT';
                            const lastTime = employeeStatuses[emp.id]?.lastTime;
                            return (
                                <motion.button
                                    key={emp.id}
                                    whileHover={{ scale: 1.02, y: -5 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => { setSelectedEmployee(emp); setAuthMethod('BIOMETRIC'); }}
                                    className="bg-white p-8 rounded-[32px] shadow-sm hover:shadow-xl hover:shadow-sky-900/5 transition-all flex flex-col items-center text-center relative border border-slate-100 hover:border-sky-200 group"
                                >
                                    {/* Status Indicator */}
                                    <div className={`absolute top-6 right-6 w-3.5 h-3.5 rounded-full border-2 border-white ${status === 'IN' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse' :
                                        status === 'LUNCH' ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]' :
                                            status === 'ON_PERMISSION' ? 'bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.5)]' : 'bg-slate-300'
                                        }`} />

                                    <div className="w-24 h-24 bg-sky-50 rounded-[28px] flex items-center justify-center mb-5 text-sky-600 font-black text-3xl border border-sky-100 group-hover:scale-110 transition-transform">
                                        {emp.name.charAt(0)}
                                    </div>
                                    <h3 className="font-bold text-slate-900 text-lg mb-1">{emp.name}</h3>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">{emp.role}</p>

                                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase ${status === 'IN' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                        status === 'LUNCH' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                            status === 'ON_PERMISSION' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-50 text-slate-500 border border-slate-100'
                                        }`}>
                                        {status === 'IN' ? 'EN JORNADA' :
                                            status === 'LUNCH' ? 'COLACIÓN' :
                                                status === 'ON_PERMISSION' ? 'SALIDA ESPECIAL' : 'FUERA'}
                                    </div>
                                    {lastTime && (
                                        <p className="text-[10px] text-slate-400 mt-2">Último: {lastTime}</p>
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>
                )}
            </div>


            {/* Auth Modal */}
            <AnimatePresence>
                {selectedEmployee && authMethod && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-[40px] p-10 max-w-md w-full relative shadow-2xl border border-slate-100"
                        >
                            <button
                                onClick={() => { setSelectedEmployee(null); setAuthMethod(null); setPin(''); setMessage(null); }}
                                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={28} />
                            </button>

                            <div className="text-center mb-10">
                                <div className="w-24 h-24 bg-sky-50 rounded-[32px] flex items-center justify-center mx-auto mb-6 text-sky-600 font-black text-3xl border border-sky-100">
                                    {selectedEmployee.name.charAt(0)}
                                </div>
                                <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">Hola, {selectedEmployee.name}</h3>
                                <p className="text-slate-500 font-medium mt-1">Verifica tu identidad para marcar</p>
                            </div>

                            {message && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={`mb-8 p-4 rounded-xl text-center font-bold text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                                        }`}>
                                    {message.text}
                                </motion.div>
                            )}

                            {authMethod === 'BIOMETRIC' ? (
                                <div className="space-y-8">
                                    <button
                                        onClick={handleBiometricAuth}
                                        className="w-full py-10 border-2 border-dashed border-sky-200 bg-sky-50/50 rounded-3xl flex flex-col items-center gap-4 hover:bg-sky-50 hover:border-sky-300 transition-all group relative overflow-hidden active:scale-[0.98]"
                                    >
                                        <div className="absolute inset-0 bg-sky-100 opacity-0 group-hover:opacity-20 transition-opacity" />
                                        <Fingerprint size={56} className="text-sky-500 group-hover:scale-110 transition-transform relative z-10" />
                                        <span className="font-bold text-sky-700 relative z-10">Sensor Huella Digital</span>
                                    </button>

                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                                        <div className="relative flex justify-center text-xs uppercase font-black tracking-widest"><span className="px-4 bg-white text-slate-400">O utiliza tu PIN</span></div>
                                    </div>

                                    <button
                                        onClick={() => setAuthMethod('PIN')}
                                        className="w-full py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-200 active:scale-[0.98]"
                                    >
                                        Ingresar PIN Manual
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center w-full">
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-6 text-center">Ingrese su PIN</label>

                                    {/* PIN Dots */}
                                    <div className="flex justify-center gap-4 mb-8">
                                        {[0, 1, 2, 3].map((i) => (
                                            <div
                                                key={i}
                                                className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-sky-500 scale-125' : 'bg-slate-200'
                                                    }`}
                                            />
                                        ))}
                                    </div>

                                    <NumericKeypad
                                        onDigit={(d) => {
                                            if (pin.length < 4) setPin(prev => prev + d);
                                        }}
                                        onDelete={() => setPin(prev => prev.slice(0, -1))}
                                        disabled={isValidating || pin.length === 4}
                                        className="mb-6"
                                    />

                                    <div className="w-full flex flex-col gap-3">
                                        <button
                                            onClick={() => handlePinSubmit()}
                                            disabled={isValidating || pin.length < 4}
                                            className="w-full bg-sky-600 hover:bg-sky-500 text-white py-4 rounded-2xl font-bold shadow-xl shadow-sky-600/20 transition-all transform active:scale-[0.98] text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                                        >
                                            {isValidating ? <Loader2 className="animate-spin" /> : 'VERIFICAR'}
                                        </button>

                                        <button
                                            onClick={() => setAuthMethod('BIOMETRIC')}
                                            className="w-full py-3 text-slate-400 font-bold hover:text-sky-600 transition-colors flex items-center justify-center gap-2 touch-manipulation"
                                        >
                                            <Fingerprint size={18} /> Usar Biometría
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* EXIT KIOSK MODAL */}
            <ExitKioskModal
                isOpen={showExitModal}
                onClose={() => setShowExitModal(false)}
            />
        </div>
    );
};

export default AttendanceKioskPage;
