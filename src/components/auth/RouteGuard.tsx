'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, Role } from '@/lib/store/useAuthStore';

interface RouteGuardProps {
    children: React.ReactNode;
    allowedRoles?: Role[];
}

export default function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
    const router = useRouter();
    const { isAuthenticated, role } = useAuthStore();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        // Wait for hydration (zustand persist)
        const checkAuth = () => {
            if (!isAuthenticated) {
                router.push('/login');
                return;
            }

            if (allowedRoles && role && !allowedRoles.includes(role)) {
                // Redirect to dashboard if role not allowed for this specific route
                // Or maybe show unauthorized page. For now, dashboard.
                router.push('/');
                return;
            }

            setAuthorized(true);
        };

        checkAuth();
    }, [isAuthenticated, role, router, allowedRoles]);

    if (!authorized) {
        return null; // Or a loading spinner
    }

    return <>{children}</>;
}
