import { redirect } from 'next/navigation';

import { getValidatedSession } from '@/lib/server-session';
import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';

const RRHH_LAYOUT_ROLES = ['ADMIN', 'MANAGER', 'RRHH', 'GERENTE_GENERAL'] as const;

export const dynamic = 'force-dynamic';

export default async function RRHHLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getValidatedSession();
    if (!session) {
        redirect('/login');
    }

    const role = String(session.role || '').trim().toUpperCase();
    if (!RRHH_LAYOUT_ROLES.includes(role as typeof RRHH_LAYOUT_ROLES[number])) {
        redirect('/');
    }

    return (
        <NextSidebarLayout>
            {children}
        </NextSidebarLayout>
    );
}
