import { describe, expect, it } from 'vitest';
import {
    isRetryableDbFailure,
    resolveLoginRetryCooldownMs,
    resolveLoginTimeoutMs
} from '@/lib/login-resilience';

describe('login-resilience', () => {
    it('aplica timeout por defecto y límites', () => {
        expect(resolveLoginTimeoutMs(undefined)).toBe(15000);
        expect(resolveLoginTimeoutMs('abc')).toBe(15000);
        expect(resolveLoginTimeoutMs('1000')).toBe(5000);
        expect(resolveLoginTimeoutMs('90000')).toBe(60000);
        expect(resolveLoginTimeoutMs('18000')).toBe(18000);
    });

    it('detecta fallos DB reintentables', () => {
        expect(isRetryableDbFailure({ code: 'DB_TIMEOUT', retryable: true })).toBe(true);
        expect(isRetryableDbFailure({ code: 'DB_AUTH', retryable: false })).toBe(false);
        expect(isRetryableDbFailure({ code: 'AUTH_INVALID_PIN', retryable: true })).toBe(false);
    });

    it('calcula cooldown por tipo de fallo', () => {
        expect(resolveLoginRetryCooldownMs({ code: 'DB_DNS', retryable: true })).toBe(12000);
        expect(resolveLoginRetryCooldownMs({ code: 'DB_UNAVAILABLE', retryable: true })).toBe(10000);
        expect(resolveLoginRetryCooldownMs({ code: 'DB_TIMEOUT', retryable: true })).toBe(8000);
        expect(resolveLoginRetryCooldownMs({ code: 'DB_UNKNOWN', retryable: true })).toBe(6000);
        expect(resolveLoginRetryCooldownMs({ code: 'AUTH_INVALID_PIN', retryable: false })).toBe(0);
    });
});
