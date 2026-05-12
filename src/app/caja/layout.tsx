import type { ReactNode } from 'react';

import { requirePosRouteAccess } from '@/app/pos/route-access';

export default async function CajaLayout({ children }: { children: ReactNode }) {
    await requirePosRouteAccess();

    return <>{children}</>;
}
