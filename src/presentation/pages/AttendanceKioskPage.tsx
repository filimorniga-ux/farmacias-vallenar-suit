import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, User, Clock, Fingerprint, LogOut, CheckCircle, AlertTriangle, Coffee, ArrowRight } from 'lucide-react';
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
    const handleUnlock = () => {
        const password = prompt("Ingrese contraseña de GERENTE para activar el Kiosco:");
        if (password === 'admin123') { // Hardcoded for demo
            setIsLocked(false);
        } else {
            alert("Contraseña incorrecta");
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
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
                <Lock size={64} className="mb-6 text-slate-500" />
                <h1 className="text-3xl font-bold mb-2">Terminal Bloqueado</h1>
                <p className="text-slate-400 mb-8 text-center max-w-md">
                    Este dispositivo no está activo como Kiosco de Asistencia.
                    Se requiere autorización de un Gerente para activarlo.
                </p>
                <button
                    onClick={handleUnlock}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all"
                >
                    Activar Terminal
                </button>
            </div>
        );
    }

    if (authenticatedEmployee) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full text-center">
                    <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 font-bold text-3xl">
                        {authenticatedEmployee.name.charAt(0)}
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-1">Hola, {authenticatedEmployee.name}</h2>
                    <p className="text-slate-500 mb-8">Selecciona tu marcaje</p>

                    <div className="grid gap-4">
                        {authenticatedEmployee.current_status === 'OUT' && (
                            <button
                                onClick={() => processAction('CHECK_IN')}
                                className="bg-green-500 hover:bg-green-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-all"
                            >
                                <LogOut className="rotate-180" /> ENTRADA
                            </button>
                        )}

                        {(authenticatedEmployee.current_status === 'IN' || authenticatedEmployee.current_status === 'LUNCH') && (
                            <>
                                {authenticatedEmployee.current_status === 'IN' && (
                                    <button
                                        onClick={() => processAction('LUNCH_START')}
                                        className="bg-amber-500 hover:bg-amber-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-all"
                                    >
                                        <Coffee /> SALIDA A COLACIÓN
                                    </button>
                                )}

                                {authenticatedEmployee.current_status === 'LUNCH' && (
                                    <button
                                        onClick={() => processAction('LUNCH_END')}
                                        className="bg-blue-500 hover:bg-blue-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-all"
                                    >
                                        <ArrowRight /> VUELTA DE COLACIÓN
                                    </button>
                                )}

                                {authenticatedEmployee.current_status === 'IN' && (
                                    <button
                                        onClick={() => processAction('CHECK_OUT')}
                                        className="bg-red-500 hover:bg-red-600 text-white p-6 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-all"
                                    >
                                        <LogOut /> FIN DE JORNADA
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    <button
                        onClick={() => setAuthenticatedEmployee(null)}
                        className="mt-8 text-slate-400 hover:text-slate-600 font-medium"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* Header */}
            <div className="bg-white p-6 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Clock className="text-blue-600" size={32} />
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Control de Asistencia</h1>
                        <p className="text-sm text-slate-500">{new Date().toLocaleDateString()} - {new Date().toLocaleTimeString()}</p>
                    </div>
                </div>
                <button onClick={() => setIsLocked(true)} className="text-slate-400 hover:text-red-500">
                    <Lock size={20} />
                </button>
            </div>

            {/* Employee Grid */}
            <div className="flex-1 p-6 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {employees.map(emp => (
                        <motion.button
                            key={emp.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => { setSelectedEmployee(emp); setAuthMethod('BIOMETRIC'); }}
                            className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center relative overflow-hidden"
                        >
                            {/* Status Indicator */}
                            <div className={`absolute top-4 right-4 w-4 h-4 rounded-full ${emp.current_status === 'IN' ? 'bg-green-500 animate-pulse' :
                                emp.current_status === 'LUNCH' ? 'bg-amber-500' : 'bg-slate-300'
                                }`} />

                            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-500 font-bold text-2xl">
                                {emp.name.charAt(0)}
                            </div>
                            <h3 className="font-bold text-slate-800 text-lg">{emp.name}</h3>
                            <p className="text-sm text-slate-500">{emp.role}</p>
                            <span className={`mt-3 px-3 py-1 rounded-full text-xs font-bold ${emp.current_status === 'IN' ? 'bg-green-100 text-green-700' :
                                emp.current_status === 'LUNCH' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                {emp.current_status === 'IN' ? 'TRABAJANDO' :
                                    emp.current_status === 'LUNCH' ? 'EN COLACIÓN' : 'FUERA'}
                            </span>
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
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full relative"
                        >
                            <button
                                onClick={() => { setSelectedEmployee(null); setAuthMethod(null); setPin(''); setMessage(null); }}
                                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                            >
                                <LogOut size={24} />
                            </button>

                            <div className="text-center mb-8">
                                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 font-bold text-2xl">
                                    {selectedEmployee.name.charAt(0)}
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">Hola, {selectedEmployee.name}</h3>
                                <p className="text-slate-500">Verifica tu identidad para continuar</p>
                            </div>

                            {message && (
                                <div className={`mb-6 p-4 rounded-xl text-center font-bold ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                    {message.text}
                                </div>
                            )}

                            {authMethod === 'BIOMETRIC' ? (
                                <div className="space-y-6">
                                    <button
                                        onClick={handleBiometricAuth}
                                        className="w-full py-8 border-2 border-dashed border-blue-300 bg-blue-50 rounded-2xl flex flex-col items-center gap-3 hover:bg-blue-100 transition-colors group"
                                    >
                                        <Fingerprint size={48} className="text-blue-500 group-hover:scale-110 transition-transform" />
                                        <span className="font-bold text-blue-700">Tocar Sensor de Huella</span>
                                    </button>

                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                                        <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-slate-500">O usa tu PIN</span></div>
                                    </div>

                                    <button
                                        onClick={() => setAuthMethod('PIN')}
                                        className="w-full py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                                    >
                                        Ingresar PIN Manualmente
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Ingresa tu PIN de 4 dígitos</label>
                                        <input
                                            type="password"
                                            maxLength={4}
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value)}
                                            className="w-full text-center text-4xl tracking-widest font-bold py-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none"
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
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all"
                                    >
                                        Confirmar PIN
                                    </button>
                                    <button
                                        onClick={() => setAuthMethod('BIOMETRIC')}
                                        className="w-full py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                                    >
                                        Volver a Huella Digital
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
