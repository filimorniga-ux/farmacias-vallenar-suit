import { redirect } from 'next/navigation';
import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';
import { getValidatedSession } from '@/lib/server-session';
import { ADMIN_LAYOUT_ROLES } from '@/actions/admin-scope';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getValidatedSession();
    const role = String(session?.role || '').trim().toUpperCase();

    if (!session || !ADMIN_LAYOUT_ROLES.includes(role as typeof ADMIN_LAYOUT_ROLES[number])) {
        redirect('/');
    }

    return <NextSidebarLayout>{children}</NextSidebarLayout>;
}
