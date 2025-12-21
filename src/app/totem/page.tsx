'use client';

import { useState } from 'react';
import { Printer, Ticket } from 'lucide-react';

export default function TotemPage() {
    const [lastTicket, setLastTicket] = useState<string | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);

    const handleGetTicket = async () => {
        setIsPrinting(true);

        try {
            const { generateTicket } = await import('@/actions/operations');
            const res = await generateTicket('GENERAL');

            if (res.success && res.ticket) {
                setLastTicket(res.ticket.numero_ticket);
                // Simulate printing delay
                setTimeout(() => {
                    window.print();
                    setIsPrinting(false);
                }, 1000);
            } else {
                alert('Error al generar ticket: ' + (res.error || 'Desconocido'));
                setIsPrinting(false);
            }
        } catch (error) {
            console.error(error);
            setIsPrinting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500 rounded-full blur-[150px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-green-500 rounded-full blur-[150px]" />
            </div>

            <div className="z-10 text-center max-w-2xl w-full">
                <div className="mb-12">
                    <h1 className="text-5xl font-bold mb-4 tracking-tight">Farmacias Vallenar</h1>
                    <p className="text-xl text-slate-400">Bienvenido. Por favor, tome su número.</p>
                </div>

                <button
                    onClick={handleGetTicket}
                    disabled={isPrinting}
                    className={`
                        w-full aspect-square max-h-[400px] rounded-full 
                        flex flex-col items-center justify-center gap-6
                        transition-all duration-300 transform hover:scale-105 active:scale-95
                        shadow-[0_0_50px_rgba(59,130,246,0.3)]
                        ${isPrinting
                            ? 'bg-slate-800 cursor-wait'
                            : 'bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700'
                        }
                    `}
                >
                    {isPrinting ? (
                        <Printer size={80} className="animate-pulse text-blue-300" />
                    ) : (
                        <Ticket size={80} className="text-white" />
                    )}
                    <span className="text-3xl font-bold">
                        {isPrinting ? 'Imprimiendo...' : 'SACAR NÚMERO'}
                    </span>
                </button>

                {lastTicket && (
                    <div className="mt-12 bg-white/10 backdrop-blur-md p-8 rounded-2xl border border-white/20 animate-in fade-in slide-in-from-bottom-4">
                        <p className="text-slate-300 text-lg mb-2">Su número es:</p>
                        <div className="text-6xl font-black text-white tracking-widest">
                            {lastTicket}
                        </div>
                        <p className="text-sm text-slate-400 mt-4">Por favor, espere su llamado en pantalla.</p>
                    </div>
                )}
            </div>

            {/* Print Styles */}
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #ticket-print-area, #ticket-print-area * {
                        visibility: visible;
                    }
                    #ticket-print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        text-align: center;
                        padding: 20px;
                    }
                }
            `}</style>

            {/* Hidden Print Area */}
            <div id="ticket-print-area" className="hidden print:block text-black">
                <h2 className="text-2xl font-bold mb-2">Farmacias Vallenar</h2>
                <p className="text-sm mb-4" suppressHydrationWarning>{new Date().toLocaleString()}</p>
                <div className="text-6xl font-black border-y-4 border-black py-4 my-4">
                    {lastTicket}
                </div>
                <p className="text-lg font-bold">TURNO GENERAL</p>
                <p className="text-sm mt-8">Gracias por su preferencia</p>
            </div>
        </div>
    );
}
