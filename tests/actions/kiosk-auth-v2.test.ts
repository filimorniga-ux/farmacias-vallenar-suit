import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockQuery,
    mockValidatePinForRoles,
    mockIssueKioskSessionToken,
    mockVerifyKioskSessionToken,
} = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockValidatePinForRoles: vi.fn(),
    mockIssueKioskSessionToken: vi.fn(),
    mockVerifyKioskSessionToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('@/lib/pin-rbac', () => ({
    ROLE_GROUPS: {
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
        MANAGER_OR_HR: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'],
    },
    validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
}));

vi.mock('@/lib/kiosk-session', () => ({
    issueKioskSessionToken: (...args: unknown[]) => mockIssueKioskSessionToken(...args),
    verifyKioskSessionToken: (...args: unknown[]) => mockVerifyKioskSessionToken(...args),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
    },
}));

import {
    unlockAttendanceKioskSecure,
    unlockQueueDisplaySecure,
    unlockQueueKioskSecure,
    validateAttendanceKioskExitPinSecure,
    validatePublicKioskAdminPinSecure,
    validateQueueDisplayExitPinSecure,
    validateQueueKioskExitPinSecure,
} from '@/actions/kiosk-auth-v2';

const LOCATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440002';
const MANAGER_ID = '550e8400-e29b-41d4-a716-446655440003';

describe('kiosk-auth-v2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIssueKioskSessionToken.mockReturnValue('signed-kiosk-token');
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: MANAGER_ID,
                name: 'Manager',
                role: 'MANAGER',
            },
        });
        mockVerifyKioskSessionToken.mockReturnValue({
            valid: true,
            payload: {
                version: 1,
                mode: 'ATTENDANCE',
                locationId: LOCATION_ID,
                authorizedBy: MANAGER_ID,
                issuedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
            },
        });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: LOCATION_ID }], rowCount: 1 })
            .mockResolvedValueOnce({
                rows: [{
                    id: MANAGER_ID,
                    name: 'Manager',
                    role: 'MANAGER',
                    assigned_location_id: LOCATION_ID,
                    is_active: true,
                }],
                rowCount: 1,
            });
    });

    it('emite token de kiosko de asistencia para manager en su sucursal', async () => {
        const result = await unlockAttendanceKioskSecure({
            locationId: LOCATION_ID,
            pin: '9999',
        });

        expect(result.success).toBe(true);
        expect(result.token).toBe('signed-kiosk-token');
        expect(mockIssueKioskSessionToken).toHaveBeenCalledWith({
            mode: 'ATTENDANCE',
            locationId: LOCATION_ID,
            authorizedBy: MANAGER_ID,
        });
    });

    it('rechaza unlockAttendanceKioskSecure si el manager intenta activar otra sucursal', async () => {
        mockQuery
            .mockReset()
            .mockResolvedValueOnce({ rows: [{ id: OTHER_LOCATION_ID }], rowCount: 1 })
            .mockResolvedValueOnce({
                rows: [{
                    id: MANAGER_ID,
                    name: 'Manager',
                    role: 'MANAGER',
                    assigned_location_id: LOCATION_ID,
                    is_active: true,
                }],
                rowCount: 1,
            });

        const result = await unlockAttendanceKioskSecure({
            locationId: OTHER_LOCATION_ID,
            pin: '9999',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('sucursal');
    });

    it('valida salida del kiosko con el token pareado', async () => {
        const result = await validateAttendanceKioskExitPinSecure({
            pin: '9999',
            kioskToken: 'signed-kiosk-token',
        });

        expect(result.success).toBe(true);
        expect(mockVerifyKioskSessionToken).toHaveBeenCalledWith('signed-kiosk-token', 'ATTENDANCE');
    });

    it('valida PIN administrativo server-side para display de cola', async () => {
        const result = await validatePublicKioskAdminPinSecure({
            mode: 'QUEUE_DISPLAY',
            locationId: LOCATION_ID,
            pin: '9999',
        });

        expect(result.success).toBe(true);
    });

    it('emite token de kiosko de fila para manager en su sucursal', async () => {
        const result = await unlockQueueKioskSecure({
            locationId: LOCATION_ID,
            pin: '9999',
        });

        expect(result.success).toBe(true);
        expect(mockIssueKioskSessionToken).toHaveBeenCalledWith({
            mode: 'QUEUE',
            locationId: LOCATION_ID,
            authorizedBy: MANAGER_ID,
        });
    });

    it('emite token de display de fila para manager en su sucursal', async () => {
        const result = await unlockQueueDisplaySecure({
            locationId: LOCATION_ID,
            pin: '9999',
        });

        expect(result.success).toBe(true);
        expect(mockIssueKioskSessionToken).toHaveBeenCalledWith({
            mode: 'QUEUE_DISPLAY',
            locationId: LOCATION_ID,
            authorizedBy: MANAGER_ID,
        });
    });

    it('valida salida del totem de fila con el token pareado', async () => {
        mockVerifyKioskSessionToken.mockReturnValueOnce({
            valid: true,
            payload: {
                version: 1,
                mode: 'QUEUE',
                locationId: LOCATION_ID,
                authorizedBy: MANAGER_ID,
                issuedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
            },
        });

        const result = await validateQueueKioskExitPinSecure({
            pin: '9999',
            kioskToken: 'signed-kiosk-token',
        });

        expect(result.success).toBe(true);
        expect(mockVerifyKioskSessionToken).toHaveBeenCalledWith('signed-kiosk-token', 'QUEUE');
    });

    it('valida salida del display de fila con el token pareado', async () => {
        mockVerifyKioskSessionToken.mockReturnValueOnce({
            valid: true,
            payload: {
                version: 1,
                mode: 'QUEUE_DISPLAY',
                locationId: LOCATION_ID,
                authorizedBy: MANAGER_ID,
                issuedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
            },
        });

        const result = await validateQueueDisplayExitPinSecure({
            pin: '9999',
            kioskToken: 'signed-kiosk-token',
        });

        expect(result.success).toBe(true);
        expect(mockVerifyKioskSessionToken).toHaveBeenCalledWith('signed-kiosk-token', 'QUEUE_DISPLAY');
    });
});
