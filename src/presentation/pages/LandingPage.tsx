
'use client';
import React from 'react';
import { User, DollarSign, Truck, Clock } from 'lucide-react';

const LandingPage: React.FC = () => {

    // Definición de enlaces y colores para el portal
    const portals = [
        { name: 'Punto de Venta', role: 'VENDEDOR', href: '/pos', icon: DollarSign, color: 'text-emerald-500', bgColor: 'bg-emerald-600/10' },
        { name: 'Logística & Inventario', role: 'QF / WAREHOUSE', href: '/supply', icon: Truck, color: 'text-cyan-500', bgColor: 'bg-cyan-600/10' },
        { name: 'Gerencia & RRHH', role: 'ADMIN', href: '/hr', icon: User, color: 'text-indigo-500', bgColor: 'bg-indigo-600/10' },
        { name: 'Reloj Control', role: 'EMPLEADO', href: '/access', icon: Clock, color: 'text-amber-500', bgColor: 'bg-amber-600/10' },
    ];

    const backgroundStyle = "min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-8";

    return (
        <div className={backgroundStyle}>
            <div className="text-center mb-16">
                <h1 className="text-6xl font-black text-cyan-400 drop-shadow-lg">Farmacias Vallenar</h1>
                <p className="text-xl text-slate-300 mt-2">Portal de Acceso v2.1</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 w-full max-w-6xl">
                {portals.map(portal => (
                    <a key={portal.name} href={portal.href} className={`p-6 rounded-2xl border-2 border-slate-700 backdrop-blur-sm shadow-xl transition hover:border-cyan-500 ${portal.bgColor}`}>
                        <div className={`p-4 rounded-full w-20 h-20 flex items-center justify-center mb-4 ${portal.bgColor}`}>
                            <portal.icon size={36} className={`${portal.color}`} />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-1">{portal.name}</h2>
                        <p className="text-sm text-slate-400">Acceso para: <span className="font-semibold">{portal.role}</span></p>
                    </a>
                ))}
            </div>

            <p className="text-xs text-slate-600 mt-16">
                Todos los derechos reservados © {new Date().getFullYear()} Pharma-Synapse Technologies
            </p>
        </div>
    );
};

export default LandingPage;
