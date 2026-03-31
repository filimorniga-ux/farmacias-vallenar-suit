'use client';

import { useRouter } from 'next/navigation';
import RouteGuard from '@/components/auth/RouteGuard';
import { DashboardPageContent } from '@/presentation/pages/DashboardPage';

export default function DashboardClientPage() {
    const router = useRouter();

    return (
        <RouteGuard>
            <DashboardPageContent navigateTo={router.push} />
        </RouteGuard>
    );
}
