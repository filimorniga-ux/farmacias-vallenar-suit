'use client';

import RouteGuard from '@/components/auth/RouteGuard';
import NetworkPage from '@/presentation/pages/NetworkPage';

export default function NetworkClientPage() {
    return (
        <RouteGuard allowedRoles={['MANAGER', 'ADMIN', 'GERENTE_GENERAL']}>
            <NetworkPage />
        </RouteGuard>
    );
}

