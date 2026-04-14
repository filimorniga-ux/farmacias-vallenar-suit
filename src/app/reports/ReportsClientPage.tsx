'use client';

import RouteGuard from '@/components/auth/RouteGuard';
import ReportsPage from '@/presentation/pages/ReportsPage';

const REPORTS_ALLOWED_ROLES = [
    'MANAGER',
    'ADMIN',
    'GERENTE_GENERAL',
    'QF',
    'CASHIER',
    'CONTADOR',
    'WAREHOUSE',
    'RRHH',
] as const;

export default function ReportsClientPage() {
    return (
        <RouteGuard allowedRoles={[...REPORTS_ALLOWED_ROLES]}>
            <ReportsPage />
        </RouteGuard>
    );
}
