import React from 'react';
import { Wrench, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';

export default function MaintenancePage() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                <div className="bg-blue-600 p-8 flex justify-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                    <div className="relative z-10 bg-white/20 p-4 rounded-full backdrop-blur-sm border border-white/30">
                        <Wrench className="w-12 h-12 text-white" />
                    </div>
                </div>
                <div className="p-8 text-center space-y-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Mantenimiento Programado</h1>
                        <p className="text-gray-500">Estamos actualizando el núcleo del sistema para garantizar la seguridad de tus datos.</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-5 text-left space-y-3">
                        <div className="flex items-start gap-3">
                            <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                            <span className="text-sm text-blue-900">Blindaje de sesiones y seguridad de usuarios.</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                            <span className="text-sm text-blue-900">Tiempo estimado: <span className="font-semibold">Breves minutos.</span></span>
                        </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 py-2 px-4 rounded-lg text-xs font-medium">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Por favor, no recargues repetidamente.</span>
                    </div>
                </div>
                <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-medium">Farmacias App System &copy; {new Date().getFullYear()}</p>
                </div>
            </div>
        </div>
    );
}
