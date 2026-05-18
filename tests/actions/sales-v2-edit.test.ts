import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockGetActorOrFail = vi.fn();
const mockValidatePinForRoles = vi.fn();

vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => Promise.resolve({
            query: mockQuery,
            release: mockRelease,
        }),
    },
    query: vi.fn(),
}));

vi.mock('uuid', () => ({
    v4: () => 'new-item-uuid',
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/lib/pin-rbac', () => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        PinRbacError: MockPinRbacError,
        ROLE_GROUPS: {
            ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
            MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
        },
        getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
        validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
    };
});

import { editSaleSecure } from '@/actions/sales-v2';

const SALE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SUP_ID = '33333333-3333-4333-8333-333333333333';
const BATCH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BATCH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_PIN = '1234';
const REASON = 'Corrección de cantidad ingresada erróneamente por cajero';

const BASE_PARAMS = {
    saleId: SALE_ID,
    userId: USER_ID,
    supervisorPin: VALID_PIN,
    reason: REASON,
    items: [
        { batch_id: BATCH_A, name: 'Paracetamol 500mg', quantity: 2, price: 1500 },
    ],
};

function setupActor() {
    mockGetActorOrFail.mockResolvedValue({
        userId: USER_ID,
        role: 'CASHIER',
        locationId: 'loc-1',
        userName: 'Caja 1',
        tokenVersion: 1,
        sessionToken: 'token',
    });
}

function setupSupervisorValidation(valid = true) {
    mockValidatePinForRoles.mockResolvedValue(
        valid
            ? {
                valid: true,
                authorizedBy: {
                    id: SUP_ID,
                    name: 'Supervisor',
                    role: 'MANAGER',
                },
            }
            : { valid: false, error: 'PIN inválido' }
    );
}

function setupSuccessFlow() {
    setupActor();
    setupSupervisorValidation(true);

    mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockQuery.mockResolvedValueOnce({
        rows: [{
            id: SALE_ID,
            status: 'COMPLETED',
            total_amount: '3000',
            location_id: 'loc-1',
            terminal_id: 'term-1',
            session_id: 'sess-1',
            dte_folio: null,
        }],
    }); // sale
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'item-old', batch_id: BATCH_A, quantity: 3, unit_price: 1500, product_name: 'Paracetamol 500mg' }],
    }); // original items
    mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }] }); // lock original batches
    mockQuery.mockResolvedValueOnce({ rows: [] }); // revert original stock
    mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }] }); // lock new batches
    mockQuery.mockResolvedValueOnce({ rows: [] }); // discount new stock
    mockQuery.mockResolvedValueOnce({ rows: [] }); // delete items
    mockQuery.mockResolvedValueOnce({ rows: [] }); // insert item
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update sale
    mockQuery.mockResolvedValueOnce({ rows: [] }); // audit
    mockQuery.mockResolvedValueOnce({ rows: [] }); // commit
}

describe('editSaleSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('edita venta con PIN válido y retorna newTotal correcto', async () => {
        setupSuccessFlow();

        const result = await editSaleSecure(BASE_PARAMS);

        expect(result.success).toBe(true);
        expect(result.newTotal).toBe(3000);
        expect(mockValidatePinForRoles).toHaveBeenCalledWith(
            expect.any(Object),
            VALID_PIN,
            expect.any(Array),
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
    });

    it('retorna error cuando el PIN es inválido', async () => {
        setupActor();
        setupSupervisorValidation(false);
        mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
        mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

        const result = await editSaleSecure({ ...BASE_PARAMS, supervisorPin: '9999' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/PIN/i);
    });

    it('retorna error cuando la venta está VOIDED', async () => {
        setupActor();
        setupSupervisorValidation(true);
        mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: SALE_ID,
                status: 'VOIDED',
                total_amount: '3000',
                location_id: 'loc-1',
                terminal_id: 'term-1',
                session_id: 'sess-1',
                dte_folio: null,
            }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

        const result = await editSaleSecure(BASE_PARAMS);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/anulada|devuelta/i);
    });

    it('falla validación Zod cuando items está vacío', async () => {
        const result = await editSaleSecure({ ...BASE_PARAMS, items: [] });

        expect(result.success).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('falla validación Zod cuando el motivo es muy corto', async () => {
        const result = await editSaleSecure({ ...BASE_PARAMS, reason: 'corto' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/10 caracteres/i);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('falla validación Zod cuando saleId no es UUID válido', async () => {
        const result = await editSaleSecure({ ...BASE_PARAMS, saleId: 'no-es-uuid' });

        expect(result.success).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('permite editar ítems sin batch_id cuando hay autorización por PIN', async () => {
        setupActor();
        setupSupervisorValidation(true);
        mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: SALE_ID,
                status: 'COMPLETED',
                total_amount: '3000',
                location_id: 'loc-1',
                terminal_id: 'term-1',
                session_id: 'sess-1',
                dte_folio: null,
            }],
        });
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'item-old', batch_id: BATCH_A, quantity: 2, unit_price: 1500, product_name: 'Paracetamol 500mg' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }] }); // lock original batch
        mockQuery.mockResolvedValueOnce({ rows: [] }); // revert original stock
        mockQuery.mockResolvedValueOnce({ rows: [] }); // delete old items
        mockQuery.mockResolvedValueOnce({ rows: [] }); // insert new item
        mockQuery.mockResolvedValueOnce({ rows: [] }); // update sales
        mockQuery.mockResolvedValueOnce({ rows: [] }); // audit
        mockQuery.mockResolvedValueOnce({ rows: [] }); // commit

        const result = await editSaleSecure({
            ...BASE_PARAMS,
            items: [{ batch_id: '', name: 'Ajuste manual', quantity: 1, price: 1200 }],
        });

        expect(result.success).toBe(true);
        expect(result.newTotal).toBe(1200);
    });

    it('retorna error de lock sin exponer stack trace', async () => {
        setupActor();
        setupSupervisorValidation(true);
        mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
        const lockError = new Error('could not obtain lock');
        (lockError as any).code = '55P03';
        mockQuery.mockRejectedValueOnce(lockError);
        mockQuery.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

        const result = await editSaleSecure(BASE_PARAMS);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/bloqueado/i);
    });

    it('recalcula correctamente el total con múltiples ítems', async () => {
        setupActor();
        setupSupervisorValidation(true);
        const items = [
            { batch_id: BATCH_A, name: 'Producto A', quantity: 3, price: 2000 },
            { batch_id: BATCH_B, name: 'Producto B', quantity: 1, price: 5000 },
        ];

        mockQuery.mockResolvedValueOnce({ rows: [] }); // BEGIN
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: SALE_ID,
                status: 'COMPLETED',
                total_amount: '8000',
                location_id: 'loc-1',
                terminal_id: 'term-1',
                session_id: 'sess-1',
                dte_folio: null,
            }],
        });
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 'i1', batch_id: BATCH_A, quantity: 2, unit_price: 2000, product_name: 'A' },
                { id: 'i2', batch_id: BATCH_B, quantity: 2, unit_price: 2000, product_name: 'B' },
            ],
        });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }, { id: BATCH_B }] }); // lock original
        mockQuery.mockResolvedValueOnce({ rows: [] }); // revert A
        mockQuery.mockResolvedValueOnce({ rows: [] }); // revert B
        mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }, { id: BATCH_B }] }); // lock new
        mockQuery.mockResolvedValueOnce({ rows: [] }); // discount A
        mockQuery.mockResolvedValueOnce({ rows: [] }); // discount B
        mockQuery.mockResolvedValueOnce({ rows: [] }); // delete old
        mockQuery.mockResolvedValueOnce({ rows: [] }); // insert A
        mockQuery.mockResolvedValueOnce({ rows: [] }); // insert B
        mockQuery.mockResolvedValueOnce({ rows: [] }); // update sale
        mockQuery.mockResolvedValueOnce({ rows: [] }); // audit
        mockQuery.mockResolvedValueOnce({ rows: [] }); // commit

        const result = await editSaleSecure({ ...BASE_PARAMS, items });

        expect(result.success).toBe(true);
        expect(result.newTotal).toBe(11000);
    });
});
