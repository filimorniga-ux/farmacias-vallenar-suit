import { redirect } from 'next/navigation';
import { requireScopedActor } from '@/actions/admin-scope';
import NetworkClientPage from './NetworkClientPage';

export const dynamic = 'force-dynamic';

const NETWORK_PAGE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

export default async function NetworkRoutePage() {
    const auth = await requireScopedActor(NETWORK_PAGE_ROLES);
    if (!auth.success) {
        redirect('/');
    }

    return <NetworkClientPage />;
}
