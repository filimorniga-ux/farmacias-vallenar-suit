import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Carga Inteligente de Facturas (DTE) | Farmacias Vallenar',
    description: 'Procesamiento automático de facturas electrónicas',
};

export default function InvoicesPage() {
    return (
        <div className="min-h-screen bg-gray-50/50 py-8">
            <div className="container mx-auto px-4 max-w-3xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                        Smart Invoice Processor
                    </h1>
                    <p className="mt-2 text-lg text-gray-600">
                        El flujo XML legado quedó fuera de servicio por hardening de seguridad.
                    </p>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-amber-200">
                    <h2 className="text-lg font-bold text-slate-900">Módulo legado deshabilitado</h2>
                    <p className="mt-3 text-sm text-slate-600">
                        Este entrypoint no seguirá procesando XML directo ni actualizando stock/costos desde cliente.
                        Usa el flujo moderno de abastecimiento para recepción y conciliación de compras.
                    </p>
                </div>
            </div>
        </div>
    );
}
