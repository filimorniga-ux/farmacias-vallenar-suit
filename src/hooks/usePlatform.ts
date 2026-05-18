import { useSyncExternalStore } from 'react';

type ViewportSnapshot = {
    width: number;
    height: number;
};

type RuntimeSnapshot = {
    isNative: boolean;
    isElectron: boolean;
};

const SERVER_VIEWPORT_SNAPSHOT: ViewportSnapshot = { width: 0, height: 0 };
const SERVER_RUNTIME_SNAPSHOT: RuntimeSnapshot = { isNative: false, isElectron: false };

let lastViewportSnapshot = SERVER_VIEWPORT_SNAPSHOT;
let lastRuntimeSnapshot = SERVER_RUNTIME_SNAPSHOT;

function getViewportSnapshot(): ViewportSnapshot {
    if (typeof window === 'undefined') return SERVER_VIEWPORT_SNAPSHOT;

    const width = window.innerWidth;
    const height = window.innerHeight;

    if (lastViewportSnapshot.width === width && lastViewportSnapshot.height === height) {
        return lastViewportSnapshot;
    }

    lastViewportSnapshot = { width, height };
    return lastViewportSnapshot;
}

function getRuntimeSnapshot(): RuntimeSnapshot {
    if (typeof navigator === 'undefined') return SERVER_RUNTIME_SNAPSHOT;

    const userAgent = navigator.userAgent.toLowerCase();
    const nextSnapshot = {
        isNative: /android|ipad|iphone|ipod/i.test(userAgent),
        isElectron: userAgent.includes(' electron/'),
    };

    if (
        lastRuntimeSnapshot.isNative === nextSnapshot.isNative
        && lastRuntimeSnapshot.isElectron === nextSnapshot.isElectron
    ) {
        return lastRuntimeSnapshot;
    }

    lastRuntimeSnapshot = nextSnapshot;
    return lastRuntimeSnapshot;
}

function subscribeToViewport(onStoreChange: () => void) {
    if (typeof window === 'undefined') return () => undefined;

    const handleResize = () => onStoreChange();
    const handleOrientation = () => {
        window.setTimeout(onStoreChange, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientation);

    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleOrientation);
    };
}

function subscribeToRuntime() {
    return () => undefined;
}

export function usePlatform() {
    const viewport = useSyncExternalStore(
        subscribeToViewport,
        getViewportSnapshot,
        () => SERVER_VIEWPORT_SNAPSHOT,
    );
    const { isNative, isElectron } = useSyncExternalStore(
        subscribeToRuntime,
        getRuntimeSnapshot,
        () => SERVER_RUNTIME_SNAPSHOT,
    );

    const isLandscape = viewport.width > viewport.height;
    const isDesktopLike = viewport.width >= 1024 || (isLandscape && viewport.width >= 740);
    const isCompactMobileViewport = viewport.width < 768;
    const isMobile = (isCompactMobileViewport || isNative) && !isDesktopLike;

    return {
        isMobile,
        isDesktopLike,
        isLandscape,
        isNative,
        isElectron,
        isWeb: !isNative && !isElectron,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
    };
}
