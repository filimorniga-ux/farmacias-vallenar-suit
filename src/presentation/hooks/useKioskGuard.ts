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

        // 3. Request Full Screen (Optional, requires user interaction first usually)
        const enterFullScreen = async () => {
            try {
                if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                }
            } catch (err) {
                console.log('Fullscreen request denied or not supported');
            }
        };

        // Attempt on mount (might fail without interaction)
        enterFullScreen();

        return () => {
            window.removeEventListener('popstate', blockBackNavigation);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [enabled]);
};
