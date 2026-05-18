'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePharmaStore } from '@/presentation/store/useStore';
import { Role } from '@/domain/types';

interface RouteGuardProps {
    children: React.ReactNode;
    allowedRoles?: Role[];
}

export default function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
    const router = useRouter();
    const user = usePharmaStore((state) => state.user);
    const [authorized, setAuthorized] = useState(false);
    // True hydration check from Zustand utils + React mount
    const [isStoreHydrated, setIsStoreHydrated] = useState(false);

    useEffect(() => {
        // Double check: React mounted AND Zustand finished rehydrating
        const checkHydration = () => {
            if (usePharmaStore.persist.hasHydrated()) {
                setIsStoreHydrated(true);
            } else {
                usePharmaStore.persist.onFinishHydration(() => setIsStoreHydrated(true));
            }
        };
        checkHydration();
    }, []);

    useEffect(() => {
        // STRICT BLOCK: Do absolutely nothing until we are sure hydration happened
        if (!isStoreHydrated) return;

        if (!user) {
            router.replace('/');
            return;
        }

        const userRole = user.role;
        // ... rest of logic
        if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
            setAuthorized(false);
            return;
        }

        setAuthorized(true);
    }, [user, router, allowedRoles, isStoreHydrated]);

    if (!authorized) {
        return null; // Loading state
    }

    return <>{children}</>;
}
