import { getDashboardStats, type DashboardStats } from '@/actions/analytics/dashboard-stats';
import {
    getManagerRealTimeDataForActor,
    type ManagerDashboardData,
} from '@/actions/manager-dashboard-v2';
import { getValidatedSession } from '@/lib/server-session';
import { redirect } from 'next/navigation';
import DashboardClientPage from './DashboardClientPage';

export const dynamic = 'force-dynamic';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'GERENTE_GENERAL']);

export default async function DashboardPage() {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    let initialDashboardStats: DashboardStats | null = null;
    let initialManagerData: ManagerDashboardData | null = null;

    if (session.userId) {
        const normalizedRole = String(session.role || '').trim().toUpperCase();
        const [dashboardStats, managerDataResult] = await Promise.all([
            getDashboardStats(),
            MANAGER_ROLES.has(normalizedRole)
                ? getManagerRealTimeDataForActor({
                    ...session,
                    role: normalizedRole,
                })
                : Promise.resolve(null),
        ]);

        initialDashboardStats = dashboardStats;
        initialManagerData = managerDataResult?.success ? managerDataResult.data ?? null : null;
    }

    return (
        <DashboardClientPage
            initialDashboardStats={initialDashboardStats}
            initialManagerData={initialManagerData}
        />
    );
}
