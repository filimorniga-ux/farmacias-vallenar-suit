import UnifiedPriceConsultant from '@/components/procurement/UnifiedPriceConsultant';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Consultor de Precios Unificado | Farmacias Vallenar',
    description: 'Arbitraje de precios y comparativa inteligente de inventario',
};

export default function ConsultantPage() {
    return (
        <div className="min-h-screen bg-gray-50/50 py-8">
            <div className="container mx-auto px-4">
                {/* Header removed as it is now inside the UnifiedPriceConsultant component for better layout */}
                <UnifiedPriceConsultant />
            </div>
        </div>
    );
}
