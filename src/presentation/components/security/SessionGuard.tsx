'use client';

import React, { useState } from 'react';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import LockScreen from './LockScreen';
import { usePharmaStore } from '../../store/useStore';
import { usePathname } from 'next/navigation';

export default function SessionGuard({ children }: { children: React.ReactNode }) {
    const [isLocked, setIsLocked] = useState(false);
    const { user } = usePharmaStore();
    const pathname = usePathname();

    // Configuration: 5 Minutes
    const TIMEOUT_MS = 5 * 60 * 1000;

    const handleIdle = () => {
        // Only lock if user is logged in
        // And not on public pages like login or recovery
        if (user && !pathname.includes('/login') && !pathname.includes('/reset-password') && !pathname.includes('/forgot-password')) {
            setIsLocked(true);
        }
    };

    useIdleTimer(handleIdle, TIMEOUT_MS);

    return (
        <>
            {children}
            <LockScreen isLocked={isLocked} onUnlock={() => setIsLocked(false)} />
        </>
    );
}
