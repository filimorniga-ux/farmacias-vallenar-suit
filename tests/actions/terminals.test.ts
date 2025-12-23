import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openTerminalAtomic, closeTerminalAtomic } from '@/actions/terminals-v2';

// Mock DB Module
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

// Mock dependencies
const mockUuid = vi.fn().mockReturnValue('mock-uuid-1234');

vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => {
            mockConnect();
            return Promise.resolve({
                query: mockQuery,
                release: mockRelease,
            });
        },
    },
}));

vi.mock('uuid', () => ({
    v4: () => mockUuid(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// Suppress logs during tests
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('openTerminalAtomic', () => {
    const VALID_TERM_ID = '123e4567-e89b-12d3-a456-426614174000';
    const VALID_USER_ID = 'user-123';

    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] }); // Default empty result
    });

    it('debe abrir terminal exitosamente (Happy Path)', async () => {
        // Setup Mocks
        mockQuery
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // 1. Check Idempotency (Empty)
            .mockResolvedValueOnce({ rows: [{ status: 'CLOSED', current_cashier_id: null }] }) // 2. Check Terminal (Available)
            .mockResolvedValueOnce({ rows: [] }) // 3. Auto-close ghost
            .mockResolvedValueOnce({ rows: [] }) // 5. Insert Cash Movement
            .mockResolvedValueOnce({ rows: [] }) // 6. Update Terminal
            .mockResolvedValueOnce({ rows: [] }) // 7. Insert Session
            .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await openTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 1000);

        if (!result.success) {
            console.error('Test Failed Result:', result);
        }

        expect(result.success, `Expected success but got error: ${result.error}`).toBe(true);
        expect(result.sessionId).toBe('mock-uuid-1234');

        // Verificar flujo de transaccion
        expect(mockQuery).toHaveBeenNthCalledWith(1, 'BEGIN ISOLATION LEVEL SERIALIZABLE');
        expect(mockQuery).toHaveBeenCalledWith('COMMIT');
        expect(mockQuery).not.toHaveBeenCalledWith('ROLLBACK');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('debe hacer rollback si falla una operacion crítica', async () => {
        // Simular error en Insert Session (paso 7)
        mockQuery.mockImplementation((sql: string) => {
            if (sql.includes('INSERT INTO cash_register_sessions')) {
                throw new Error('DB Error Simulated');
            }
            if (sql.includes('SELECT status')) {
                return { rows: [{ status: 'CLOSED' }] };
            }
            return { rows: [] };
        });

        const result = await openTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 1000);

        expect(result.success).toBe(false);
        expect(result.error).toBe('DB Error Simulated');

        expect(mockQuery).toHaveBeenCalledWith('BEGIN ISOLATION LEVEL SERIALIZABLE');
        expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('debe retornar sesión existente si ya está abierta (Idempotencia)', async () => {
        // Simular que paso 1 retorna una sesión
        mockQuery.mockImplementation((sql: string) => {
            if (sql.includes('SELECT id FROM cash_register_sessions')) {
                return { rows: [{ id: 'existing-session-id' }] };
            }
            return { rows: [] };
        });

        const result = await openTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 1000);

        expect(result.success).toBe(true);
        expect(result.sessionId).toBe('existing-session-id');
        expect(mockQuery).toHaveBeenCalledWith('COMMIT');
        // No deberia intentar insertar nada nuevo
        const calls = mockQuery.mock.calls.map(c => c[0]);
        expect(calls.some(c => c.includes('INSERT'))).toBe(false);
    });

    it('debe fallar si terminal ocupado por otro usuario', async () => {
        mockQuery.mockImplementation((sql: string) => {
            if (sql.includes('SELECT status')) {
                return { rows: [{ status: 'OPEN', current_cashier_id: 'other-user' }] };
            }
            return { rows: [] };
        });

        const result = await openTerminalAtomic(VALID_TERM_ID, 'my-user', 1000);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Terminal ocupado');
        expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('debe fallar con input inválido (Zod Validation)', async () => {
        // Input invalido: cash negativo
        const result = await openTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, -500);

        expect(result.success).toBe(false);
        expect(result.error).toContain('negativo');
        // Ni siquiera debe conectar a DB
        expect(mockConnect).not.toHaveBeenCalled();
    });
});

describe('closeTerminalAtomic', () => {
    const VALID_TERM_ID = '123e4567-e89b-12d3-a456-426614174000';
    const VALID_USER_ID = 'user-123';

    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
    });

    it('debe cerrar terminal exitosamente', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ status: 'OPEN', current_cashier_id: VALID_USER_ID, location_id: 'loc-1' }] }) // 1. Check Terminal
            .mockResolvedValueOnce({ rows: [{ id: 'session-uuid-123' }] }) // 2. Find Active Session
            .mockResolvedValueOnce({ rows: [] }) // 3. Update Session (Close)
            .mockResolvedValueOnce({ rows: [] }) // 4. Create Cash Move
            .mockResolvedValueOnce({ rows: [] }) // 5. Create Remittance (if amount > 0)
            .mockResolvedValueOnce({ rows: [] }) // 6. Update Terminal Status
            .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await closeTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 50000, 'All good', 10000);

        if (!result.success) console.error('Close Error:', result);

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith('COMMIT');

        // Verificar que se cerró la sesión correcta
        const sessionUpdateCall = mockQuery.mock.calls.find(c => c[0].includes('UPDATE cash_register_sessions'));
        expect(sessionUpdateCall).toBeDefined();
        if (sessionUpdateCall) {
            expect(sessionUpdateCall[0]).toContain("status = 'CLOSED'");
            expect(sessionUpdateCall[1]).toContain('session-uuid-123'); // params
        }
    });
});
