import React, { useState } from 'react';
import { Cloud, Database, ExternalLink, CreditCard, Calendar, Bell, CheckCircle, AlertTriangle } from 'lucide-react';
import { BILLING_LINKS } from '../../../domain/config/infrastructure';

const InfrastructureBillingPanel = () => {
    const [notify, setNotify] = useState(true);

    const ServiceCard = ({ title, icon: Icon, status, cost, cycle, link, color, gradient }: any) => (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
            <div className={`h-2 w-full bg-gradient-to-r ${gradient}`}></div>
            <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-xl bg-${color}-50 text-${color}-600`}>
                        <Icon size={24} />
                    </div>
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-lg border border-emerald-100 flex items-center gap-1">
                        <CheckCircle size={12} /> {status}
                    </span>
                </div>

                <h3 className="font-bold text-slate-800 text-lg mb-1">{title}</h3>
                <p className="text-slate-400 text-xs font-medium mb-4 uppercase tracking-wider">Suscripción Activa</p>

                <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Costo Estimado</span>
                        <span className="font-bold text-slate-800">{cost}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Ciclo</span>
                        <span className="font-bold text-slate-800">{cycle}</span>
                    </div>
                </div>

                <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r ${gradient} hover:opacity-90 transition-opacity shadow-lg shadow-${color}-500/20`}
                >
                    <CreditCard size={16} /> Gestionar Pago
                    <ExternalLink size={12} className="opacity-70" />
                </a>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Suscripción & Pagos</h2>
                    <p className="text-slate-500 text-sm">Gestiona la infraestructura tecnológica de tu farmacia.</p>
                </div>
                <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">
                    <AlertTriangle size={14} className="text-amber-500" />
                    <span className="text-xs font-bold text-amber-700">Próximo cobro: 01 de Diciembre</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ServiceCard
                    title="Servidor Web (Vercel)"
                    icon={Cloud}
                    status="Activo"
                    cost="$20 USD"
                    cycle="Mensual (Día 1)"
                    link={BILLING_LINKS.VERCEL}
                    color="slate"
                    gradient="from-slate-700 to-slate-900"
                />
                <ServiceCard
                    title="Base de Datos (Tiger)"
                    icon={Database}
                    status="Activo"
                    cost="$20 USD"
                    cycle="Mensual (Día 1)"
                    link={BILLING_LINKS.TIGER}
                    color="amber"
                    gradient="from-amber-500 to-orange-600"
                />
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Calendar size={20} className="text-slate-400" />
                    Historial y Preferencias
                </h3>

                <div className="flex flex-col md:flex-row gap-8">
                    <div className="flex-1 space-y-4">
                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase">Último Pago Realizado</p>
                                <p className="font-bold text-slate-800">01 de Noviembre, 2023</p>
                            </div>
                            <CheckCircle className="text-emerald-500" />
                        </div>
                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase">Próximo Vencimiento</p>
                                <p className="font-bold text-slate-800">01 de Diciembre, 2023</p>
                            </div>
                            <Calendar className="text-blue-500" />
                        </div>
                    </div>

                    <div className="flex-1 border-l border-slate-100 pl-0 md:pl-8">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-slate-700">Notificaciones de Cobro</span>
                            <button
                                onClick={() => setNotify(!notify)}
                                className={`w-12 h-6 rounded-full transition-colors relative ${notify ? 'bg-cyan-500' : 'bg-slate-200'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${notify ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            Recibe un correo electrónico 3 días antes de que se procese el pago automático.
                        </p>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-50 p-3 rounded-lg">
                            <Bell size={14} />
                            {notify ? 'Notificaciones Activas' : 'Notificaciones Desactivadas'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InfrastructureBillingPanel;
