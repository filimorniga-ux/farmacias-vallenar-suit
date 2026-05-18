import { redirect } from 'next/navigation';
import { PROCUREMENT_READ_ROLES, requireProcurementActor } from '@/actions/procurement-scope';
import { getValidatedSession } from '@/lib/server-session';
import SupplyChainClientPage from './SupplyChainClientPage';

export const dynamic = 'force-dynamic';

export default async function SupplyChainRoutePage() {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    const auth = await requireProcurementActor(PROCUREMENT_READ_ROLES, 'supply-chain-route-page');
    if (!auth.success) {
        redirect('/');
    }

    return <SupplyChainClientPage />;
}
