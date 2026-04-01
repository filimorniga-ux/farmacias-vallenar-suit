/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import NotificationBellRuntime from '@/presentation/components/notifications/NotificationBellRuntime';

const mocks = vi.hoisted(() => ({
    fetchNotificationsMock: vi.fn(),
    savePushTokenMock: vi.fn(),
    pushRuntimeLoadedMock: vi.fn(),
    scheduleIdleTaskMock: vi.fn(),
}));

vi.mock('@/presentation/store/useNotificationStore', () => ({
    useNotificationStore: (selector: (state: {
        fetchNotifications: typeof mocks.fetchNotificationsMock;
        savePushToken: typeof mocks.savePushTokenMock;
    }) => unknown) => selector({
        fetchNotifications: mocks.fetchNotificationsMock,
        savePushToken: mocks.savePushTokenMock,
    }),
}));

vi.mock('@/presentation/store/useLocationStore', () => ({
    useLocationStore: (selector: (state: { currentLocation: { id: string } | null }) => unknown) => selector({
        currentLocation: { id: 'loc-1' },
    }),
}));

vi.mock('@/presentation/lib/scheduleIdleTask', () => ({
    scheduleIdleTask: (callback: () => void) => {
        mocks.scheduleIdleTaskMock();
        callback();
        return () => undefined;
    },
}));

vi.mock('@/lib/pushNotifications', () => {
    mocks.pushRuntimeLoadedMock();
    return {
        initPushNotifications: vi.fn(),
    };
});

describe('NotificationBellRuntime', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: false,
        });
        Object.defineProperty(window, 'Capacitor', {
            configurable: true,
            value: undefined,
        });
    });

    it('ejecuta fetch inicial en web sin cargar push nativo ni @capacitor en el mount', async () => {
        render(<NotificationBellRuntime />);

        await waitFor(() => {
            expect(mocks.fetchNotificationsMock).toHaveBeenCalledWith('loc-1');
        });

        expect(mocks.scheduleIdleTaskMock).toHaveBeenCalledTimes(1);
        expect(mocks.pushRuntimeLoadedMock).not.toHaveBeenCalled();
        expect(mocks.savePushTokenMock).not.toHaveBeenCalled();
    });
});
