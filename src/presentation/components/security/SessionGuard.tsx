'use client';

import React, { useState, useEffect } from 'react';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import LockScreen from './LockScreen';
import { usePharmaStore } from '../../store/useStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { usePathname } from 'next/navigation';

export default function SessionGuard({ children }: { children: React.ReactNode }) {
    const [isLocked, setIsLocked] = useState(false);
    const { user } = usePharmaStore();
    const { security } = useSettingsStore();
    const pathname = usePathname();

    // Configuration: Dynamic from Store (Minutes to Ms)
    const TIMEOUT_MS = (security?.idle_timeout_minutes || 5) * 60 * 1000;

    const handleIdle = () => {
        if (user && !pathname.includes('/login') && !pathname.includes('/reset-password') && !pathname.includes('/forgot-password')) {
            setIsLocked(true);
        }
    };

    useIdleTimer(handleIdle, TIMEOUT_MS);

    // 🔒 Server Session Verification (Remote Logout & Activity Tracking)
    useEffect(() => {
        if (!user) return;

        const checkSession = async () => {
            try {
                // Determine current context (Location)
                // In a perfect world we get this from a Context provider or Store
                // For now, we trust the store's assigned location or fallback.
                const contextData = {
                    location_id: user.assigned_location_id || 'UNKNOWN',
                    path: pathname
                };

                const { verifySession } = await import('../../../actions/security');
                const res = await verifySession(user.id, user.token_version || 1, contextData);

                if (!res.valid) {
                    console.warn('Session Invalid/Revoked:', res.error);
                    // Force Logout
                    setIsLocked(false); // No point locking, kick them out.
                    usePharmaStore.getState().logout(); // Logout from store
                    window.location.href = '/login?reason=session_revoked';
                }
            } catch (error) {
                console.error('Session check failed:', error);
            }
        };

        // Check immediately and then every 30 seconds
        checkSession();
        const interval = setInterval(checkSession, 30 * 1000);

        return () => clearInterval(interval);
    }, [user, pathname]); // Re-check on nav change too

    return (
        <>
            {children}
            <LockScreen isLocked={isLocked} onUnlock={() => setIsLocked(false)} />
        </>
    );
}
