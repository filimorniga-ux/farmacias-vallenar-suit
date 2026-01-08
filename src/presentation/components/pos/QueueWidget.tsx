/**
 * QueueWidget - Versión Compacta con Menú
 * Ahorra espacio horizontal moviendo acciones secundarias al dropdown.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { Users, RefreshCw, Check, RotateCcw, ChevronDown, X, Volume2, ArrowRight, MousePointerClick, MoreVertical } from 'lucide-react';
import { completeTicketSecure, resetQueueSecure, cancelTicketSecure, recallTicketSecure } from '../../../actions/queue-v2';
import { toast } from 'sonner';

// QueueTicket imported from types


const QueueWidget: React.FC = () => {
    const {
        user,
        currentLocationId,
        currentTerminalId,
        currentTicket,
        tickets: waitingTickets,
        setCurrentTicket,
        refreshQueueStatus,
        callNextTicket,
        completeAndNextTicket,
        terminals,
        fetchTerminals
    } = usePharmaStore();

    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const lastActionTimeRef = useRef(0);

    // Polling using Store Action
    useEffect(() => {
        refreshQueueStatus();
        if (currentLocationId && terminals.length === 0) {
            fetchTerminals(currentLocationId);
        }
        const interval = setInterval(refreshQueueStatus, 5000);
        return () => clearInterval(interval);
    }, [refreshQueueStatus, currentLocationId, terminals.length, fetchTerminals]);

    const currentTerminal = terminals.find(t => t.id === currentTerminalId);
    const moduleDisplay = currentTerminal?.module_number ? `MOD ${currentTerminal.module_number}` : '';

    // Actions
    const handleCallNext = async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!currentTerminalId || !user?.id || !currentLocationId) {
            toast.error('Terminal error');
            return;
        }

        setLoading(true);
        try {
            const ticket = await callNextTicket(currentTerminalId);

            // DEBUG: Show what IDs we are using
            toast('DEBUG POS', {
                description: `Loc: ${currentLocationId?.substring(0, 6)}... | Term: ${currentTerminalId?.substring(0, 6)}...`
            });

            if (ticket) {
                toast.success(`🔔 ${ticket.number}`, { duration: 2000 });
            } else {
                toast.info('Sin tickets', { duration: 1000 });
            }
        } catch (e: any) {
            toast.error(e.message || 'Error');
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async () => {
        if (!currentTicket || !user?.id) return;
        setLoading(true);
        try {
            // We use direct action for simple complete as we didn't add completeTicket to store yet
            // But we can use completeTicketSecure and then nullify current ticket in store
            const result = await completeTicketSecure(currentTicket.id, user.id);
            if (result.success) {
                toast.success('Ticket finalizado');
                setCurrentTicket(null); // Updates store and timestamp
                await refreshQueueStatus(); // Force backend sync immediately
            } else {
                toast.error(result.error);
            }
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteAndNext = async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!currentTicket || !currentLocationId || !user?.id) return;
        setLoading(true);
        try {
            const result = await completeAndNextTicket(currentTerminalId || '', currentTicket.id);

            if (result.completedTicket) {
                toast.success('Ticket finalizado');
            } else {
                console.warn('Previous ticket not confirmed as completed');
            }

            if (result.nextTicket) {
                toast.success(`🔔 ${result.nextTicket.number}`);
            } else {
                toast.info('No hay más tickets', { duration: 1500 });
            }
            await refreshQueueStatus();
        } catch (e: any) {
            toast.error(e.message || 'Error');
        } finally {
            setLoading(false);
        }
    };

    const handleRecall = async () => {
        if (!currentTicket || !user?.id) return;
        setLoading(true);
        try {
            await recallTicketSecure(currentTicket.id, user.id);
            toast.message('📢 Re-llamando...', { duration: 1000 }); // Keep subtle feedback for recall
            lastActionTimeRef.current = Date.now();
        } finally {
            setLoading(false);
        }
    };

    const handleNoShow = async () => {
        if (!currentTicket) return;
        setLoading(true);
        try {
            await cancelTicketSecure(currentTicket.id, 'No se presentó');
            toast.info('Marcado No Show', { duration: 1500 });
            setCurrentTicket(null);
            await refreshQueueStatus(); // Force update display

            // Auto-advance to next ticket
            // We adding a small delay to allow the display to briefly clear or update
            setTimeout(() => {
                handleCallNext();
            }, 500);
        } finally {
            setLoading(false);
        }
    };

    const handleResetQueue = async () => {
        if (!user?.id || !currentLocationId) return;
        if (!confirm('⚠️ ¿ESTÁS SEGURO?\n\nEsto borrará TODOS los tickets de la fila actual y reiniciará el contador.\nEsta acción no se puede deshacer.')) return;

        setLoading(true);
        try {
            const result = await resetQueueSecure(currentLocationId, user.id);
            if (result.success) {
                toast.success('Cola reiniciada correctamente');
                refreshQueueStatus();
                setShowDropdown(false);
            } else {
                toast.error(result.error || 'Error al reiniciar cola');
            }
        } catch (e) {
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    // Dropdown Handlers
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        if (showDropdown) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showDropdown]);

    const count = waitingTickets.length;
    const hasTicket = !!currentTicket;

    return (
        <div ref={containerRef} className="relative">
            {/* Main Trigger Button */}
            <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={`
                    flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 transition-all shadow-sm outline-none
                    ${hasTicket ? 'bg-indigo-50 border-indigo-200' : 'bg-white hover:bg-slate-50'}
                    ${showDropdown ? 'ring-2 ring-indigo-500/20' : ''}
                `}
            >
                {/* Badge/Icon */}
                <div className={`
                    flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold
                    ${count > 0 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}
                `}>
                    {count}
                </div>

                {/* Label */}
                <div className="flex flex-col items-start leading-none mr-1">
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fila</span>
                        {moduleDisplay && <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-1 rounded">{moduleDisplay}</span>}
                    </div>
                    <span className={`text-sm font-bold ${hasTicket ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {currentTicket ? currentTicket.number : 'Gestión'}
                    </span>
                </div>

                <ChevronDown size={14} className={`text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
                <div className="absolute top-12 left-0 z-50 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                    {/* Header Status */}
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500 uppercase">
                            {hasTicket ? 'En Atención' : 'Control de Fila'}
                        </span>
                        <div className="flex gap-1">
                            <button onClick={refreshQueueStatus} className="p-1 hover:bg-slate-200 rounded text-slate-400" title="Actualizar"><RefreshCw size={12} /></button>
                            <button onClick={handleResetQueue} className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500" title="Resetear Fila"><RotateCcw size={12} /></button>
                        </div>
                    </div>

                    {/* ACTIONS SECTION */}
                    <div className="p-3 grid gap-2">
                        {/* Primary Action Button */}
                        <button
                            onClick={async (e) => {
                                hasTicket ? await handleCompleteAndNext(e) : await handleCallNext(e);
                                setShowDropdown(false);
                            }}
                            disabled={loading || (!hasTicket && count === 0)}
                            className={`
                                w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 font-bold text-sm text-white shadow-md transition-all
                                ${hasTicket
                                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none'
                                }
                            `}
                        >
                            {loading ? <RefreshCw className="animate-spin" size={16} /> : (hasTicket ? <ArrowRight size={18} /> : <Volume2 size={18} />)}
                            <span>{hasTicket ? 'Terminar y Siguiente' : 'Llamar Siguiente'}</span>
                        </button>

                        {/* Secondary Actions Grid (Always visible) */}
                        <div className="grid grid-cols-3 gap-2 mt-1">
                            <button
                                onClick={handleRecall}
                                disabled={!hasTicket}
                                className={`
                                    flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-colors
                                    ${hasTicket
                                        ? 'bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border-slate-200 shadow-sm'
                                        : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-70'}
                                `}
                            >
                                <Volume2 size={16} />
                                <span className="text-[10px] font-bold">Rellamar</span>
                            </button>

                            <button
                                onClick={handleNoShow}
                                disabled={!hasTicket}
                                className={`
                                    flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-colors
                                    ${hasTicket
                                        ? 'bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 border-slate-200 shadow-sm'
                                        : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-70'}
                                `}
                            >
                                <X size={16} />
                                <span className="text-[10px] font-bold">Ausente</span>
                            </button>

                            <button
                                onClick={handleComplete}
                                disabled={!hasTicket}
                                className={`
                                    flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-colors
                                    ${hasTicket
                                        ? 'bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 border-slate-200 shadow-sm'
                                        : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-70'}
                                `}
                            >
                                <Check size={16} />
                                <span className="text-[10px] font-bold">Finalizar</span>
                            </button>
                        </div>
                    </div>

                    {/* Waiting List Section */}
                    <div className="border-t border-slate-100">
                        <div className="px-3 py-2 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            En Espera ({waitingTickets.length})
                        </div>
                        <div className="max-h-48 overflow-y-auto w-full bg-white">
                            {waitingTickets.length === 0 ? (
                                <div className="py-8 text-center text-slate-300 flex flex-col items-center gap-2">
                                    <Users size={24} className="opacity-20" />
                                    <span className="text-xs">Cola vacía</span>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {waitingTickets.slice(0, 50).map((t) => (
                                        <div key={t.id} className={`flex items-center justify-between px-4 py-2.5 text-xs hover:bg-slate-50 ${t.type === 'PREFERENTIAL' ? 'bg-purple-50/30' : ''}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`font-black text-sm ${t.type === 'PREFERENTIAL' ? 'text-purple-600' : 'text-slate-700'}`}>
                                                    {t.number}
                                                </div>
                                                {t.type === 'PREFERENTIAL' && (
                                                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[9px] rounded font-bold">PREF</span>
                                                )}
                                            </div>
                                            <span className="font-mono text-[10px] text-slate-400">
                                                {new Date(t.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default QueueWidget;
