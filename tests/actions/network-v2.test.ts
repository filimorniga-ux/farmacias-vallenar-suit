import { beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const ACTOR_USER_ID = '550e8400-e29b-41d4-a716-446655440010';

const {
    mockQuery,
    mockRelease,
    mockConnect,
    mockGetActorOrFail,
    mockValidatePinForRoles,
    PinRbacErrorMock,
} = vi.hoisted(() => {
    class PinRbacErrorMock extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        mockQuery: vi.fn(),
        mockRelease: vi.fn(),
        mockConnect: vi.fn(),
        mockGetActorOrFail: vi.fn(),
        mockValidatePinForRoles: vi.fn(),
        PinRbacErrorMock,
    };
});

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: () =>
            Promise.resolve({
                query: mockQuery,
                release: mockRelease,
            }),
    },
}));

vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
    validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
    requireRole: (actor: { role?: string }, allowedRoles: readonly string[]) => {
        const normalizedRole = String(actor.role || '').trim().toUpperCase();
        const normalizedAllowed = allowedRoles.map((role) => String(role).trim().toUpperCase());
        if (!normalizedAllowed.includes(normalizedRole)) {
            throw new PinRbacErrorMock('AUTH_FORBIDDEN', 'Acceso denegado');
        }
        return actor;
    },
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    },
    PinRbacError: PinRbacErrorMock,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440999') }));

import * as networkV2 from '@/actions/network-v2';

describe('network-v2 auth alignment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockConnect.mockClear();
        mockGetActorOrFail.mockResolvedValue({
            userId: ACTOR_USER_ID,
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin Actor',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: '550e8400-e29b-41d4-a716-446655440099',
                name: 'Supervisor PIN',
                role: 'ADMIN',
            },
        });
    });

    it('rechaza getOrganizationStructureSecure sin sesión válida', async () => {
        mockGetActorOrFail.mockRejectedValueOnce(
            new PinRbacErrorMock('AUTH_UNAUTHORIZED', 'Sesión no válida')
        );

        const result = await networkV2.getOrganizationStructureSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('createLocationSecure valida input antes de tocar DB', async () => {
        const result = await networkV2.createLocationSecure(
            { name: 'AB', address: '123', type: 'STORE' },
            '1234'
        );

        expect(result.success).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('createLocationSecure audita con actor de sesión y deja authorized_by como metadato', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [] });

        const result = await networkV2.createLocationSecure(
            { name: 'Sucursal Prat', address: 'Dirección larga válida', type: 'STORE' },
            '1234'
        );

        expect(result.success).toBe(true);
        expect(mockValidatePinForRoles).toHaveBeenCalledOnce();

        const auditCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1]?.[0]).toBe(ACTOR_USER_ID);
        const payload = JSON.parse(String(auditCall?.[1]?.[2] || '{}')) as Record<string, unknown>;
        expect(payload.created_by).toBe('Admin Actor');
        expect(payload.authorized_by_id).toBe('550e8400-e29b-41d4-a716-446655440099');
    });

    it('deactivateLocationSecure exige razón mínima', async () => {
        const result = await networkV2.deactivateLocationSecure(
            VALID_LOCATION_ID,
            '1234',
            'short'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('10 caracteres');
    });
});
