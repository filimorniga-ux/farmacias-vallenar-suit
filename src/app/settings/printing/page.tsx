import { redirect } from 'next/navigation';
import { getValidatedSession } from '@/lib/server-session';
import PrintingSettingsClientPage from './PrintingSettingsClientPage';

export const dynamic = 'force-dynamic';

const SETTINGS_PRINTING_PAGE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

export default async function SettingsPrintingRoutePage() {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    const role = String(session.role || '').trim().toUpperCase();
    if (!SETTINGS_PRINTING_PAGE_ROLES.includes(role as typeof SETTINGS_PRINTING_PAGE_ROLES[number])) {
        redirect('/');
    }

    return <PrintingSettingsClientPage />;
}
