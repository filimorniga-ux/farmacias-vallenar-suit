'use client';

/**
 * useGlobalFullscreen — Solicita pantalla completa al primer click del usuario
 *
 * Se activa globalmente en providers.tsx para que toda la app entre en
 * fullscreen sin importar la ruta. Compatible con Chrome, Firefox, Safari
 * y Edge. Se desactiva automáticamente en Electron y Capacitor (donde el
 * fullscreen se maneja a nivel nativo).
 */

import { useEffect, useRef } from 'react';

function isElectron(): boolean {
    return typeof window !== 'undefined' &&
        (typeof (window as unknown as Record<string, unknown>).electronAPI !== 'undefined' ||
            navigator.userAgent.toLowerCase().includes('electron'));
}

function isCapacitor(): boolean {
    return typeof window !== 'undefined' &&
        typeof (window as unknown as Record<string, unknown>).Capacitor !== 'undefined';
}

export function useGlobalFullscreen() {
    const triggered = useRef(false);

    useEffect(() => {
        // Skip in SSR, Electron (uses native fullscreen), or Capacitor (uses native config)
        if (typeof window === 'undefined' || isElectron() || isCapacitor()) return;

        const requestFullscreen = async () => {
            if (triggered.current) return;
            triggered.current = true;

            try {
                if (!document.fullscreenElement) {
                    const docEl = document.documentElement as HTMLElement & {
                        webkitRequestFullscreen?: () => Promise<void>;
                    };

                    if (docEl.requestFullscreen) {
                        await docEl.requestFullscreen();
                    } else if (docEl.webkitRequestFullscreen) {
                        // Safari / older WebKit
                        await docEl.webkitRequestFullscreen();
                    }
                }
            } catch {
                // Fullscreen request denied by browser policy — silent ignore
            }
        };

        // Browsers require a user gesture to enter fullscreen
        const handleInteraction = () => {
            requestFullscreen();
            // Remove after first successful trigger
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
        };

        window.addEventListener('click', handleInteraction);
        window.addEventListener('touchstart', handleInteraction);

        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
        };
    }, []);
}
