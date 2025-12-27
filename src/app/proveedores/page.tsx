import { getSuppliers, getRestockingSuggestions, getProducts } from '@/lib/data/supply';
import RestockingTable from '@/components/supply/RestockingTable';
import ReceptionForm from '@/components/supply/ReceptionForm';
import RouteGuard from '@/components/auth/RouteGuard';

import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';

export const dynamic = 'force-dynamic';

export default async function ProveedoresPage() {
    const suppliers = await getSuppliers();
    const suggestions = await getRestockingSuggestions();
    const products = await getProducts();

    return (
        <RouteGuard allowedRoles={['ADMIN', 'QF']}>
            <div className="min-h-screen bg-gray-100 py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="md:flex md:items-center md:justify-between mb-8">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                                🚚 Abastecimiento
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Gestión de proveedores y reposición inteligente.
                            </p>
                        </div>
                        <div className="mt-4 flex items-center gap-4 md:ml-4 md:mt-0">
                            <SyncStatusBadge />
                            <div className="flex">
                                <form action={async () => {
                                    'use server';
                                    const { logActionSecure } = await import('@/actions/logger-action-v2');
                                    await logActionSecure('AJUSTE_STOCK', 'Ajuste manual de stock simulado: Paracetamol -10');
                                }}>
                                    <button
                                        type="submit"
                                        className="ml-3 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                    >
                                        Simular Ajuste Stock
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column: Restocking Suggestions (2/3 width) */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white shadow sm:rounded-lg p-6">
                                <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
                                    Alertas de Stock
                                </h3>
                                <RestockingTable suggestions={suggestions} />
                            </div>
                        </div>

                        {/* Right Column: Reception Form (1/3 width) */}
                        <div className="lg:col-span-1">
                            <ReceptionForm suppliers={suppliers} products={products} />
                        </div>
                    </div>
                </div>
            </div>
        </RouteGuard>
    );
}
