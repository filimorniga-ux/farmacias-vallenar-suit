'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, UserRole } from '@/lib/store/auth';

interface RouteGuardProps {
    children: React.ReactNode;
    allowedRoles?: UserRole[];
}

export default function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        // 1. Check Authentication
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        // 2. Check Role Authorization
        if (allowedRoles && user) {
            if (!allowedRoles.includes(user.role)) {
                // Redirect to home or show denied message
                // For better UX, we'll redirect to home which will show disabled cards
                router.push('/');
                return;
            }
        }

        setAuthorized(true);
    }, [isAuthenticated, user, router, allowedRoles]);

    if (!authorized) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return <>{children}</>;
}
