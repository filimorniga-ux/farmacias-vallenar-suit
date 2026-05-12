import type { ReactNode } from 'react';

import { requirePosRouteAccess } from './route-access';

export default async function PosLayout({ children }: { children: ReactNode }) {
    await requirePosRouteAccess();

    return <>{children}</>;
}
