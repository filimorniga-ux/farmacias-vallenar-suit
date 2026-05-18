import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockPoolQuery = vi.fn();
const mockPoolRelease = vi.fn();
const mockGetActorOrFail = vi.fn();
const mockRequireRole = vi.fn();
const mockValidatePinForRoles = vi.fn();
const mockValidatePinForUser = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    pool: {
        connect: vi.fn(async () => ({
            query: (...args: unknown[]) => mockPoolQuery(...args),
            release: (...args: unknown[]) => mockPoolRelease(...args),
        })),
    },
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
            MANAGER_OR_HR: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'],
            OVERRIDE: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'],
            TREASURY_AUTH: ['ADMIN', 'MANAGER', 'GERENTE_GENERAL', 'TESORERO'],
        },
        getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
        requireRole: (...args: unknown[]) => mockRequireRole(...args),
        validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
        validatePinForUser: (...args: unknown[]) => mockValidatePinForUser(...args),
        normalizeRole: (role: string | null | undefined) => String(role || '').trim().toUpperCase(),
    };
});

import {
    cancelAccountPayableSecure,
    createAccountPayableSecure,
    getAccountsPayableSecure,
    getAccountPayablePaymentsSecure,
    getFinancialAccountsSecure,
    getAccountsPayableSummarySecure,
    getPendingRemittancesSecure,
    getTreasuryTransactionsSecure,
    registerAccountPayablePaymentSecure,
    transferFundsSecure,
} from '@/actions/treasury-v2';
import { PinRbacError } from '@/lib/pin-rbac';

const ACTOR_ID = 'actor-user-1';
const SUPPLIER_ID = '123e4567-e89b-12d3-a456-426614174011';
const ACCOUNT_PAYABLE_ID = '123e4567-e89b-12d3-a456-426614174012';
const BANK_ACCOUNT_ID = '123e4567-e89b-12d3-a456-426614174013';
const LOCATION_ID = '123e4567-e89b-12d3-a456-426614174014';
const SAFE_ACCOUNT_ID = '123e4567-e89b-12d3-a456-426614174015';
const OTHER_ACCOUNT_ID = '123e4567-e89b-12d3-a456-426614174016';

function setActor(role: string = 'MANAGER', locationId: string = LOCATION_ID) {
    mockGetActorOrFail.mockResolvedValue({
        userId: ACTOR_ID,
        role,
        locationId,
        userName: 'Actor',
        tokenVersion: 1,
        sessionToken: 'session-token',
    });
    mockRequireRole.mockImplementation((actor, allowedRoles: readonly string[]) => {
        if (!allowedRoles.includes(actor.role)) {
            throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        }
        return actor;
    });
    mockValidatePinForRoles.mockResolvedValue({
        valid: true,
        authorizedBy: { id: ACTOR_ID, name: 'Actor', role },
    });
    mockValidatePinForUser.mockResolvedValue({
        valid: true,
        authorizedBy: { id: ACTOR_ID, name: 'Actor', role },
    });
}

describe('treasury-v2 shared RBAC contracts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
        mockPoolQuery.mockResolvedValue({ rows: [] });
        setActor();
    });

    it('rechaza getFinancialAccountsSecure sin sesión válida', async () => {
        mockGetActorOrFail.mockRejectedValue(new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida'));

        const result = await getFinancialAccountsSecure(LOCATION_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autorizado');
    });

    it('usa la ubicación del actor para getFinancialAccountsSecure cuando no tiene acceso global', async () => {
        setActor('TESORERO', 'actor-location');
        mockQuery.mockResolvedValue({
            rows: [{ id: 'acc-1', location_id: 'actor-location', name: 'Caja', type: 'SAFE', balance: 0, is_active: true }],
        });

        const result = await getFinancialAccountsSecure('requested-location');

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM financial_accounts'), ['actor-location']);
    });

    it('getPendingRemittancesSecure limita la ubicación al scope del actor sin acceso global', async () => {
        setActor('TESORERO', 'actor-location');
        mockQuery.mockResolvedValue({
            rows: [{ id: 'rem-1', location_id: 'actor-location', source_terminal_id: 'term-1', amount: 1000, status: 'PENDING_RECEIPT', created_at: new Date(), created_by: ACTOR_ID }],
        });

        const result = await getPendingRemittancesSecure('requested-location');

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM treasury_remittances'), ['actor-location']);
    });

    it('rechaza transferFundsSecure con rol insuficiente', async () => {
        setActor('CASHIER');

        const result = await transferFundsSecure({
            fromAccountId: SAFE_ACCOUNT_ID,
            toAccountId: BANK_ACCOUNT_ID,
            amount: 1000,
            description: 'Transferencia inválida por rol',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No tiene permisos');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('rechaza transferFundsSecure cuando alguna cuenta está fuera del scope del actor', async () => {
        setActor('TESORERO', 'actor-location');

        mockPoolQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
                rows: [
                    { id: SAFE_ACCOUNT_ID, name: 'Caja Actor', type: 'SAFE', balance: 900000, location_id: 'actor-location', is_active: true },
                    { id: OTHER_ACCOUNT_ID, name: 'Banco Externo', type: 'BANK', balance: 100000, location_id: 'other-location', is_active: true },
                ],
            })
            .mockResolvedValueOnce({ rows: [] });

        const result = await transferFundsSecure({
            fromAccountId: SAFE_ACCOUNT_ID,
            toAccountId: OTHER_ACCOUNT_ID,
            amount: 1000,
            description: 'Transferencia cross-location',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No tiene permisos');
    });

    it('permite transferFundsSecure dentro del scope del actor', async () => {
        setActor('MANAGER', 'actor-location');

        mockPoolQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
                rows: [
                    { id: SAFE_ACCOUNT_ID, name: 'Caja Actor', type: 'SAFE', balance: 900000, location_id: 'actor-location', is_active: true },
                    { id: BANK_ACCOUNT_ID, name: 'Banco Actor', type: 'BANK', balance: 100000, location_id: 'actor-location', is_active: true },
                ],
            })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await transferFundsSecure({
            fromAccountId: SAFE_ACCOUNT_ID,
            toAccountId: BANK_ACCOUNT_ID,
            amount: 1000,
            description: 'Transferencia válida',
        });

        expect(result.success).toBe(true);
    });

    it('rechaza getTreasuryTransactionsSecure con rol insuficiente', async () => {
        setActor('CASHIER');

        const result = await getTreasuryTransactionsSecure(SAFE_ACCOUNT_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('rechaza getTreasuryTransactionsSecure para una cuenta fuera del scope del actor', async () => {
        setActor('TESORERO', 'actor-location');
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: SAFE_ACCOUNT_ID, location_id: 'other-location' }],
        });

        const result = await getTreasuryTransactionsSecure(SAFE_ACCOUNT_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('permite getTreasuryTransactionsSecure dentro del scope del actor', async () => {
        setActor('TESORERO', 'actor-location');
        mockQuery
            .mockResolvedValueOnce({
                rows: [{ id: SAFE_ACCOUNT_ID, location_id: 'actor-location' }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: 'tx-1', account_id: SAFE_ACCOUNT_ID, amount: 1000, type: 'IN', description: 'Ingreso', created_at: new Date(), created_by: ACTOR_ID }],
            });

        const result = await getTreasuryTransactionsSecure(SAFE_ACCOUNT_ID);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
    });

    it('rechaza getAccountsPayableSecure con rol insuficiente', async () => {
        setActor('CASHIER');

        const result = await getAccountsPayableSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('createAccountPayableSecure audita con el actor de sesión y no con userId del payload', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: SUPPLIER_ID, business_name: 'Proveedor Uno' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: ACCOUNT_PAYABLE_ID }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await createAccountPayableSecure({
            supplierId: SUPPLIER_ID,
            invoiceNumber: 'F-100',
            invoiceType: 'FACTURA',
            issueDate: '2026-03-27',
            netAmount: 1000,
            taxAmount: 190,
            totalAmount: 1190,
            locationId: LOCATION_ID,
            expenseCategory: 'INVENTORY',
            userId: 'spoofed-user',
        });

        expect(result.success).toBe(true);

        const insertCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO accounts_payable'));
        expect(insertCall?.[1][12]).toBe(ACTOR_ID);

        const auditCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("'AP_CREATED'"));
        expect(auditCall?.[1][0]).toBe(ACTOR_ID);
    });

    it('registerAccountPayablePaymentSecure usa el actor de sesión y no el userId del payload', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: ACCOUNT_PAYABLE_ID, total_amount: 5000, paid_amount: 1000, status: 'PENDING' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'payment-1' }] })
            .mockResolvedValueOnce({ rows: [{ balance: 3000, status: 'PARTIAL' }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await registerAccountPayablePaymentSecure({
            accountPayableId: ACCOUNT_PAYABLE_ID,
            amount: 1000,
            paymentMethod: 'TRANSFER',
            bankAccountId: BANK_ACCOUNT_ID,
            userId: 'spoofed-user',
        });

        expect(result.success).toBe(true);

        const paymentInsert = mockQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO accounts_payable_payments'));
        expect(paymentInsert?.[1][7]).toBe(ACTOR_ID);

        const auditCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("'AP_PAYMENT'"));
        expect(auditCall?.[1][0]).toBe(ACTOR_ID);
    });

    it('cancelAccountPayableSecure audita con el actor de sesión y no con userId legado', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: ACCOUNT_PAYABLE_ID, status: 'PENDING', paid_amount: 0 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await cancelAccountPayableSecure(
            ACCOUNT_PAYABLE_ID,
            'Motivo de anulación suficientemente largo',
            'spoofed-user'
        );

        expect(result.success).toBe(true);

        const auditCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("'AP_CANCELLED'"));
        expect(auditCall?.[1][0]).toBe(ACTOR_ID);
    });

    it('getAccountsPayableSummarySecure exige rol permitido', async () => {
        setActor('CASHIER');

        const result = await getAccountsPayableSummarySecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('getAccountPayablePaymentsSecure exige sesión válida', async () => {
        mockGetActorOrFail.mockRejectedValue(new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida'));

        const result = await getAccountPayablePaymentsSecure(ACCOUNT_PAYABLE_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autorizado');
    });
});
