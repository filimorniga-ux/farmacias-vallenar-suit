import { useEffect, useCallback, useRef } from 'react';

/**
 * Hook to detect user inactivity and trigger a callback.
 * @param timeoutMs Duration in milliseconds before idle (default 5 mins)
 * @param onIdle Callback function to execute when idle
 */
export function useIdleTimer(onIdle: () => void, timeoutMs: number = 300000) {
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const resetTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(onIdle, timeoutMs);
    }, [onIdle, timeoutMs]);

    useEffect(() => {
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

        // Initial Start
        resetTimer();

        // Listeners
        const handleActivity = () => resetTimer();

        events.forEach(event => {
            window.addEventListener(event, handleActivity);
        });

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
        };
    }, [resetTimer]);

    return { resetTimer };
}
