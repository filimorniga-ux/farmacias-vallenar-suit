/**
 * Tests for editSaleSecure – Sales V2
 *
 * Covers:
 * - Edición exitosa con PIN válido (recalcula total, ajusta stock)
 * - PIN inválido → rechaza sin modificar datos
 * - Venta VOIDED → no se puede editar
 * - Validación Zod (items vacíos, motivo corto, UUID inválido)
 * - Error de lock de BD (código 55P03)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// =====================================================
// MOCKS
// =====================================================

const mockQuery   = vi.fn();
const mockRelease = vi.fn();
const mockBcryptCompare = vi.fn();

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
        info:  vi.fn(),
        warn:  vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('bcryptjs', () => ({
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
}));

// =====================================================
// IMPORT after mocks
// =====================================================

import { editSaleSecure } from '@/actions/sales-v2';

// =====================================================
// FIXTURES
// =====================================================

const SALE_ID   = '11111111-1111-4111-8111-111111111111';
const USER_ID   = '22222222-2222-4222-8222-222222222222';
const SUP_ID    = '33333333-3333-4333-8333-333333333333';
const BATCH_A   = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BATCH_B   = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_PIN = '1234';
const REASON    = 'Corrección de cantidad ingresada erróneamente por cajero';

const BASE_PARAMS = {
    saleId: SALE_ID,
    userId: USER_ID,
    supervisorPin: VALID_PIN,
    reason: REASON,
    items: [
        { batch_id: BATCH_A, name: 'Paracetamol 500mg', quantity: 2, price: 1500 },
    ],
};

// =====================================================
// HELPERS
// =====================================================

/** Configura mockQuery para el flujo exitoso */
function setupSuccessFlow() {
    mockBcryptCompare.mockResolvedValue(true);

    // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // validateSupervisorPin – SELECT users
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: SUP_ID, name: 'Supervisor', role: 'MANAGER', access_pin_hash: 'hashed', access_pin: null }],
    });

    // SELECT sale FOR UPDATE NOWAIT
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

    // SELECT sale_items (original)
    mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'item-old', batch_id: BATCH_A, quantity: 3, unit_price: 1500, product_name: 'Paracetamol 500mg' }],
    });

    // SELECT batch FOR UPDATE NOWAIT (original batches)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }] });

    // UPDATE inventory_batches – revertir stock original
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // SELECT batch FOR UPDATE NOWAIT (new batches)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }] });

    // UPDATE inventory_batches – descontar nuevo stock
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // DELETE sale_items
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // INSERT sale_item (1 item)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // UPDATE sales (total + edit metadata)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // INSERT audit_log
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // COMMIT
    mockQuery.mockResolvedValueOnce({ rows: [] });
}

// =====================================================
// TESTS
// =====================================================

describe('editSaleSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('edita venta con PIN válido y retorna newTotal correcto', async () => {
        setupSuccessFlow();

        const result = await editSaleSecure(BASE_PARAMS);

        expect(result.success).toBe(true);
        expect(result.newTotal).toBe(2 * 1500); // quantity=2, price=1500
        expect(result.error).toBeUndefined();

        const insertCall = mockQuery.mock.calls.find(
            (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO sale_items')
        );
        expect(insertCall).toBeDefined();
        if (!insertCall) return;
        expect(insertCall[0]).toContain('timestamp');
        expect(insertCall[0]).toContain('NOW()');

        const updateCall = mockQuery.mock.calls.find(
            (call) => typeof call[0] === 'string' && call[0].includes('UPDATE sales')
        );
        expect(updateCall).toBeDefined();
        if (!updateCall) return;
        expect(updateCall[0]).toContain('total_amount        = $1');
        expect(updateCall[0]).toContain('total               = $2');
    });

    it('hace ROLLBACK y retorna error cuando el PIN es inválido', async () => {
        mockBcryptCompare.mockResolvedValue(false);

        // BEGIN
        mockQuery.mockResolvedValueOnce({ rows: [] });

        // validateSupervisorPin – ningún usuario coincide
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: SUP_ID, name: 'Supervisor', role: 'MANAGER', access_pin_hash: 'hashed', access_pin: null }],
        });

        // ROLLBACK
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await editSaleSecure({ ...BASE_PARAMS, supervisorPin: '9999' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/PIN/i);
    });

    it('hace ROLLBACK y retorna error cuando la venta está VOIDED', async () => {
        mockBcryptCompare.mockResolvedValue(true);

        // BEGIN
        mockQuery.mockResolvedValueOnce({ rows: [] });

        // validateSupervisorPin
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: SUP_ID, name: 'Supervisor', role: 'MANAGER', access_pin_hash: 'hashed', access_pin: null }],
        });

        // SELECT sale – status VOIDED
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: SALE_ID, status: 'VOIDED', total_amount: '3000',
                     location_id: 'loc-1', terminal_id: 'term-1', session_id: 'sess-1', dte_folio: null }],
        });

        // ROLLBACK (lanzado por el throw)
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await editSaleSecure(BASE_PARAMS);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/anulada|devuelta/i);
    });

    it('falla validación Zod cuando items está vacío', async () => {
        const result = await editSaleSecure({ ...BASE_PARAMS, items: [] });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        // No debe tocar la BD
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
        mockBcryptCompare.mockResolvedValue(true);

        // BEGIN
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // validateSupervisorPin
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: SUP_ID, name: 'Supervisor', role: 'MANAGER', access_pin_hash: 'hashed', access_pin: null }],
        });
        // SELECT sale
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
        // SELECT sale_items (original)
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'item-old', batch_id: BATCH_A, quantity: 2, unit_price: 1500, product_name: 'Paracetamol 500mg' }],
        });
        // SELECT batch lock original
        mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }] });
        // UPDATE revert stock original
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // DELETE old items
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // INSERT new item (batch_id null)
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // UPDATE sales
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // INSERT audit_log
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // COMMIT
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await editSaleSecure({
            ...BASE_PARAMS,
            items: [{ batch_id: '', name: 'Ajuste manual', quantity: 1, price: 1200 }],
        });

        expect(result.success).toBe(true);
        expect(result.newTotal).toBe(1200);
    });

    it('retorna error de lock (55P03) sin exponer stack trace', async () => {
        mockBcryptCompare.mockResolvedValue(true);

        // BEGIN
        mockQuery.mockResolvedValueOnce({ rows: [] });

        // validateSupervisorPin
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: SUP_ID, name: 'Supervisor', role: 'MANAGER', access_pin_hash: 'hashed', access_pin: null }],
        });

        // SELECT sale FOR UPDATE NOWAIT – lanza error de lock
        const lockError = new Error('could not obtain lock');
        (lockError as any).code = '55P03';
        mockQuery.mockRejectedValueOnce(lockError);

        // ROLLBACK
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await editSaleSecure(BASE_PARAMS);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/bloqueado/i);
    });

    it('recalcula correctamente el total con múltiples ítems', async () => {
        const items = [
            { batch_id: BATCH_A, name: 'Producto A', quantity: 3, price: 2000 },
            { batch_id: BATCH_B, name: 'Producto B', quantity: 1, price: 5000 },
        ];
        const expectedTotal = 3 * 2000 + 1 * 5000; // 11000

        mockBcryptCompare.mockResolvedValue(true);

        // BEGIN
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // validateSupervisorPin
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: SUP_ID, name: 'S', role: 'MANAGER', access_pin_hash: 'h', access_pin: null }],
        });
        // SELECT sale
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: SALE_ID, status: 'COMPLETED', total_amount: '8000',
                     location_id: 'l', terminal_id: 't', session_id: 's', dte_folio: null }],
        });
        // SELECT sale_items
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 'i1', batch_id: BATCH_A, quantity: 2, unit_price: 2000, product_name: 'A' },
                { id: 'i2', batch_id: BATCH_B, quantity: 2, unit_price: 2000, product_name: 'B' },
            ],
        });
        // SELECT batch lock original
        mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }, { id: BATCH_B }] });
        // UPDATE revert stock item 1
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // UPDATE revert stock item 2
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // SELECT batch lock new
        mockQuery.mockResolvedValueOnce({ rows: [{ id: BATCH_A }, { id: BATCH_B }] });
        // UPDATE deduct stock item 1
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // UPDATE deduct stock item 2
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // DELETE old items
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // INSERT item 1
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // INSERT item 2
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // UPDATE sales total
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // INSERT audit_log
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // COMMIT
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await editSaleSecure({ ...BASE_PARAMS, items });

        expect(result.success).toBe(true);
        expect(result.newTotal).toBe(expectedTotal);
    });
});
