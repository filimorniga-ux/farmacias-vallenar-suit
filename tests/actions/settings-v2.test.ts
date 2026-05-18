/**
 * Tests - Settings V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const { mockClient, mockQuery, mockGetSiiConfigurationSummary, PinRbacError } = vi.hoisted(() => {
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
        mockGetSiiConfigurationSummary: vi.fn(),
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
vi.mock('@/lib/sii-config', () => ({
    getSiiConfigurationSummary: mockGetSiiConfigurationSummary,
}));

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
    mockGetSiiConfigurationSummary.mockResolvedValue({
        ambiente: 'CERTIFICACION',
        hasCertificate: false,
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

    it('usa backend como fuente de verdad para configuración operativa', async () => {
        mockGetSiiConfigurationSummary.mockResolvedValueOnce({
            ambiente: 'PRODUCCION',
            hasCertificate: true,
        });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ value: '7' }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows: [{ value: '4' }], rowCount: 1 } as any)
            .mockResolvedValueOnce({ rows: [{ value: '22' }], rowCount: 1 } as any);

        const result = await settingsV2.getOperationalSettingsSecure();

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            sii_enabled: true,
            fiscal_mode: 'FISCAL',
            sii_environment: 'PRODUCCION',
            security: {
                idle_timeout_minutes: 7,
                max_login_attempts: 4,
                lockout_duration_minutes: 22,
            },
        });
    });
});

describe('Settings V2 - Critical Settings', () => {
    it('bloquea settings gestionados por entorno de despliegue', async () => {
        const result = await settingsV2.updateSettingSecure('MAINTENANCE_MODE', 'true');

        expect(result.success).toBe(false);
        expect(result.error).toContain('entorno de despliegue');
    });

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
