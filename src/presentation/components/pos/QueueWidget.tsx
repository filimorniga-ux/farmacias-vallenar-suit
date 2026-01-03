/**
 * QueueWidget - Ultra Compact Version
 * Se integra en la barra superior del POS, mínimo espacio visual
 */
import React, { useEffect, useState, useCallback } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { Users, Bell, RefreshCw, Check, RotateCcw, ChevronDown, X, Volume2, ArrowRight, MousePointerClick } from 'lucide-react';
import { getQueueStatusSecure, getNextTicketSecure, completeTicketSecure, resetQueueSecure, cancelTicketSecure, recallTicketSecure } from '../../../actions/queue-v2';
import { toast } from 'sonner';

interface QueueTicket {
    id: string;
    code: string;
    type: 'GENERAL' | 'PREFERENTIAL';
    status: 'WAITING' | 'CALLED' | 'COMPLETED';
    customer_name?: string;
    created_at: string;
    called_by?: string;
    terminal_id?: string;
}

const QueueWidget: React.FC = () => {
    const { user, currentLocationId, currentTerminalId } = usePharmaStore();

    const [waitingTickets, setWaitingTickets] = useState<QueueTicket[]>([]);
    const [currentTicket, setCurrentTicket] = useState<QueueTicket | null>(null);
    const [calledTickets, setCalledTickets] = useState<QueueTicket[]>([]); // Track all active
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    // Fetch queue status
    const fetchStatus = useCallback(async () => {
        if (!currentLocationId) return;
        try {
            const result = await getQueueStatusSecure(currentLocationId);
            if (result.success && result.data) {
                setWaitingTickets(result.data.waitingTickets || []);
                setCalledTickets(result.data.calledTickets || []);

                // Find MY active ticket (Prioritize Terminal Match)
                const allCalled = result.data.calledTickets || [];
                let myTicket = null;

                if (currentTerminalId) {
                    myTicket = allCalled.find((t: QueueTicket) => t.terminal_id === currentTerminalId);
                }

                // Fallback to User Match if no terminal match (or terminal not set yet)
                if (!myTicket && user?.id) {
                    myTicket = allCalled.find((t: QueueTicket) => t.called_by === user.id);
                }

                setCurrentTicket(myTicket || null);
            }
        } catch (e) {
            console.error('Error fetching queue', e);
        }
    }, [currentLocationId, user?.id, currentTerminalId]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // Call next ticket
    const handleCallNext = async () => {
        if (!currentTerminalId || !user?.id || !currentLocationId) {
            toast.error('Terminal/usuario/sucursal no configurado');
            return;
        }

        setLoading(true);
        try {
            const result = await getNextTicketSecure(currentLocationId, user.id, currentTerminalId);
            if (result.success && result.ticket) {
                setCurrentTicket(result.ticket);
                toast.success(`🔔 ${result.ticket.code}`, { duration: 2000 });
                // Refrescar lista
                setTimeout(fetchStatus, 500);
            } else if (result.success && !result.ticket) {
                toast.info('Sin tickets en espera');
            } else {
                toast.error(result.error || 'Error');
            }
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    // Complete current ticket
    const handleComplete = async () => {
        if (!currentTicket || !user?.id) return;
        try {
            const result = await completeTicketSecure(currentTicket.id, user.id);
            if (result.success) {
                toast.success(`✓ ${currentTicket.code}`);
                setCurrentTicket(null);
                fetchStatus();
            }
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    // Reset all tickets (admin function)
    const handleReset = async () => {
        if (!currentLocationId || !user?.id) return;
        if (!confirm('¿Resetear TODOS los tickets de hoy?')) return;

        try {
            const result = await resetQueueSecure(currentLocationId, user.id);
            if (result.success) {
                toast.success('Cola reseteada');
                setWaitingTickets([]);
                setCurrentTicket(null);
                fetchStatus();
            } else {
                toast.error(result.error || 'Error');
            }
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const count = waitingTickets.length;

    return (
        <div className="relative inline-flex items-center gap-1 bg-slate-50 rounded-lg border border-slate-200 px-2 py-1">
            {/* Status Badge */}
            <div className="flex items-center gap-1.5">
                <Users size={14} className="text-slate-500" />
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${count > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                    }`}>
                    {count}
                </span>
            </div>

            {/* Current Ticket or Call Button */}
            {/* Current Ticket or Call Button */}
            {currentTicket ? (
                <div className="flex items-center gap-1 bg-blue-100 px-2 py-0.5 rounded border border-blue-200 animate-in fade-in slide-in-from-right-2 duration-300">
                    <span className="text-sm font-black text-blue-700 min-w-[3rem] text-center">{currentTicket.code}</span>

                    {/* Re-Call */}
                    <button
                        onClick={async () => {
                            if (!currentTicket || !user?.id || loading) return;
                            setLoading(true);
                            try {
                                const res = await recallTicketSecure(currentTicket.id, user.id);
                                if (res.success) toast.info('📢 Ticket re-llamado');
                                else toast.error(res.error || 'Error re-llamando');
                            } catch (e: any) {
                                toast.error(e.message);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading}
                        className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Re-Llamar (Anunciar de nuevo)"
                    >
                        <Volume2 size={14} />
                    </button>

                    {/* No Show */}
                    <button
                        onClick={async () => {
                            if (!currentTicket || loading) return;
                            if (!confirm('¿Marcar como NO PRESENTÓ?')) return;
                            setLoading(true);
                            try {
                                const result = await cancelTicketSecure(currentTicket.id, 'No se presentó');
                                if (result.success) {
                                    toast.info('Marcado como No Show');
                                    setCurrentTicket(null);
                                    setTimeout(fetchStatus, 300); // Debounce refresh
                                }
                            } catch (e: any) {
                                toast.error(e.message);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading}
                        className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200 border border-red-200 disabled:opacity-50"
                        title="Cliente No Presentó"
                    >
                        <X size={14} />
                    </button>

                    {/* Complete */}
                    <button
                        onClick={async () => {
                            if (loading) return;
                            setLoading(true);
                            await handleComplete();
                            setLoading(false);
                        }}
                        disabled={loading}
                        className="p-1 bg-green-500 text-white rounded hover:bg-green-600 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Finalizar Atención"
                    >
                        <Check size={14} />
                    </button>

                    {/* Complete & Next */}
                    <button
                        onClick={async () => {
                            if (loading) return;
                            setLoading(true);
                            await handleComplete();
                            // Small delay to ensure DB update before calling next
                            setTimeout(() => {
                                handleCallNext();
                                // Note: handleCallNext handles setLoading(false) internally? 
                                // Actually handleCallNext sets loading=true at start and false at end.
                                // But since handleComplete is async and we wait for it, we are safe.
                                // We leave loading=true here to prevent double clicks during the transition.
                            }, 300);
                        }}
                        disabled={loading}
                        className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm ml-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Finalizar y Llamar Siguiente"
                    >
                        <ArrowRight size={14} />
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleCallNext}
                    disabled={loading || waitingTickets.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                >
                    <MousePointerClick size={14} />
                    {loading ? '...' : (waitingTickets.length > 0 ? 'Llamar Siguiente' : 'Sin espera')}
                </button>
            )}

            {/* Dropdown Toggle */}
            <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
            >
                <ChevronDown size={14} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
                <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 z-50 min-w-48">
                    <div className="p-2 border-b border-slate-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-600">Cola de Espera</span>
                        <div className="flex gap-1">
                            <button onClick={fetchStatus} className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-50">
                                <RefreshCw size={12} />
                            </button>
                            <button onClick={handleReset} className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50" title="Resetear cola">
                                <RotateCcw size={12} />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto p-2">
                        {/* 1. Active Calls */}
                        {calledTickets.length > 0 && (
                            <div className="mb-2">
                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1 px-1">En Atención / Llamados</p>
                                <div className="space-y-1">
                                    {calledTickets.map((t) => (
                                        <div key={t.id} className="flex items-center justify-between px-2 py-1 rounded text-xs bg-blue-50 border border-blue-100">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-blue-700">{t.code}</span>
                                                {t.terminal_id && (
                                                    <span className="px-1 py-0.5 bg-white rounded border border-blue-200 text-[10px] text-blue-500">
                                                        {t.terminal_id === currentTerminalId ? 'Tu terminal' : 'Otro terminal'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col text-right">
                                                <span className="text-[10px] text-slate-500 truncate max-w-[80px]">
                                                    {/* Try to show box number if available or user name if needed */}
                                                    {t.terminal_id ? 'Caja Ocupada' : 'En Atención'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="h-px bg-slate-100 my-2"></div>
                            </div>
                        )}

                        {/* 2. Waiting */}
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">En Espera</p>
                        {waitingTickets.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-2">Sin tickets</p>
                        ) : (
                            <div className="space-y-1">
                                {waitingTickets.slice(0, 8).map((t) => (
                                    <div key={t.id} className={`flex items-center justify-between px-2 py-1 rounded text-xs ${t.type === 'PREFERENTIAL' ? 'bg-purple-50 text-purple-700' : 'bg-slate-50 text-slate-700'
                                        }`}>
                                        <span className="font-bold">{t.code}</span>
                                        <span className="text-slate-400">
                                            {new Date(t.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default QueueWidget;
