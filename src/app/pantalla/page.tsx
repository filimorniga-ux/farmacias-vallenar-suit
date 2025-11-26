import { getShiftStatus } from '@/actions/operations';
import { MapPin, Clock, Phone } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // Revalidate every minute

export default async function PantallaPage() {
    const isShiftOpen = await getShiftStatus();

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col">
            {/* Header */}
            <header className="p-6 flex justify-between items-center border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-3xl font-bold">FV</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Farmacias Vallenar</h1>
                        <p className="text-slate-400">Su salud, nuestra prioridad</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xl font-mono">{new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="text-slate-400">{new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className={`
                    max-w-4xl w-full rounded-3xl p-12 border-4 shadow-2xl transition-all duration-500
                    ${isShiftOpen
                        ? 'bg-green-900/20 border-green-500 shadow-green-900/50'
                        : 'bg-slate-800/50 border-slate-700'
                    }
                `}>
                    <h2 className="text-3xl text-slate-300 mb-8 uppercase tracking-widest">Estado Actual</h2>

                    {isShiftOpen ? (
                        <div className="space-y-6">
                            <div className="inline-block px-8 py-4 bg-green-600 rounded-2xl text-5xl font-bold animate-pulse">
                                ESTAMOS DE TURNO
                            </div>
                            <p className="text-2xl text-green-200 mt-4">
                                Atendiendo urgencias las 24 horas
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="inline-block px-8 py-4 bg-slate-700 rounded-2xl text-5xl font-bold text-slate-400">
                                CERRADO
                            </div>
                            <p className="text-2xl text-slate-400 mt-4">
                                Horario de atención: Lunes a Sábado 09:00 - 21:00
                            </p>
                        </div>
                    )}
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 w-full max-w-6xl">
                    <div className="bg-slate-800 p-6 rounded-2xl flex items-center gap-4">
                        <div className="p-4 bg-blue-900/50 rounded-xl text-blue-400">
                            <MapPin size={32} />
                        </div>
                        <div className="text-left">
                            <h3 className="font-bold text-lg">Ubicación</h3>
                            <p className="text-slate-400">Calle Principal 123, Vallenar</p>
                        </div>
                    </div>
                    <div className="bg-slate-800 p-6 rounded-2xl flex items-center gap-4">
                        <div className="p-4 bg-purple-900/50 rounded-xl text-purple-400">
                            <Phone size={32} />
                        </div>
                        <div className="text-left">
                            <h3 className="font-bold text-lg">Contacto</h3>
                            <p className="text-slate-400">+56 51 234 5678</p>
                        </div>
                    </div>
                    <div className="bg-slate-800 p-6 rounded-2xl flex items-center gap-4">
                        <div className="p-4 bg-orange-900/50 rounded-xl text-orange-400">
                            <Clock size={32} />
                        </div>
                        <div className="text-left">
                            <h3 className="font-bold text-lg">Horario Normal</h3>
                            <p className="text-slate-400">09:00 - 21:00 hrs</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
