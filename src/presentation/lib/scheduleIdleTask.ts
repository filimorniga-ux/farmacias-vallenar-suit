export function scheduleIdleTask(task: () => void, timeoutMs = 800) {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    if (typeof window.requestIdleCallback === 'function') {
        const idleId = window.requestIdleCallback(() => {
            task();
        }, { timeout: timeoutMs });

        return () => {
            if (typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(idleId);
            }
        };
    }

    const timeoutId = globalThis.setTimeout(() => {
        task();
    }, timeoutMs);

    return () => globalThis.clearTimeout(timeoutId);
}
