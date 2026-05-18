import type { ReactNode } from 'react';

import NextSidebarLayout from '@/presentation/layouts/NextSidebarLayout';
import { requirePosRouteAccess } from '@/app/pos/route-access';

export const dynamic = 'force-dynamic';

export default async function CajaLayout({ children }: { children: ReactNode }) {
    await requirePosRouteAccess();

    return <NextSidebarLayout>{children}</NextSidebarLayout>;
}
