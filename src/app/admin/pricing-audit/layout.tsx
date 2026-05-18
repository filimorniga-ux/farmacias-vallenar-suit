import { redirect } from 'next/navigation';

import { PRICING_GLOBAL_ROLES, requireScopedActor } from '@/actions/admin-scope';

export default async function PricingAuditLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const auth = await requireScopedActor(PRICING_GLOBAL_ROLES);
    if (!auth.success) {
        redirect('/');
    }

    return children;
}
