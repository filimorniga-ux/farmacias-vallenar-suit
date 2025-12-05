import { getLogisticsData } from '@/lib/data/logistics';
import DataTable from '@/components/logistica/DataTable';
import AddPurchaseButton from '@/components/logistica/AddPurchaseButton';
import RouteGuard from '@/components/auth/RouteGuard';
import { InventoryExportForm } from '@/presentation/components/reports/InventoryExportForm';

export const dynamic = 'force-dynamic';

export default async function LogisticaPage() {
    const logisticsData = await getLogisticsData();

    return (
        <RouteGuard allowedRoles={['ADMIN', 'QF', 'VENDEDOR']}>
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
                        <div className="mt-4 flex md:ml-4 md:mt-0">
                            <AddPurchaseButton />
                        </div>
                    </div>

                    <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2 mb-6">
                        <div className="px-4 py-6 sm:px-6">
                            <InventoryExportForm />
                        </div>
                    </div>

                    <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
                        <div className="px-4 py-6 sm:px-6">
                            <DataTable initialData={logisticsData} />
                        </div>
                    </div>
                </div>
            </div>
        </RouteGuard>
    );
}
