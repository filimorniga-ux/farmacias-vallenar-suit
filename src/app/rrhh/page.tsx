import { getPayrollData } from '@/lib/data/payroll';
import { getEmployees } from '@/lib/data/employees';
import HumanResourcesDashboard from '@/presentation/components/hr/HumanResourcesDashboard';
import RouteGuard from '@/components/auth/RouteGuard';
import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';
import { getTodayAttendanceSecure, getApprovedAttendanceHistory } from '@/actions/attendance-v2';

export const dynamic = 'force-dynamic';

export default async function RRHHPage() {
    const payrollData = await getPayrollData();
    const employeesData = await getEmployees();

    // Fetch real-time data
    const liveAttendanceRes = await getTodayAttendanceSecure();
    const liveData = liveAttendanceRes.success ? liveAttendanceRes.data : [];

    // Fetch initial history
    const historyRes = await getApprovedAttendanceHistory({
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
        endDate: new Date().toISOString()
    });
    const historyData = historyRes.success ? historyRes.data : [];

    return (
        <RouteGuard allowedRoles={['ADMIN', 'MANAGER', 'RRHH', 'GERENTE_GENERAL']}>
            <div className="min-h-screen bg-slate-50 py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                                👥 Recursos Humanos
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Gestión integral de personal, asistencia y credenciales.
                            </p>
                        </div>
                        <SyncStatusBadge />
                    </div>

                    <HumanResourcesDashboard
                        employees={employeesData}
                        liveAttendance={liveData || []}
                        initialHistory={historyData || []}
                    />
                </div>
            </div>
        </RouteGuard>
    );
}
