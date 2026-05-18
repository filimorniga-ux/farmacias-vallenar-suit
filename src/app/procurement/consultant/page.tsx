import UnifiedPriceConsultant from '@/components/procurement/UnifiedPriceConsultant';
import { Metadata } from 'next';
import { getSessionSecure } from '@/actions/auth-v2';

const INTERNAL_PRICING_ROLES = new Set([
    'WAREHOUSE',
    'WAREHOUSE_CHIEF',
    'MANAGER',
    'QF',
    'ADMIN',
    'GERENTE_GENERAL',
]);

export const metadata: Metadata = {
    title: 'Consultor de Precios Unificado | Farmacias Vallenar',
    description: 'Arbitraje de precios y comparativa inteligente de inventario',
};

export default async function ConsultantPage() {
    const session = await getSessionSecure().catch(() => null);
    const canViewInternalPricing = INTERNAL_PRICING_ROLES.has(String(session?.role || '').trim().toUpperCase());

    return (
        <div className="min-h-screen bg-gray-50/50 py-8">
            <div className="container mx-auto px-4">
                {/* Header removed as it is now inside the UnifiedPriceConsultant component for better layout */}
                <UnifiedPriceConsultant canViewInternalPricing={canViewInternalPricing} allowToggle={canViewInternalPricing} />
            </div>
        </div>
    );
}
