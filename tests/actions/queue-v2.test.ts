/**
 * Tests - Queue V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as queueV2 from '@/actions/queue-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Queue V2 - RUT Validation', () => {
    it('should reject invalid RUT format', async () => {
        const result = await queueV2.createTicketSecure({
            branchId: '550e8400-e29b-41d4-a716-446655440000',
            rut: 'invalid-rut',
            type: 'GENERAL'
        });

        expect(result.success).toBe(false);
    });

    it('should accept ANON as valid RUT', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query)
            .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 } as any) // Count
            .mockResolvedValueOnce({ rows: [{ id: 'new-id', code: 'G001' }], rowCount: 1 } as any); // Insert

        const result = await queueV2.createTicketSecure({
            branchId: '550e8400-e29b-41d4-a716-446655440000',
            rut: 'ANON',
            type: 'GENERAL'
        });

        // Will succeed with proper DB mocking
        expect(result.error).not.toContain('RUT');
    });
});

describe('Queue V2 - Input Validation', () => {
    it('should reject invalid branch ID for getNextTicket', async () => {
        const result = await queueV2.getNextTicketSecure('invalid', '550e8400-e29b-41d4-a716-446655440000');
        expect(result.success).toBe(false);
        expect(result.error).toContain('inválidos');
    });

    it('should reject invalid ticket ID for complete', async () => {
        const result = await queueV2.completeTicketSecure('invalid', '550e8400-e29b-41d4-a716-446655440000');
        expect(result.success).toBe(false);
    });
});

describe('Queue V2 - Cancel', () => {
    it('should require reason for cancellation', async () => {
        const result = await queueV2.cancelTicketSecure(
            '550e8400-e29b-41d4-a716-446655440000',
            'abc' // Too short
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('5 caracteres');
    });
});

describe('Queue V2 - Metrics', () => {
    it('should validate branch ID', async () => {
        const result = await queueV2.getQueueMetrics('invalid');
        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});
