import React from 'react';
import { Cloud, Database, ExternalLink, AlertTriangle, CreditCard } from 'lucide-react';
import { BILLING_LINKS } from '../../../domain/config/infrastructure';

const InfrastructureStatusCard = () => {
    return (
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Cloud className="text-cyan-600" size={20} />
                    Estado de Suscripciones & Infraestructura
                </h3>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200 flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    Sistemas Operativos
                </span>
            </div>

            <div className="p-6 space-y-6">
                {/* Warning Banner */}
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div>
                        <p className="text-sm font-bold text-amber-800">Mantenimiento de Pagos</p>
                        <p className="text-xs text-amber-700 mt-1">
                            Recuerde mantener sus tarjetas actualizadas en las plataformas de los proveedores para evitar cortes de servicio.
                            Estos pagos se realizan directamente a los proveedores tecnológicos internacionales.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Vercel Status */}
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 hover:border-slate-200 transition-colors group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:scale-105 transition-transform">
                                <Cloud className="text-slate-800" size={24} />
                            </div>
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                🟢 Operativo
                            </span>
                        </div>
                        <h4 className="font-bold text-slate-700 mb-1">Servidor Web (Vercel)</h4>
                        <p className="text-xs text-slate-500 mb-4">Alojamiento del Frontend y API</p>

                        <a
                            href={BILLING_LINKS.VERCEL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-slate-200"
                        >
                            <CreditCard size={16} /> Gestionar Pago Vercel
                            <ExternalLink size={12} className="opacity-50" />
                        </a>
                    </div>

                    {/* Tiger Cloud Status */}
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 hover:border-slate-200 transition-colors group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:scale-105 transition-transform">
                                <Database className="text-amber-600" size={24} />
                            </div>
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                🟢 Operativo
                            </span>
                        </div>
                        <h4 className="font-bold text-slate-700 mb-1">Base de Datos (Tiger)</h4>
                        <p className="text-xs text-slate-500 mb-4">Almacenamiento y Motor SQL</p>

                        <a
                            href={BILLING_LINKS.TIGER}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-amber-200"
                        >
                            <CreditCard size={16} /> Gestionar Pago Tiger
                            <ExternalLink size={12} className="opacity-50" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InfrastructureStatusCard;
