import { redirect } from 'next/navigation';
import { INVENTORY_READ_ROLES, requireInventoryActor } from '@/actions/inventory-scope';
import { getValidatedSession } from '@/lib/server-session';
import InventoryClientPage from './InventoryClientPage';

export const dynamic = 'force-dynamic';

export default async function InventoryRoutePage() {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    const auth = await requireInventoryActor(INVENTORY_READ_ROLES, 'inventory-route-page');
    if (!auth.success) {
        redirect('/');
    }

    return <InventoryClientPage />;
}
