import { getFinanceData } from '@/lib/data/finance';
import KPICards from '@/components/finanzas/KPICards';
import SalesChart from '@/components/finanzas/SalesChart';
import TransactionsTable from '@/components/finanzas/TransactionsTable';
import ExportButton from '@/components/finanzas/ExportButton'; // We'll create this small client component for the alert
import RouteGuard from '@/components/auth/RouteGuard';

export const dynamic = 'force-dynamic';

export default async function FinanzasPage() {
    const financeData = await getFinanceData();

    return (
        <RouteGuard allowedRoles={['ADMIN']}>
            <div className="min-h-screen bg-gray-100 py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="md:flex md:items-center md:justify-between mb-8">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                                📊 Gerencia & BI
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Dashboard financiero y control de gestión.
                            </p>
                        </div>
                        <div className="mt-4 flex md:ml-4 md:mt-0">
                            <ExportButton />
                        </div>
                    </div>

                    <div className="space-y-8">
                        {/* KPI Cards */}
                        <KPICards stats={financeData.monthlyStats} />

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Chart Section - Takes up 2 columns on large screens */}
                            <div className="lg:col-span-2">
                                <SalesChart data={financeData.dailySales} />
                            </div>

                            {/* Recent Transactions - Takes up 1 column */}
                            <div className="lg:col-span-1">
                                <TransactionsTable transactions={financeData.recentTransactions} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </RouteGuard>
    );
}
