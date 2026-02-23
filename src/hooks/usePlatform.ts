import { useState, useEffect } from 'react';

export function usePlatform() {
    const detectNative = () => {
        // Fallback Web-only detection para despliegues móviles 
        // Ya no requerimos Capacitor nativo (Removido para estabilizar NextJS Web)
        if (typeof navigator === 'undefined') return false;
        return /android|ipad|iphone|ipod/i.test(navigator.userAgent.toLowerCase());
    };

    const detectElectron = () =>
        typeof navigator !== 'undefined'
        && navigator.userAgent.toLowerCase().includes(' electron/');

    const [viewport, setViewport] = useState(() => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
    }));
    const [isNative] = useState(detectNative);
    const [isElectron] = useState(detectElectron);

    useEffect(() => {
        const handleResize = () => {
            setViewport({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };
        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
