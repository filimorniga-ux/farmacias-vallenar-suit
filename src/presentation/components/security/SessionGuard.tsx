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

        // Throttle check: only validate if last check was > 30s ago OR path changed significantly
        // Note: We use a simple timestamp ref to track last validation
        const now = Date.now();
        const lastCheck = sessionStorage.getItem('last_session_check');
        const shouldCheck = !lastCheck || (now - parseInt(lastCheck) > 30000); // 30 seconds throttle

        if (!shouldCheck) return;

        const checkSession = async () => {
            try {
                // Determine current context (Location)
                const contextData = {
                    location_id: user.assigned_location_id || 'UNKNOWN',
                    path: pathname
                };

                const { validateSessionSecure } = await import('../../../actions/security-v2');
                const res = await validateSessionSecure(user.id, user.token_version || 1, contextData);

                if (!res.valid) {
                    console.warn('Session Invalid/Revoked:', res.error);
                    // Force Logout
                    setIsLocked(false);
                    usePharmaStore.getState().logout();
                    window.location.href = '/login?reason=session_revoked';
                } else {
                    // Update last check timestamp
                    sessionStorage.setItem('last_session_check', Date.now().toString());
                }
            } catch (error) {
                console.error('Session check failed:', error);
            }
        };

        checkSession();

        // Also set up the interval for background checking
        const interval = setInterval(checkSession, 60 * 1000); // Check every minute in background

        return () => clearInterval(interval);
    }, [user, pathname]); // Re-check on nav change (but throttled)

    return (
        <>
            {children}
            <LockScreen isLocked={isLocked} onUnlock={() => setIsLocked(false)} />
        </>
    );
}
