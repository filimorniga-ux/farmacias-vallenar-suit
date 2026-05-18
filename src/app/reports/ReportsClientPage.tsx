'use client';

import { Suspense } from 'react';
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
            <Suspense fallback={<div className="p-6 text-sm text-slate-500">Cargando reportes...</div>}>
                <ReportsPage />
            </Suspense>
        </RouteGuard>
    );
}
