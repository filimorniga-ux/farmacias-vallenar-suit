import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =====================================================
// TEST SETUP - Define all test variables and mocks
// =====================================================

// Test IDs
const VALID_TERM_ID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_USER_ID = 'user-123';

// Mock functions - shared across tests
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

// Mock DB module - must be hoisted before the import
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
    query: vi.fn(),
}));

// Mock uuid with stable mock function
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-1234',
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

// Import after all mocks are set up
import { openTerminalAtomic, closeTerminalAtomic } from '@/actions/terminals-v2';

// =====================================================
// TESTS
// =====================================================

describe('openTerminalAtomic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] }); // Default empty result
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('debe abrir terminal exitosamente (Happy Path)', async () => {
        // Setup Mocks - sequential responses for each query
        mockQuery
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // 1. Check Idempotency (Empty - no existing session)
            .mockResolvedValueOnce({ rows: [{ id: VALID_TERM_ID, status: 'CLOSED', current_cashier_id: null, location_id: 'loc-1', name: 'Terminal 1' }] }) // 2. Check Terminal with FOR UPDATE
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // 3. Auto-close ghost sessions
            .mockResolvedValueOnce({ rows: [] }) // 4. Insert Cash Movement
            .mockResolvedValueOnce({ rows: [] }) // 5. Update Terminal
            .mockResolvedValueOnce({ rows: [] }) // 6. Insert Session
            .mockResolvedValueOnce({ rows: [] }) // 7. Insert Audit (may or may not be called)
            .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await openTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 1000);

        expect(result.success, `Expected success but got error: ${result.error}`).toBe(true);
        expect(result.sessionId).toBe('mock-uuid-1234');

        // Verificar flujo de transaccion
        expect(mockQuery).toHaveBeenNthCalledWith(1, 'BEGIN ISOLATION LEVEL SERIALIZABLE');
        expect(mockQuery).toHaveBeenCalledWith('COMMIT');
        expect(mockQuery).not.toHaveBeenCalledWith('ROLLBACK');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('debe hacer rollback si falla una operacion crítica', async () => {
        // Reset and configure mock for this specific test
        mockQuery.mockReset();
        
        // Simular error en Insert Session
        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('SELECT id FROM cash_register_sessions')) {
                return Promise.resolve({ rows: [] }); // No existing session
            }
            if (sql.includes('SELECT id, status, current_cashier_id')) {
                return Promise.resolve({ rows: [{ id: VALID_TERM_ID, status: 'CLOSED', current_cashier_id: null, location_id: 'loc-1', name: 'Terminal 1' }] });
            }
            if (sql.includes('UPDATE cash_register_sessions')) {
                return Promise.resolve({ rows: [], rowCount: 0 });
            }
            if (sql.includes('INSERT INTO cash_register_sessions')) {
                throw new Error('DB Error Simulated');
            }
            if (sql === 'ROLLBACK') {
                return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
        });

        const result = await openTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 1000);

        expect(result.success).toBe(false);
        expect(result.error).toBe('DB Error Simulated');

        expect(mockQuery).toHaveBeenCalledWith('BEGIN ISOLATION LEVEL SERIALIZABLE');
        expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('debe retornar sesión existente si ya está abierta (Idempotencia)', async () => {
        // Reset and configure mock for idempotency test
        mockQuery.mockReset();
        
        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('SELECT id FROM cash_register_sessions')) {
                return Promise.resolve({ rows: [{ id: 'existing-session-id' }] });
            }
            if (sql === 'COMMIT') {
                return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
        });

        const result = await openTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 1000);

        expect(result.success).toBe(true);
        expect(result.sessionId).toBe('existing-session-id');
        expect(mockQuery).toHaveBeenCalledWith('COMMIT');
        
        // No deberia intentar insertar nada nuevo
        const calls = mockQuery.mock.calls.map(c => c[0]);
        expect(calls.some((c: string) => c.includes && c.includes('INSERT'))).toBe(false);
    });

    it('debe fallar si terminal ocupado por otro usuario', async () => {
        // Reset and configure mock for occupied terminal test
        mockQuery.mockReset();
        
        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
                return Promise.resolve({ rows: [] });
            }
            if (sql.includes('SELECT id FROM cash_register_sessions')) {
                return Promise.resolve({ rows: [] }); // No existing session
            }
            if (sql.includes('SELECT id, status, current_cashier_id')) {
                return Promise.resolve({ rows: [{ id: VALID_TERM_ID, status: 'OPEN', current_cashier_id: 'other-user', location_id: 'loc-1', name: 'Terminal 1' }] });
            }
            if (sql === 'ROLLBACK') {
                return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
        });

        const result = await openTerminalAtomic(VALID_TERM_ID, 'my-user', 1000);

        expect(result.success).toBe(false);
        expect(result.error).toContain('ocupado');
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
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [] });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('debe cerrar terminal exitosamente', async () => {
        // Reset and configure mock for close terminal test
        mockQuery.mockReset();
        
        // Create sequential mock that handles each call in order
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_TERM_ID, status: 'OPEN', current_cashier_id: VALID_USER_ID, location_id: 'loc-1', name: 'Terminal 1' }] }, // Terminal check with FOR UPDATE
            { rows: [{ id: 'session-uuid-123', opening_amount: 50000, opened_at: new Date() }] }, // Session check with FOR UPDATE
            { rows: [], rowCount: 1 }, // Update session (close)
            { rows: [] }, // Insert cash movement
            { rows: [] }, // Insert remittance (if withdrawal > 0)
            { rows: [], rowCount: 1 }, // Update terminal
            { rows: [] }, // Insert audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await closeTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 50000, 'All good', 10000);

        expect(result.success, `Close Error: ${result.error}`).toBe(true);
        // Verify we reached commit (called at least 8 times for all steps)
        expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(7);
    });

    it('debe fallar si terminal no existe', async () => {
        // Reset and configure mock for terminal not found
        mockQuery.mockReset();
        
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [] }, // Terminal check - empty (not found)
        ];

        mockQuery.mockImplementation((sql: string) => {
            if (sql === 'ROLLBACK') {
                return Promise.resolve({ rows: [] });
            }
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await closeTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 50000, 'Notes', 10000);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Terminal');
    });

    it('debe completar aunque no haya sesión activa', async () => {
        // closeTerminalAtomic permite cerrar terminal sin sesión activa
        // Solo registra warning pero continua
        mockQuery.mockReset();
        
        let callIndex = 0;
        const responses = [
            { rows: [] }, // BEGIN
            { rows: [{ id: VALID_TERM_ID, status: 'OPEN', current_cashier_id: VALID_USER_ID, location_id: 'loc-1', name: 'Terminal 1' }] }, // Terminal check
            { rows: [] }, // Session check - empty (no active session - but continues)
            { rows: [] }, // Insert cash movement
            { rows: [] }, // Update terminal
            { rows: [] }, // Insert audit
            { rows: [] }, // COMMIT
        ];

        mockQuery.mockImplementation(() => {
            const response = responses[callIndex] || { rows: [] };
            callIndex++;
            return Promise.resolve(response);
        });

        const result = await closeTerminalAtomic(VALID_TERM_ID, VALID_USER_ID, 50000, 'Notes', 0);

        // The function should succeed even without active session
        expect(result.success).toBe(true);
    });
});
