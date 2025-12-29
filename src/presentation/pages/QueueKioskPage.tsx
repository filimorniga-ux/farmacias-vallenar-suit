import React, { useState, useEffect, useCallback } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Ticket, UserPlus, ArrowRight, Settings, Printer, X, Phone, User, MapPin, Check, ChevronLeft, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PrinterService } from '../../domain/services/PrinterService';
import { toast } from 'sonner';
import { getPublicLocationsSecure } from '../../actions/public-network-v2';
import { createTicketSecure } from '../../actions/queue-v2';

// =============================================================================
// TYPES
// =============================================================================

type Step = 'SETUP' | 'WELCOME' | 'IDENTIFY' | 'REGISTER' | 'PHONE' | 'SUCCESS';
type TicketType = 'GENERAL' | 'PREFERENTIAL';

interface Location {
    id: string;
    name: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const QueueKioskPage: React.FC = () => {
    const { printerConfig, customers } = usePharmaStore();

    // Kiosk Mode State
    const [isKioskActive, setIsKioskActive] = useState(false);
    const [activationPin, setActivationPin] = useState('');
    const [exitPin, setExitPin] = useState('');
    const [showExitPrompt, setShowExitPrompt] = useState(false);

    // Flow State
    const [step, setStep] = useState<Step>('WELCOME');
    const [ticketType, setTicketType] = useState<TicketType>('GENERAL');

    // Location State
    const [locationId, setLocationId] = useState<string>('');
    const [locations, setLocations] = useState<Location[]>([]);
    const locationName = locations.find(l => l.id === locationId)?.name || localStorage.getItem('preferred_location_name') || 'Farmacia';

    // Customer Data
    const [rut, setRut] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('+569');

    // Result
    const [ticket, setTicket] = useState<any>(null);
    const [customerName, setCustomerName] = useState('');

    // Setup Lock (for changing location)
    const [setupPin, setSetupPin] = useState('');
    const [isSetupUnlocked, setIsSetupUnlocked] = useState(false);

    // Valid PINs (1213 = admin)
    const ADMIN_PIN = '1213';

    // =============================================================================
    // FULLSCREEN HELPERS
    // =============================================================================

    const enterFullscreen = () => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(console.error);
        } else if ((elem as any).webkitRequestFullscreen) { // Safari
            (elem as any).webkitRequestFullscreen();
        }
    };

    const exitFullscreen = () => {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(console.error);
        } else if ((document as any).webkitExitFullscreen) {
            (document as any).webkitExitFullscreen();
        }
    };

    // =============================================================================
    // KIOSK ACTIVATION
    // =============================================================================

    const handleActivateKiosk = (pin: string) => {
        if (pin === ADMIN_PIN) {
            setIsKioskActive(true);
            setActivationPin('');
            enterFullscreen();
            toast.success('Modo Kiosk Activado');
        } else {
            setActivationPin('');
            toast.error('PIN Incorrecto');
        }
    };

    const handleExitKiosk = (pin: string) => {
        if (pin === ADMIN_PIN) {
            setIsKioskActive(false);
            setShowExitPrompt(false);
            setExitPin('');
            exitFullscreen();
            // Navigate back to main app
            window.location.href = '/';
        } else {
            setExitPin('');
            toast.error('PIN Incorrecto');
        }
    };

    // =============================================================================
    // INIT: Load location from localStorage (shared with ContextSelectionPage)
    // =============================================================================

    useEffect(() => {
        // Read from shared location preference (set in ContextSelectionPage)
        const storedLocation = localStorage.getItem('preferred_location_id');
        const storedLocationName = localStorage.getItem('preferred_location_name');

        // Pre-set locationId if available (before async fetch completes)
        if (storedLocation && storedLocation.length > 30) {
            setLocationId(storedLocation);
            // If we have the name cached, use it for display
            if (storedLocationName) {
                setLocations([{ id: storedLocation, name: storedLocationName }]);
            }
            setStep('WELCOME'); // Skip SETUP since we have location
        }

        getPublicLocationsSecure().then((res: any) => {
            if (res.success && res.data) {
                setLocations(res.data);

                // Validate stored location against available locations
                if (storedLocation && res.data.some((l: Location) => l.id === storedLocation)) {
                    setLocationId(storedLocation);
                    setStep('WELCOME');
                } else if (!storedLocation) {
                    // No location stored - go to setup
                    setStep('SETUP');
                }
                // If stored location exists but not in list, still use it (might be valid)
            } else {
                // API failed - still try to use stored location
                if (storedLocation && storedLocation.length > 30) {
                    setStep('WELCOME');
                } else {
                    setStep('SETUP');
                }
            }
        }).catch(() => {
            // Network error - try stored location anyway
            if (storedLocation && storedLocation.length > 30) {
                setStep('WELCOME');
            } else {
                setStep('SETUP');
            }
        });
    }, []);

    // =============================================================================
    // AUTO PRINT on SUCCESS
    // =============================================================================

    useEffect(() => {
        if (step === 'SUCCESS' && ticket?.code) {
            const timer = setTimeout(() => window.print(), 500);
            return () => clearTimeout(timer);
        }
    }, [step, ticket]);

    // =============================================================================
    // ACTIONS
    // =============================================================================

    const handleSelectLocation = (id: string) => {
        const selectedLoc = locations.find(l => l.id === id);
        localStorage.setItem('preferred_location_id', id);
        if (selectedLoc) {
            localStorage.setItem('preferred_location_name', selectedLoc.name);
        }
        setLocationId(id);
        setIsSetupUnlocked(false);
        setStep('WELCOME');
    };

    const unlockSetup = (pin: string) => {
        if (pin === '1213') {
            setIsSetupUnlocked(true);
            setSetupPin('');
        } else {
            setSetupPin('');
            toast.error('PIN Incorrecto');
        }
    };

    const handleTypeSelect = (type: TicketType) => {
        setTicketType(type);
        setStep('IDENTIFY');
        resetForm();
    };

    const resetForm = () => {
        setRut('');
        setName('');
        setPhone('+569');
    };

    const handleNumberClick = (num: string) => {
        if (rut.length < 12) {
            setRut(prev => formatRut(prev + num));
        }
    };

    const handleBackspace = () => {
        setRut(prev => formatRut(prev.slice(0, -1)));
    };

    const formatRut = (value: string): string => {
        const clean = value.replace(/[^0-9kK]/g, '');
        if (clean.length <= 1) return clean;
        const body = clean.slice(0, -1);
        const dv = clean.slice(-1);
        return `${body}-${dv}`;
    };

    const handleIdentifySubmit = () => {
        if (rut.length < 8) {
            toast.error('RUT inválido');
            return;
        }

        // Check if customer exists in local store
        const exists = customers.find(c => c.rut === rut);

        if (exists) {
            setCustomerName(exists.name || exists.fullName || '');
            generateTicket(rut, exists.name || exists.fullName);
        } else {
            // New customer - ask for name
            setStep('REGISTER');
        }
    };

    const handleSkipIdentify = () => {
        setRut('ANON');
        generateTicket('ANON');
    };

    const handleRegisterSubmit = () => {
        if (!name.trim()) {
            toast.error('Ingrese su nombre');
            return;
        }
        setCustomerName(name);
        setStep('PHONE');
    };

    const handlePhoneSubmit = () => {
        // Phone is optional, proceed to ticket
        const phoneValue = phone.length > 4 ? phone : undefined;
        generateTicket(rut, name, phoneValue);
    };

    const handleSkipPhone = () => {
        generateTicket(rut, name, undefined);
    };

    const generateTicket = async (finalRut: string, finalName?: string, finalPhone?: string) => {
        // Get locationId from state OR localStorage as backup
        const effectiveLocationId = locationId || localStorage.getItem('preferred_location_id') || '';

        console.log('[Totem] === CREATING TICKET ===');
        console.log('[Totem] stateLocationId:', locationId, '| length:', locationId?.length);
        console.log('[Totem] localStorageId:', localStorage.getItem('preferred_location_id'));
        console.log('[Totem] effectiveLocationId:', effectiveLocationId, '| length:', effectiveLocationId?.length);
        console.log('[Totem] finalRut:', finalRut);
        console.log('[Totem] ticketType:', ticketType);

        // Validate locationId
        if (!effectiveLocationId || effectiveLocationId.length < 30) {
            toast.error('Sucursal no configurada. Seleccione una sucursal primero.');
            setStep('SETUP');
            return;
        }

        try {
            const res = await createTicketSecure({
                branchId: effectiveLocationId,
                rut: finalRut,
                type: ticketType,
                name: finalName,
                phone: finalPhone
            });

            console.log('[Totem] RAW SERVER RESPONSE:', res);
            console.log('[Totem] res.success:', res.success);
            console.log('[Totem] res.ticket:', res.ticket);
            console.log('[Totem] res.error:', res.error);

            if (res.success && res.ticket) {
                setTicket(res.ticket);
                setCustomerName(res.ticket.customerName || finalName || '');
                setStep('SUCCESS');

                PrinterService.printQueueTicket({
                    ...res.ticket,
                    number: res.ticket.code,
                    timestamp: new Date(res.ticket.created_at).getTime()
                }, printerConfig);

                // Auto-reset after 10s
                setTimeout(() => {
                    setStep('WELCOME');
                    setTicket(null);
                    resetForm();
                }, 10000);
            } else {
                console.error('[Totem] Ticket creation failed. Full response:', JSON.stringify(res, null, 2));
                toast.error(`Error al generar ticket: ${res.error || 'Desconocido'}`);
            }
        } catch (e: any) {
            console.error('[Totem] Exception caught:', e);
            console.error('[Totem] Exception message:', e?.message);
            console.error('[Totem] Exception stack:', e?.stack);
            toast.error(`Error de conexión: ${e?.message || 'Desconocido'}`);
        }
    };

    const goBack = () => {
        if (step === 'IDENTIFY') setStep('WELCOME');
        else if (step === 'REGISTER') setStep('IDENTIFY');
        else if (step === 'PHONE') setStep('REGISTER');
    };

    // =============================================================================
    // UI COMPONENTS
    // =============================================================================

    const Keypad = () => (
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'K', 0].map((k) => (
                <button
                    key={k}
                    onClick={() => handleNumberClick(k.toString())}
                    className="h-16 text-2xl font-bold bg-slate-100 text-slate-700 rounded-2xl active:bg-blue-100 active:text-blue-600 transition-all border border-slate-200 shadow-sm"
                >
                    {k}
                </button>
            ))}
            <button
                onClick={handleBackspace}
                className="h-16 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl active:bg-red-100 transition-all border border-red-100"
            >
                <X size={28} />
            </button>
        </div>
    );

    const PhoneKeypad = () => (
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '+', 0].map((k) => (
                <button
                    key={k}
                    onClick={() => setPhone(prev => prev.length < 12 ? prev + k : prev)}
                    className="h-16 text-2xl font-bold bg-slate-100 text-slate-700 rounded-2xl active:bg-blue-100 active:text-blue-600 transition-all border border-slate-200 shadow-sm"
                >
                    {k}
                </button>
            ))}
            <button
                onClick={() => setPhone(prev => prev.length > 4 ? prev.slice(0, -1) : prev)}
                className="h-16 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl active:bg-red-100 transition-all border border-red-100"
            >
                <X size={28} />
            </button>
        </div>
    );

    const Keyboard = () => (
        <div className="grid grid-cols-10 gap-1.5 max-w-2xl mx-auto">
            {'QWERTYUIOPASDFGHJKLÑZXCVBNM'.split('').map(char => (
                <button
                    key={char}
                    onClick={() => setName(prev => prev + char)}
                    className="h-12 text-lg font-bold bg-slate-100 text-slate-700 rounded-xl active:bg-blue-100 active:text-blue-600 transition-all"
                >
                    {char}
                </button>
            ))}
            <button
                onClick={() => setName(prev => prev + ' ')}
                className="col-span-8 h-12 text-lg font-bold bg-slate-100 text-slate-600 rounded-xl"
            >
                ESPACIO
            </button>
            <button
                onClick={() => setName(prev => prev.slice(0, -1))}
                className="col-span-2 h-12 flex items-center justify-center bg-red-50 text-red-500 rounded-xl"
            >
                <X size={20} />
            </button>
        </div>
    );

    // =============================================================================
    // RENDER
    // =============================================================================

    // KIOSK ACTIVATION SCREEN
    if (!isKioskActive) {
        const hasLocation = locationId || localStorage.getItem('preferred_location_id');

        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col items-center justify-center p-6">
                <div className="bg-white/10 backdrop-blur-xl p-10 rounded-3xl border border-white/20 max-w-lg w-full text-center">
                    <div className="w-20 h-20 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Ticket size={40} className="text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-black text-white mb-2">Totem de Turnos</h1>

                    {/* Step 1: Select Location if not set */}
                    {!hasLocation && locations.length > 0 && (
                        <div className="mb-8">
                            <p className="text-slate-400 mb-4">Seleccione la sucursal</p>
                            <div className="grid gap-2">
                                {locations.map(loc => (
                                    <button
                                        key={loc.id}
                                        onClick={() => {
                                            setLocationId(loc.id);
                                            localStorage.setItem('preferred_location_id', loc.id);
                                            localStorage.setItem('preferred_location_name', loc.name);
                                        }}
                                        className="p-4 bg-white/10 border border-white/20 rounded-xl text-white font-bold hover:bg-blue-500/30 hover:border-blue-400 transition-all flex items-center gap-3"
                                    >
                                        <MapPin size={18} className="text-blue-400" />
                                        {loc.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Enter PIN (only show if location is set) */}
                    {hasLocation && (
                        <>
                            <p className="text-slate-400 mb-8">Ingrese PIN de administrador para activar</p>

                            <input
                                type="password"
                                maxLength={4}
                                placeholder="••••"
                                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-5 text-center text-white text-4xl tracking-[0.8em] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none mb-6"
                                value={activationPin}
                                autoFocus
                                onChange={e => {
                                    setActivationPin(e.target.value);
                                    if (e.target.value.length === 4) handleActivateKiosk(e.target.value);
                                }}
                            />
                        </>
                    )}

                    <p className="text-xs text-slate-500">
                        Sucursal: {locationName}
                        {hasLocation && (
                            <button
                                onClick={() => { setLocationId(''); localStorage.removeItem('preferred_location_id'); }}
                                className="ml-2 text-blue-400 hover:underline"
                            >
                                (cambiar)
                            </button>
                        )}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">

            {/* Exit Prompt Modal */}
            {showExitPrompt && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
                    <div className="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Salir del Modo Kiosk</h2>
                        <p className="text-slate-500 mb-6 text-sm">Ingrese PIN de administrador</p>

                        <input
                            type="password"
                            maxLength={4}
                            placeholder="••••"
                            className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-4 text-center text-slate-800 text-3xl tracking-[0.8em] focus:border-blue-500 outline-none mb-6"
                            value={exitPin}
                            autoFocus
                            onChange={e => {
                                setExitPin(e.target.value);
                                if (e.target.value.length === 4) handleExitKiosk(e.target.value);
                            }}
                        />

                        <button
                            onClick={() => { setShowExitPrompt(false); setExitPin(''); }}
                            className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Print Styles */}
            <style>{`
                @media print {
                    body, #root { visibility: hidden; height: 0; overflow: hidden; }
                    #printable-ticket {
                        visibility: visible !important;
                        display: block !important;
                        position: fixed !important;
                        top: 0; left: 0;
                        width: 80mm !important;
                        background: white !important;
                        color: black !important;
                        z-index: 99999;
                    }
                    #printable-ticket * { visibility: visible !important; color: black !important; }
                    @page { size: auto; margin: 0; }
                }
            `}</style>

            {/* Header with Location */}
            <header className="absolute top-0 left-0 right-0 bg-blue-600 text-white py-4 px-6 flex items-center justify-between shadow-lg z-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <MapPin size={20} />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-blue-200 uppercase tracking-wider">Sucursal</p>
                        <h1 className="text-lg font-black">{locationName}</h1>
                    </div>
                </div>
                <button
                    onClick={() => setShowExitPrompt(true)}
                    className="p-3 bg-red-500/20 rounded-xl hover:bg-red-500/40 transition-colors flex items-center gap-2"
                >
                    <LogOut size={18} />
                    <span className="text-sm font-bold hidden md:inline">Salir</span>
                </button>
            </header>

            {/* Main Content */}
            <AnimatePresence mode="wait">

                {/* SETUP STEP */}
                {step === 'SETUP' && (
                    <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="z-10 text-center w-full max-w-md mt-16">
                        {!isSetupUnlocked ? (
                            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                                <Settings className="mx-auto text-blue-500 mb-4" size={48} />
                                <h2 className="text-2xl text-slate-800 font-bold mb-4">Configuración</h2>
                                <p className="text-slate-500 mb-6 text-sm">Ingrese el PIN de administrador</p>
                                <input
                                    type="password"
                                    maxLength={4}
                                    placeholder="••••"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-center text-slate-800 text-3xl tracking-[1em] focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                                    value={setupPin}
                                    onChange={e => {
                                        setSetupPin(e.target.value);
                                        if (e.target.value.length === 4) unlockSetup(e.target.value);
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                                <h2 className="text-xl text-slate-800 font-bold mb-6">Seleccionar Sucursal</h2>
                                <div className="grid gap-3">
                                    {locations.map(loc => (
                                        <button
                                            key={loc.id}
                                            onClick={() => handleSelectLocation(loc.id)}
                                            className="p-5 bg-slate-50 text-slate-800 rounded-2xl hover:bg-blue-50 hover:text-blue-600 font-bold transition-all border border-slate-200 hover:border-blue-200 text-left flex items-center gap-4"
                                        >
                                            <MapPin size={20} className="text-blue-500" />
                                            {loc.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* WELCOME STEP */}
                {step === 'WELCOME' && (
                    <motion.div key="welcome" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.1, opacity: 0 }} className="z-10 w-full max-w-lg mt-16">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-black text-slate-800 mb-2">¡Bienvenido!</h2>
                            <p className="text-slate-500">Seleccione el tipo de atención</p>
                        </div>

                        <div className="grid gap-5">
                            <button
                                onClick={() => handleTypeSelect('GENERAL')}
                                className="h-40 bg-gradient-to-r from-blue-500 to-blue-600 rounded-3xl p-8 flex flex-col items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-blue-200/50 border border-blue-400/30"
                            >
                                <Ticket size={48} className="text-white" />
                                <span className="text-3xl font-black text-white tracking-tight">ATENCIÓN GENERAL</span>
                            </button>

                            <button
                                onClick={() => handleTypeSelect('PREFERENTIAL')}
                                className="h-28 bg-white rounded-3xl p-6 flex items-center justify-center gap-4 hover:bg-purple-50 transition-all border-2 border-purple-200 hover:border-purple-400"
                            >
                                <UserPlus size={32} className="text-purple-500" />
                                <span className="text-xl font-bold text-purple-600">PREFERENCIAL / TERCERA EDAD</span>
                            </button>

                            {/* Quick Ticket Option */}
                            <button
                                onClick={() => { setTicketType('GENERAL'); generateTicket('ANON'); }}
                                className="h-16 bg-slate-100 rounded-2xl p-4 flex items-center justify-center gap-3 hover:bg-slate-200 transition-all border border-slate-200"
                            >
                                <ArrowRight size={20} className="text-slate-500" />
                                <span className="text-base font-bold text-slate-500">TICKET RÁPIDO (sin identificar)</span>
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* IDENTIFY STEP (RUT) */}
                {step === 'IDENTIFY' && (
                    <motion.div key="identify" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="z-10 text-center w-full max-w-md mt-16">
                        <button onClick={goBack} className="absolute top-20 left-6 p-2 bg-white rounded-xl shadow border border-slate-200 text-slate-500">
                            <ChevronLeft size={24} />
                        </button>

                        <h2 className="text-2xl text-slate-800 font-bold mb-2">Ingrese su RUT</h2>
                        <p className="text-slate-400 mb-6 text-sm">Para un servicio personalizado</p>

                        <div className="bg-white border border-slate-200 p-6 rounded-2xl mb-6 shadow-sm">
                            <span className="text-4xl font-mono text-blue-600 tracking-widest font-bold">{rut || '–'}</span>
                        </div>

                        <Keypad />

                        <div className="grid grid-cols-2 gap-4 mt-8">
                            <button onClick={handleSkipIdentify} className="py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-colors border border-slate-200">
                                Omitir
                            </button>
                            <button onClick={handleIdentifySubmit} className="py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-colors shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
                                Continuar <ArrowRight size={20} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* REGISTER STEP (Name) */}
                {step === 'REGISTER' && (
                    <motion.div key="register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="z-10 text-center w-full max-w-3xl mt-16">
                        <button onClick={goBack} className="absolute top-20 left-6 p-2 bg-white rounded-xl shadow border border-slate-200 text-slate-500">
                            <ChevronLeft size={24} />
                        </button>

                        <div className="flex items-center justify-center gap-3 mb-2">
                            <User className="text-blue-500" size={28} />
                            <h2 className="text-2xl text-slate-800 font-bold">¿Cuál es su nombre?</h2>
                        </div>
                        <p className="text-slate-400 mb-6 text-sm">Para un mejor servicio</p>

                        <div className="bg-white border border-slate-200 p-6 rounded-2xl mb-6 shadow-sm max-w-md mx-auto">
                            <span className="text-3xl text-slate-800 font-bold">{name || '_'}</span>
                        </div>

                        <Keyboard />

                        <button
                            onClick={handleRegisterSubmit}
                            disabled={!name.trim()}
                            className="mt-8 w-80 py-5 bg-blue-600 text-white text-xl font-bold rounded-2xl hover:bg-blue-500 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-lg shadow-blue-200 mx-auto flex items-center justify-center gap-2 transition-colors"
                        >
                            Continuar <ArrowRight size={22} />
                        </button>
                    </motion.div>
                )}

                {/* PHONE STEP */}
                {step === 'PHONE' && (
                    <motion.div key="phone" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="z-10 text-center w-full max-w-md mt-16">
                        <button onClick={goBack} className="absolute top-20 left-6 p-2 bg-white rounded-xl shadow border border-slate-200 text-slate-500">
                            <ChevronLeft size={24} />
                        </button>

                        <div className="flex items-center justify-center gap-3 mb-2">
                            <Phone className="text-blue-500" size={28} />
                            <h2 className="text-2xl text-slate-800 font-bold">Teléfono (Opcional)</h2>
                        </div>
                        <p className="text-slate-400 mb-6 text-sm">Para notificaciones y ofertas</p>

                        <div className="bg-white border border-slate-200 p-6 rounded-2xl mb-6 shadow-sm">
                            <span className="text-3xl font-mono text-blue-600 tracking-wider font-bold">{phone}</span>
                        </div>

                        <PhoneKeypad />

                        <div className="grid grid-cols-2 gap-4 mt-8">
                            <button onClick={handleSkipPhone} className="py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-colors border border-slate-200">
                                Omitir
                            </button>
                            <button onClick={handlePhoneSubmit} className="py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-colors shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
                                <Check size={20} /> Confirmar
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* SUCCESS STEP */}
                {step === 'SUCCESS' && ticket && (
                    <motion.div key="success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="z-10 text-center mt-16">
                        <div className="bg-white rounded-[2rem] p-12 shadow-2xl border border-slate-100 max-w-lg mx-auto">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Check size={32} className="text-green-600" />
                            </div>
                            <p className="text-slate-400 font-bold tracking-widest mb-4 uppercase">Su número es</p>
                            <h1 className="text-8xl font-black text-slate-900 mb-4">{ticket.code}</h1>
                            {customerName && <p className="text-blue-600 font-bold text-xl mb-6">Hola, {customerName}</p>}
                            <div className="bg-slate-50 p-4 rounded-xl flex items-center justify-center gap-3 text-slate-400 animate-pulse border border-slate-100">
                                <Printer size={24} />
                                <span className="font-bold">Imprimiendo ticket...</span>
                            </div>
                        </div>
                        <p className="text-slate-400 mt-8 text-lg">Espere su llamado en pantalla</p>
                    </motion.div>
                )}

            </AnimatePresence>

            {/* Hidden Print Area */}
            {ticket && (
                <div id="printable-ticket" style={{ display: 'none' }}>
                    <div style={{ textAlign: 'center', fontFamily: 'monospace', padding: '10px' }}>
                        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '5px 0' }}>Farmacias Vallenar</h2>
                        <p style={{ fontSize: '12px', marginBottom: '15px' }}>{locationName}</p>
                        <div style={{ borderTop: '2px dashed black', borderBottom: '2px dashed black', margin: '15px 0', padding: '15px 0' }}>
                            <h1 style={{ fontSize: '4rem', margin: 0, fontWeight: '900' }}>{ticket.code}</h1>
                            <p style={{ fontSize: '12px', marginTop: '5px' }}>
                                {new Date().toLocaleString('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                        <p style={{ fontSize: '12px' }}>Espere su llamado en pantalla</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QueueKioskPage;
