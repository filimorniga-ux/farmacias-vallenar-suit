'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, ArrowRight, ShieldAlert } from 'lucide-react';
// Note: Adjusted import path to match project structure (using alias @/)
import { getRecentSystemIncidents } from '@/actions/maintenance';
import { useRouter } from 'next/navigation';

export default function SystemIncidentsBanner() {
    const [incidents, setIncidents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        getRecentSystemIncidents().then(res => {
            if (res.success && res.data) {
                setIncidents(res.data);
            }
            setLoading(false);
        });
    }, []);

    if (loading || incidents.length === 0) return null;

    return (
        <div className="mb-8 animate-in slide-in-from-top-4 duration-500">
            <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl shadow-sm p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">

                {/* Icono y Título */}
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-red-100 text-red-600 rounded-full shrink-0">
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <h3 className="text-red-800 font-bold text-lg">
                            {incidents.length} {incidents.length === 1 ? 'Cierre Automático Detectado' : 'Cierres Automáticos Detectados'}
                        </h3>
                        <p className="text-red-600 text-sm mt-1">
                            El sistema cerró sesiones olvidadas durante la noche para proteger la seguridad de datos.
                            Estas cajas tienen un cierre en $0 y requieren conciliación.
                        </p>
                    </div>
                </div>

                {/* Lista Resumida y Acción */}
                <div className="flex flex-col items-end gap-3 w-full md:w-auto">
                    <div className="flex -space-x-2 overflow-hidden">
                        {incidents.slice(0, 3).map((inc, idx) => (
                            <div key={inc.id} title={`${inc.terminal_name} - ${inc.cashier_name}`} className="relative inline-flex items-center justify-center w-8 h-8 text-xs font-bold text-white bg-red-400 border-2 border-white rounded-full">
                                {inc.terminal_name.substring(0, 1)}
                            </div>
                        ))}
                        {incidents.length > 3 && (
                            <div className="relative inline-flex items-center justify-center w-8 h-8 text-xs font-bold text-white bg-gray-400 border-2 border-white rounded-full">
                                +{incidents.length - 3}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => router.push('/reports/daily-closings?filter=system_bot')} // Futuro enlace a reportes
                        className="group flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-all shadow-md hover:shadow-lg"
                    >
                        Revisar y Conciliar
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Detalle Desplegable Rápido (Opcional: Listado simple debajo) */}
            <div className="mt-2 pl-16 space-y-1">
                {incidents.slice(0, 2).map((inc) => (
                    <div key={inc.id} className="text-xs text-red-400 flex items-center gap-2">
                        <Clock size={12} />
                        <span>{new Date(inc.end_time).toLocaleTimeString()} - <strong>{inc.terminal_name}</strong> ({inc.cashier_name})</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
