import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => Promise.resolve({
            query: mockQuery,
            release: mockRelease,
        }),
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { getSuggestedOpeningAmount } from '@/actions/terminals-v2';

describe('Terminals V2 - getSuggestedOpeningAmount', () => {
    const TERMINAL_ID = 'a897fab7-61a8-48a3-b7bb-d869f7078086';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('debe saltar un CLOSED_FORCE en cero y usar una sesión cerrada válida anterior', async () => {
        // Arrange
        mockQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'session-force',
                    status: 'CLOSED_FORCE',
                    user_id: 'u1',
                    opening_amount: '10000.00',
                    closing_amount: '0.00',
                    cash_sales: '0.00',
                    cash_in: '0.00',
                    cash_out: '0.00',
                    remittance_amount: '0.00',
                    user_name: 'Gerente General 1',
                },
                {
                    id: 'session-closed',
                    status: 'CLOSED',
                    user_id: 'u1',
                    opening_amount: '100000.00',
                    closing_amount: '100000.00',
                    cash_sales: '0.00',
                    cash_in: '0.00',
                    cash_out: '0.00',
                    remittance_amount: '0.00',
                    user_name: 'Gerente General 1',
                },
            ],
        });

        // Act
        const result = await getSuggestedOpeningAmount(TERMINAL_ID);

        // Assert
        expect(result.success).toBe(true);
        expect(result.amount).toBe(100000);
        expect(result.lastUser).toBe('Gerente General 1');
        expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('debe estimar continuidad desde trazas de sesión cuando no hay cierre declarado', async () => {
        // Arrange
        mockQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'session-force',
                    status: 'CLOSED_FORCE',
                    user_id: 'u2',
                    opening_amount: '50000.00',
                    closing_amount: '0.00',
                    cash_sales: '200000.00',
                    cash_in: '10000.00',
                    cash_out: '30000.00',
                    remittance_amount: '210000.00',
                    user_name: 'Admin Santiago',
                },
            ],
        });

        // Act
        const result = await getSuggestedOpeningAmount(TERMINAL_ID);

        // Assert
        expect(result.success).toBe(true);
        expect(result.amount).toBe(20000);
        expect(result.lastUser).toBe('Admin Santiago');
        expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('debe priorizar la sesión más reciente con trazas por sobre cierres antiguos', async () => {
        // Arrange
        mockQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: 'session-recent-force',
                    status: 'CLOSED_FORCE',
                    user_id: 'u3',
                    opening_amount: '100000.00',
                    closing_amount: '0.00',
                    cash_sales: '1800000.00',
                    cash_in: '0.00',
                    cash_out: '0.00',
                    remittance_amount: '0.00',
                    user_name: 'Gerente General 1',
                },
                {
                    id: 'session-old-closed',
                    status: 'CLOSED',
                    user_id: 'u3',
                    opening_amount: '100000.00',
                    closing_amount: '100000.00',
                    cash_sales: '0.00',
                    cash_in: '0.00',
                    cash_out: '0.00',
                    remittance_amount: '0.00',
                    user_name: 'Gerente General 1',
                },
            ],
        });

        // Act
        const result = await getSuggestedOpeningAmount(TERMINAL_ID);

        // Assert
        expect(result.success).toBe(true);
        // 100.000 apertura + 1.800.000 ventas efectivo
        expect(result.amount).toBe(1900000);
        expect(result.lastUser).toBe('Gerente General 1');
        expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('debe retornar cero cuando no hay historial cerrado', async () => {
        // Arrange
        mockQuery.mockResolvedValueOnce({ rows: [] });

        // Act
        const result = await getSuggestedOpeningAmount(TERMINAL_ID);

        // Assert
        expect(result.success).toBe(true);
        expect(result.amount).toBe(0);
        expect(result.lastUser).toBeUndefined();
        expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('debe retornar error controlado cuando falla la consulta', async () => {
        // Arrange
        mockQuery.mockRejectedValueOnce(new Error('db-failure'));

        // Act
        const result = await getSuggestedOpeningAmount(TERMINAL_ID);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Error calculando sugerencia');
        expect(mockRelease).toHaveBeenCalledTimes(1);
    });
});
