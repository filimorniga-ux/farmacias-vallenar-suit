'use client';

export default function OrdersPage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-4xl mx-auto px-6 py-16">
                <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8">
                    <h1 className="text-2xl font-bold text-slate-900">Reposición Inteligente Legacy</h1>
                    <p className="mt-4 text-sm text-slate-600">
                        Este entrypoint quedó deshabilitado. Usaba un flujo legado con sugerencias no determinísticas y
                        fuera del owner canónico del dominio. La operación segura quedó en
                        <span className="font-semibold"> /procurement/smart-order</span> y
                        <span className="font-semibold"> /supply-chain</span>.
                    </p>
                </div>
            </div>
        </div>
    );
}
