import { describe, expect, it } from 'vitest';
import { isTransientPgConnectionError } from '@/lib/db-errors';

describe('db-errors', () => {
    describe('isTransientPgConnectionError', () => {
        it('returns true for transient error codes', () => {
            expect(isTransientPgConnectionError({ code: 'ETIMEDOUT' })).toBe(true);
            expect(isTransientPgConnectionError({ code: '08006' })).toBe(true);
        });

        it('returns true for transient timeout messages without code', () => {
            expect(isTransientPgConnectionError({
                message: 'Connection terminated due to connection timeout'
            })).toBe(true);
        });

        it('returns false for non-transient sql errors', () => {
            expect(isTransientPgConnectionError({
                code: '42601',
                message: 'syntax error at or near "FROM"',
            })).toBe(false);
        });

        it('returns false for empty input', () => {
            expect(isTransientPgConnectionError(undefined)).toBe(false);
            expect(isTransientPgConnectionError(null)).toBe(false);
        });
    });
});
