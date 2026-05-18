import { redirect } from 'next/navigation';
import { PROCUREMENT_READ_ROLES, requireProcurementActor } from '@/actions/procurement-scope';
import { getValidatedSession } from '@/lib/server-session';
import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

export const dynamic = 'force-dynamic';

export default async function ProcurementLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    const auth = await requireProcurementActor(PROCUREMENT_READ_ROLES, 'procurement-layout');
    if (!auth.success) {
        redirect('/');
    }

    return <NextSidebarLayout>{children}</NextSidebarLayout>;
}
