'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Store, UserCircle, Clock, Ticket, ArrowRight, Loader2, RefreshCw, Search, Monitor, Command, Download, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmployeeProfile, Role } from '../../domain/types';
import PriceCheckerModal from '../components/public/PriceCheckerModal';
import { resolveLoginRetryCooldownMs } from '@/lib/login-resilience';

import { findUserForLogin } from '../actions/login';
import { requestPinReset, applyPinReset } from '@/actions/pin-recovery-v2';
import { toast } from 'sonner';

import { brand } from '@/config/brand.config';
import { bootstrapRouteShell } from '@/presentation/lib/bootstrapRouteShell';
import { readPreferredPublicContext, type PreferredPublicContext } from '@/presentation/lib/preferredPublicContext';

export type LandingNavigateOptions = {
    replace?: boolean;
};

export type LandingPageContentProps = {
    navigateTo: (path: string, options?: LandingNavigateOptions) => void;
};

export const LandingPageContent: React.FC<LandingPageContentProps> = ({ navigateTo }) => {
    const login = usePharmaStore((state) => state.login);
    const employees = usePharmaStore((state) => state.employees);
    const user = usePharmaStore((state) => state.user);
    const [localEmployees, setLocalEmployees] = useState<EmployeeProfile[]>([]);
    const [context, setContext] = useState<PreferredPublicContext | null | undefined>(undefined);

    // Login UI State
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [loginMode, setLoginMode] = useState<'GENERAL' | 'LOGISTICS'>('GENERAL');
    const [isPriceCheckOpen, setIsPriceCheckOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [retryCooldownMs, setRetryCooldownMs] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [usersLoadError, setUsersLoadError] = useState('');
    const [isRetryingUsers, setIsRetryingUsers] = useState(false);
    const [hasUserLookupAttempt, setHasUserLookupAttempt] = useState(false);

    // Queue Modal State
    const [isQueueOptionsOpen, setIsQueueOptionsOpen] = useState(false);

    // Recovery / Force Reset State
    const [recoveryMode, setRecoveryMode] = useState(false);
    const [forcePinReset, setForcePinReset] = useState(false);
    const [supervisorPin, setSupervisorPin] = useState('');
    const [newPermanentPin, setNewPermanentPin] = useState('');
    const [confirmPermanentPin, setConfirmPermanentPin] = useState('');
    const [temporaryPinUsed, setTemporaryPinUsed] = useState('');

    // Dynamic Role Filtering State
    const [requiredRoles, setRequiredRoles] = useState<Role[] | null>(null);
    const [targetUrl, setTargetUrl] = useState<string>('/dashboard');

    const resetLoginModalState = useCallback(() => {
        setRequiredRoles(null);
        setTargetUrl('/dashboard');
        setLoginMode('GENERAL');
        setSelectedEmployee(null);
        setPin('');
        setSearchTerm('');
        setError('');
        setRetryCooldownMs(0);
        setLocalEmployees([]);
        setUsersLoadError('');
        setHasUserLookupAttempt(false);
    }, []);

    const openLoginModal = useCallback((params: {
        mode: 'GENERAL' | 'LOGISTICS';
        roles?: Role[] | null;
        targetPath?: string;
    }) => {
        resetLoginModalState();
        setLoginMode(params.mode);
        setRequiredRoles(params.roles ?? null);
        setTargetUrl(params.targetPath || '/dashboard');
        setIsLoginOpen(true);
    }, [resetLoginModalState]);

    const closeLoginModal = useCallback(() => {
        setIsLoginOpen(false);
        resetLoginModalState();
    }, [resetLoginModalState]);

    useEffect(() => {
        if (retryCooldownMs <= 0) return;
        const timer = window.setInterval(() => {
            setRetryCooldownMs((prev) => Math.max(0, prev - 1000));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [retryCooldownMs]);

    useEffect(() => {
        setContext(readPreferredPublicContext(window.localStorage));
    }, []);

    useEffect(() => {
        // Check for session revocation flag to prevent infinite loops
        const params = new URLSearchParams(window.location.search);
        const reason = params.get('reason');

        if (reason === 'session_revoked') {
            console.log('🛑 Session revoked detected. Clearing ghost session...');
            usePharmaStore.getState().logout();
            return;
        }

        if (user) {
            console.log('🔄 Sesión restaurada, redirigiendo...');
            const restorePath = user.role === 'CASHIER'
                ? '/pos'
                : user.role === 'WAREHOUSE' || user.role === 'WAREHOUSE_CHIEF'
                    ? '/warehouse'
                    : '/dashboard';

            void bootstrapRouteShell(restorePath).catch(console.error);
            navigateTo(restorePath, { replace: true });
        }
    }, [user, navigateTo]);

    // Initial Check - Location Context
    useEffect(() => {
        if (context === null) {
            navigateTo('/select-context');
        }
    }, [context, navigateTo]);

    const lookupLoginUser = useCallback(async () => {
        if (!context) return;

        const identifier = searchTerm.trim();
        if (identifier.length < 7) {
            setUsersLoadError('Ingrese su RUT para continuar.');
            setLocalEmployees([]);
            setHasUserLookupAttempt(true);
            return;
        }

        setIsRetryingUsers(true);
        setUsersLoadError('');
        setHasUserLookupAttempt(true);

        const result = await findUserForLogin({
            identifier,
            locationId: context.id,
            requiredRoles: requiredRoles ?? undefined,
            mode: loginMode,
        });

        if (result.success) {
            setLocalEmployees([result.data]);
            setIsRetryingUsers(false);
            return;
        }

        setLocalEmployees([]);
        const supportRef = result.correlationId ? ` Ref: ${result.correlationId.slice(0, 8)}` : '';
        setUsersLoadError(`${result.userMessage || result.error || 'No fue posible cargar usuarios.'}${supportRef}`);
        setIsRetryingUsers(false);
    }, [context, loginMode, requiredRoles, searchTerm]);

    const handleRequestPinReset = async () => {
        if (!selectedEmployee || !supervisorPin) return;
        setIsLoading(true);
        const res = await requestPinReset(selectedEmployee.id, supervisorPin);
        setIsLoading(false);
        if (res.success) {
            toast.success('¡Solicitud enviada! Se ha enviado un PIN temporal al Correo Maestro del Administrador.');
            setRecoveryMode(false);
            setSupervisorPin('');
            setPin('');
        } else {
            toast.error(res.error || 'Error autorizando el reseteo');
            setSupervisorPin('');
        }
    };

    const handleApplyPinReset = async () => {
        if (!selectedEmployee || !temporaryPinUsed) return;
        if (newPermanentPin.length < 4) {
            toast.error('El PIN debe ser de al menos 4 dígitos');
            return;
        }
        if (newPermanentPin !== confirmPermanentPin) {
            toast.error('Los PINes no coinciden');
            return;
        }

        setIsLoading(true);
        const res = await applyPinReset(selectedEmployee.id, temporaryPinUsed, newPermanentPin);
        setIsLoading(false);

        if (res.success) {
            toast.success('¡PIN actualizado! Ahora puedes entrar con tu nuevo PIN.');
            setForcePinReset(false);
            setNewPermanentPin('');
            setConfirmPermanentPin('');
            setPin('');
            // Optional: Auto login after reset or keep them at login screen
        } else {
            toast.error(res.error || 'Error actualizando el PIN');
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee || !context) return;
        if (pin.length < 4) return;

        setIsLoading(true);
        setError('');
        const clearLoading = () => setIsLoading(false);

        try {
            // Login success triggers 'user' update in store
            // The useEffect hook monitors 'user' and handles navigation/sync
            const result = await login(selectedEmployee.id, pin, context.id);

            if (result.success) {
                // Determine redirect path
                const finalPath = targetUrl || '/dashboard';

                if (result.isTemporaryPin) {
                    setForcePinReset(true);
                    setTemporaryPinUsed(pin);
                    setIsLoading(false);
                    return;
                }
                void bootstrapRouteShell(finalPath).catch(console.error);
                // Redirect
                navigateTo(finalPath, { replace: true });
            } else {
                const baseError = result.error || 'Credenciales inválidas o sin permiso en esta sucursal';
                const supportRef = result.correlationId ? ` Ref: ${result.correlationId.slice(0, 8)}` : '';
                setError(`${baseError}${supportRef}`);
                const cooldown = resolveLoginRetryCooldownMs({
                    code: result.code,
                    retryable: result.retryable
                });
                if (cooldown > 0) {
                    setRetryCooldownMs(cooldown);
                }
                setPin('');
                clearLoading();
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión');
            setRetryCooldownMs((prev) => Math.max(prev, 6000));
            clearLoading();
        }
    };

    const openQueueDisplay = useCallback(() => {
        window.location.href = '/display/queue';
    }, []);

    // Initial Loading Check
    if (!context) {
        return (
            <div data-testid="public-context-loader" className="min-h-dvh bg-slate-900 flex items-center justify-center pt-safe pb-safe">
                <Loader2 className="animate-spin text-cyan-400" size={40} />
            </div>
        );
    }

    const employeesForSelection = employees.length > 0 ? employees : localEmployees;
    const effectiveUsersLoadError = employees.length > 0 ? '' : usersLoadError;

    // Filter active employees
    const validEmployees = employeesForSelection.filter(e => {
        if (e.status !== 'ACTIVE') return false;

        // Admins and Managers are typically visible everywhere
        const isGlobal = e.role === 'ADMIN' || e.role === 'MANAGER' || e.role === 'GERENTE_GENERAL';

        // Base location check
        const isLocal = e.assigned_location_id === context.id;

        // Special Case: In LOGISTICS mode, show all warehouse staff regardless of location assignment
        // This is necessary because warehouse staff might be assigned to a central "Bodega" location
        // but need to login from a Store terminal.
        if (loginMode === 'LOGISTICS') {
            const isWarehouseRole = ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'DRIVER', 'ASISTENTE_BODEGA', 'JEFE_BODEGA', 'BODEGUERO', 'AUXILIAR_FARMACIA'].includes(e.role);
            if (isWarehouseRole) return true;
        }

        return isGlobal || isLocal;
    });

    const filteredEmployees = validEmployees.filter(emp => {
        if (employees.length > 0) {
            const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (emp.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (emp.job_title || '').toLowerCase().includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;
        }

        // 2. Required Roles Filter (Priority)
        if (requiredRoles && requiredRoles.length > 0) {
            return requiredRoles.includes(emp.role);
        }

        // 3. Mode Filter (Logistics vs General)
        if (loginMode === 'LOGISTICS') {
            // Show only Warehouse staff and Drivers
            return ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'DRIVER', 'ASISTENTE_BODEGA', 'JEFE_BODEGA', 'BODEGUERO', 'AUXILIAR_FARMACIA'].includes(emp.role) ||
                ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'DRIVER', 'ASISTENTE_BODEGA', 'JEFE_BODEGA', 'BODEGUERO', 'AUXILIAR_FARMACIA'].includes(emp.job_title);
        } else {
            // General Mode (Fallback if no requiredRoles set)
            // If General Mode, exclude pure warehouse roles if possible
            const isWarehouseRole = ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'DRIVER'].includes(emp.role);
            if (isWarehouseRole) return false;

            return true;
        }
    });

    return (
        <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-start md:justify-center p-4 sm:p-6 pt-safe pb-safe relative overflow-x-hidden overflow-y-auto">
            {/* Background Ambience - Light Clinical Blue/Teal */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[5%] left-[10%] w-[600px] h-[600px] bg-sky-200/40 rounded-full blur-[120px]" />
                <div className="absolute bottom-[5%] right-[10%] w-[600px] h-[600px] bg-teal-100/30 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 w-full max-w-6xl">

                <header className="mb-8 md:mb-12 text-center">
                    <div className="flex justify-center mb-4 md:mb-6">
                        <img src={brand.logoHorizontal} alt={brand.appName} className="h-24 w-auto max-w-full object-contain drop-shadow-xl md:h-32" />
                    </div>
                    {/* <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-3">
                        Farmacias <span className="text-sky-600">Vallenar</span> Suit
                    </h1> */}
                    <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 text-sky-800/80 mt-4 bg-white/80 py-2 px-4 sm:px-5 rounded-2xl sm:rounded-full border border-sky-200 shadow-sm backdrop-blur-md">
                        <Store size={18} className={context.type === 'WAREHOUSE' ? 'text-amber-500' : 'text-sky-500'} />
                        <span className="font-medium tracking-wide">Sucursal: <span className="font-bold text-slate-800">{context.name}</span></span>
                        <button
                            type="button"
                            onClick={() => navigateTo('/select-context')}
                            className="min-h-11 text-xs bg-sky-100 hover:bg-sky-200 text-sky-700 px-3 py-1.5 rounded-full transition-colors inline-flex items-center border border-sky-200"
                        >
                            <RefreshCw size={10} className="mr-1.5" /> Cambiar
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">

                    {/* 1. Main System (ERP/POS) - Light Blue -> Now explicitly "Administración" or "Acceso General" */}
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            openLoginModal({
                                mode: 'GENERAL',
                                roles: ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'],
                            });
                        }}
                        data-testid="landing-module-administracion"
                        className="w-full text-left cursor-pointer bg-white border border-sky-100 rounded-3xl p-8 relative overflow-hidden shadow-xl shadow-sky-900/5 group hover:border-sky-300 transition-all hover:shadow-2xl hover:shadow-sky-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 bg-sky-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-20 transition-opacity" />
                        <div className="bg-sky-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-sky-100 group-hover:scale-110 transition-transform">
                            <UserCircle size={40} className="text-sky-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Administración</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Acceso general: Gestión, Finanzas y Configuración.</p>
                        <div className="flex items-center text-xs font-bold text-sky-600 uppercase tracking-wider bg-sky-50 px-4 py-2 rounded-lg w-fit border border-sky-100 group-hover:bg-sky-500 group-hover:text-white transition-all">
                            Acceder <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.button>

                    {/* NEW CARD: Caja / POS - Light Purple */}
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            openLoginModal({
                                mode: 'GENERAL',
                                roles: ['CASHIER', 'QF'],
                                targetPath: '/pos',
                            });
                        }}
                        data-testid="landing-module-pos"
                        className="w-full text-left cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-purple-300 transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-purple-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-purple-200 group-hover:scale-110 transition-transform">
                            <Monitor size={40} className="text-purple-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Punto de Venta</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Caja rápida y atención a público.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:bg-purple-500 group-hover:text-white transition-all">
                            Acceder <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.button>

                    {/* 2. Attendance Kiosk - Light Teal */}
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigateTo('/kiosk')}
                        className="w-full text-left cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-teal-300 transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-teal-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-teal-200 group-hover:scale-110 transition-transform">
                            <Clock size={40} className="text-teal-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Reloj Control</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Registro de asistencia y turnos del personal.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:text-teal-600 group-hover:border-teal-200 transition-all">
                            Activar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.button>

                    {/* 3. Customer Queue - Light Indigo */}
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsQueueOptionsOpen(true)}
                        className="w-full text-left cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-indigo-300 transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-indigo-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-indigo-200 group-hover:scale-110 transition-transform">
                            <Ticket size={40} className="text-indigo-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Fila Virtual</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Totem de atención y pantalla de sala de espera.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-all">
                            Opciones <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.button>

                    {/* 4. Logistics - Light Amber */}
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            openLoginModal({
                                mode: 'LOGISTICS',
                                targetPath: '/logistica',
                            });
                        }}
                        data-testid="landing-module-logistica"
                        className="w-full text-left cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-amber-300 transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-amber-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-amber-200 group-hover:scale-110 transition-transform">
                            <Store size={40} className="text-amber-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Logística</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Gestión WMS y operaciones de bodega.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:text-amber-600 group-hover:border-amber-200 transition-all">
                            Entrar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.button>

                    {/* 5. Price Checker - Light Emerald */}
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsPriceCheckOpen(true)}
                        className="w-full text-left cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-emerald-300 transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-emerald-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-emerald-200 group-hover:scale-110 transition-transform">
                            <Search size={40} className="text-emerald-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Consultor</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Consulta pública de disponibilidad y alternativas.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:text-emerald-600 group-hover:border-emerald-200 transition-all">
                            Consultar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.button>
                </div>

                {/* Desktop App Downloads - Light Clinical Refactor */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-8 md:mt-12 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-5xl mx-auto"
                >
                    {/* Desktop App Downloads */}
                    <div className="bg-white/80 backdrop-blur-md border border-sky-100 rounded-3xl p-5 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 shadow-xl shadow-sky-900/5 transition-all hover:shadow-2xl hover:border-sky-200">
                        <div className="bg-sky-100 w-16 h-16 rounded-2xl flex items-center justify-center text-sky-600 shrink-0 border border-sky-200">
                            <Monitor size={32} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-slate-900 font-bold text-xl mb-1">App Escritorio</h3>
                            <p className="text-slate-500 text-sm mb-4 leading-relaxed">
                                Versión completa para Windows y macOS.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <a
                                    href="https://github.com/filimorniga-ux/farmacias-vallenar-suit/releases/download/v1.0.11/FarmaciasVallenar-Setup.exe"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-11 flex items-center gap-2 px-4 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg transition-all text-xs font-bold border border-sky-100 shadow-sm"
                                >
                                    <Monitor size={14} className="text-sky-500" />
                                    <span>Windows (Última)</span>
                                </a>
                                <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
                                <a
                                    href="https://github.com/filimorniga-ux/farmacias-vallenar-suit/releases/download/v1.0.11/FarmaciasVallenar-Mac-arm64.dmg"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-11 flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all text-xs font-bold border border-slate-200 shadow-sm"
                                >
                                    <Command size={14} className="text-slate-500" />
                                    <span>macOS</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Android App Download */}
                    <div className="bg-white/80 backdrop-blur-md border border-emerald-100 rounded-3xl p-5 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 shadow-xl shadow-emerald-900/5 transition-all hover:shadow-2xl hover:border-emerald-200">
                        <div className="bg-emerald-100 w-16 h-16 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-200">
                            <Smartphone size={32} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-slate-900 font-bold text-xl mb-1">App para Android</h3>
                            <p className="text-slate-500 text-sm mb-4 leading-relaxed">
                                Gestiona tu sucursal y audita precios desde tu celular.
                            </p>
                            <a
                                href="/api/downloads/android-apk"
                                className="min-h-11 flex items-center gap-2 justify-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all text-sm font-bold shadow-lg shadow-emerald-600/20 w-full md:w-auto"
                            >
                                <Download size={18} />
                                <span>Descargar APK</span>
                            </a>
                        </div>
                    </div>
                </motion.div>

                {/* Login Modal Overlay */}
                <AnimatePresence>
                    {isLoginOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 md:items-center">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="relative my-3 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-8 md:my-0"
                            >
                                <button type="button" aria-label="Cerrar inicio de sesión" onClick={closeLoginModal} className="absolute top-4 right-4 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>

                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-slate-800">
                                        {loginMode === 'LOGISTICS' ? 'Acceso Logística' : 'Iniciar Sesión'}
                                    </h2>
                                    <p className="text-slate-500 text-sm">Validando para: <span className="font-bold text-sky-600">{context.name}</span></p>
                                </div>

                                {recoveryMode ? (
                                    /* 🛠️ RECOVERY MODE: Supervisor authorizes PIN reset */
                                    <div className="space-y-6">
                                        <div className="text-center">
                                            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-500 border border-amber-100">
                                                <Clock size={32} />
                                            </div>
                                            <h3 className="text-xl font-bold text-slate-800">Solicitar Reseteo</h3>
                                            <p className="text-slate-500 text-sm">Un supervisor debe autorizar esta solicitud con su PIN.</p>
                                        </div>

                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-4">
                                            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Usuario a resetear</p>
                                            <p className="text-slate-700 font-bold">{selectedEmployee?.name}</p>
                                        </div>

                                        <label htmlFor="supervisor-pin" className="sr-only">PIN de supervisor</label>
                                        <input
                                            id="supervisor-pin"
                                            name="supervisor-pin"
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="new-password"
                                            maxLength={8}
                                            value={supervisorPin}
                                            onChange={(e) => setSupervisorPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                            placeholder="PIN Supervisor"
                                                className="w-full min-h-11 text-center text-3xl font-bold py-3 border-b-4 border-slate-200 focus:border-amber-500 text-slate-800 outline-none bg-transparent tracking-[0.5em]"
                                        />

                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => { setRecoveryMode(false); setSupervisorPin(''); }}
                                                className="min-h-11 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleRequestPinReset}
                                                disabled={isLoading || supervisorPin.length < 4}
                                                className="min-h-11 py-3 rounded-xl font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                                            >
                                                {isLoading ? '...' : 'Autorizar'}
                                            </button>
                                        </div>
                                    </div>
                                ) : forcePinReset ? (
                                    /* 🔐 FORCE RESET: User enters with temporary PIN and must set a permanent one */
                                    <div className="space-y-6">
                                        <div className="text-center">
                                            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-500 border border-emerald-100">
                                                <RefreshCw size={32} />
                                            </div>
                                            <h3 className="text-xl font-bold text-slate-800">Nuevo PIN requerido</h3>
                                            <p className="text-slate-500 text-sm">Ingresa tu nuevo PIN permanente para esta sucursal.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label htmlFor="new-permanent-pin" className="block text-xs text-slate-400 font-bold mb-1 ml-1 uppercase">Nuevo PIN (4-8 dígitos)</label>
                                                <input
                                                    id="new-permanent-pin"
                                                    name="new-permanent-pin"
                                                    type="password"
                                                    inputMode="numeric"
                                                    autoComplete="new-password"
                                                    maxLength={8}
                                                    value={newPermanentPin}
                                                    onChange={(e) => setNewPermanentPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                                    placeholder="••••"
                                                    className="w-full min-h-11 text-center text-3xl font-bold py-3 border-b-4 border-slate-200 focus:border-emerald-500 text-slate-800 outline-none bg-transparent tracking-[0.5em]"
                                                />
                                            </div>
                                            <div>
                                                <label htmlFor="confirm-permanent-pin" className="block text-xs text-slate-400 font-bold mb-1 ml-1 uppercase">Confirmar PIN</label>
                                                <input
                                                    id="confirm-permanent-pin"
                                                    name="confirm-permanent-pin"
                                                    type="password"
                                                    inputMode="numeric"
                                                    autoComplete="new-password"
                                                    maxLength={8}
                                                    value={confirmPermanentPin}
                                                    onChange={(e) => setConfirmPermanentPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                                    placeholder="••••"
                                                    className="w-full min-h-11 text-center text-3xl font-bold py-3 border-b-4 border-slate-200 focus:border-emerald-500 text-slate-800 outline-none bg-transparent tracking-[0.5em]"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => { setForcePinReset(false); setSelectedEmployee(null); }}
                                                className="min-h-11 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleApplyPinReset}
                                                disabled={isLoading || newPermanentPin.length < 4 || newPermanentPin !== confirmPermanentPin}
                                                className="min-h-11 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                            >
                                                {isLoading ? '...' : 'Guardar y Entrar'}
                                            </button>
                                        </div>
                                    </div>
                                ) : !selectedEmployee ? (
                                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        <div className="relative mb-4 sticky top-0 z-10 bg-white pb-2">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <label htmlFor="login-user-search" className="sr-only">Buscar usuario por RUT</label>
                                            <input
                                                id="login-user-search"
                                                name="login-user-search"
                                                type="text"
                                                autoComplete="username"
                                                spellCheck={false}
                                                placeholder={employees.length > 0 ? 'Buscar usuario...' : 'Ingrese su RUT'}
                                                value={searchTerm}
                                                onChange={(e) => {
                                                    const nextValue = employees.length > 0
                                                        ? e.target.value
                                                        : e.target.value.replace(/[^0-9kK.-]/g, '').toUpperCase();
                                                    setSearchTerm(nextValue);
                                                    if (employees.length === 0) {
                                                        setUsersLoadError('');
                                                        setLocalEmployees([]);
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && employees.length === 0) {
                                                        e.preventDefault();
                                                        void lookupLoginUser();
                                                    }
                                                }}
                                                className="w-full min-h-11 pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                                            />
                                        </div>

                                        {employees.length === 0 && (
                                            <button
                                                type="button"
                                                onClick={() => void lookupLoginUser()}
                                                disabled={isRetryingUsers || searchTerm.trim().length < 7}
                                                className="min-h-11 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60"
                                            >
                                                {isRetryingUsers ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                                {isRetryingUsers ? 'Buscando...' : 'Buscar por RUT'}
                                            </button>
                                        )}

                                        {filteredEmployees.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400">
                                                <p className="text-sm">
                                                    {effectiveUsersLoadError || (hasUserLookupAttempt ? 'No se encontró un usuario válido para esta sucursal.' : 'Ingrese su RUT para continuar.')}
                                                </p>
                                                {employees.length === 0 && hasUserLookupAttempt && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void lookupLoginUser()}
                                                        disabled={isRetryingUsers}
                                                        className="mt-3 min-h-11 inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                                                    >
                                                        {isRetryingUsers ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                        {isRetryingUsers ? 'Reintentando...' : 'Reintentar búsqueda'}
                                                    </button>
                                                )}
                                                {employees.length === 0 && !hasUserLookupAttempt && (
                                                    <p className="mt-3 text-xs text-slate-400">
                                                        El directorio de usuarios ya no se expone públicamente.
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            filteredEmployees.map(emp => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    onClick={() => setSelectedEmployee(emp)}
                                                    className="w-full flex items-center p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group"
                                                >
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${emp.role === 'ADMIN' ? 'bg-sky-100 text-sky-600' : emp.role === 'MANAGER' ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-600'}`}>
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <div className="ml-3 text-left">
                                                        <p className="text-slate-800 font-bold text-sm">{emp.name}</p>
                                                        <p className="text-slate-400 text-xs">{emp.role === 'ADMIN' ? 'ADMINISTRADOR' : emp.role === 'MANAGER' ? 'GERENTE' : emp.job_title}</p>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                ) : (
                                    <form onSubmit={handleLogin} className="space-y-6">
                                        <div className="flex flex-col items-center">
                                            <button type="button" aria-label="Cambiar usuario seleccionado" onClick={() => setSelectedEmployee(null)} className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-600 mb-2 cursor-pointer hover:bg-red-50 hover:text-red-500 transition-colors">
                                                {selectedEmployee.name.charAt(0)}
                                            </button>
                                        </div>
                                        <div className="text-center mb-4">
                                            <h3 className="font-bold text-slate-900 text-xl">{selectedEmployee.name}</h3>
                                            <p className="text-sm text-slate-400">{selectedEmployee.job_title || 'Empleado'}</p>
                                        </div>

                                        <label htmlFor="employee-pin" className="sr-only">PIN de acceso</label>
                                        <input
                                            id="employee-pin"
                                            name="employee-pin"
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={8}
                                            value={pin}
                                            onChange={(e) => {
                                                setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                                                setError('');
                                            }}
                                            placeholder="••••"
                                            className={`w-full min-h-11 text-center text-4xl font-bold py-3 border-b-4 ${error ? 'border-red-500 text-red-500' : 'border-slate-200 focus:border-sky-500 text-slate-800'} outline-none bg-transparent tracking-[1em]`}
                                            autoComplete="new-password"
                                        />

                                        {error && <p className="text-red-500 text-sm text-center font-bold">{error}</p>}

                                        {!error.includes('bloqueado') && (
                                            <div className="text-center mt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setRecoveryMode(true)}
                                                    className="min-h-11 inline-flex items-center justify-center text-sky-600 hover:text-sky-700 text-xs font-semibold hover:underline"
                                                >
                                                    ¿Olvidaste tu PIN? Solicitar ayuda al Administrador
                                                </button>
                                            </div>
                                        )}

                                        {retryCooldownMs > 0 && (
                                            <p className="text-amber-600 text-xs text-center font-semibold">
                                                Servicio de datos inestable. Reintento disponible en {Math.ceil(retryCooldownMs / 1000)}s.
                                            </p>
                                        )}

                                        <div className="grid grid-cols-2 gap-3">
                                            <button type="button" onClick={() => setSelectedEmployee(null)} className="min-h-11 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Atrás</button>
                                            <button
                                                type="submit"
                                                disabled={isLoading || pin.length < 4 || retryCooldownMs > 0}
                                                className="min-h-11 py-3 rounded-xl font-bold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
                                            >
                                                {isLoading ? '...' : retryCooldownMs > 0 ? 'Espera...' : 'Entrar'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Queue Options Modal */}
                <AnimatePresence>
                    {isQueueOptionsOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto overscroll-contain px-3 py-3 sm:p-4 md:items-center">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="relative my-3 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-8 md:my-0"
                            >
                                <button type="button" aria-label="Cerrar opciones de fila" onClick={() => setIsQueueOptionsOpen(false)} className="absolute top-4 right-4 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>

                                <div className="text-center mb-6">
                                    <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4 text-sky-600">
                                        <Ticket size={32} />
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-900">Sistema de Filas</h2>
                                    <p className="text-slate-500 text-sm">Selecciona una opción</p>
                                </div>

                                <div className="space-y-4">
                                    <button
                                        type="button"
                                        onClick={() => navigateTo('/totem')}
                                        className="w-full flex items-center p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-sky-500 hover:bg-sky-50 transition-all group"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                                            <Ticket size={24} />
                                        </div>
                                        <div className="ml-4 text-left">
                                            <p className="font-bold text-slate-800">Abrir Totem</p>
                                            <p className="text-xs text-slate-500">Para tablet de ingreso de público.</p>
                                        </div>
                                        <ArrowRight size={20} className="ml-auto text-slate-300 group-hover:text-sky-500" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsQueueOptionsOpen(false);
                                            openQueueDisplay();
                                        }}
                                        className="w-full flex items-center p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-teal-500 hover:bg-teal-50 transition-all group"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center">
                                            <RefreshCw size={24} />
                                        </div>
                                        <div className="ml-4 text-left">
                                            <p className="font-bold text-slate-800">Activar Pantalla</p>
                                            <p className="text-xs text-slate-500">Para TV/Monitor de sala de espera.</p>
                                        </div>
                                        <ArrowRight size={20} className="ml-auto text-slate-300 group-hover:text-teal-500" />
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <PriceCheckerModal
                    isOpen={isPriceCheckOpen}
                    onClose={() => setIsPriceCheckOpen(false)}
                />

                <footer className="mt-12 text-center text-slate-400 text-sm">
                    <p>&copy; {new Date().getFullYear()} Farmacias Vallenar. Todos los derechos reservados.</p>
                </footer>
            </div>
        </div>
    );
};
