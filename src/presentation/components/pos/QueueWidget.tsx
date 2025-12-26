import React, { useEffect, useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { Users, Megaphone, Bell } from 'lucide-react';
import { getQueueStatusSecure } from '../../../actions/queue-v2';
import { toast } from 'sonner';

const QueueWidget: React.FC = () => {
    const { currentTicket, callNextTicket, currentLocationId, currentTerminalId } = usePharmaStore();
    const [status, setStatus] = useState({ waiting: 0 });
    const [loading, setLoading] = useState(false);

    const fetchStatus = async () => {
        if (!currentLocationId) return;
        const result = await getQueueStatusSecure(currentLocationId);
        if (result.success && result.data) {
            setStatus({
                waiting: result.data.waitingCount || 0
            });
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [currentLocationId, currentTicket]); // Refresh when ticket changes

    const handleCallNext = async () => {
        if (!currentTerminalId) {
            toast.error('Terminal no identificado');
            return;
        }
        setLoading(true);
        try {
            const ticket = await callNextTicket(currentTerminalId); // Pass terminal/counter ID
            if (ticket) {
                toast.success(`Llamando a ticket ${ticket.number}`);
                fetchStatus();
            } else {
                toast.info('No hay tickets en espera');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error llamando ticket');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 text-slate-600">
                    <Users size={18} />
                    <span className="font-bold text-sm">Fila de Espera</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${status.waiting > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {status.waiting} en espera
                </span>
            </div>

            <div className="flex flex-col gap-2">
                {currentTicket ? (
                    <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-cyan-600 font-bold uppercase">Atendiendo</p>
                            <p className="text-2xl font-black text-cyan-800">{currentTicket.number}</p>
                        </div>
                        <Megaphone className="text-cyan-400 animate-pulse" size={24} />
                    </div>
                ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                        <p className="text-xs text-slate-400 font-bold">Sin atención activa</p>
                    </div>
                )}

                <button
                    onClick={handleCallNext}
                    disabled={loading || status.waiting === 0}
                    className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                >
                    <Bell size={18} />
                    {loading ? 'Llamando...' : 'Llamar Siguiente'}
                </button>
            </div>
        </div>
    );
};

export default QueueWidget;
