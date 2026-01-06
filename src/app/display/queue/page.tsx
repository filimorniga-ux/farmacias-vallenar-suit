'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, MapPin, Volume2, VolumeX, Maximize, Monitor, LogOut, Users } from 'lucide-react';
import { getPublicLocationsSecure } from '@/actions/public-network-v2';
import { getQueueStatusSecure } from '@/actions/queue-v2';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface Location {
    id: string;
    name: string;
}

interface Ticket {
    id: string;
    code: string;
    type: 'GENERAL' | 'PREFERENTIAL';
    terminal_id?: string;
    status: string;
    created_at: string;
    called_at: string;
    terminal_name?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function QueueDisplayPage() {
    // SETUP STATE
    const [step, setStep] = useState<'SETUP' | 'DISPLAY'>('SETUP');
    const [locations, setLocations] = useState<Location[]>([]);
    const [locationId, setLocationId] = useState<string>('');
    const [locationName, setLocationName] = useState<string>('');
    const [setupPin, setSetupPin] = useState('');

    // DISPLAY STATE
    const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
    const [history, setHistory] = useState<Ticket[]>([]);
    const [waitingCount, setWaitingCount] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [waitingList, setWaitingList] = useState<Ticket[]>([]);

    // ... (Init Effects)

    // ... (Poll Effect)

    const audioContextRef = useRef<AudioContext | null>(null);
    const lastCalledTicketIdRef = useRef<string | null>(null);

    // ========================================================================
    // INIT & SETUP
    // ========================================================================

    useEffect(() => {
        // Load persistency
        const savedLocId = localStorage.getItem('queue_display_location_id');
        const savedLocName = localStorage.getItem('queue_display_location_name');

        if (savedLocId) {
            setLocationId(savedLocId);
            setLocationName(savedLocName || 'Sucursal');
            setStep('DISPLAY');
        }

        // Fetch locations for setup
        getPublicLocationsSecure().then(res => {
            if (res.success && res.data) {
                setLocations(res.data);
            }
        });
    }, []);

    const handleSelectLocation = (loc: Location) => {
        setLocationId(loc.id);
        setLocationName(loc.name);
        localStorage.setItem('queue_display_location_id', loc.id);
        localStorage.setItem('queue_display_location_name', loc.name);
        setStep('DISPLAY');
        setSetupPin('');
    };

    const handleReset = () => {
        if (setupPin === '1213') {
            localStorage.removeItem('queue_display_location_id');
            localStorage.removeItem('queue_display_location_name');
            setStep('SETUP');
            setSetupPin('');
            setCurrentTicket(null);
            setHistory([]);
        } else {
            toast.error('PIN Incorrecto');
            setSetupPin('');
        }
    };

    // ========================================================================
    // POLLING & DATA
    // ========================================================================

    useEffect(() => {
        if (step !== 'DISPLAY' || !locationId) return;

        let isMounted = true;
        const POLL_INTERVAL = 2000; // 2 seconds

        const fetchStatus = async () => {
            try {
                const res = await getQueueStatusSecure(locationId);

                if (isMounted && res.success && res.data) {
                    const { calledTickets, waitingCount, lastCompletedTickets, waitingTickets } = res.data;

                    // Merge Active (Called) + History (Completed)
                    const allVideo = [
                        ...(calledTickets || []).map((t: any) => ({ ...t, timestamp: t.called_at })),
                        ...(lastCompletedTickets || []).map((t: any) => ({ ...t, timestamp: t.completed_at || t.called_at }))
                    ];

                    const sortedAll = allVideo.sort((a, b) =>
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    );

                    const latestActive = (calledTickets || []).sort((a: any, b: any) =>
                        new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
                    )[0];

                    const current = latestActive || null;

                    // History List: Show top 3
                    const historyList = sortedAll.filter((t: any) => t.id !== current?.id).slice(0, 3);

                    // Next List: Show top 4
                    const nextList = (waitingTickets || []).slice(0, 4);

                    setCurrentTicket(current);
                    setHistory(historyList);
                    setWaitingList(nextList);
                    setWaitingCount(waitingCount);

                    // Check for Audio Trigger
                    if (current && current.id !== lastCalledTicketIdRef.current) {
                        playAnnouncement(current);
                        lastCalledTicketIdRef.current = current.id;
                    }
                }
            } catch (err) {
                console.error("Poll error:", err);
            }
        };

        // Initial fetch
        fetchStatus();

        // Loop
        const interval = setInterval(fetchStatus, POLL_INTERVAL);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [step, locationId]);

    // ========================================================================
    // AUDIO SYSTEM
    // ========================================================================

    const playDingDong = () => {
        if (isMuted) return;

        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const ctx = audioContextRef.current;
            const t = ctx.currentTime;

            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();

            // Ding (High E)
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(659.25, t); // E5
            gain1.gain.setValueAtTime(0.5, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 1);

            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(t);
            osc1.stop(t + 1);

            // Dong (Low C)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();

            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(523.25, t + 0.6); // C5
            gain2.gain.setValueAtTime(0.5, t + 0.6);
            gain2.gain.exponentialRampToValueAtTime(0.01, t + 2);

            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(t + 0.6);
            osc2.stop(t + 2);

        } catch (e) {
            console.error('Audio error', e);
        }
    };

    const playAnnouncement = (ticket: Ticket) => {
        if (isMuted) return;

        // 1. Ding Dong
        playDingDong();

        // 2. TTS
        setTimeout(() => {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(
                    `Ticket ${ticket.code.split('').join(' ')}, ${ticket.terminal_name || 'Caja'}`
                );
                // "A Cero Cero Uno" reads better than "A001"
                utterance.lang = 'es-ES';
                utterance.rate = 0.9;
                window.speechSynthesis.speak(utterance);
            }
        }, 1500); // Wait for DingDong
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    // ========================================================================
    // RENDER
    // ========================================================================

    if (step === 'SETUP') {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <Monitor className="text-blue-600" size={32} />
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Configuración Monitor</h1>
                            <p className="text-slate-500 text-sm">Seleccione la sucursal para esta pantalla</p>
                        </div>
                    </div>

                    <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-2">
                        {locations.map(loc => (
                            <button
                                key={loc.id}
                                onClick={() => handleSelectLocation(loc)}
                                className="p-4 text-left border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-500 hover:text-blue-700 font-bold transition-all flex items-center gap-3 group"
                            >
                                <MapPin size={20} className="text-slate-400 group-hover:text-blue-500" />
                                {loc.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 overflow-hidden relative font-sans">
            {/* TOOLBAR (Hidden usually) */}
            <div className="absolute top-4 right-4 z-50 flex gap-2 opacity-0 hover:opacity-100 transition-opacity bg-white/80 p-2 rounded-xl backdrop-blur-sm border border-slate-200 shadow-sm">
                <button onClick={() => setIsMuted(!isMuted)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
                    {isMuted ? <VolumeX /> : <Volume2 />}
                </button>
                <button onClick={toggleFullscreen} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
                    <Maximize />
                </button>
                <div className="w-px bg-slate-300 mx-1" />
                <div className="flex items-center gap-2">
                    <input
                        type="password"
                        placeholder="PIN"
                        className="w-16 bg-transparent border border-slate-300 rounded px-2 py-1 text-sm text-center"
                        value={setupPin}
                        onChange={e => setSetupPin(e.target.value)}
                    />
                    <button onClick={handleReset} className="p-2 bg-red-100 hover:bg-red-200 rounded-lg text-red-700">
                        <LogOut size={16} />
                    </button>
                </div>
            </div>

            {/* MAIN LAYOUT */}
            <div className="h-screen grid grid-cols-12 gap-0">

                {/* LEFT: CURRENT TICKET (BIG) */}
                <div className="col-span-8 flex flex-col relative border-r border-blue-100 bg-white">

                    {/* Header */}
                    <div className="absolute top-0 left-0 p-8 flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                            <MapPin size={24} />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Sucursal</p>
                            <span className="text-xl font-bold text-slate-800 tracking-tight">{locationName}</span>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center p-12 relative overflow-hidden">
                        {/* Medical Background Decoration */}
                        <div className="absolute inset-0 pointer-events-none opacity-5">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400 rounded-full blur-[150px]" />
                        </div>

                        <AnimatePresence mode="wait">
                            {currentTicket ? (
                                <motion.div
                                    key={currentTicket.id}
                                    initial={{ scale: 0.8, opacity: 0, y: 50 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 1.2, opacity: 0 }}
                                    transition={{ type: "spring", bounce: 0.5 }}
                                    className="text-center relative z-10"
                                >
                                    <p className="text-3xl text-blue-500 font-bold tracking-[0.2em] uppercase mb-12">Su Turno</p>

                                    <div className="bg-white text-slate-900 rounded-[3rem] px-24 py-16 shadow-[0_20px_60px_-15px_rgba(37,99,235,0.2)] mb-12 border border-blue-100 relative">
                                        <div className="absolute -inset-1 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-[3.1rem] -z-10 blur opacity-20" />
                                        <div className="text-[14rem] leading-none font-black tracking-tighter tabular-nums text-slate-900">
                                            {currentTicket.code}
                                        </div>
                                    </div>

                                    <div className="inline-flex items-center gap-6 bg-blue-50 rounded-2xl px-12 py-6 border border-blue-100">
                                        <p className="text-4xl text-blue-900 font-light">Módulo</p>
                                        <div className="w-px h-12 bg-blue-200"></div>
                                        <p className="text-6xl font-black text-blue-600">
                                            {currentTicket.terminal_name?.replace(/Caja\s*/i, '') || '---'}
                                        </p>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="text-center opacity-30 relative z-10">
                                    <div className="w-40 h-40 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-8 text-slate-300">
                                        <Monitor size={80} />
                                    </div>
                                    <h2 className="text-4xl font-light text-slate-400">Esperando turnos...</h2>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer Stats */}
                    <div className="p-8 border-t border-slate-100 flex justify-between items-end bg-slate-50/50">
                        <div>
                            <p className="text-sm text-slate-500 uppercase tracking-widest mb-1 font-bold">En Espera</p>
                            <p className="text-5xl font-black text-blue-600">{waitingCount}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{new Date().toLocaleDateString()}</p>
                            <p className="text-3xl font-light text-slate-300">
                                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* RIGHT: HISTORY & NEXT */}
                <div className="col-span-4 bg-slate-50 flex flex-col border-l border-slate-200">

                    {/* TOP: HISTORY */}
                    <div className="flex-1 flex flex-col border-b border-slate-200">
                        <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                Últimos Llamados
                            </h2>
                        </div>
                        <div className="flex-1 p-6 space-y-3 overflow-hidden bg-slate-50/50">
                            <AnimatePresence>
                                {history.map((ticket, i) => (
                                    <motion.div
                                        key={ticket.id}
                                        initial={{ x: 20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm"
                                    >
                                        <div>
                                            <p className="text-2xl font-black text-slate-700">{ticket.code}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">Módulo</p>
                                            {ticket.status === 'NO_SHOW' ? (
                                                <p className="text-sm font-bold text-red-400">NO SE PRESENTÓ</p>
                                            ) : (
                                                <p className="text-lg font-bold text-blue-600">{ticket.terminal_name?.replace(/Caja\s*/i, '') || '---'}</p>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* BOTTOM: NEXT IN LINE */}
                    <div className="h-1/3 bg-white flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-600 flex items-center gap-2">
                                <Users size={18} />
                                Próximos Turnos
                            </h2>
                            <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{waitingCount} En Espera</span>
                        </div>
                        <div className="flex-1 p-6 overflow-hidden">
                            {waitingList.length > 0 ? (
                                <div className="grid grid-cols-2 gap-3">
                                    {waitingList.map((t) => (
                                        <div key={t.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                                            <span className="text-xl font-bold text-slate-500">{t.code}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-300 italic text-sm">
                                    No hay tickets en espera
                                </div>
                            )}
                        </div>

                        {/* Branding Footer */}
                        <div className="p-4 bg-slate-900 text-center">
                            <h2 className="text-xl font-black text-white tracking-tight">Farmacias <span className="text-cyan-400">Vallenar</span></h2>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
