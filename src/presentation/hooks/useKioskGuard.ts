import { useEffect } from 'react';

/**
 * useKioskGuard — POS-specific kiosk protections
 *
 * Blocks back-button navigation and tab close/refresh.
 * Fullscreen is now handled globally by useGlobalFullscreen in providers.tsx.
 */
export const useKioskGuard = (enabled: boolean = true) => {
    useEffect(() => {
        if (!enabled) return;

        // 1. Block Back Button
        const blockBackNavigation = () => {
            window.history.pushState(null, '', window.location.href);
        };

        // Initial push to stack
        blockBackNavigation();

        window.addEventListener('popstate', blockBackNavigation);

        // 2. Block Tab Close / Refresh
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = ''; // Legacy support for Chrome
            return '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('popstate', blockBackNavigation);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [enabled]);
};
