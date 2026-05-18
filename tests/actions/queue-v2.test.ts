import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockQuery,
    mockPoolConnect,
    mockClientQuery,
    mockRelease,
    mockGetActorOrFail,
    mockVerifyKioskSessionToken,
    PinRbacError,
} = vi.hoisted(() => {
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
        mockPoolConnect: vi.fn(),
        mockClientQuery: vi.fn(),
        mockRelease: vi.fn(),
        mockGetActorOrFail: vi.fn(),
        mockVerifyKioskSessionToken: vi.fn(),
        PinRbacError: MockPinRbacError,
    };
});

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    pool: {
        connect: (...args: unknown[]) => mockPoolConnect(...args),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
    unstable_noStore: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/lib/pin-rbac', () => ({
    PinRbacError,
    getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
}));

vi.mock('@/lib/kiosk-session', () => ({
    verifyKioskSessionToken: (...args: unknown[]) => mockVerifyKioskSessionToken(...args),
}));

import * as queueV2 from '@/actions/queue-v2';
import { PinRbacError as ImportedPinRbacError } from '@/lib/pin-rbac';

const ACTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const BRANCH_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_BRANCH_ID = '550e8400-e29b-41d4-a716-446655440002';
const TERMINAL_ID = '550e8400-e29b-41d4-a716-446655440003';
const TICKET_ID = '550e8400-e29b-41d4-a716-446655440004';

function setActor(role: string = 'CASHIER', locationId: string = BRANCH_ID) {
    mockGetActorOrFail.mockResolvedValue({
        userId: ACTOR_ID,
        role,
        locationId,
        userName: 'Actor',
        tokenVersion: 1,
        sessionToken: 'session-token',
    });
}

describe('queue-v2 hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActor();
        mockVerifyKioskSessionToken.mockReturnValue({
            valid: true,
            payload: {
                version: 1,
                mode: 'QUEUE_DISPLAY',
                locationId: BRANCH_ID,
                authorizedBy: ACTOR_ID,
                issuedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
            },
        });
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockPoolConnect.mockResolvedValue({
            query: mockClientQuery,
            release: mockRelease,
        });
    });

    it('rechaza RUT inválido al crear ticket', async () => {
        const result = await queueV2.createTicketSecure({
            branchId: BRANCH_ID,
            rut: 'invalid-rut',
            type: 'GENERAL',
            kioskToken: 'queue-kiosk-token',
        });

        expect(result.success).toBe(false);
    });

    it('rechaza getNextTicketSecure sin sesión válida', async () => {
        mockGetActorOrFail.mockRejectedValue(
            new ImportedPinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida')
        );

        const result = await queueV2.getNextTicketSecure(BRANCH_ID, TERMINAL_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('rechaza getNextTicketSecure fuera del scope de sucursal', async () => {
        setActor('CASHIER', BRANCH_ID);

        const result = await queueV2.getNextTicketSecure(OTHER_BRANCH_ID, TERMINAL_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('otra sucursal');
    });

    it('rechaza completeTicketSecure si el ticket pertenece a otra sucursal', async () => {
        setActor('CASHIER', BRANCH_ID);
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: TICKET_ID, branch_id: OTHER_BRANCH_ID, called_by: ACTOR_ID, status: 'CALLED' }],
            rowCount: 1,
        });

        const result = await queueV2.completeTicketSecure(TICKET_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('otra sucursal');
    });

    it('expone un payload público mínimo para display sin debug ni branch interna', async () => {
        mockVerifyKioskSessionToken.mockReturnValueOnce({
            valid: true,
            payload: {
                version: 1,
                mode: 'QUEUE_DISPLAY',
                locationId: BRANCH_ID,
                authorizedBy: ACTOR_ID,
                issuedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
            },
        });
        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    id: TICKET_ID,
                    code: 'G001',
                    type: 'GENERAL',
                    status: 'CALLED',
                    branch_id: BRANCH_ID,
                    created_at: '2026-04-02T10:00:00.000Z',
                    called_at: '2026-04-02T10:01:00.000Z',
                    terminal_id: TERMINAL_ID,
                    terminal_name: 'Caja 1',
                    module_number: '1',
                    called_by: ACTOR_ID,
                }],
                rowCount: 1,
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: '550e8400-e29b-41d4-a716-446655440099',
                    code: 'G000',
                    type: 'GENERAL',
                    status: 'COMPLETED',
                    branch_id: BRANCH_ID,
                    created_at: '2026-04-02T09:00:00.000Z',
                    completed_at: '2026-04-02T09:10:00.000Z',
                    terminal_name: 'Caja 1',
                    module_number: '1',
                }],
                rowCount: 1,
            });

        const result = await queueV2.getQueueStatusSecure(BRANCH_ID, {
            publicDisplay: true,
            kioskToken: 'display-token',
        });

        expect(result.success).toBe(true);
        expect(result.data?.debug_allRows).toBeUndefined();
        expect(result.data?.calledTickets?.[0]).toMatchObject({
            id: TICKET_ID,
            code: 'G001',
            terminal_name: 'Caja 1',
        });
        expect(result.data?.calledTickets?.[0]?.branch_id).toBeUndefined();
        expect(result.data?.calledTickets?.[0]?.called_by).toBeUndefined();
    });

    it('rechaza createTicketSecure sin token de totem ni actor autenticado', async () => {
        mockGetActorOrFail.mockRejectedValue(
            new ImportedPinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida')
        );
        mockVerifyKioskSessionToken.mockReturnValueOnce({
            valid: false,
            error: 'Token de kiosko inválido',
        });

        const result = await queueV2.createTicketSecure({
            branchId: BRANCH_ID,
            rut: '12345678-5',
            type: 'GENERAL',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('kiosko');
    });

    it('rechaza getQueueStatusSecure público sin token válido de display', async () => {
        mockVerifyKioskSessionToken.mockReturnValueOnce({
            valid: false,
            error: 'Token de kiosko inválido',
        });

        const result = await queueV2.getQueueStatusSecure(BRANCH_ID, {
            publicDisplay: true,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Token');
    });

    it('requiere rol manager o superior para resetear la cola', async () => {
        setActor('CASHIER', BRANCH_ID);

        const result = await queueV2.resetQueueSecure(BRANCH_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autorizado');
    });
});
