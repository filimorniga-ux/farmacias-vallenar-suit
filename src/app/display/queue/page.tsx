'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, MapPin, Volume2, VolumeX, Maximize, Monitor, LogOut, Users, Check } from 'lucide-react';
import { getPublicLocationsSecure } from '@/actions/public-network-v2';
import { getQueueStatusSecure } from '@/actions/queue-v2';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

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
    module_number?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function QueueDisplayPage() {
    const router = useRouter();
    // SETUP STATE
    const [step, setStep] = useState<'SETUP' | 'DISPLAY'>('SETUP');
    const [locations, setLocations] = useState<Location[]>([]);
    const [locationId, setLocationId] = useState<string>('');
    const [locationName, setLocationName] = useState<string>('');
    const [setupPin, setSetupPin] = useState('');

    // DISPLAY STATE
    const [activeTickets, setActiveTickets] = useState<Ticket[]>([]);
    const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
    const [history, setHistory] = useState<Ticket[]>([]);
    const [waitingCount, setWaitingCount] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [waitingList, setWaitingList] = useState<Ticket[]>([]);
    const [debugData, setDebugData] = useState<any[]>([]);

    // State for tracking last announcement to support recalls
    const lastAnnouncementRef = useRef<{ id: string; time: string } | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);

    // ========================================================================
    // INIT & SETUP
    // ========================================================================

    // ========================================================================
    // AUTO-UNLOCK AUDIO
    // ========================================================================
    useEffect(() => {
        const createAudioContext = () => {
            // 1. Audio Unlock
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume().then(() => {
                    console.log('Audio Context Resumed');
                    toast.success('Audio Activado');
                });
            }

            // 2. Auto Fullscreen (if not already)
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch((err) => {
                    console.log(`Fullscreen blocked: ${err.message}`);
                });
            }
        };

        document.addEventListener('click', createAudioContext);
        document.addEventListener('touchstart', createAudioContext);
        return () => {
            document.removeEventListener('click', createAudioContext);
            document.removeEventListener('touchstart', createAudioContext);
        };
    }, []);

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

        // Auto-Fullscreen on setup (User Interaction)
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((e) => console.log('Fullscreen denied:', e));
        }
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
    // AUDIO SYSTEM
    // ========================================================================

    const playDingDong = useCallback(() => {
        if (isMuted) return;

        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const ctx = audioContextRef.current;
            const t = ctx.currentTime;

            const playNote = (freq: number, startTime: number, duration: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);

                // Envelope for soft attack and long release
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05); // Attack
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // Release

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            // First Note (Higher) - 659.25Hz (E5)
            playNote(659.25, t, 1.2);

            // Second Note (Lower) - 523.25Hz (C5)
            playNote(523.25, t + 0.4, 1.8);

        } catch (e) {
            console.error('Audio error', e);
        }
    }, [isMuted]);

    const playAnnouncement = useCallback((ticket: Ticket) => {
        if (isMuted) {
            console.log('[QueueAudio] Skipped because MUTED');
            return;
        }

        console.log('[QueueAudio] Playing sequence for:', ticket.code);

        // 1. Ding Dong
        playDingDong();

        // 2. TTS
        // Wait 1s for ding-dong to settle
        setTimeout(() => {
            if (!window.speechSynthesis) {
                console.warn('[QueueAudio] No TTS support');
                return;
            }

            const moduleLabel = ticket.module_number ? `Módulo ${ticket.module_number}` : 'Atención al Cliente';
            // Text: "Ticket G004, Módulo 1"
            // Spoken clearly: "Ticket G, cero, cero, cuatro... Módulo uno"
            // Let's keep it simple first
            const text = `Ticket ${ticket.code}, ${moduleLabel}`;

            console.log('[QueueAudio] Speaking:', text);
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9; // Slightly slower
            utterance.pitch = 1;
            utterance.lang = 'es-ES'; // Prefer Spanish

            // Try to find a Spanish voice, prioritizing Google (usually Female/Better)
            const voices = window.speechSynthesis.getVoices();
            console.log('[QueueAudio] Available voices:', voices.length);

            let esVoice = voices.find(v => v.lang.includes('es') && v.name.includes('Google'));
            if (!esVoice) esVoice = voices.find(v => v.lang.includes('es') && v.name.includes('Monica'));
            if (!esVoice) esVoice = voices.find(v => v.lang.includes('es') && v.name.includes('Paulina'));
            if (!esVoice) esVoice = voices.find(v => v.lang.includes('es') && v.name.includes('Female'));
            if (!esVoice) esVoice = voices.find(v => v.lang.includes('es')); // Fallback to any Spanish

            if (esVoice) utterance.voice = esVoice;

            utterance.onerror = (e) => {
                // @ts-ignore - error property exists on SpeechSynthesisErrorEvent
                if (e.error === 'canceled' || e.error === 'interrupted') {
                    // This is expected when stopping previous speech or unmounting
                    return;
                }
                console.error('[QueueAudio] TTS Error:', e);
            };
            utterance.onstart = () => console.log('[QueueAudio] TTS Started');

            window.speechSynthesis.cancel(); // Stop previous
            window.speechSynthesis.speak(utterance);
        }, 1200);
    }, [isMuted, playDingDong]);

    // ========================================================================
    // POLLING & DATA
    // ========================================================================

    // POLL EFFECT
    useEffect(() => {
        if (step !== 'DISPLAY' || !locationId) return;

        let isMounted = true;
        const POLL_INTERVAL = 2000;

        const fetchStatus = async () => {
            try {
                const res = await getQueueStatusSecure(locationId);

                if (isMounted && res.success && res.data) {
                    const { calledTickets, waitingCount, lastCompletedTickets, waitingTickets } = res.data;

                    // Active (CALLED) tickets sorted by time (newest first)
                    // We trust called_at timestamp for ordering
                    const active = (calledTickets || []).sort((a: any, b: any) =>
                        new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
                    );

                    const latestActive = active[0] || null;

                    // History: Completed tickets
                    const historyList = (lastCompletedTickets || []).slice(0, 5);
                    const nextList = (waitingTickets || []).slice(0, 4);

                    setActiveTickets(active);
                    setCurrentTicket(latestActive);
                    setHistory(historyList);
                    setWaitingList(nextList);
                    setWaitingCount(waitingCount);

                    // @ts-ignore
                    setDebugData(res.data.debug_allRows || []);

                    // AUDIO TRIGGER LOGIC
                    // We check if:
                    // 1. We have a latest active ticket
                    // 2. It is DIFFERENT from the last one OR the timestamp changed (Recall)
                    if (latestActive) {
                        const last = lastAnnouncementRef.current;
                        const lastTime = last?.time ? new Date(last.time).getTime() : 0;
                        const currentTime = latestActive.called_at ? new Date(latestActive.called_at).getTime() : 0;

                        const isNewTicket = !last || last.id !== latestActive.id;
                        const isRecall = !isNewTicket && lastTime !== currentTime;

                        if (isNewTicket || isRecall) {
                            console.log('[QueueAudio] Triggering announcement for:', latestActive.code, { isNewTicket, isRecall, lastTime, currentTime });
                            playAnnouncement(latestActive);
                            lastAnnouncementRef.current = {
                                id: latestActive.id,
                                time: latestActive.called_at
                            };
                        }
                    }
                }
            } catch (err) {
                console.error("Poll error:", err);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, POLL_INTERVAL);
        return () => { isMounted = false; clearInterval(interval); };
    }, [step, locationId, playAnnouncement]);



    // DEBUG ACTION
    const testAudio = useCallback(() => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        audioContextRef.current.resume();
        playAnnouncement({
            id: 'test',
            code: 'A000',
            status: 'CALLED',
            module_number: '1',
            type: 'GENERAL',
            created_at: new Date().toISOString(),
            called_at: new Date().toISOString()
        });
    }, [playAnnouncement]);

    const getModuleDisplay = (t: Ticket) => {
        if (t.module_number) return `${t.module_number}`;
        return t.terminal_name?.replace(/Caja\s*/i, '') || '---';
    };

    const getModuleLabel = (t: Ticket) => {
        if (t.module_number) return 'Módulo';
        return 'Caja';
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
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
                {/* Background Ambience */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                    <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-sky-200/40 rounded-full blur-[128px]" />
                    <div className="absolute bottom-[10%] right-[20%] w-[500px] h-[500px] bg-teal-100/30 rounded-full blur-[128px]" />
                </div>

                <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl shadow-sky-900/5 border border-sky-100 relative z-10">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="bg-sky-100 p-4 rounded-2xl border border-sky-200 shadow-sm">
                            <Monitor className="text-sky-600" size={32} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Configuración Monitor</h1>
                            <p className="text-slate-500 text-sm">Seleccione la sucursal para esta pantalla</p>
                        </div>
                    </div>
                    <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {locations.map(loc => (
                            <button
                                key={loc.id}
                                onClick={() => handleSelectLocation(loc)}
                                className="p-5 text-left border border-slate-100 rounded-2xl bg-white hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 font-bold transition-all flex items-center gap-4 shadow-sm group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                                    <MapPin size={20} className="text-slate-400 group-hover:text-sky-500" />
                                </div>
                                {loc.name}
                            </button>
                        ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-100 flex justify-center">
                        <button
                            onClick={() => router.push('/')}
                            className="px-4 py-2 text-slate-400 hover:text-slate-600 text-sm font-medium flex items-center gap-2 transition-colors rounded-lg hover:bg-slate-50"
                        >
                            <LogOut size={16} /> Volver al Menú Principal
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800 overflow-hidden relative font-sans selection:bg-blue-200">
            {/* TOOLBAR (VISIBLE & STYLED) */}
            <div className="absolute top-0 right-0 z-50 flex items-center gap-2 bg-white px-4 py-3 rounded-bl-3xl border-b border-l border-slate-200 shadow-lg shadow-slate-200/50">
                {/* Audio Controls */}
                <div className="flex items-center gap-1 border-r border-slate-200 pr-3 mr-1">
                    <button
                        onClick={testAudio}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors"
                        title="Probar sonido"
                    >
                        <Volume2 size={16} />
                        Test
                    </button>
                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`p-2 rounded-lg transition-colors ${isMuted ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'hover:bg-slate-100 text-slate-600'}`}
                        title={isMuted ? "Activar Sonido" : "Silenciar"}
                    >
                        {isMuted ? <VolumeX size={18} /> : <Check size={18} className="text-green-500" />} {/* Show Check if audio on? No, just keep simple */}
                    </button>
                </div>

                {/* Screen Controls */}
                <button
                    onClick={toggleFullscreen}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                    title="Pantalla Completa"
                >
                    <Maximize size={18} />
                </button>

                {/* Admin / Reset */}
                <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                    <input
                        type="password"
                        placeholder="PIN"
                        className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                        value={setupPin}
                        onChange={e => setSetupPin(e.target.value)}
                    />
                    <button
                        onClick={handleReset}
                        className="p-2 bg-slate-50 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors"
                        title="Reiniciar / Salir"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>

            {/* MAIN LAYOUT */}
            <div className="h-screen grid grid-cols-12 gap-0">

                {/* LEFT: CURRENT TICKET (BIG) */}
                <div className="col-span-8 flex flex-col relative bg-white relative z-10 shadow-2xl">

                    {/* Header */}
                    <div className="absolute top-0 left-0 p-8 flex items-center gap-5 z-20">
                        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                            <MapPin size={28} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mb-1">Estamos atendiendo en</p>
                            <span className="text-3xl font-black text-slate-800 tracking-tight leading-none block">{locationName}</span>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center p-12 relative overflow-hidden bg-white">

                        {/* DEBUG OVERLAY - Moved outside AnimatePresence to avoid key conflicts */}
                        <div className="absolute top-0 left-0 bg-black/90 text-white p-4 text-[10px] font-mono z-50 pointer-events-none max-h-96 overflow-auto">
                            <p className="font-bold text-yellow-400">DEBUG MODE</p>
                            <p>LocID: {locationId?.substring(0, 8)}...</p>
                            <p>Active: {activeTickets.length}</p>
                            <p>Waiting: {waitingCount}</p>

                            <div className="mt-2 border-t border-gray-700 pt-1">
                                <p className="font-bold">Backend Rows:</p>
                                {debugData.map((r: any, i: number) => (
                                    <div key={r.id || i}>
                                        [{r.status}] {r.code} <span className="opacity-50 text-[8px]">{(r.id || 'N/A').substring(0, 4)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <AnimatePresence mode="popLayout">
                            {activeTickets.length > 0 ? (
                                activeTickets.length === 1 ? (
                                    // SINGLE ACTIVE TICKET (BIG)
                                    <motion.div
                                        key={activeTickets[0].id} // Key handles enter/exit
                                        layout
                                        initial={{ scale: 0.9, opacity: 0, y: 30 }}
                                        animate={{
                                            scale: 1,
                                            opacity: 1,
                                            y: 0,
                                            // Pulse effect when recently called (within last 5 seconds)
                                            boxShadow: (new Date().getTime() - new Date(activeTickets[0].called_at).getTime() < 5000)
                                                ? ["0px 0px 0px 0px rgba(37, 99, 235, 0.4)", "0px 0px 0px 20px rgba(37, 99, 235, 0)"]
                                                : "none"
                                        }}
                                        transition={{
                                            layout: { type: "spring", bounce: 0.4 },
                                            boxShadow: { repeat: Infinity, duration: 1.5 }
                                        }}
                                        className="text-center relative z-10 flex flex-col items-center w-full"
                                    >
                                        <motion.div
                                            animate={{ scale: [1, 1.05, 1] }}
                                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                                            className="bg-blue-600 text-white px-8 py-2 rounded-full font-bold uppercase tracking-[0.3em] mb-12 shadow-sm"
                                        >
                                            Atención Cliente
                                        </motion.div>

                                        <div className="relative mb-14">
                                            <div className="text-[18rem] leading-[0.85] font-black tracking-tighter tabular-nums text-slate-900">
                                                {activeTickets[0].code}
                                            </div>
                                        </div>

                                        <div className="inline-flex items-stretch overflow-hidden bg-white rounded-xl border-2 border-slate-100 shadow-xl">
                                            <div className="bg-slate-50 px-10 py-6 flex items-center justify-center border-r-2 border-slate-100">
                                                <p className="text-4xl text-slate-400 font-bold uppercase tracking-tight">{getModuleLabel(activeTickets[0])}</p>
                                            </div>
                                            <div className="bg-white px-12 py-6 flex items-center justify-center">
                                                <motion.p
                                                    key={activeTickets[0].called_at} // Re-trigger animation on recall
                                                    initial={{ scale: 0.5, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="text-8xl font-black text-blue-600"
                                                >
                                                    {getModuleDisplay(activeTickets[0])}
                                                </motion.p>
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    // MULTIPLE ACTIVE TICKETS (GRID)
                                    <div className="w-full h-full flex items-center justify-center">
                                        <div className="grid grid-cols-2 gap-8 w-full max-w-5xl">
                                            {activeTickets.map((ticket, i) => {
                                                const isRecent = new Date().getTime() - new Date(ticket.called_at).getTime() < 5000;
                                                return (
                                                    <motion.div
                                                        key={ticket.id}
                                                        layout
                                                        initial={{ scale: 0.8, opacity: 0 }}
                                                        animate={{
                                                            scale: 1,
                                                            opacity: 1,
                                                            borderColor: i === 0 ? "rgb(37 99 235)" : "rgb(241 245 249)", // Highlight newest
                                                            boxShadow: i === 0 && isRecent
                                                                ? ["0px 0px 0px 0px rgba(37, 99, 235, 0.4)", "0px 0px 0px 10px rgba(37, 99, 235, 0)"]
                                                                : "none"
                                                        }}
                                                        transition={{
                                                            boxShadow: { repeat: Infinity, duration: 1.5 }
                                                        }}
                                                        className={`bg-white border-4 rounded-3xl p-8 flex items-center justify-between shadow-sm relative overflow-hidden ${i === 0 ? 'z-10' : 'z-0'}`}
                                                    >
                                                        {i === 0 && (
                                                            <motion.div
                                                                initial={{ x: 100 }} animate={{ x: 0 }}
                                                                className="absolute top-0 right-0 bg-blue-600 text-white text-[12px] font-bold px-4 py-1 rounded-bl-xl uppercase tracking-wider"
                                                            >
                                                                Llamando...
                                                            </motion.div>
                                                        )}
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Ticket</p>
                                                            <p className="text-8xl font-black text-slate-800 tracking-tighter leading-none">{ticket.code}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">{getModuleLabel(ticket)}</p>
                                                            <p className="text-6xl font-black text-blue-600">{getModuleDisplay(ticket)}</p>
                                                        </div>
                                                    </motion.div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            ) : (
                                // NO ACTIVE TICKETS (WAITING SCREEN)
                                <motion.div
                                    key="waiting"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex flex-col items-center"
                                >
                                    <div className="w-48 h-48 bg-slate-50 rounded-full flex items-center justify-center mb-8 border-4 border-slate-100 text-slate-300">
                                        <Monitor size={80} />
                                    </div>
                                    <h2 className="text-5xl font-black text-slate-800 tracking-tight mb-2">Farmacias <span className="text-blue-500">Vallenar</span></h2>
                                    <p className="text-slate-400 text-xl font-medium">Por favor espere su turno...</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer Stats - SOLID STRIP */}
                    <div className="absolute bottom-0 left-0 w-full h-24 bg-slate-50 border-t border-slate-200 flex justify-between items-center px-10">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">En Espera</p>
                                <p className="text-3xl font-black text-slate-800">{waitingCount}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{new Date().toLocaleDateString()}</p>
                            <p className="text-3xl font-bold text-slate-600 tabular-nums">
                                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* RIGHT: HISTORY & NEXT - SOLID CONTRAST */}
                <div className="col-span-4 bg-slate-100 flex flex-col border-l border-slate-300 shadow-inner">

                    {/* TOP: HISTORY */}
                    <div className="flex-1 flex flex-col">
                        <div className="p-6 bg-blue-700 text-white shadow-md z-10 flex items-center justify-between">
                            <h2 className="text-xl font-bold flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                                Últimos Llamados
                            </h2>
                            <button
                                onClick={testAudio}
                                className="text-xs bg-blue-800 hover:bg-blue-600 px-2 py-1 rounded border border-blue-500 transition-colors"
                            >
                                🔊 Test
                            </button>
                        </div>

                        <div className="flex-1 p-6 space-y-4 overflow-hidden overflow-y-auto">
                            <AnimatePresence>
                                {history.map((ticket, i) => (
                                    <motion.div
                                        key={ticket.id}
                                        initial={{ x: 50, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: i * 0.1 }}
                                        className="bg-white rounded-xl p-5 flex justify-between items-center shadow-sm border border-slate-100"
                                    >
                                        <div>
                                            <p className="text-4xl font-black text-slate-800 tracking-tight">{ticket.code}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] text-slate-400 uppercase font-bold mb-1">{getModuleLabel(ticket)}</p>
                                            {ticket.status === 'NO_SHOW' ? (
                                                <div className="bg-red-50 text-red-600 px-3 py-1 rounded text-xs font-bold uppercase tracking-wide">
                                                    No Presente
                                                </div>
                                            ) : (
                                                <p className="text-3xl font-bold text-blue-600">{getModuleDisplay(ticket)}</p>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {history.length === 0 && (
                                <div className="text-center py-10 opacity-30">
                                    <p className="font-bold text-slate-900">Sin historial reciente</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* BOTTOM: NEXT IN LINE */}
                    <div className="h-[35%] bg-white flex flex-col shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)] relative z-20">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
                            <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                <Users size={20} className="text-blue-500" />
                                Próximos
                            </h2>
                            <span className="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase tracking-wider">
                                {waitingCount} Turnos
                            </span>
                        </div>

                        <div className="flex-1 p-5 overflow-hidden bg-slate-50">
                            {waitingList.length > 0 ? (
                                <div className="grid grid-cols-2 gap-3">
                                    {waitingList.map((t) => (
                                        <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm">
                                            <span className="text-2xl font-black text-slate-700 block">{t.code}</span>
                                            <span className="text-[10px] uppercase font-bold text-slate-400">En Espera</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-2">
                                        <Check size={24} />
                                    </div>
                                    <p className="text-sm font-bold">Todo al día</p>
                                </div>
                            )}
                        </div>

                        {/* Branding Footer */}
                        <div className="p-6 bg-slate-800 text-center">
                            <h2 className="text-2xl font-black text-white tracking-tight">Farmacias <span className="text-blue-400">Vallenar</span></h2>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
