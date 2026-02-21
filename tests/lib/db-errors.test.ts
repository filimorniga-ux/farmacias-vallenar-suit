import { describe, expect, it } from 'vitest';
import { classifyPgError, isTransientPgConnectionError } from '@/lib/db-errors';

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

    describe('classifyPgError', () => {
        it('maps timeout message to DB_TIMEOUT', () => {
            const result = classifyPgError({
                message: 'Connection terminated due to connection timeout',
            });

            expect(result.code).toBe('DB_TIMEOUT');
            expect(result.retryable).toBe(true);
        });

        it('maps auth failures to DB_AUTH', () => {
            const result = classifyPgError({
                code: '28P01',
                message: 'password authentication failed for user',
            });

            expect(result.code).toBe('DB_AUTH');
            expect(result.retryable).toBe(false);
        });

        it('maps dns failures to DB_DNS', () => {
            const result = classifyPgError({
                code: 'ENOTFOUND',
                message: 'getaddrinfo ENOTFOUND db.internal',
            });

            expect(result.code).toBe('DB_DNS');
            expect(result.retryable).toBe(true);
        });
    });
});
