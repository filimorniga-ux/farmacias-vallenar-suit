import { redirect } from 'next/navigation';
import { CUSTOMER_DIRECTORY_ROLES, requireCustomerActor } from '@/actions/customer-scope';
import { getValidatedSession } from '@/lib/server-session';
import ClientsClientPage from './ClientsClientPage';

export const dynamic = 'force-dynamic';

export default async function ClientsRoutePage() {
    const session = await getValidatedSession();

    if (!session) {
        redirect('/login');
    }

    const auth = await requireCustomerActor(CUSTOMER_DIRECTORY_ROLES, 'clients-route-page');

    if (!auth.success) {
        redirect('/');
    }

    return <ClientsClientPage />;
}
