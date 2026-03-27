/**
 * Tests - Settings V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const { mockClient, mockQuery, PinRbacError } = vi.hoisted(() => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        mockClient: {
            query: vi.fn(),
            release: vi.fn(),
        },
        mockQuery: vi.fn(),
        PinRbacError: MockPinRbacError,
    };
});

import * as settingsV2 from '@/actions/settings-v2';
import {
    getActorOrFail,
    validatePinForRoles,
} from '@/lib/pin-rbac';

vi.mock('@/lib/db', () => ({
    query: mockQuery,
    pool: {
        connect: vi.fn(async () => mockClient),
    },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: vi.fn(),
    requireRole: vi.fn((actor, allowedRoles: readonly string[]) => {
        if (!allowedRoles.includes(actor.role)) {
            throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        }

        return actor;
    }),
    validatePinForRoles: vi.fn(),
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    },
    PinRbacError,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActorOrFail).mockResolvedValue({
        userId: 'user-1',
        role: 'MANAGER',
        locationId: 'loc-1',
        userName: 'Manager',
        tokenVersion: 1,
        sessionToken: 'token',
    });
    vi.mocked(validatePinForRoles).mockResolvedValue({
        valid: true,
        authorizedBy: {
            id: 'admin-1',
            name: 'Admin Principal',
            role: 'ADMIN',
        },
        matchedBy: 'hash',
    });
});

describe('Settings V2 - Public Settings', () => {
    it('should allow public settings without auth', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ value: 'Farmacia Vallenar' }],
            rowCount: 1
        } as any);

        const result = await settingsV2.getPublicSettingSecure('STORE_NAME');

        expect(result.success).toBe(true);
        expect(result.value).toBe('Farmacia Vallenar');
    });

    it('should reject non-public settings', async () => {
        const result = await settingsV2.getPublicSettingSecure('ADMIN_EMAIL');

        expect(result.success).toBe(false);
        expect(result.error).toContain('públicamente');
    });
});

describe('Settings V2 - RBAC', () => {
    it('should require admin role for all settings list', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await settingsV2.getAllSettingsSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });
});

describe('Settings V2 - Critical Settings', () => {
    it('should require PIN for critical settings update', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await settingsV2.updateSettingSecure(
            'SII_CERT_PASSWORD',
            'new-password'
            // No PIN provided
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });

    it('audita el cambio crítico con el actor de sesión y valida PIN con el helper compartido', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'admin-session',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin Real',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({ rows: [{ value: 'old-secret' }], rowCount: 1 }) // previous
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // upsert
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // audit
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await settingsV2.updateSettingSecure(
            'SII_CERT_PASSWORD',
            'new-password',
            '1234'
        );

        expect(result.success).toBe(true);
        expect(validatePinForRoles).toHaveBeenCalledWith(
            mockClient,
            '1234',
            ['ADMIN', 'GERENTE_GENERAL'],
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO audit_log'),
            expect.arrayContaining(['admin-session'])
        );
    });
});
