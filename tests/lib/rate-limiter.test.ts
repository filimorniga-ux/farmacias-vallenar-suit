/**
 * Tests for Rate Limiter - PIN Validation Security
 * 
 * Covers:
 * - Normal operation (under limit)
 * - Reaching the limit
 * - Lockout mechanism
 * - Window expiration
 * - Reset after successful validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    checkRateLimit,
    recordFailedAttempt,
    resetAttempts,
    getRateLimitStats,
    clearAllRecords,
    RATE_LIMIT_CONFIG,
} from '@/lib/rate-limiter';

describe('Rate Limiter', () => {
    beforeEach(() => {
        // Limpiar todos los registros antes de cada test
        clearAllRecords();
    });

    describe('checkRateLimit', () => {
        it('should allow first attempt with max remaining', () => {
            const result = checkRateLimit('user-123');

            expect(result.allowed).toBe(true);
            expect(result.remainingAttempts).toBe(RATE_LIMIT_CONFIG.MAX_ATTEMPTS);
            expect(result.blockedUntil).toBeNull();
        });

        it('should allow attempts under the limit', () => {
            const userId = 'user-123';

            // Registrar 3 intentos fallidos
            recordFailedAttempt(userId);
            recordFailedAttempt(userId);
            recordFailedAttempt(userId);

            const result = checkRateLimit(userId);

            expect(result.allowed).toBe(true);
            expect(result.remainingAttempts).toBe(2); // 5 - 3 = 2
        });

        it('should block user after exceeding max attempts', () => {
            const userId = 'user-123';

            // Registrar 5 intentos fallidos
            for (let i = 0; i < 5; i++) {
                recordFailedAttempt(userId);
            }

            const result = checkRateLimit(userId);

            expect(result.allowed).toBe(false);
            expect(result.remainingAttempts).toBe(0);
            expect(result.blockedUntil).toBeInstanceOf(Date);
            expect(result.reason).toContain('bloqueado');
        });

        it('should unblock user after lockout expires', () => {
            vi.useFakeTimers();
            const userId = 'user-123';

            // Bloquear usuario
            for (let i = 0; i < 5; i++) {
                recordFailedAttempt(userId);
            }

            // Verificar bloqueado
            let result = checkRateLimit(userId);
            expect(result.allowed).toBe(false);

            // Avanzar tiempo más allá del lockout (15 minutos + 1 segundo)
            vi.advanceTimersByTime(RATE_LIMIT_CONFIG.LOCKOUT_MS + 1000);

            // Verificar desbloqueado
            result = checkRateLimit(userId);
            expect(result.allowed).toBe(true);
            expect(result.remainingAttempts).toBe(RATE_LIMIT_CONFIG.MAX_ATTEMPTS);

            vi.useRealTimers();
        });

        it('should reset counter after window expires', () => {
            vi.useFakeTimers();
            const userId = 'user-123';

            // Registrar 3 intentos
            recordFailedAttempt(userId);
            recordFailedAttempt(userId);
            recordFailedAttempt(userId);

            // Verificar contador
            let result = checkRateLimit(userId);
            expect(result.remainingAttempts).toBe(2);

            // Avanzar tiempo más allá de la ventana (5 minutos + 1 segundo)
            vi.advanceTimersByTime(RATE_LIMIT_CONFIG.WINDOW_MS + 1000);

            // Verificar reiniciado
            result = checkRateLimit(userId);
            expect(result.allowed).toBe(true);
            expect(result.remainingAttempts).toBe(RATE_LIMIT_CONFIG.MAX_ATTEMPTS);

            vi.useRealTimers();
        });
    });

    describe('recordFailedAttempt', () => {
        it('should record first failed attempt', () => {
            const userId = 'user-123';

            recordFailedAttempt(userId);

            const stats = getRateLimitStats(userId);
            expect(stats.hasRecord).toBe(true);
            expect(stats.attempts).toBe(1);
            expect(stats.remainingAttempts).toBe(4);
        });

        it('should increment attempts within window', () => {
            const userId = 'user-123';

            recordFailedAttempt(userId);
            recordFailedAttempt(userId);
            recordFailedAttempt(userId);

            const stats = getRateLimitStats(userId);
            expect(stats.attempts).toBe(3);
            expect(stats.remainingAttempts).toBe(2);
        });

        it('should trigger lockout on 5th attempt', () => {
            const userId = 'user-123';

            for (let i = 0; i < 5; i++) {
                recordFailedAttempt(userId);
            }

            const stats = getRateLimitStats(userId);
            expect(stats.isLocked).toBe(true);
            expect(stats.lockedUntil).toBeInstanceOf(Date);
        });

        it('should reset counter in new window', () => {
            vi.useFakeTimers();
            const userId = 'user-123';

            // Intentos en primera ventana
            recordFailedAttempt(userId);
            recordFailedAttempt(userId);

            // Avanzar más allá de la ventana
            vi.advanceTimersByTime(RATE_LIMIT_CONFIG.WINDOW_MS + 1000);

            // Nuevo intento en nueva ventana
            recordFailedAttempt(userId);

            const stats = getRateLimitStats(userId);
            expect(stats.attempts).toBe(1); // Reiniciado

            vi.useRealTimers();
        });
    });

    describe('resetAttempts', () => {
        it('should clear attempts after successful validation', () => {
            const userId = 'user-123';

            // Registrar algunos intentos
            recordFailedAttempt(userId);
            recordFailedAttempt(userId);

            // Verificar que existen
            let stats = getRateLimitStats(userId);
            expect(stats.hasRecord).toBe(true);
            expect(stats.attempts).toBe(2);

            // Reset exitoso
            resetAttempts(userId);

            // Verificar limpieza
            stats = getRateLimitStats(userId);
            expect(stats.hasRecord).toBe(false);
        });

        it('should allow immediate retry after reset', () => {
            const userId = 'user-123';

            // Bloquear usuario
            for (let i = 0; i < 5; i++) {
                recordFailedAttempt(userId);
            }

            // Verificar bloqueado
            let result = checkRateLimit(userId);
            expect(result.allowed).toBe(false);

            // Reset (simula PIN correcto)
            resetAttempts(userId);

            // Verificar permitido nuevamente
            result = checkRateLimit(userId);
            expect(result.allowed).toBe(true);
            expect(result.remainingAttempts).toBe(RATE_LIMIT_CONFIG.MAX_ATTEMPTS);
        });
    });

    describe('getRateLimitStats', () => {
        it('should return no record for new user', () => {
            const stats = getRateLimitStats('new-user');

            expect(stats.hasRecord).toBe(false);
            expect(stats.attempts).toBeUndefined();
        });

        it('should return correct stats for user with attempts', () => {
            const userId = 'user-123';

            recordFailedAttempt(userId);
            recordFailedAttempt(userId);
            recordFailedAttempt(userId);

            const stats = getRateLimitStats(userId);

            expect(stats.hasRecord).toBe(true);
            expect(stats.attempts).toBe(3);
            expect(stats.remainingAttempts).toBe(2);
            expect(stats.isLocked).toBe(false);
        });

        it('should return locked status for blocked user', () => {
            const userId = 'user-123';

            // Bloquear
            for (let i = 0; i < 5; i++) {
                recordFailedAttempt(userId);
            }

            const stats = getRateLimitStats(userId);

            expect(stats.isLocked).toBe(true);
            expect(stats.lockedUntil).toBeInstanceOf(Date);
        });
    });

    describe('Multiple users isolation', () => {
        it('should track users independently', () => {
            const user1 = 'user-1';
            const user2 = 'user-2';

            // user1: 3 intentos
            recordFailedAttempt(user1);
            recordFailedAttempt(user1);
            recordFailedAttempt(user1);

            // user2: 1 intento
            recordFailedAttempt(user2);

            const stats1 = getRateLimitStats(user1);
            const stats2 = getRateLimitStats(user2);

            expect(stats1.attempts).toBe(3);
            expect(stats1.remainingAttempts).toBe(2);

            expect(stats2.attempts).toBe(1);
            expect(stats2.remainingAttempts).toBe(4);
        });

        it('should not affect other users when one is blocked', () => {
            const user1 = 'user-1';
            const user2 = 'user-2';

            // Bloquear user1
            for (let i = 0; i < 5; i++) {
                recordFailedAttempt(user1);
            }

            // user2 debería estar permitido
            const result1 = checkRateLimit(user1);
            const result2 = checkRateLimit(user2);

            expect(result1.allowed).toBe(false);
            expect(result2.allowed).toBe(true);
            expect(result2.remainingAttempts).toBe(RATE_LIMIT_CONFIG.MAX_ATTEMPTS);
        });
    });
});
