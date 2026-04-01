'use client';

import RouteGuard from '@/components/auth/RouteGuard';
import InventoryPage from '@/presentation/pages/InventoryPage';

export default function InventoryClientPage() {
    return (
        <RouteGuard allowedRoles={['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL']}>
            <InventoryPage />
        </RouteGuard>
    );
}

