import { getPayrollData } from '@/lib/data/payroll';
import { getEmployees } from '@/lib/data/employees';
import EmployeeGrid from '@/components/rrhh/EmployeeGrid'; // Client component wrapper
import RouteGuard from '@/components/auth/RouteGuard';

import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';

export const dynamic = 'force-dynamic';

export default async function RRHHPage() {
    const payrollData = await getPayrollData();

    const employees = await getEmployees();

    return (
        <RouteGuard allowedRoles={['ADMIN', 'MANAGER']}>
            <div className="min-h-screen bg-gray-100 py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="md:flex md:items-center md:justify-between mb-8">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                                👥 Recursos Humanos
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Gestión de personal y cálculo de remuneraciones (Anti-Canela).
                            </p>
                        </div>
                        <div className="mt-4 flex md:ml-4 md:mt-0">
                            <SyncStatusBadge />
                        </div>
                    </div>

                    <EmployeeGrid employees={employees} payrollData={payrollData} />
                </div>
            </div>
        </RouteGuard>
    );
}
