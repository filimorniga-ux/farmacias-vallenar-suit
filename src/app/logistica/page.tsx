import AddPurchaseButton from '@/components/logistica/AddPurchaseButton';
import UnifiedPriceConsultant from '@/components/procurement/UnifiedPriceConsultant';
import RouteGuard from '@/components/auth/RouteGuard';
import { InventoryExportForm } from '@/presentation/components/reports/InventoryExportForm';
import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';
import { requireScopedActor } from '@/actions/admin-scope';
import { getValidatedSession } from '@/lib/server-session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const LOGISTICA_PAGE_ROLES = ['ADMIN', 'QF', 'WAREHOUSE', 'MANAGER', 'GERENTE_GENERAL'] as const;
const INTERNAL_PRICING_ROLES = new Set([
    'WAREHOUSE',
    'WAREHOUSE_CHIEF',
    'MANAGER',
    'QF',
    'ADMIN',
    'GERENTE_GENERAL',
]);

export default async function LogisticaPage() {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    const auth = await requireScopedActor(LOGISTICA_PAGE_ROLES);
    if (!auth.success) {
        redirect('/');
    }

    const canViewInternalPricing = INTERNAL_PRICING_ROLES.has(auth.actor.role);

    return (
        <RouteGuard allowedRoles={[...LOGISTICA_PAGE_ROLES]}>
            <div className="min-h-screen bg-gray-100 py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="md:flex md:items-center md:justify-between mb-8">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                                📦 Logística y Bodega
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Gestión de inventario, lotes y trazabilidad.
                            </p>
                        </div>
                        <div className="mt-4 flex items-center gap-4 md:ml-4 md:mt-0">
                            <SyncStatusBadge />
                            <AddPurchaseButton />
                        </div>
                    </div>

                    <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2 mb-6">
                        <div className="px-4 py-6 sm:px-6">
                            <InventoryExportForm />
                        </div>
                    </div>

                    <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
                        {/* Replaced DataTable with UnifiedPriceConsultant for consistency */}
                        <UnifiedPriceConsultant allowToggle={canViewInternalPricing} canViewInternalPricing={canViewInternalPricing} />
                    </div>
                </div>
            </div>
        </RouteGuard>
    );
}
