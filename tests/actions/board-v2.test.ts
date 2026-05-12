import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPoolConnect = vi.fn();
const mockPoolQuery = vi.fn();
const mockGetValidatedSession = vi.fn();

vi.mock('crypto', () => ({
    randomUUID: () => '550e8400-e29b-41d4-a716-446655440050',
}));

vi.mock('@/lib/db', () => ({
    pool: {
        connect: (...args: unknown[]) => mockPoolConnect(...args),
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: (...args: unknown[]) => mockGetValidatedSession(...args),
}));

import { deleteNote, getNotes, postNote } from '@/actions/board-v2';

const MANAGER_SESSION = {
    userId: '550e8400-e29b-41d4-a716-446655440001',
    role: 'MANAGER',
    userName: 'Gerente Real',
    tokenVersion: 1,
    sessionToken: 'session-token',
    locationId: '550e8400-e29b-41d4-a716-446655440010',
};

const NOTE_ID = '550e8400-e29b-41d4-a716-446655440099';

describe('board-v2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPoolConnect.mockResolvedValue({
            query: mockClientQuery,
            release: mockClientRelease,
        });
        mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
        mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockGetValidatedSession.mockResolvedValue(MANAGER_SESSION);
    });

    it('rechaza publicar notas sin sesión válida', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const result = await postNote({ content: 'Aviso interno' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockPoolConnect).not.toHaveBeenCalled();
    });

    it('publica usando identidad de sesión e ignora identidad enviada por cliente', async () => {
        const spoofedPayload = {
            content: '  Revisar pedido de la mañana  ',
            userId: '550e8400-e29b-41d4-a716-446655440088',
            authorName: 'Admin falso',
            authorRole: 'ADMIN',
        } as unknown as Parameters<typeof postNote>[0];

        const result = await postNote(spoofedPayload);

        expect(result.success).toBe(true);
        expect(mockClientQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO board_notes'),
            [
                '550e8400-e29b-41d4-a716-446655440050',
                'Revisar pedido de la mañana',
                'Gerente Real',
                'MANAGER',
                'General',
                '550e8400-e29b-41d4-a716-446655440001',
            ],
        );
        expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('protege la lectura de notas con sesión server-side', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const result = await getNotes();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('elimina usando el rol real de sesión y no un userId enviado por cliente', async () => {
        const result = await deleteNote(NOTE_ID, '550e8400-e29b-41d4-a716-446655440088');

        expect(result.success).toBe(true);
        expect(mockClientQuery).toHaveBeenCalledWith(
            'DELETE FROM board_notes WHERE id = $1',
            [NOTE_ID],
        );
        expect(mockClientQuery).not.toHaveBeenCalledWith(
            expect.stringContaining('SELECT role FROM users'),
            expect.any(Array),
        );
    });

    it('rechaza eliminar notas cuando el rol de sesión no tiene permiso', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            ...MANAGER_SESSION,
            role: 'CASHIER',
        });

        const result = await deleteNote(NOTE_ID, MANAGER_SESSION.userId);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No tienes permisos');
        expect(mockPoolConnect).not.toHaveBeenCalled();
    });
});
