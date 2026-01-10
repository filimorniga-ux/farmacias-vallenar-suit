
import InvoiceUploader from '@/components/procurement/InvoiceUploader';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Carga Inteligente de Facturas (DTE) | Farmacias Vallenar',
    description: 'Procesamiento automático de facturas electrónicas',
};

export default function InvoicesPage() {
    return (
        <div className="min-h-screen bg-gray-50/50 py-8">
            <div className="container mx-auto px-4 max-w-4xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                        Smart Invoice Processor
                    </h1>
                    <p className="mt-2 text-lg text-gray-600">
                        Sube tu DTE (XML) para actualizar inventario y costos automáticamente.
                    </p>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <InvoiceUploader />
                </div>
            </div>
        </div>
    );
}
