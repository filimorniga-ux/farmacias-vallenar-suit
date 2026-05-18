import { redirect } from 'next/navigation';
import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';
import { getValidatedSession } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

const WAREHOUSE_PAGE_ROLES = ['WAREHOUSE', 'WAREHOUSE_CHIEF', 'MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'] as const;

export default function WarehouseLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <WarehouseLayoutInner>{children}</WarehouseLayoutInner>
    );
}

async function WarehouseLayoutInner({ children }: { children: React.ReactNode }) {
    const session = await getValidatedSession();
    const role = String(session?.role || '').trim().toUpperCase();

    if (!session || !WAREHOUSE_PAGE_ROLES.includes(role as typeof WAREHOUSE_PAGE_ROLES[number])) {
        redirect('/');
    }

    return <NextSidebarLayout>{children}</NextSidebarLayout>;
}
