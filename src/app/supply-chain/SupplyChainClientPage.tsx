'use client';

import RouteGuard from '@/components/auth/RouteGuard';
import SupplyChainPage from '@/presentation/pages/SupplyChainPage';

export default function SupplyChainClientPage() {
    return (
        <RouteGuard allowedRoles={['MANAGER', 'QF', 'ADMIN', 'WAREHOUSE', 'WAREHOUSE_CHIEF', 'GERENTE_GENERAL']}>
            <SupplyChainPage />
        </RouteGuard>
    );
}

