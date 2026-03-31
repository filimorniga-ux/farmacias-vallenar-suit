import { getDashboardStats, type DashboardStats } from '@/actions/analytics/dashboard-stats';
import { getManagerRealTimeDataSecure, type ManagerDashboardData } from '@/actions/manager-dashboard-v2';
import { getValidatedSession } from '@/lib/server-session';
import DashboardClientPage from './DashboardClientPage';

export const dynamic = 'force-dynamic';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'GERENTE_GENERAL']);

export default async function DashboardPage() {
    const session = await getValidatedSession();
    let initialDashboardStats: DashboardStats | null = null;
    let initialManagerData: ManagerDashboardData | null = null;

    if (session?.userId) {
        const normalizedRole = String(session.role || '').trim().toUpperCase();
        const [dashboardStats, managerDataResult] = await Promise.all([
            getDashboardStats(),
            MANAGER_ROLES.has(normalizedRole)
                ? getManagerRealTimeDataSecure()
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
