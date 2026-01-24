
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export function usePlatform() {
    const [isMobile, setIsMobile] = useState(false);
    const [isNative, setIsNative] = useState(false);
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        // Detect Capacitor Native Platform
        const platform = Capacitor.getPlatform();
        setIsNative(platform === 'ios' || platform === 'android');

        // Detect Mobile Viewport
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);

        // Detect Electron (User Agent)
        const userAgent = navigator.userAgent.toLowerCase();
        setIsElectron(userAgent.indexOf(' electron/') > -1);

        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return {
        isMobile: isMobile || isNative, // Treat tablet native as mobile interaction (touch)
        isNative,
        isElectron,
        isWeb: !isNative && !isElectron
    };
}
