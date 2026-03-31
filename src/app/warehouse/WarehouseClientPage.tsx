'use client';

import RouteGuard from '@/components/auth/RouteGuard';
import { WMSPage } from '@/presentation/pages/WMSPage';

export default function WarehouseClientPage() {
    return (
        <RouteGuard allowedRoles={['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL', 'CASHIER']}>
            <WMSPage />
        </RouteGuard>
    );
}
