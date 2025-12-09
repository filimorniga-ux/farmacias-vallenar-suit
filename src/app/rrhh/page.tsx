import { getPayrollData } from '@/lib/data/payroll';
import EmployeeGrid from '@/components/rrhh/EmployeeGrid'; // Client component wrapper
import RouteGuard from '@/components/auth/RouteGuard';

import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';

export const dynamic = 'force-dynamic';

export default async function RRHHPage() {
    const payrollData = await getPayrollData();

    // Mock Employees
    const employees = [
        {
            id: 1,
            name: 'Juan Pérez',
            role: 'Químico Farmacéutico',
            baseSalary: 1800000,
            isActive: true,
            photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        },
        {
            id: 2,
            name: 'María González',
            role: 'Auxiliar de Farmacia',
            baseSalary: 600000,
            isActive: true,
            photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        },
        {
            id: 3,
            name: 'Carlos Rodríguez',
            role: 'Vendedor',
            baseSalary: 500000,
            isActive: true,
            photoUrl: 'https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        },
        {
            id: 4,
            name: 'Ana Martínez',
            role: 'Vendedor',
            baseSalary: 500000,
            isActive: false,
            photoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
        },
    ];

    return (
        <RouteGuard allowedRoles={['ADMIN']}>
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
