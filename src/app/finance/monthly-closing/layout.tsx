import { redirect } from 'next/navigation';
import { requireScopedActor } from '@/actions/admin-scope';

const MONTHLY_CLOSING_PAGE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

export default async function MonthlyClosingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const auth = await requireScopedActor(MONTHLY_CLOSING_PAGE_ROLES);
    if (!auth.success) {
        redirect('/');
    }

    return children;
}
