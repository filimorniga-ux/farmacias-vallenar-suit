
'use client';

import UnifiedPriceConsultant from "@/components/procurement/UnifiedPriceConsultant";
import { ArrowLeft, Monitor } from "lucide-react";
import Link from "next/link";

export default function TotemPage() {
    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8">
            <header className="mb-8 flex items-center justify-between container mx-auto max-w-5xl">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-200">
                        <Monitor className="text-white h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Consulta de Precios</h1>
                        <p className="text-slate-500">Farmacias Vallenar</p>
                    </div>
                </div>
                <Link href="/" className="text-sm font-medium text-slate-400 hover:text-slate-600 flex items-center gap-1">
                    <ArrowLeft size={16} /> Volver
                </Link>
            </header>

            <main className="container mx-auto max-w-5xl">
                <UnifiedPriceConsultant isPublicMode={true} />

                <div className="mt-8 text-center text-slate-400 text-sm">
                    <p>Los precios y stocks pueden variar. Consulte con un ejecutivo para confirmar.</p>
                </div>
            </main>
        </div>
    );
}
