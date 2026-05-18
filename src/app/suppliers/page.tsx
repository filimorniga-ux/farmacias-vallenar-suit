import { redirect } from 'next/navigation';
import { SUPPLIER_CATALOG_ROLES, requireProcurementActor } from '@/actions/procurement-scope';
import { getValidatedSession } from '@/lib/server-session';
import SuppliersClientPage from './SuppliersClientPage';

export const dynamic = 'force-dynamic';

export default async function SuppliersRoutePage() {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    const auth = await requireProcurementActor(SUPPLIER_CATALOG_ROLES, 'suppliers-route-page');
    if (!auth.success) {
        redirect('/');
    }

    return <SuppliersClientPage />;
}
