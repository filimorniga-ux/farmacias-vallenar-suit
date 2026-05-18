'use client';

import RouteGuard from '@/components/auth/RouteGuard';
import PrintingSettingsPage from '@/presentation/pages/settings/PrintingSettingsPage';

const SETTINGS_PRINTING_ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

export default function PrintingSettingsClientPage() {
    return (
        <RouteGuard allowedRoles={[...SETTINGS_PRINTING_ALLOWED_ROLES]}>
            <PrintingSettingsPage />
        </RouteGuard>
    );
}
