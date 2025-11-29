import { useEffect } from 'react';

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

        // 3. Request Full Screen on First Interaction
        const enterFullScreen = async () => {
            try {
                if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                }
            } catch (err) {
                // Fullscreen request denied or not supported
            }
        };

        // Attach to click listener to satisfy browser policy
        const handleInteraction = () => {
            enterFullScreen();
            window.removeEventListener('click', handleInteraction);
        };

        window.addEventListener('click', handleInteraction);

        return () => {
            window.removeEventListener('popstate', blockBackNavigation);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('click', handleInteraction);
        };
    }, [enabled]);
};
