/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlatform } from '@/hooks/usePlatform';

function setViewport(width: number, height: number) {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        writable: true,
        value: height,
    });
}

function setUserAgent(userAgent: string) {
    Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        value: userAgent,
    });
}

describe('usePlatform', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
        setViewport(1280, 800);
    });

    it('detecta desktop web correctamente', () => {
        const { result } = renderHook(() => usePlatform());

        expect(result.current.isWeb).toBe(true);
        expect(result.current.isDesktopLike).toBe(true);
        expect(result.current.isMobile).toBe(false);
        expect(result.current.isLandscape).toBe(true);
    });

    it('detecta móvil nativo en portrait y desktop-like en landscape ancho', () => {
        setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7)');
        setViewport(390, 844);
        const { result } = renderHook(() => usePlatform());

        expect(result.current.isNative).toBe(true);
        expect(result.current.isMobile).toBe(true);
        expect(result.current.isDesktopLike).toBe(false);

        act(() => {
            setViewport(920, 430);
            window.dispatchEvent(new Event('resize'));
        });

        expect(result.current.isLandscape).toBe(true);
        expect(result.current.isDesktopLike).toBe(true);
        expect(result.current.isMobile).toBe(false);
    });

    it('recalcula viewport al orientationchange con delay de 100ms', () => {
        vi.useFakeTimers();
        try {
            setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7)');
            setViewport(390, 844);
            const { result } = renderHook(() => usePlatform());

            expect(result.current.isLandscape).toBe(false);
            expect(result.current.viewportWidth).toBe(390);

            act(() => {
                setViewport(920, 430);
                window.dispatchEvent(new Event('orientationchange'));
            });

            // Antes de los 100ms, aún conserva el viewport previo.
            expect(result.current.viewportWidth).toBe(390);
            expect(result.current.isLandscape).toBe(false);

            act(() => {
                vi.advanceTimersByTime(100);
            });

            expect(result.current.viewportWidth).toBe(920);
            expect(result.current.viewportHeight).toBe(430);
            expect(result.current.isLandscape).toBe(true);
            expect(result.current.isDesktopLike).toBe(true);
            expect(result.current.isMobile).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});
