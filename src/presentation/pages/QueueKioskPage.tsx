import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Ticket, User, ArrowRight, Settings, Printer, UserPlus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PrinterService } from '../../domain/services/PrinterService';
import { toast } from 'sonner';
import { exportQueueReportSecure } from '../../actions/queue-export-v2';
import { getLocationsSecure } from '../../actions/get-locations-v2';
import { createTicketSecure } from '../../actions/queue-v2';

const QueueKioskPage: React.FC = () => {
    const { printerConfig } = usePharmaStore();

    // State
    const [step, setStep] = useState<'SETUP' | 'WELCOME' | 'IDENTIFY' | 'REGISTER' | 'SUCCESS'>('WELCOME');
    const [ticketType, setTicketType] = useState<'GENERAL' | 'PREFERENTIAL'>('GENERAL');

    // Data
    const [branchId, setBranchId] = useState('');
    const [locations, setLocations] = useState<any[]>([]);

    // Inputs
    const [rut, setRut] = useState('');
    const [name, setName] = useState('');

    // Result
    const [ticket, setTicket] = useState<any>(null);
    const [customerName, setCustomerName] = useState('');

    // Setup Lock
    const [setupPin, setSetupPin] = useState('');
    const [isSetupUnlocked, setIsSetupUnlocked] = useState(false);

    // Load Config
    useEffect(() => {
        // ... (existing config load)
        const storedBranch = localStorage.getItem('kiosk_branch_id');
        // Simple uuid check (length > 30) to filter out legacy 'SUC-CENTRO'
        if (storedBranch && storedBranch.length > 30) {
            setBranchId(storedBranch);
            setStep('WELCOME');
            // Fetch name for printing (V2)
            getLocationsSecure().then((res: any) => {
                if (res.success) setLocations(res.locations || []);
            });
        } else {
            localStorage.removeItem('kiosk_branch_id'); // Clear invalid legacy
            setStep('SETUP');
            getLocationsSecure().then((res: any) => {
                if (res.success) {
                    setLocations(res.locations || []);
                }
            });
        }
    }, []);

    // Print Trigger (Dev Mode)
    useEffect(() => {
        if (step === 'SUCCESS' && ticket && ticket.code) {
            // Wait for DOM to update with ticket data
            const timer = setTimeout(() => {
                window.print();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [step, ticket]);

    const branchName = locations.find(l => l.id === branchId)?.name || 'Farmacia Vallenar';

    // --- Actions ---

    const handleSetup = (selectedBranch: string) => {
        if (!selectedBranch) return;
        localStorage.setItem('kiosk_branch_id', selectedBranch);
        setBranchId(selectedBranch);
        setTimeout(() => setStep('WELCOME'), 100);
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

    const handleTypeSelect = (type: 'GENERAL' | 'PREFERENTIAL') => {
        setTicketType(type);
        setStep('IDENTIFY');
        setRut('');
        setName('');
    };

    const handleNumberClick = (num: string) => {
        if (rut.length < 12) {
            setRut(prev => formatRut(prev + num));
        }
    };

    const handleBackspace = () => {
        setRut(prev => formatRut(prev.slice(0, -1)));
    };

    const formatRut = (value: string) => {
        const clean = value.replace(/[^0-9kK]/g, '');
        if (clean.length <= 1) return clean;
        const body = clean.slice(0, -1);
        const dv = clean.slice(-1);
        return `${body}-${dv}`;
    };

    const handleIdentifySubmit = async () => {
        if (rut.length < 8) {
            toast.error('RUT inválido');
            return;
        }

        // We proceed to register step if name is needed, OR we could check DB here.
        // For smoother UX, let's try to generate ticket. If backend says "New Customer need name" (not implemented yet)
        // Actually, the requirement says: "Paso 3: REGISTER (Solo si es nuevo)".
        // Since we don't have a dedicated "checkCustomer" API exposed yet (besides createTicket doing it internally),
        // we can attempt to create ticket. If we want to capture name for new users, we ideally need to check FIRST.
        // Let's assume we simply go to REGISTER step for everyone providing RUT if we want to confirm name?
        // OR better: Just go to Ticket generation if we assume old customers.
        // BUT, to fulfill "Captura de datos", asking for name is good if we don't know them.
        // Let's Step 3 (Register) be conditional? 
        // Without a check action, I'll add a helper `checkCustomer` here or in queue.ts.
        // ACTUALLY, I can use the `createTicket` returns. But that creates the ticket. 
        // Let's add a lightweight check to `getCustomers` or assume we ask Name if not found in local store?
        // Local store `customers` has 500 loaded. That's a good proxy!

        // USE LOCAL STORE for fast check!
        const { customers } = usePharmaStore.getState();
        const exists = customers.find(c => c.rut === rut);

        if (exists) {
            setCustomerName(exists.name);
            generateFinalTicket(rut, exists.name);
        } else {
            setStep('REGISTER');
        }
    };

    const handleSkipIdentify = () => {
        setRut('ANON');
        generateFinalTicket('ANON');
    };

    const handleRegisterSubmit = () => {
        if (!name.trim()) return;
        setCustomerName(name);
        generateFinalTicket(rut, name);
    };

    const generateFinalTicket = async (finalRut: string, finalName?: string) => {
        try {
            // V2: Usa createTicketSecure con nuevo formato
            const res = await createTicketSecure({
                branchId: branchId,
                rut: finalRut,
                type: ticketType,
                name: finalName
            });

            if (res.success && res.ticket) {
                setTicket(res.ticket);
                setCustomerName(res.ticket.customerName || (finalName || ''));
                setStep('SUCCESS');

                // Print (Existing Service)
                PrinterService.printQueueTicket({
                    ...res.ticket,
                    number: res.ticket.code, // Map code to number for printer
                    timestamp: new Date(res.ticket.created_at).getTime()
                }, printerConfig);

                // Auto-close (Delay increased to allow printing)
                setTimeout(() => {
                    setStep('WELCOME');
                    setTicket(null);
                    setRut('');
                    setName('');
                }, 8000);
            } else {
                console.error('Ticket Error:', res.error);
                toast.error(`Error: ${res.error || 'Fallo desconocido'}`);
            }
        } catch (e: any) {
            console.error('Network Error:', e);
            toast.error(`Error de conexión: ${e.message}`);
        }
    };

    // --- Components ---

    const Keypad = () => (
        <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mb-8">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'K', 0].map((k) => (
                <button
                    key={k}
                    onClick={() => handleNumberClick(k.toString())}
                    className="h-20 text-3xl font-bold bg-white/10 text-white rounded-2xl active:bg-white/20 transition-colors border border-white/10"
                >
                    {k}
                </button>
            ))}
            <button
                onClick={handleBackspace}
                className="h-20 flex items-center justify-center bg-red-500/20 text-red-500 rounded-2xl active:bg-red-500/40 transition-colors border border-red-500/20"
            >
                <X size={32} />
            </button>
        </div>
    );

    const Keyboard = () => (
        <div className="grid grid-cols-10 gap-2 max-w-3xl mx-auto mb-8">
            {'QWERTYUIOPASDFGHJKLÑZXCVBNM'.split('').map(char => (
                <button
                    key={char}
                    onClick={() => setName(prev => prev + char)}
                    className="h-16 text-xl font-bold bg-white/10 text-white rounded-xl active:bg-white/20 transition-colors"
                >
                    {char}
                </button>
            ))}
            <button
                onClick={() => setName(prev => prev + ' ')}
                className="col-span-8 h-16 text-xl font-bold bg-white/10 text-white rounded-xl"
            >
                ESPACIO
            </button>
            <button
                onClick={() => setName(prev => prev.slice(0, -1))}
                className="col-span-2 h-16 flex items-center justify-center bg-red-500/20 text-red-500 rounded-xl"
            >
                <X />
            </button>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 relative overflow-hidden select-none">
            {/* CSS for Printing (High Contrast Force) */}
            <style>{`
                @media print {
                    /* 1. Ocultar todo lo demás */
                    body, #root, .app-container {
                        visibility: hidden;
                        height: 0;
                        overflow: hidden;
                    }

                    /* 2. Posicionar y Mostrar Ticket */
                    #printable-ticket {
                        visibility: visible !important;
                        display: block !important;
                        position: fixed !important;
                        top: 0;
                        left: 0;
                        width: 80mm !important;
                        margin: 0 auto;
                        background-color: white !important;
                        color: black !important;
                        z-index: 99999999;
                    }

                    /* 3. Forzar color negro en todos los hijos */
                    #printable-ticket * {
                        visibility: visible !important;
                        color: black !important;
                        text-shadow: none !important;
                        filter: none !important;
                    }
                    
                    /* 4. Limpieza de página */
                    @page {
                        size: auto;
                        margin: 0mm;
                    }
                }
            `}</style>

            {/* Background */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black pointer-events-none" />

            <header className="absolute top-12 text-center z-10">
                <h1 className="text-4xl font-black text-white tracking-widest uppercase opacity-80">Farmacias Vallenar</h1>
                {branchId && <p className="text-cyan-600 font-mono text-sm mt-2">{branchId}</p>}
            </header>

            <AnimatePresence mode="wait">
                {step === 'SETUP' && (
                    <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="z-20 text-center">
                        {!isSetupUnlocked ? (
                            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10">
                                <Settings className="mx-auto text-slate-500 mb-4" size={48} />
                                <h2 className="text-2xl text-white font-bold mb-4">Configuración</h2>
                                <input
                                    type="password"
                                    maxLength={4}
                                    placeholder="PIN"
                                    className="w-full bg-black/50 border border-slate-700 rounded-xl px-4 py-3 text-center text-white text-2xl tracking-widest focus:border-cyan-500 outline-none"
                                    value={setupPin}
                                    onChange={e => {
                                        setSetupPin(e.target.value);
                                        if (e.target.value.length === 4) unlockSetup(e.target.value);
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="grid gap-4 w-96">
                                <h2 className="text-white text-xl font-bold mb-2">Seleccionar Tienda</h2>
                                {locations.map(loc => (
                                    <button
                                        key={loc.id}
                                        onClick={() => handleSetup(loc.id)}
                                        className="p-4 bg-slate-800 text-white rounded-xl hover:bg-cyan-600 font-bold transition-all border border-slate-700"
                                    >
                                        {loc.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {step === 'WELCOME' && (
                    <motion.div key="welcome" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.1, opacity: 0 }} className="z-20 grid gap-6 w-full max-w-lg">
                        <button
                            onClick={() => handleTypeSelect('GENERAL')}
                            className="h-48 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-[2.5rem] p-8 flex flex-col items-center justify-center gap-4 hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(8,145,178,0.3)] border border-cyan-400/30"
                        >
                            <Ticket size={64} className="text-white" />
                            <span className="text-4xl font-black text-white tracking-tight">GENERAL</span>
                        </button>
                        <button
                            onClick={() => handleTypeSelect('PREFERENTIAL')}
                            className="h-32 bg-slate-800/50 rounded-[2rem] p-6 flex flex-row items-center justify-center gap-4 hover:bg-purple-900/50 transition-all border border-purple-500/30"
                        >
                            <UserPlus size={40} className="text-purple-400" />
                            <span className="text-2xl font-bold text-purple-300">PREFERENCIAL / TERCERA EDAD</span>
                        </button>
                    </motion.div>
                )}

                {step === 'IDENTIFY' && (
                    <motion.div key="identify" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }} className="z-20 text-center w-full max-w-md">
                        <h2 className="text-3xl text-white font-bold mb-8">Ingrese su RUT</h2>

                        <div className="bg-slate-900/50 border border-slate-700 p-6 rounded-2xl mb-8">
                            <span className="text-5xl font-mono text-cyan-400 tracking-widest">{rut || '-'}</span>
                        </div>

                        <Keypad />

                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={handleSkipIdentify} className="py-4 bg-slate-800 text-slate-400 font-bold rounded-xl hover:bg-slate-700">
                                Omitir
                            </button>
                            <button onClick={handleIdentifySubmit} className="py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-500 shadow-lg shadow-cyan-900/20">
                                Continuar <ArrowRight className="inline ml-2" size={20} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {step === 'REGISTER' && (
                    <motion.div key="register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="z-20 text-center w-full max-w-4xl">
                        <h2 className="text-3xl text-white font-bold mb-2">¡Bienvenido!</h2>
                        <p className="text-slate-400 mb-8">Ingrese su nombre para un mejor servicio</p>

                        <div className="bg-slate-900/50 border border-slate-700 p-6 rounded-2xl mb-8 max-w-xl mx-auto">
                            <span className="text-4xl text-white font-bold">{name || '_'}</span>
                        </div>

                        <Keyboard />

                        <button onClick={handleRegisterSubmit} className="w-96 py-6 bg-cyan-600 text-white text-2xl font-bold rounded-2xl hover:bg-cyan-500 shadow-xl shadow-cyan-900/30 mx-auto block">
                            Confirmar
                        </button>
                    </motion.div>
                )}

                {step === 'SUCCESS' && ticket && (
                    <motion.div key="success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="z-20 text-center">
                        <div className="bg-white rounded-3xl p-12 shadow-[0_0_100px_rgba(255,255,255,0.2)] max-w-lg mx-auto">
                            <p className="text-slate-500 font-bold tracking-widest mb-4">SU NÚMERO ES</p>
                            <h1 className="text-9xl font-black text-slate-900 mb-6">{ticket.code}</h1>
                            {customerName && <p className="text-cyan-600 font-bold text-xl mb-6">Hola, {customerName}</p>}
                            <div className="bg-slate-100 p-4 rounded-xl flex items-center justify-center gap-3 text-slate-500 animate-pulse">
                                <Printer size={24} />
                                <span className="text-lg font-bold">Imprimiendo...</span>
                            </div>
                        </div>
                        <p className="text-white/50 mt-8 text-xl">Espere su llamado en pantalla</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hidden Print Area */}
            {ticket && (
                <div id="printable-ticket" style={{ display: 'none' }}>
                    <div style={{ textAlign: 'center', fontFamily: 'monospace', padding: '10px' }}>
                        <div style={{ fontSize: '12px', marginBottom: '10px', filter: 'grayscale(1)' }}>
                            <img src="/logo-full.png" alt="Logo" style={{ width: '60px', margin: '0 auto' }} />
                        </div>
                        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '5px 0' }}>Farmacias Vallenar</h2>
                        <p style={{ fontSize: '12px', marginBottom: '15px' }}>{branchName}</p>

                        <div style={{ borderTop: '2px dashed black', borderBottom: '2px dashed black', margin: '15px 0', padding: '15px 0' }}>
                            <h1 style={{ fontSize: '4rem', margin: 0, fontWeight: '900' }}>{ticket.code}</h1>
                            <p style={{ fontSize: '12px', marginTop: '5px' }}>
                                {new Date().toLocaleString('es-CL', {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit'
                                })}
                            </p>
                        </div>

                        <p style={{ fontSize: '12px', margin: '10px 0' }}>Por favor, espere su llamado en pantalla</p>
                        <br /><br />
                        <p>.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QueueKioskPage;
