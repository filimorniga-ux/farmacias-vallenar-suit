import { redirect } from 'next/navigation';
import { requireScopedActor } from '@/actions/admin-scope';

const TREASURY_PAGE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF', 'TESORERO'] as const;

export default async function TreasuryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const auth = await requireScopedActor(TREASURY_PAGE_ROLES);
    if (!auth.success) {
        redirect('/');
    }

    return children;
}
