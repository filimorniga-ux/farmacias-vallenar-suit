import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, Clock, Coffee, LogOut, CheckCircle, AlertTriangle, Stethoscope, FileText, Ambulance, ArrowLeftCircle, Lock, Unlock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePharmaStore } from '../store/useStore';
import { EmployeeProfile, AttendanceType } from '../../domain/types';
import { toast } from 'sonner';
import { WebAuthnService } from '../../infrastructure/biometrics/WebAuthnService';

const AccessControlPage: React.FC = () => {
    const { employees, registerAttendance } = usePharmaStore();

    // Security State
    const [isKioskActive, setIsKioskActive] = useState(false);
    const [adminPin, setAdminPin] = useState('');

    // User Flow State
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [pin, setPin] = useState('');
    const [status, setStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [actionType, setActionType] = useState<AttendanceType | ''>('');
    const [showSpecialMenu, setShowSpecialMenu] = useState(false);
    const [observation, setObservation] = useState('');

    // Filter active employees for the wall
    const activeEmployees = useMemo(() => employees.filter(e => e.status === 'ACTIVE'), [employees]);

    const handleUnlock = (e: React.FormEvent) => {
        e.preventDefault();
        const admin = employees.find(emp => emp.access_pin === adminPin && (emp.role === 'MANAGER' || emp.role === 'ADMIN'));
        if (admin) {
            setIsKioskActive(true);
            toast.success(`Terminal Activado por ${admin.name}`);
            setAdminPin('');
        } else {
            toast.error('PIN no autorizado');
            setAdminPin('');
        }
    };

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedEmployee || !actionType) return;

        if (pin === selectedEmployee.access_pin) {
            // Capture Evidence (Photo)
            const evidencePhoto = captureEvidence();

            // Register Attendance
            registerAttendance(selectedEmployee.id, actionType as AttendanceType, observation, evidencePhoto);

            setStatus('SUCCESS');
            toast.success(`Marca registrada: ${actionType}`);

            setTimeout(() => {
                setStatus('IDLE');
                setSelectedEmployee(null);
                setPin('');
                setActionType('');
                setObservation('');
                setShowSpecialMenu(false);
            }, 3000);
        } else {
            setStatus('ERROR');
            toast.error('PIN Incorrecto');
            setPin('');
        }
    };

    // --- BIOMETRICS & CAMERA ---
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        // Initialize Camera when kiosk is active
        if (isKioskActive) {
            navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
                .then(stream => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                })
                .catch(err => console.error("Error accessing camera:", err));
        }
    }, [isKioskActive]);

    const captureEvidence = (): string | undefined => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            if (context) {
                context.drawImage(videoRef.current, 0, 0, 320, 240);
                return canvasRef.current.toDataURL('image/jpeg', 0.5); // Low quality for storage
            }
        }
        return undefined;
    };

    const handleBiometricLogin = async () => {
        if (!selectedEmployee || !actionType) return;

        try {
            toast.info('Coloque su huella o rostro...');

            // Pass registered credentials to allow 1:1 verification
            const allowedCredentials = selectedEmployee.biometric_credentials || [];
            const credential = await WebAuthnService.authenticateCredential(allowedCredentials);

            if (credential) {
                // In a real app, we would verify the credential ID against the user's registered credentials
                // For this demo, we assume success if the device authenticates

                const evidencePhoto = captureEvidence();
                registerAttendance(selectedEmployee.id, actionType as AttendanceType, observation, evidencePhoto);

                setStatus('SUCCESS');
                toast.success(`Marca Biométrica Exitosa: ${actionType}`);

                setTimeout(() => {
                    setStatus('IDLE');
                    setSelectedEmployee(null);
                    setPin('');
                    setActionType('');
                    setObservation('');
                    setShowSpecialMenu(false);
                }, 3000);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error de autenticación biométrica');
        }
    };

    const handleActionSelect = (type: AttendanceType) => {
        setActionType(type);
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Buenos días';
        if (hour < 19) return 'Buenas tardes';
        return 'Buenas noches';
    };

    // --- LOCK SCREEN ---
    if (!isKioskActive) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
                <div className="w-full max-w-md text-center">
                    <div className="mb-8 flex justify-center">
                        <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center border-4 border-slate-800">
                            <Lock size={40} className="text-slate-600" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold text-slate-200 mb-2">Terminal Desactivado</h1>
                    <p className="text-slate-500 mb-8">Ingrese PIN de Supervisor para activar</p>

                    <form onSubmit={handleUnlock}>
                        <input type="text" autoComplete="username" className="hidden" readOnly value="admin" />
                        <input
                            type="password"
                            maxLength={4}
                            autoFocus
                            className="w-full text-center text-5xl tracking-[1em] font-bold py-6 bg-slate-900 border-2 border-slate-800 rounded-2xl focus:border-cyan-600 focus:outline-none text-white mb-8 transition-colors"
                            value={adminPin}
                            onChange={(e) => setAdminPin(e.target.value)}
                            placeholder="••••"
                            autoComplete="current-password"
                        />
                        <button
                            type="submit"
                            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            <Unlock size={20} />
                            ACTIVAR TERMINAL
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
            <div className="w-full max-w-6xl">
                <header className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-white mb-2">Control de Asistencia</h1>
                    <p className="text-slate-400 text-xl capitalize">{new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <p className="text-cyan-400 text-3xl font-mono font-bold mt-2">
                        {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </header>

                <AnimatePresence mode="wait">
                    {!selectedEmployee ? (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6"
                        >
                            {activeEmployees.map(emp => (
                                <motion.button
                                    key={emp.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setSelectedEmployee(emp)}
                                    className={`rounded-3xl p-6 flex flex-col items-center gap-4 transition border group relative overflow-hidden ${emp.current_status === 'IN'
                                        ? 'bg-slate-800 border-slate-700 hover:border-emerald-500'
                                        : emp.current_status === 'LUNCH'
                                            ? 'bg-slate-800/50 border-orange-900/30 hover:border-orange-500'
                                            : 'bg-slate-800/50 border-slate-800 hover:border-cyan-500'
                                        }`}
                                >
                                    <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white transition-colors ${emp.current_status === 'IN' ? 'bg-emerald-600' :
                                        emp.current_status === 'LUNCH' ? 'bg-orange-600' :
                                            emp.current_status === 'ON_PERMISSION' ? 'bg-amber-600' :
                                                'bg-slate-600 group-hover:bg-cyan-600'
                                        }`}>
                                        {emp.name.charAt(0)}
                                    </div>
                                    <div className="text-center z-10">
                                        <h3 className="text-lg font-bold text-white leading-tight mb-1">{emp.name.split(' ')[0]}</h3>
                                        <p className="text-slate-400 text-xs">{emp.job_title?.replace(/_/g, ' ')}</p>
                                    </div>
                                    {emp.current_status === 'IN' && (
                                        <div className="absolute top-4 right-4 w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                    )}
                                    {emp.current_status === 'LUNCH' && (
                                        <div className="absolute top-4 right-4"><Coffee size={16} className="text-orange-500" /></div>
                                    )}
                                </motion.button>
                            ))}
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white rounded-[3rem] p-12 max-w-3xl mx-auto shadow-2xl relative overflow-hidden"
                        >
                            {status === 'SUCCESS' ? (
                                <div className="text-center py-12">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="inline-block mb-6"
                                    >
                                        <CheckCircle size={100} className="text-emerald-500" />
                                    </motion.div>
                                    <h2 className="text-4xl font-bold text-slate-900 mb-4">¡Marca Registrada!</h2>
                                    <p className="text-2xl text-slate-500">{getGreeting()}, {selectedEmployee.name.split(' ')[0]}.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-8 mb-10 pb-8 border-b border-slate-100">
                                        <div className="w-24 h-24 rounded-full bg-cyan-600 flex items-center justify-center text-4xl font-bold text-white shadow-lg shadow-cyan-200">
                                            {selectedEmployee.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-bold text-slate-900 mb-1">{selectedEmployee.name}</h2>
                                            <p className="text-slate-500 font-medium mb-2">{selectedEmployee.job_title?.replace(/_/g, ' ')}</p>
                                            <button
                                                onClick={() => { setSelectedEmployee(null); setActionType(''); setShowSpecialMenu(false); }}
                                                className="text-slate-400 hover:text-slate-600 font-bold text-sm flex items-center gap-1 transition-colors"
                                            >
                                                <ArrowLeftCircle size={16} /> Cambiar Usuario
                                            </button>
                                        </div>
                                        <div className="ml-auto text-right">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Estado Actual</p>
                                            <span className={`px-4 py-2 rounded-full font-bold text-sm ${selectedEmployee.current_status === 'IN' ? 'bg-emerald-100 text-emerald-700' :
                                                selectedEmployee.current_status === 'LUNCH' ? 'bg-orange-100 text-orange-700' :
                                                    selectedEmployee.current_status === 'ON_PERMISSION' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-slate-100 text-slate-600'
                                                }`}>
                                                {selectedEmployee.current_status === 'IN' ? '🟢 TRABAJANDO' :
                                                    selectedEmployee.current_status === 'LUNCH' ? '🍔 EN COLACIÓN' :
                                                        selectedEmployee.current_status === 'ON_PERMISSION' ? '⚠️ SALIDA ESPECIAL' :
                                                            '🔴 FUERA'}
                                            </span>
                                        </div>
                                    </div>

                                    {!actionType ? (
                                        <div className="space-y-6">
                                            {/* --- CASE A: OUT (Start Shift) --- */}
                                            {selectedEmployee.current_status === 'OUT' && (
                                                <button onClick={() => handleActionSelect('CHECK_IN')} className="w-full p-8 bg-emerald-50 rounded-3xl border-2 border-emerald-100 hover:border-emerald-500 flex flex-col items-center gap-4 transition group">
                                                    <Clock size={64} className="text-emerald-600 group-hover:scale-110 transition-transform" />
                                                    <span className="font-bold text-2xl text-emerald-800">MARCAR INICIO JORNADA</span>
                                                </button>
                                            )}

                                            {/* --- CASE B: IN (Working) --- */}
                                            {selectedEmployee.current_status === 'IN' && (
                                                !showSpecialMenu ? (
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <button onClick={() => handleActionSelect('BREAK_START')} className="p-8 bg-orange-50 rounded-3xl border-2 border-orange-100 hover:border-orange-500 flex flex-col items-center gap-4 transition group">
                                                            <Coffee size={48} className="text-orange-500 group-hover:scale-110 transition-transform" />
                                                            <span className="font-bold text-xl text-orange-800">Inicio Colación</span>
                                                        </button>
                                                        <button onClick={() => handleActionSelect('CHECK_OUT')} className="p-8 bg-red-50 rounded-3xl border-2 border-red-100 hover:border-red-500 flex flex-col items-center gap-4 transition group">
                                                            <LogOut size={48} className="text-red-500 group-hover:scale-110 transition-transform" />
                                                            <span className="font-bold text-xl text-red-800">Fin de Jornada</span>
                                                        </button>
                                                        <button onClick={() => setShowSpecialMenu(true)} className="col-span-2 p-6 bg-amber-50 rounded-3xl border-2 border-amber-100 hover:border-amber-500 flex items-center justify-center gap-3 transition group">
                                                            <AlertTriangle size={24} className="text-amber-600" />
                                                            <span className="font-bold text-lg text-amber-800">Registrar Salida Especial / Permiso</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h3 className="font-bold text-slate-700">Seleccione Tipo de Salida</h3>
                                                            <button onClick={() => setShowSpecialMenu(false)} className="text-sm text-slate-400 hover:text-slate-600">Cancelar</button>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <button onClick={() => handleActionSelect('MEDICAL_LEAVE')} className="p-6 bg-blue-50 rounded-2xl border-2 border-blue-100 hover:border-blue-500 flex flex-col items-center gap-3 transition text-center">
                                                                <Stethoscope size={32} className="text-blue-600" />
                                                                <span className="font-bold text-blue-800 leading-tight">Cita<br />Médica</span>
                                                            </button>
                                                            <button onClick={() => handleActionSelect('PERMISSION_START')} className="p-6 bg-purple-50 rounded-2xl border-2 border-purple-100 hover:border-purple-500 flex flex-col items-center gap-3 transition text-center">
                                                                <FileText size={32} className="text-purple-600" />
                                                                <span className="font-bold text-purple-800 leading-tight">Permiso<br />Personal</span>
                                                            </button>
                                                            <button onClick={() => handleActionSelect('WORK_ACCIDENT')} className="p-6 bg-red-50 rounded-2xl border-2 border-red-100 hover:border-red-600 flex flex-col items-center gap-3 transition text-center">
                                                                <Ambulance size={32} className="text-red-600" />
                                                                <span className="font-bold text-red-800 leading-tight">Accidente<br />Laboral</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            )}

                                            {/* --- CASE C: ON BREAK --- */}
                                            {selectedEmployee.current_status === 'LUNCH' && (
                                                <button onClick={() => handleActionSelect('BREAK_END')} className="w-full p-8 bg-emerald-50 rounded-3xl border-2 border-emerald-100 hover:border-emerald-500 flex flex-col items-center gap-4 transition group">
                                                    <Coffee size={64} className="text-emerald-600 group-hover:scale-110 transition-transform" />
                                                    <span className="font-bold text-2xl text-emerald-800">REGRESO DE COLACIÓN</span>
                                                </button>
                                            )}

                                            {/* --- CASE D: ON PERMISSION --- */}
                                            {selectedEmployee.current_status === 'ON_PERMISSION' && (
                                                <button onClick={() => handleActionSelect('PERMISSION_END')} className="w-full p-8 bg-blue-50 rounded-3xl border-2 border-blue-100 hover:border-blue-500 flex flex-col items-center gap-4 transition group">
                                                    <ArrowLeftCircle size={64} className="text-blue-600 group-hover:scale-110 transition-transform" />
                                                    <span className="font-bold text-2xl text-blue-800">RETORNO DE SALIDA ESPECIAL</span>
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <form onSubmit={handlePinSubmit} className="animate-in fade-in zoom-in-95">
                                            <div className="text-center mb-8">
                                                <h3 className="text-xl font-bold text-slate-800 mb-2">Confirmar Acción</h3>
                                                <span className="inline-block px-4 py-1 bg-slate-100 rounded-full text-slate-600 font-mono font-bold">{actionType}</span>
                                            </div>

                                            {['MEDICAL_LEAVE', 'PERMISSION_START', 'WORK_ACCIDENT'].includes(actionType) && (
                                                <div className="mb-6">
                                                    <label className="block text-sm font-bold text-slate-500 mb-2">Observación (Opcional)</label>
                                                    <textarea
                                                        className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none resize-none"
                                                        rows={2}
                                                        placeholder="Ej: Cita dentista, Trámite banco..."
                                                        value={observation}
                                                        onChange={(e) => setObservation(e.target.value)}
                                                    />
                                                </div>
                                            )}

                                            <div className="mb-8">
                                                <label className="block text-center text-sm font-bold text-slate-400 mb-4">INGRESE SU PIN DE 4 DÍGITOS</label>
                                                <input
                                                    type="password"
                                                    maxLength={4}
                                                    autoFocus
                                                    className="w-full text-center text-6xl tracking-[1em] font-bold py-4 border-b-4 border-slate-200 focus:border-cyan-600 focus:outline-none text-slate-800"
                                                    value={pin}
                                                    onChange={(e) => setPin(e.target.value)}
                                                />

                                                {/* Biometric Option */}
                                                <button
                                                    type="button"
                                                    onClick={handleBiometricLogin}
                                                    className="w-full mt-6 py-4 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-700 transition shadow-lg"
                                                >
                                                    <span className="text-2xl">👆</span>
                                                    Ingresar con Huella / Rostro
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <button type="button" onClick={() => { setActionType(''); setPin(''); }} className="py-4 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition">
                                                    Cancelar
                                                </button>
                                                <button type="submit" className="py-4 rounded-xl font-bold text-white bg-cyan-600 hover:bg-cyan-700 shadow-lg shadow-cyan-200 transition transform active:scale-95">
                                                    CONFIRMAR
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Hidden Camera Elements */}
            <div className="fixed bottom-4 right-4 w-32 h-24 bg-black rounded-lg overflow-hidden border-2 border-slate-700 opacity-50 hover:opacity-100 transition-opacity pointer-events-none">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} width="320" height="240" className="hidden" />
            </div>
        </div>
    );
};

export default AccessControlPage;
