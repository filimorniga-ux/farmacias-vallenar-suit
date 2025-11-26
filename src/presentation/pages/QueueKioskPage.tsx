
'use client';
import React, { useState } from 'react';
import { Ticket, User, Clock, CheckCircle } from 'lucide-react';
import { usePharmaStore } from '../store/useStore';

const MOCK_SUPERVISOR_PIN = '0000'; // PIN de supervisor para modo configuración

const QueueKioskPage: React.FC = () => {
    const { user, queue, generateQueueTicket } = usePharmaStore();
    const [isLocked, setIsLocked] = useState(true);
    const [pin, setPin] = useState('');

    const currentTicket = queue.find(t => t.status === 'CALLING');

    // Simulación de pantalla de Kiosco/Totem
    if (isLocked) {
        return (
            <div className="bg-slate-900 min-h-screen flex items-center justify-center p-4">
                <div className="text-center">
                    <h1 className="text-4xl font-extrabold text-cyan-500 mb-8">Acceso Supervisor</h1>
                    <input
                        type="password"
                        placeholder="Ingrese PIN de Supervisor"
                        className="bg-slate-800 text-white p-4 text-xl rounded-xl border-2 border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        maxLength={4}
                    />
                    <button
                        onClick={() => pin === MOCK_SUPERVISOR_PIN && setIsLocked(false)}
                        className="block mt-6 mx-auto py-3 px-8 bg-cyan-700 text-white font-bold rounded-lg hover:bg-cyan-800 disabled:opacity-50"
                        disabled={pin.length !== 4}
                    >
                        Desbloquear
                    </button>
                </div>
            </div>
        );
    }

    // Vista de Generación de Ticket (Desbloqueada)
    return (
        <div className="bg-slate-50 min-h-screen flex flex-col items-center justify-center p-6">
            <h1 className="text-4xl font-extrabold text-slate-900 mb-10">Farmacias Vallenar - Kiosco</h1>

            <div className={`p-8 rounded-2xl shadow-xl w-full max-w-lg text-center ${currentTicket ? 'bg-amber-100 border-4 border-amber-500' : 'bg-emerald-100 border-4 border-emerald-500'}`}>
                <p className="text-slate-600 text-xl mb-4">
                    {currentTicket ? '📢 LLAMANDO AL NÚMERO:' : 'Último cliente atendido. Pulse para el siguiente.'}
                </p>
                <div className="text-7xl font-extrabold text-slate-900 mb-6">
                    {currentTicket ? currentTicket.number : <CheckCircle size={80} className="mx-auto text-emerald-600" />}
                </div>
            </div>

            <button
                onClick={generateQueueTicket}
                className="mt-10 py-5 px-12 bg-cyan-700 text-white font-black text-2xl rounded-2xl hover:bg-cyan-800 transition shadow-xl flex items-center"
            >
                <Ticket size={30} className="mr-3" /> Sacar Número
            </button>
            <button
                onClick={() => setIsLocked(true)}
                className="mt-6 text-slate-500 text-sm hover:underline"
            >
                Bloquear Kiosco (Supervisor)
            </button>
        </div>
    );
};

export default QueueKioskPage;
