'use client';

import { useRouter } from 'next/navigation';
import type { DashboardStats } from '@/actions/analytics/dashboard-stats';
import type { ManagerDashboardData } from '@/actions/manager-dashboard-v2';
import RouteGuard from '@/components/auth/RouteGuard';
import { DashboardPageContent } from '@/presentation/pages/DashboardPage';

type DashboardClientPageProps = {
    initialDashboardStats?: DashboardStats | null;
    initialManagerData?: ManagerDashboardData | null;
};

export default function DashboardClientPage({
    initialDashboardStats,
    initialManagerData,
}: DashboardClientPageProps) {
    const router = useRouter();

    return (
        <RouteGuard>
            <DashboardPageContent
                navigateTo={router.push}
                initialDashboardStats={initialDashboardStats}
                initialManagerData={initialManagerData}
            />
        </RouteGuard>
    );
}
