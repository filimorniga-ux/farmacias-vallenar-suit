/**
 * Tests - Hardware V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const { mockQuery, mockClient, PinRbacError } = vi.hoisted(() => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        mockQuery: vi.fn(),
        mockClient: {
            query: vi.fn(),
            release: vi.fn(),
        },
        PinRbacError: MockPinRbacError,
    };
});

import * as hardwareV2 from '@/actions/hardware-v2';
import { getActorOrFail, validatePinForRoles } from '@/lib/pin-rbac';

vi.mock('@/lib/db', () => ({
    query: mockQuery,
    pool: {
        connect: vi.fn(async () => mockClient),
    },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: vi.fn(),
    validatePinForRoles: vi.fn(),
    ROLE_GROUPS: {
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    },
    PinRbacError,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActorOrFail).mockResolvedValue({
        userId: 'user-1',
        role: 'CASHIER',
        locationId: 'loc-1',
        userName: 'Caja',
        tokenVersion: 1,
        sessionToken: 'token',
    });
    vi.mocked(validatePinForRoles).mockResolvedValue({
        valid: true,
        authorizedBy: {
            id: 'manager-1',
            name: 'Manager Uno',
            role: 'MANAGER',
        },
        matchedBy: 'hash',
    });
});

describe('Hardware V2 - Authentication', () => {
    it('should require authentication', async () => {
        vi.mocked(getActorOrFail).mockRejectedValueOnce(
            new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await hardwareV2.getTerminalHardwareConfigSecure(
            '550e8400-e29b-41d4-a716-446655440000'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Hardware V2 - Validation', () => {
    it('should validate terminal ID format', async () => {
        const result = await hardwareV2.getTerminalHardwareConfigSecure('invalid');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});

describe('Hardware V2 - Update Config', () => {
    it('should require PIN for config updates', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce(undefined); // ROLLBACK
        vi.mocked(validatePinForRoles).mockResolvedValueOnce({
            valid: false,
            code: 'PIN_INVALID',
            error: 'PIN inválido',
        });

        const result = await hardwareV2.updateTerminalHardwareConfigSecure(
            '550e8400-e29b-41d4-a716-446655440000',
            { receipt_printer: 'EPSON' },
            '0000' // Invalid PIN
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('manager');
    });

    it('should audit config updates with the session actor instead of the PIN authorizer', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'session-user-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Gerente Real',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({ rows: [{ config: { receipt_printer: 'OLD' } }], rowCount: 1 }) // previous
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // audit
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await hardwareV2.updateTerminalHardwareConfigSecure(
            '550e8400-e29b-41d4-a716-446655440000',
            { receipt_printer: 'NEW' },
            '1234'
        );

        expect(result.success).toBe(true);
        expect(validatePinForRoles).toHaveBeenCalledWith(
            mockClient,
            '1234',
            ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO audit_log'),
            expect.arrayContaining(['session-user-1'])
        );
    });
});
