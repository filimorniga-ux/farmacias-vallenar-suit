import { redirect } from 'next/navigation';
import HumanResourcesDashboard from '@/presentation/components/hr/HumanResourcesDashboard';
import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';
import { getTodayAttendanceSecure, getApprovedAttendanceHistory } from '@/actions/attendance-v2';
import { getUsersSecure } from '@/actions/users-v2';
import { getValidatedSession } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

const RRHH_ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'RRHH', 'GERENTE_GENERAL'];
const RRHH_GLOBAL_ROLES = ['ADMIN', 'RRHH', 'GERENTE_GENERAL'];

export default async function RRHHPage() {
    const session = await getValidatedSession();

    if (!session || !RRHH_ALLOWED_ROLES.includes(session.role)) {
        redirect('/');
    }

    const scopedLocationId = RRHH_GLOBAL_ROLES.includes(session.role)
        ? undefined
        : session.locationId;

    const employeesRes = await getUsersSecure({
        locationId: scopedLocationId,
        page: 1,
        pageSize: 200,
    });
    const employeesData = employeesRes.success
        ? employeesRes.data?.users.map((employee) => ({
            ...employee,
            isActive: employee.is_active,
            baseSalary: employee.base_salary || 0,
            photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.name)}&background=random`,
        })) || []
        : [];

    const liveAttendanceRes = await getTodayAttendanceSecure(scopedLocationId);
    const liveData = liveAttendanceRes.success ? liveAttendanceRes.data : [];

    const historyRes = await getApprovedAttendanceHistory({
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
        locationId: scopedLocationId,
    });
    const historyData = historyRes.success ? historyRes.data : [];

    return (
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
    );
}
