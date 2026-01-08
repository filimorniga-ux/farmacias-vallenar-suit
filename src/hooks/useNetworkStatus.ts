import { useState, useEffect } from 'react';

/**
 * useNetworkStatus Hook
 * 
 * Provides robust network connectivity status compatible with SSR.
 * Initially returns `true` (Online) during SSR to avoid hydration mismatch,
 * then updates on the client based on actual `navigator.onLine`.
 * 
 * @returns { isOnline: boolean }
 */
export const useNetworkStatus = () => {
    // Default to true (Online) for SSR consistency
    const [isOnline, setIsOnline] = useState<boolean>(true);

    useEffect(() => {
        // Safe check for browser environment
        if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
            // Set initial client-side status
            setIsOnline(navigator.onLine);

            const handleOnline = () => setIsOnline(true);
            const handleOffline = () => setIsOnline(false);

            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            return () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        }
    }, []);

    return { isOnline };
};
