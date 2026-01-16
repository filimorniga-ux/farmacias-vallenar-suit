import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, User, Clock, Fingerprint, LogOut, CheckCircle, AlertTriangle, Coffee, ArrowRight, X } from 'lucide-react';
import { WebAuthnService } from '../../infrastructure/biometrics/WebAuthnService';
import { EmployeeProfile, AttendanceStatus } from '../../domain/types';

const AttendanceKioskPage: React.FC = () => {
    const { employees, registerAttendance, user } = usePharmaStore();
    const [isLocked, setIsLocked] = useState(true);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [authMethod, setAuthMethod] = useState<'PIN' | 'BIOMETRIC' | null>(null);
    const [pin, setPin] = useState('');
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    // --- Activation Logic ---
    // --- Activation Logic ---
    const handleUnlock = (adminPin: string) => {
        const adminUser = employees.find(e => e.access_pin === adminPin);

        // Master PIN fallback (1213) or valid Admin/Manager employee
        const isMasterPin = adminPin === '1213';
        const isAuthorizedAdmin = adminUser && (adminUser.role === 'MANAGER' || adminUser.role === 'ADMIN');

        if (isMasterPin || isAuthorizedAdmin) {
            setIsLocked(false);
            setMessage({ text: `Terminal activado ${isMasterPin ? 'vía PIN Maestro' : `por ${adminUser?.name}`}`, type: 'success' });
            setTimeout(() => setMessage(null), 3000);
        } else {
            setMessage({ text: 'PIN no autorizado. Se requiere MANAGER o ADMIN.', type: 'error' });
            setTimeout(() => setMessage(null), 3000);
        }
    };

    // --- Authentication Logic ---
    const handlePinSubmit = () => {
        if (!selectedEmployee) return;
        if (pin === selectedEmployee.access_pin) {
            handleAttendanceAction();
        } else {
            setMessage({ text: 'PIN Incorrecto', type: 'error' });
            setPin('');
        }
    };

    const handleBiometricAuth = async () => {
        if (!selectedEmployee) return;
        setMessage({ text: 'Coloque su dedo en el sensor...', type: 'success' });

        try {
            const credential = await WebAuthnService.authenticateCredential(selectedEmployee.biometric_credentials || []);
            if (credential) {
                handleAttendanceAction();
            } else {
                setMessage({ text: 'Autenticación fallida', type: 'error' });
            }
        } catch (error) {
            setMessage({ text: 'Error de autenticación biométrica', type: 'error' });
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

    const onAuthSuccess = () => {
        setAuthenticatedEmployee(selectedEmployee);
        setSelectedEmployee(null);
        setAuthMethod(null);
        setPin('');
        setMessage(null);
    };

    const processAction = (type: 'CHECK_IN' | 'CHECK_OUT' | 'LUNCH_START' | 'LUNCH_END') => {
        if (!authenticatedEmployee) return;

        // Map UI actions to Domain Types
        let attendanceType: any = type;
        if (type === 'LUNCH_START') attendanceType = 'BREAK_START';
        if (type === 'LUNCH_END') attendanceType = 'BREAK_END';

        registerAttendance(authenticatedEmployee.id, attendanceType);

        setMessage({ text: `Marcaje registrado: ${type}`, type: 'success' });

        setTimeout(() => {
            setAuthenticatedEmployee(null);
            setMessage(null);
        }, 3000);
    };

    // --- Renders ---

    if (isLocked) {
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
                    className="z-10 bg-white border border-slate-200 p-10 md:p-14 rounded-[40px] shadow-2xl shadow-sky-900/5 max-w-lg w-full text-center"
                >
                    <div className="w-24 h-24 bg-sky-50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-sky-100">
                        <Lock size={48} className="text-sky-500" />
                    </div>

                    <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">Kiosco de Asistencia</h1>
                    <p className="text-slate-500 mb-10 text-lg leading-relaxed font-medium">Terminal bloqueado. Se requiere PIN de administración para activar el dispositivo.</p>

                    <div className="w-full max-w-xs mx-auto">
                        <input
                            type="password"
                            placeholder="PIN Maestro (1213)"
                            className="w-full text-center text-4xl tracking-[0.5em] bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-4 text-slate-900 focus:border-sky-500 focus:bg-white outline-none mb-6 transition-all font-bold placeholder:tracking-normal placeholder:text-lg placeholder:font-normal"
                            maxLength={4}
                            onChange={(e) => {
                                if (e.target.value.length === 4) {
                                    handleUnlock(e.target.value);
                                    e.target.value = ''; // Reset input
                                }
                            }}
                        />
                        {message && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`p-4 rounded-xl text-sm font-bold text-center ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}
                            >
                                {message.text}
                            </motion.div>
                        )}
                    </div>

                    <div className="mt-14 pt-8 border-t border-slate-100">
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
                        {authenticatedEmployee.current_status === 'OUT' && (
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

                        {(authenticatedEmployee.current_status === 'IN' || authenticatedEmployee.current_status === 'LUNCH') && (
                            <>
                                {authenticatedEmployee.current_status === 'IN' && (
                                    <button
                                        onClick={() => processAction('LUNCH_START')}
                                        className="bg-amber-500 hover:bg-amber-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-4 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] group"
                                    >
                                        <div className="p-2 bg-amber-400 rounded-xl group-hover:scale-110 transition-transform">
                                            <Coffee size={24} />
                                        </div>
                                        <span>SALIDA A COLACIÓN</span>
                                    </button>
                                )}

                                {authenticatedEmployee.current_status === 'LUNCH' && (
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

                                {authenticatedEmployee.current_status === 'IN' && (
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
                            {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-sky-600 font-black uppercase tracking-widest mt-1">Conectado a Sucursal</p>
                    </div>
                    <button
                        onClick={() => setIsLocked(true)}
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all border border-slate-100"
                    >
                        <Lock size={22} />
                    </button>
                </div>
            </div>

            {/* Employee Grid */}
            <div className="flex-1 p-8 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 max-w-7xl mx-auto">
                    {employees.map(emp => (
                        <motion.button
                            key={emp.id}
                            whileHover={{ scale: 1.02, y: -5 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => { setSelectedEmployee(emp); setAuthMethod('BIOMETRIC'); }}
                            className="bg-white p-8 rounded-[32px] shadow-sm hover:shadow-xl hover:shadow-sky-900/5 transition-all flex flex-col items-center text-center relative border border-slate-100 hover:border-sky-200 group"
                        >
                            {/* Status Indicator */}
                            <div className={`absolute top-6 right-6 w-3.5 h-3.5 rounded-full border-2 border-white ${emp.current_status === 'IN' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse' :
                                emp.current_status === 'LUNCH' ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'bg-slate-300'
                                }`} />

                            <div className="w-24 h-24 bg-sky-50 rounded-[28px] flex items-center justify-center mb-5 text-sky-600 font-black text-3xl border border-sky-100 group-hover:scale-110 transition-transform">
                                {emp.name.charAt(0)}
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg mb-1">{emp.name}</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4">{emp.role}</p>

                            <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase ${emp.current_status === 'IN' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                emp.current_status === 'LUNCH' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-50 text-slate-500 border border-slate-100'
                                }`}>
                                {emp.current_status === 'IN' ? 'EN JORNADA' :
                                    emp.current_status === 'LUNCH' ? 'COLACIÓN' : 'FUERA'}
                            </div>
                        </motion.button>
                    ))}
                </div>
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
                                <div className="space-y-8">
                                    <div>
                                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-4 text-center">PIN de 4 dígitos</label>
                                        <input
                                            type="password"
                                            maxLength={4}
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value)}
                                            className="w-full text-center text-5xl tracking-[0.5em] font-black py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-sky-500 focus:bg-white outline-none transition-all text-slate-900"
                                            placeholder="••••"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (pin === selectedEmployee.access_pin) {
                                                onAuthSuccess();
                                            } else {
                                                setMessage({ text: 'PIN Incorrecto', type: 'error' });
                                                setPin('');
                                            }
                                        }}
                                        className="w-full bg-sky-600 hover:bg-sky-500 text-white py-5 rounded-2xl font-bold shadow-xl shadow-sky-600/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] text-lg border-b-4 border-sky-800"
                                    >
                                        VERIFICAR PIN
                                    </button>
                                    <button
                                        onClick={() => setAuthMethod('BIOMETRIC')}
                                        className="w-full py-3 text-slate-400 font-bold hover:text-sky-600 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Fingerprint size={18} /> Volver a Biometría
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AttendanceKioskPage;
