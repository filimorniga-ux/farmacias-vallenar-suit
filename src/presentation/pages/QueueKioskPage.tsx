import React, { useState, useEffect, useCallback } from 'react';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import { Ticket, UserPlus, ArrowRight, Settings, Printer, X, Phone, User, MapPin, Check, ChevronLeft, LogOut, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PrinterService } from '../../domain/services/PrinterService';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/presentation/components/ui/tabs"
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

const Keypad = ({ onNumberClick, onBackspace }: { onNumberClick: (n: string) => void, onBackspace: () => void }) => (
    <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'K', 0].map((k) => (
            <button
                key={k}
                onClick={() => onNumberClick(k.toString())}
                className="h-16 text-2xl font-bold bg-slate-100 text-slate-700 rounded-2xl active:bg-blue-100 active:text-blue-600 transition-all border border-slate-200 shadow-sm"
            >
                {k}
            </button>
        ))}
        <button
            onClick={onBackspace}
            className="h-16 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl active:bg-red-100 transition-all border border-red-100"
        >
            <X size={28} />
        </button>
    </div>
);

const PhoneKeypad = ({ onNumberClick, onBackspace }: { onNumberClick: (n: string) => void, onBackspace: () => void }) => (
    <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '+', 0].map((k) => (
            <button
                key={k}
                onClick={() => onNumberClick(k.toString())}
                className="h-16 text-2xl font-bold bg-slate-100 text-slate-700 rounded-2xl active:bg-blue-100 active:text-blue-600 transition-all border border-slate-200 shadow-sm"
            >
                {k}
            </button>
        ))}
        <button
            onClick={onBackspace}
            className="h-16 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl active:bg-red-100 transition-all border border-red-100"
        >
            <X size={28} />
        </button>
    </div>
);

const Keyboard = ({ onCharClick, onSpace, onBackspace }: { onCharClick: (c: string) => void, onSpace: () => void, onBackspace: () => void }) => (
    <div className="grid grid-cols-10 gap-1.5 max-w-2xl mx-auto">
        {'QWERTYUIOPASDFGHJKLÑZXCVBNM'.split('').map(char => (
            <button
                key={char}
                onClick={() => onCharClick(char)}
                className="h-12 text-lg font-bold bg-slate-100 text-slate-700 rounded-xl active:bg-blue-100 active:text-blue-600 transition-all"
            >
                {char}
            </button>
        ))}
        <button
            onClick={onSpace}
            className="col-span-8 h-12 text-lg font-bold bg-slate-100 text-slate-600 rounded-xl"
        >
            ESPACIO
        </button>
        <button
            onClick={onBackspace}
            className="col-span-2 h-12 flex items-center justify-center bg-red-50 text-red-500 rounded-xl"
        >
            <X size={20} />
        </button>
    </div>
);

const QueueKioskPage: React.FC = () => {
    const { printerConfig, customers } = usePharmaStore();
    const { kiosks, updateKioskStatus, locations: storeLocations, fetchLocations } = useLocationStore();

    // Kiosk Mode State
    const [isKioskActive, setIsKioskActive] = useState(false);
    const [activationPin, setActivationPin] = useState('');
    const [exitPin, setExitPin] = useState('');
    const [showExitPrompt, setShowExitPrompt] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    // Flow State
    const [step, setStep] = useState<Step>('WELCOME');
    const [ticketType, setTicketType] = useState<TicketType>('GENERAL');

    // Location State
    const [locationId, setLocationId] = useState<string>('');
    const [locations, setLocations] = useState<Location[]>([]);

    // Derived state (safe for server)
    const locationName = locations.find(l => l.id === locationId)?.name || 'Farmacia';

    // Customer Data
    const [rut, setRut] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('+569');

    // Result
    const [ticket, setTicket] = useState<any>(null);
    const [customerName, setCustomerName] = useState('');

    // Setup Lock (for changing location)
    const [setupPin, setSetupPin] = useState('');
    const [pairingCode, setPairingCode] = useState(''); // New State for Pairing Code
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
    // KEYBOARD LISTENER (Physical Keyboard Support)
    // =============================================================================



    // =============================================================================
    // INIT: Load location from localStorage (shared with ContextSelectionPage)
    // =============================================================================

    useEffect(() => {
        setIsMounted(true);
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

    const handlePairWithCode = (code: string) => {
        console.log('Attempting to pair with code:', code);
        const kiosk = kiosks.find(k => k.pairing_code === code);

        if (kiosk) {
            console.log('Kiosk found:', kiosk);
            // 1. Set Location
            setLocationId(kiosk.location_id);
            localStorage.setItem('preferred_location_id', kiosk.location_id);

            // 2. Find Location Name (Try local state or store)
            const locName = locations.find(l => l.id === kiosk.location_id)?.name
                || storeLocations.find(l => l.id === kiosk.location_id)?.name;

            if (locName) {
                localStorage.setItem('preferred_location_name', locName);
            }

            // 3. Mark as Active locally and in store
            updateKioskStatus(kiosk.id, 'ACTIVE');

            // 4. Enter Kiosk Mode
            setIsKioskActive(true);
            toast.success(`¡Vinculado a ${locName || 'Sucursal'}!`);

            // 5. Clean up
            setPairingCode('');
            enterFullscreen();
        } else {
            console.warn('Invalid code. Available kiosks:', kiosks);
            setPairingCode('');
            toast.error('Código inválido o expirado');
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

                // Auto-reset after 3s (thermal printers are fast)
                setTimeout(() => {
                    setStep('WELCOME');
                    setTicket(null);
                    resetForm();
                }, 3000);
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

    // =============================================================================
    // KEYBOARD LISTENER (Physical Keyboard Support)
    // =============================================================================

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if regular inputs are focused (Setup/Activation screens)
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            const key = e.key;

            // Global Back/Escape
            if (key === 'Escape') {
                if (step === 'IDENTIFY' || step === 'REGISTER' || step === 'PHONE') {
                    goBack();
                } else if (step === 'WELCOME') {
                    setShowExitPrompt(true);
                }
                return;
            }

            // Step: IDENTIFY (RUT)
            if (step === 'IDENTIFY') {
                if (/^[0-9kK]$/.test(key)) {
                    // Need to use functional update wrapper or access current state
                    // We use the existing handler but it sets state.
                    // To avoid stale state issues in this closure, we rely on the dependency array
                    // re-creating this listener on every change. 
                    handleNumberClick(key.toUpperCase());
                } else if (key === 'Backspace') {
                    handleBackspace();
                } else if (key === 'Enter') {
                    handleIdentifySubmit();
                }
            }

            // Step: REGISTER (Name)
            if (step === 'REGISTER') {
                if (/^[a-zA-Z\s\u00f1\u00d1]$/.test(key) && key.length === 1) {
                    setName(prev => prev + key);
                } else if (key === 'Backspace') {
                    setName(prev => prev.slice(0, -1));
                } else if (key === 'Enter') {
                    handleRegisterSubmit();
                }
            }

            // Step: PHONE
            if (step === 'PHONE') {
                if (/^[0-9+]$/.test(key)) {
                    setPhone(prev => prev.length < 12 ? prev + key : prev);
                } else if (key === 'Backspace') {
                    setPhone(prev => prev.length > 4 ? prev.slice(0, -1) : prev);
                } else if (key === 'Enter') {
                    handlePhoneSubmit();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [step, rut, name, phone, locationId, customers, ticketType]); // Re-bind when state changes to keep closures fresh

    // =============================================================================
    // RENDER
    // =============================================================================

    // =============================================================================
    // KIOSK ACTIVATION SCREEN
    // =============================================================================

    if (!isKioskActive) {
        // Prevent hydration mismatch by rendering null until mounted
        if (!isMounted) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            );
        }

        const hasLocation = !!locationId;

        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
                {/* Background Ambience */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                    <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-sky-200/40 rounded-full blur-[128px]" />
                    <div className="absolute bottom-[10%] right-[20%] w-[500px] h-[500px] bg-teal-100/30 rounded-full blur-[128px]" />
                </div>

                <div className="relative z-10 bg-white/80 backdrop-blur-xl p-10 rounded-[3rem] border border-sky-100 shadow-2xl shadow-sky-900/5 max-w-lg w-full text-center">
                    <div className="w-20 h-20 bg-sky-100 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-sky-200">
                        <Ticket size={40} className="text-sky-600" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 mb-2">Totem de Turnos</h1>

                    {/* Step 1: Select Location if not set */}
                    {/* Step 1: Select Location or Pair Code if not set */}
                    {!hasLocation && (
                        <div className="mb-8 w-full">
                            <Tabs defaultValue="list" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 mb-6">
                                    <TabsTrigger value="list">Lista</TabsTrigger>
                                    <TabsTrigger value="code">Código</TabsTrigger>
                                </TabsList>

                                {/* OPTION A: LIST */}
                                <TabsContent value="list">
                                    <p className="text-slate-500 mb-4 font-medium">Seleccione sucursal manualmente</p>
                                    <div className="grid gap-3 max-h-64 overflow-y-auto">
                                        {locations.map(loc => (
                                            <button
                                                key={loc.id}
                                                onClick={() => {
                                                    setLocationId(loc.id);
                                                    localStorage.setItem('preferred_location_id', loc.id);
                                                    localStorage.setItem('preferred_location_name', loc.name);
                                                }}
                                                className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-700 font-bold hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 transition-all flex items-center gap-3 shadow-sm group text-left"
                                            >
                                                <MapPin size={18} className="text-sky-400 group-hover:text-sky-500" />
                                                <span className="truncate">{loc.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </TabsContent>

                                {/* OPTION B: PAIRING CODE */}
                                <TabsContent value="code">
                                    <p className="text-slate-500 mb-6 font-medium">Ingrese código de vinculación</p>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        placeholder="CÓDIGO"
                                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-6 text-center text-slate-800 text-3xl font-mono font-bold uppercase focus:border-sky-500 outline-none mb-4 transition-all tracking-widest placeholder:text-slate-300"
                                        value={pairingCode}
                                        onChange={e => {
                                            const val = e.target.value.toUpperCase();
                                            setPairingCode(val);
                                            if (val.length === 6) handlePairWithCode(val);
                                        }}
                                    />
                                    <p className="text-xs text-slate-400">Genera este código desde Gestión de Red</p>
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}

                    {/* Step 2: Enter PIN (only show if location is set) */}
                    {hasLocation && (
                        <>
                            <p className="text-slate-500 mb-8">Ingrese PIN de administrador para activar</p>

                            <input
                                type="password"
                                maxLength={4}
                                placeholder="••••"
                                className="w-full bg-sky-50 border-2 border-sky-100 rounded-2xl px-4 py-6 text-center text-slate-800 text-5xl tracking-[0.8em] focus:border-sky-500 outline-none mb-8 transition-all"
                                value={activationPin}
                                autoFocus
                                onChange={e => {
                                    setActivationPin(e.target.value);
                                    if (e.target.value.length === 4) handleActivateKiosk(e.target.value);
                                }}
                            />
                        </>
                    )}

                    <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-slate-100 px-4 py-2 rounded-full border border-slate-200 mt-2">
                            <MapPin size={12} className="text-sky-500" />
                            {locationName}
                        </div>
                        {hasLocation && (
                            <button
                                onClick={() => { setLocationId(''); localStorage.removeItem('preferred_location_id'); }}
                                className="text-sky-600 font-bold hover:text-sky-700 text-xs transition-colors"
                            >
                                (cambiar sucursal)
                            </button>
                        )}
                    </div>
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
            <header className="absolute top-0 left-0 right-0 bg-white border-b border-slate-100 py-5 px-8 flex items-center justify-between shadow-sm z-20">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600 border border-sky-100">
                        <MapPin size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] mb-0.5">Terminal de Sucursal</p>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">{locationName}</h1>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <p className="text-2xl font-black text-slate-800 tabular-nums leading-none">
                            {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Modo Kiosco Activo</p>
                    </div>
                    <button
                        onClick={() => setShowExitPrompt(true)}
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all border border-slate-100"
                    >
                        <LogOut size={22} />
                    </button>
                </div>
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

                                <div className="space-y-6">
                                    {/* Option A: Manual PIN */}
                                    <div>
                                        <p className="text-slate-500 mb-2 text-xs font-bold uppercase tracking-wider">Acceso Manual (Admin)</p>
                                        <input
                                            type="password"
                                            maxLength={4}
                                            placeholder="••••"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center text-slate-800 text-2xl tracking-[0.5em] focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:tracking-normal"
                                            value={setupPin}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setSetupPin(val);
                                                if (val.length === 4) unlockSetup(val);
                                            }}
                                        />
                                    </div>

                                    <div className="relative flex py-2 items-center">
                                        <div className="flex-grow border-t border-slate-200"></div>
                                        <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase">O Vincular</span>
                                        <div className="flex-grow border-t border-slate-200"></div>
                                    </div>

                                    {/* Option B: Pairing Code */}
                                    <div>
                                        <p className="text-slate-500 mb-2 text-xs font-bold uppercase tracking-wider">Código de Vinculación</p>
                                        <input
                                            type="text"
                                            maxLength={6}
                                            placeholder="CÓDIGO"
                                            className="w-full bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-3 text-center text-cyan-800 text-2xl font-mono font-bold uppercase focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none transition-all placeholder:text-cyan-300/50"
                                            value={pairingCode}
                                            onChange={e => {
                                                const val = e.target.value.toUpperCase();
                                                setPairingCode(val);
                                                if (val.length === 6) handlePairWithCode(val);
                                            }}
                                        />
                                    </div>
                                </div>
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
                    <motion.div key="welcome" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.1, opacity: 0 }} className="z-10 w-full max-w-xl mt-16 px-6">
                        <div className="text-center mb-12">
                            <div className="inline-flex items-center gap-2 bg-sky-50 px-4 py-2 rounded-full border border-sky-100 text-sky-600 font-bold text-xs uppercase tracking-[0.2em] mb-6">
                                <Printer size={14} /> Totem de Atención
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">¡Bienvenido!</h2>
                            <p className="text-slate-500 text-lg font-medium">Seleccione el servicio que necesita hoy</p>
                        </div>

                        <div className="grid gap-6">
                            <button
                                onClick={() => handleTypeSelect('GENERAL')}
                                className="group relative h-48 bg-white rounded-[40px] p-10 flex flex-col items-center justify-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-sky-900/5 border border-slate-100 hover:border-sky-300 overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 w-2 bg-sky-500 h-full" />
                                <div className="w-20 h-20 bg-sky-50 rounded-3xl flex items-center justify-center text-sky-600 group-hover:bg-sky-500 group-hover:text-white transition-all transform group-hover:rotate-6 border border-sky-100">
                                    <Ticket size={40} />
                                </div>
                                <span className="text-3xl font-black text-slate-800 tracking-tight group-hover:text-sky-700 transition-colors">ATENCIÓN GENERAL</span>
                            </button>

                            <button
                                onClick={() => handleTypeSelect('PREFERENTIAL')}
                                className="group relative h-32 bg-white rounded-[32px] p-8 flex items-center justify-center gap-6 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-sky-900/5 border border-slate-100 hover:border-teal-300"
                            >
                                <div className="absolute top-0 left-0 w-2 bg-teal-500 h-full" />
                                <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600 group-hover:bg-teal-500 group-hover:text-white transition-all border border-teal-100">
                                    <UserPlus size={32} />
                                </div>
                                <span className="text-2xl font-black text-slate-800 tracking-tight group-hover:text-teal-700 transition-colors">MESA PREFERENCIAL</span>
                            </button>

                            {/* Quick Ticket Option */}
                            <button
                                onClick={() => { setTicketType('GENERAL'); generateTicket('ANON'); }}
                                className="h-20 bg-slate-50 border border-slate-200 rounded-[24px] p-4 flex items-center justify-center gap-4 hover:bg-slate-100 transition-all active:scale-[0.98] group"
                            >
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-sky-500 border border-slate-200 transition-colors">
                                    <ArrowRight size={20} />
                                </div>
                                <span className="text-lg font-bold text-slate-500 group-hover:text-slate-700 tracking-tight">EMITIR TICKET RÁPIDO (SIN RUT)</span>
                            </button>
                        </div>

                        <div className="mt-16 text-center">
                            <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.3em] font-mono">Farmacias Vallenar Suit v2.1</p>
                        </div>
                    </motion.div>
                )}

                {/* IDENTIFY STEP (RUT) */}
                {step === 'IDENTIFY' && (
                    <motion.div key="identify" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="z-10 text-center w-full max-w-lg mt-16 px-6">
                        <button onClick={goBack} className="absolute top-28 left-8 w-14 h-14 bg-white rounded-2xl shadow-xl shadow-sky-900/5 border border-slate-100 text-slate-400 hover:text-sky-600 transition-all flex items-center justify-center active:scale-95">
                            <ChevronLeft size={32} />
                        </button>

                        <div className="mb-10 text-center">
                            <div className="w-20 h-20 bg-sky-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-sky-600 border border-sky-100">
                                <User size={40} />
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Ingrese su RUT</h2>
                            <p className="text-slate-500 font-medium">Ayúdenos a agilizar su atención</p>
                        </div>

                        <div className="bg-white border-2 border-slate-100 p-8 rounded-[32px] mb-10 shadow-xl shadow-sky-900/5 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-sky-500 opacity-20" />
                            <span className="text-5xl font-black text-sky-600 tracking-widest font-mono group-hover:scale-105 transition-transform inline-block">
                                {rut || <span className="text-slate-200">RUT AQUÍ</span>}
                            </span>
                        </div>

                        <div className="max-w-xs mx-auto mb-10">
                            <Keypad onNumberClick={handleNumberClick} onBackspace={handleBackspace} />
                        </div>

                        <div className="grid grid-cols-2 gap-6 max-w-md mx-auto">
                            <button onClick={handleSkipIdentify} className="py-6 bg-slate-50 text-slate-400 font-black uppercase tracking-widest text-xs rounded-[24px] hover:bg-slate-100 hover:text-slate-600 transition-all border border-slate-100 active:scale-95">
                                Omitir RUT
                            </button>
                            <button
                                onClick={handleIdentifySubmit}
                                disabled={rut.length < 8}
                                className="py-6 bg-sky-600 text-white font-black uppercase tracking-widest text-xs rounded-[24px] hover:bg-sky-500 transition-all shadow-xl shadow-sky-600/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale disabled:scale-100 active:scale-95 border-b-4 border-sky-800"
                            >
                                SIGUIENTE <ArrowRight size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* REGISTER STEP (Name) */}
                {step === 'REGISTER' && (
                    <motion.div key="register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="z-10 text-center w-full max-w-4xl mt-16 px-6">
                        <button onClick={goBack} className="absolute top-28 left-8 w-14 h-14 bg-white rounded-2xl shadow-xl shadow-sky-900/5 border border-slate-100 text-slate-400 hover:text-sky-600 transition-all flex items-center justify-center active:scale-95">
                            <ChevronLeft size={32} />
                        </button>

                        <div className="mb-10 text-center">
                            <div className="w-20 h-20 bg-sky-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-sky-600 border border-sky-100">
                                <User size={40} />
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">¿Cuál es su nombre?</h2>
                            <p className="text-slate-500 font-medium">Para un servicio más cercano y personalizado</p>
                        </div>

                        <div className="bg-white border-2 border-slate-100 p-8 rounded-[32px] mb-10 shadow-xl shadow-sky-900/5 max-w-lg mx-auto relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-sky-500 opacity-20" />
                            <span className="text-4xl font-black text-slate-800 tracking-tight group-hover:scale-105 transition-transform inline-block">
                                {name || <span className="text-slate-200">SU NOMBRE AQUÍ</span>}
                            </span>
                        </div>

                        <div className="max-w-3xl mx-auto mb-10">
                            <Keyboard
                                onCharClick={(c) => setName(prev => prev + c)}
                                onSpace={() => setName(prev => prev + ' ')}
                                onBackspace={() => setName(prev => prev.slice(0, -1))}
                            />
                        </div>

                        <button
                            onClick={handleRegisterSubmit}
                            disabled={!name.trim()}
                            className="w-full max-w-md py-6 bg-sky-600 text-white font-black uppercase tracking-widest text-sm rounded-[24px] hover:bg-sky-500 transition-all shadow-2xl shadow-sky-600/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale disabled:scale-100 active:scale-95 mx-auto border-b-4 border-sky-800"
                        >
                            CONTINUAR <ArrowRight size={22} />
                        </button>
                    </motion.div>
                )}

                {/* PHONE STEP */}
                {step === 'PHONE' && (
                    <motion.div key="phone" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="z-10 text-center w-full max-w-lg mt-16 px-6">
                        <button onClick={goBack} className="absolute top-28 left-8 w-14 h-14 bg-white rounded-2xl shadow-xl shadow-sky-900/5 border border-slate-100 text-slate-400 hover:text-sky-600 transition-all flex items-center justify-center active:scale-95">
                            <ChevronLeft size={32} />
                        </button>

                        <div className="mb-10 text-center">
                            <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-600 border border-emerald-100">
                                <Phone size={40} />
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Teléfono (Opcional)</h2>
                            <p className="text-slate-500 font-medium">Le avisaremos por WhatsApp cuando sea su turno</p>
                        </div>

                        <div className="bg-white border-2 border-slate-100 p-8 rounded-[32px] mb-10 shadow-xl shadow-sky-900/5 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500 opacity-20" />
                            <span className="text-5xl font-black text-emerald-600 tracking-wider font-mono group-hover:scale-105 transition-transform inline-block">
                                {phone}
                            </span>
                        </div>

                        <div className="max-w-xs mx-auto mb-10">
                            <PhoneKeypad
                                onNumberClick={(k) => setPhone(prev => prev.length < 12 ? prev + k : prev)}
                                onBackspace={() => setPhone(prev => prev.length > 4 ? prev.slice(0, -1) : prev)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6 max-w-md mx-auto">
                            <button onClick={handleSkipPhone} className="py-6 bg-slate-50 text-slate-400 font-black uppercase tracking-widest text-xs rounded-[24px] hover:bg-slate-100 hover:text-slate-600 transition-all border border-slate-100 active:scale-95">
                                Omitir
                            </button>
                            <button
                                onClick={handlePhoneSubmit}
                                className="py-6 bg-emerald-600 text-white font-black uppercase tracking-widest text-xs rounded-[24px] hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3 active:scale-95 border-b-4 border-emerald-800"
                            >
                                GENERAR TICKET <Printer size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* SUCCESS STEP */}
                {step === 'SUCCESS' && ticket && (
                    <motion.div
                        key="success"
                        initial={{ scale: 1.2, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="z-10 text-center w-full max-w-lg mt-16 px-6"
                    >
                        <div className="bg-white p-12 rounded-[50px] shadow-2xl shadow-sky-900/10 border-2 border-emerald-100 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />

                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-8 text-emerald-600 border-4 border-white shadow-lg"
                            >
                                <Check size={48} strokeWidth={4} />
                            </motion.div>

                            <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">¡Ticket Generado!</h2>
                            <p className="text-slate-500 text-lg font-medium mb-10">Retire su comprobante impreso abajo</p>

                            <div className="p-8 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 mb-8">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Su Número de Atención</p>
                                <h3 className="text-7xl font-black text-sky-600 tracking-tighter tabular-nums mb-2">
                                    {ticket?.code || '...'}
                                </h3>
                                <p className="text-lg font-bold text-slate-700">{customerName}</p>
                            </div>

                            <div className="flex items-center justify-center gap-3 text-emerald-600 font-black animate-bounce bg-emerald-50 py-3 px-6 rounded-2xl border border-emerald-100">
                                <Printer size={20} />
                                <span className="uppercase tracking-widest text-xs">Imprimiendo comprobante...</span>
                            </div>
                        </div>

                        <div className="mt-12">
                            <p className="text-slate-400 font-medium">Volviendo al inicio automáticamente...</p>
                        </div>
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
