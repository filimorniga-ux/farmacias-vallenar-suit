
'use client';

import UnifiedPriceConsultant from "@/components/procurement/UnifiedPriceConsultant";
import { ArrowLeft, Monitor } from "lucide-react";
import Link from "next/link";

export default function TotemPage() {
    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[5%] left-[10%] w-[600px] h-[600px] bg-sky-200/30 rounded-full blur-[120px]" />
                <div className="absolute bottom-[5%] right-[10%] w-[600px] h-[600px] bg-teal-100/20 rounded-full blur-[120px]" />
            </div>

            <header className="mb-12 flex items-center justify-between container mx-auto max-w-5xl relative z-10">
                <div className="flex items-center gap-4">
                    <div className="bg-white p-3 rounded-2xl shadow-xl shadow-sky-900/5 border border-sky-100">
                        <div className="bg-sky-500 p-2.5 rounded-xl">
                            <Monitor className="text-white h-6 w-6" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Consulta de Precios</h1>
                        <p className="text-sky-600 font-bold text-sm tracking-wide">Farmacias Vallenar</p>
                    </div>
                </div>
                <Link href="/" className="px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-sky-100 shadow-sm text-sm font-bold text-sky-700 hover:bg-sky-50 transition-all flex items-center gap-2">
                    <ArrowLeft size={16} /> Salir
                </Link>
            </header>

            <main className="container mx-auto max-w-5xl relative z-10">
                <div className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-4 md:p-8 shadow-2xl shadow-sky-900/5 border border-sky-50">
                    <UnifiedPriceConsultant isPublicMode={true} allowToggle={false} />
                </div>

                <div className="mt-12 text-center text-slate-400 text-sm font-medium bg-slate-100/50 py-3 px-6 rounded-full border border-slate-200 w-fit mx-auto">
                    <p>Los precios y stocks pueden variar. Sugerimos confirmar con el farmacéutico.</p>
                </div>
            </main>
        </div>
    );
}
