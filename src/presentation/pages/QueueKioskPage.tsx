import React, { useState } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Ticket, User, ArrowRight, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const QueueKioskPage: React.FC = () => {
    const { generateTicket, customers, addCustomer } = usePharmaStore();
    const [rut, setRut] = useState('');
    const [name, setName] = useState('');
    const [step, setStep] = useState<'RUT' | 'NAME' | 'TICKET'>('RUT');
    const [ticket, setTicket] = useState<any>(null);
    const [customerName, setCustomerName] = useState('');

    const handleNumberClick = (num: string) => {
        if (rut.length < 12) {
            const raw = rut.replace(/[^0-9kK]/g, '') + num;
            setRut(formatRut(raw));
        }
    };

    const formatRut = (value: string) => {
        const clean = value.replace(/[^0-9kK]/g, '');
        if (clean.length <= 1) return clean;
        const body = clean.slice(0, -1);
        const dv = clean.slice(-1).toUpperCase();
        let formattedBody = '';
        for (let i = body.length - 1, j = 0; i >= 0; i--, j++) {
            formattedBody = body.charAt(i) + (j > 0 && j % 3 === 0 ? '.' : '') + formattedBody;
        }
        return `${formattedBody}-${dv}`;
    };

    const handleRutSubmit = () => {
        if (rut.length < 8) return;

        const existingCustomer = customers.find(c => c.rut === rut);

        if (existingCustomer) {
            setCustomerName(existingCustomer.fullName);
            const newTicket = generateTicket(rut);
            setTicket(newTicket);
            setStep('TICKET');
        } else {
            setStep('NAME'); // Ask for name to register
        }
    };

    const handleRegisterAndTicket = () => {
        if (!name) return;

        // Register new customer
        addCustomer({
            rut,
            fullName: name,
            registrationSource: 'KIOSK'
        });

        setCustomerName(name);
        const newTicket = generateTicket(rut);
        setTicket(newTicket);
        setStep('TICKET');
    };

    const handleSkipRegister = () => {
        const newTicket = generateTicket(); // Anonymous
        setTicket(newTicket);
        setStep('TICKET');
    };

    const reset = () => {
        setRut('');
        setName('');
        setStep('RUT');
        setTicket(null);
        setCustomerName('');
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-cyan-500/20 rounded-full blur-3xl" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-3xl" />
            </div>

            <div className="z-10 w-full max-w-2xl">
                <header className="text-center mb-12">
                    <h1 className="text-5xl font-extrabold text-white mb-4 tracking-tight">Bienvenido</h1>
                    <p className="text-slate-400 text-xl">Farmacias Vallenar Suit</p>
                </header>

                <AnimatePresence mode="wait">
                    {step === 'RUT' && (
                        <motion.div
                            key="rut"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-white/10 backdrop-blur-lg rounded-[3rem] p-8 border border-white/10 shadow-2xl"
                        >
                            <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 text-center border border-slate-700">
                                <p className="text-slate-400 mb-2 text-sm uppercase font-bold tracking-widest">Ingrese su RUT</p>
                                <div className="text-5xl font-mono font-bold text-white tracking-wider h-16 flex items-center justify-center">
                                    {rut || <span className="text-slate-600 animate-pulse">_</span>}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-8">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'K', 0].map((num) => (
                                    <button
                                        key={num}
                                        onClick={() => handleNumberClick(num.toString())}
                                        className="h-20 rounded-2xl bg-slate-800 text-white text-3xl font-bold hover:bg-cyan-600 transition-all shadow-lg active:scale-95 flex items-center justify-center"
                                    >
                                        {num}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setRut(prev => prev.slice(0, -1))}
                                    className="h-20 rounded-2xl bg-red-500/20 text-red-400 text-xl font-bold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                                >
                                    ⌫
                                </button>
                            </div>

                            <button
                                onClick={handleRutSubmit}
                                disabled={rut.length < 8}
                                className="w-full py-6 bg-cyan-500 text-white text-2xl font-bold rounded-2xl hover:bg-cyan-400 transition-all shadow-xl shadow-cyan-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                            >
                                Continuar <ArrowRight />
                            </button>
                        </motion.div>
                    )}

                    {step === 'NAME' && (
                        <motion.div
                            key="name"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="bg-white/10 backdrop-blur-lg rounded-[3rem] p-8 border border-white/10 shadow-2xl text-center"
                        >
                            <div className="mb-8">
                                <div className="w-20 h-20 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-cyan-400">
                                    <UserPlus size={40} />
                                </div>
                                <h2 className="text-3xl font-bold text-white mb-2">¡Hola! No te conocemos.</h2>
                                <p className="text-slate-400">Ingresa tu nombre para registrarte rápidamente.</p>
                            </div>

                            <input
                                type="text"
                                autoFocus
                                placeholder="Tu Nombre"
                                className="w-full bg-slate-800/50 border-2 border-slate-700 rounded-2xl p-6 text-center text-2xl text-white focus:border-cyan-500 focus:outline-none mb-8"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />

                            <div className="space-y-4">
                                <button
                                    onClick={handleRegisterAndTicket}
                                    disabled={!name}
                                    className="w-full py-6 bg-cyan-500 text-white text-xl font-bold rounded-2xl hover:bg-cyan-400 transition-all shadow-xl"
                                >
                                    Registrarme y Sacar Número
                                </button>
                                <button
                                    onClick={handleSkipRegister}
                                    className="w-full py-4 bg-transparent text-slate-400 font-bold hover:text-white transition-colors"
                                >
                                    Omitir y Sacar Número Anónimo
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 'TICKET' && ticket && (
                        <motion.div
                            key="ticket"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white rounded-[3rem] p-12 text-center shadow-2xl max-w-md mx-auto relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-cyan-400 to-blue-500" />

                            <div className="mb-8">
                                <p className="text-slate-400 text-sm uppercase font-bold tracking-widest mb-2">Tu Número de Atención</p>
                                <h2 className="text-8xl font-black text-slate-900 tracking-tighter">{ticket.number}</h2>
                            </div>

                            {customerName && (
                                <div className="mb-8 p-4 bg-cyan-50 rounded-2xl border border-cyan-100">
                                    <p className="text-cyan-800 font-bold">¡Hola, {customerName}!</p>
                                    <p className="text-cyan-600 text-sm">Gracias por registrarte.</p>
                                </div>
                            )}

                            <div className="flex items-center justify-center gap-2 text-slate-400 mb-8">
                                <Ticket size={20} />
                                <span className="font-mono">{new Date().toLocaleTimeString()}</span>
                            </div>

                            <button
                                onClick={reset}
                                className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition"
                            >
                                Finalizar
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default QueueKioskPage;
