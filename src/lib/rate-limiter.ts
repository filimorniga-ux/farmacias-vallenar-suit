/**
 * 🛡️ RATE LIMITER - PIN VALIDATION SECURITY
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Previene ataques de fuerza bruta en validación de PINs mediante:
 * - Límite de intentos fallidos por usuario
 * - Bloqueo temporal después de exceder límite
 * - Registro en audit log de intentos sospechosos
 * - Auto-reset en login exitoso
 * 
 * @version 1.0.0
 * @date 2024-12-24
 */

import { logger } from './logger';

// =====================================================
// CONFIGURACIÓN
// =====================================================

const MAX_ATTEMPTS = 5; // Máximo intentos fallidos permitidos
const WINDOW_MS = 5 * 60 * 1000; // Ventana de tiempo: 5 minutos
const LOCKOUT_MS = 15 * 60 * 1000; // Tiempo de bloqueo: 15 minutos

// =====================================================
// ALMACENAMIENTO EN MEMORIA
// =====================================================

interface AttemptRecord {
    attempts: number;
    firstAttemptAt: number;
    lockedUntil: number | null;
}

// Map: userId -> AttemptRecord
const attemptStore = new Map<string, AttemptRecord>();

// Limpiar registros expirados cada 10 minutos
setInterval(() => {
    const now = Date.now();
    for (const [userId, record] of attemptStore.entries()) {
        // Eliminar si el bloqueo expiró y la ventana pasó
        if (
            record.lockedUntil &&
            record.lockedUntil < now &&
            (now - record.firstAttemptAt) > WINDOW_MS
        ) {
            attemptStore.delete(userId);
        }
    }
}, 10 * 60 * 1000);

// =====================================================
// INTERFACES
// =====================================================

export interface RateLimitResult {
    allowed: boolean;
    remainingAttempts: number;
    blockedUntil: Date | null;
    reason?: string;
}

// =====================================================
// FUNCIONES PÚBLICAS
// =====================================================

/**
 * Verifica si un usuario puede intentar validar PIN
 */
export function checkRateLimit(userId: string): RateLimitResult {
    const now = Date.now();
    const record = attemptStore.get(userId);

    // Si no hay registro previo, está permitido
    if (!record) {
        return {
            allowed: true,
            remainingAttempts: MAX_ATTEMPTS,
            blockedUntil: null,
        };
    }

    // Si está bloqueado, verificar si ya expiró
    if (record.lockedUntil) {
        if (record.lockedUntil > now) {
            // Aún bloqueado
            return {
                allowed: false,
                remainingAttempts: 0,
                blockedUntil: new Date(record.lockedUntil),
                reason: `Usuario bloqueado hasta ${new Date(record.lockedUntil).toLocaleString('es-CL')}`,
            };
        } else {
            // Bloqueo expirado, reiniciar
            attemptStore.delete(userId);
            return {
                allowed: true,
                remainingAttempts: MAX_ATTEMPTS,
                blockedUntil: null,
            };
        }
    }

    // Verificar si la ventana de tiempo expiró
    if ((now - record.firstAttemptAt) > WINDOW_MS) {
        // Ventana expirada, reiniciar contador
        attemptStore.delete(userId);
        return {
            allowed: true,
            remainingAttempts: MAX_ATTEMPTS,
            blockedUntil: null,
        };
    }

    // Dentro de la ventana, verificar intentos
    const remaining = MAX_ATTEMPTS - record.attempts;

    if (remaining > 0) {
        return {
            allowed: true,
            remainingAttempts: remaining,
            blockedUntil: null,
        };
    } else {
        // Excedió límite, bloquear
        const lockedUntil = now + LOCKOUT_MS;
        record.lockedUntil = lockedUntil;
        attemptStore.set(userId, record);

        logger.warn({
            userId,
            lockedUntil: new Date(lockedUntil),
        }, '🚨 [Rate Limiter] Usuario bloqueado por exceder intentos de PIN');

        return {
            allowed: false,
            remainingAttempts: 0,
            blockedUntil: new Date(lockedUntil),
            reason: `Demasiados intentos fallidos. Bloqueado por ${LOCKOUT_MS / 60000} minutos.`,
        };
    }
}

/**
 * Registra un intento fallido de PIN
 */
export function recordFailedAttempt(userId: string): void {
    const now = Date.now();
    const record = attemptStore.get(userId);

    if (!record) {
        // Primer intento fallido
        attemptStore.set(userId, {
            attempts: 1,
            firstAttemptAt: now,
            lockedUntil: null,
        });
        logger.info({ userId, attempts: 1 }, '⚠️ [Rate Limiter] Intento de PIN fallido registrado');
    } else {
        // Verificar si está en nueva ventana
        if ((now - record.firstAttemptAt) > WINDOW_MS) {
            // Nueva ventana, reiniciar
            attemptStore.set(userId, {
                attempts: 1,
                firstAttemptAt: now,
                lockedUntil: null,
            });
            logger.info({ userId, attempts: 1 }, '⚠️ [Rate Limiter] Nueva ventana - Intento fallido registrado');
        } else {
            // Incrementar en ventana actual
            record.attempts += 1;
            attemptStore.set(userId, record);

            const remaining = MAX_ATTEMPTS - record.attempts;
            logger.warn({
                userId,
                attempts: record.attempts,
                remaining: Math.max(0, remaining),
            }, `⚠️ [Rate Limiter] Intento fallido #${record.attempts}. Quedan ${Math.max(0, remaining)} intentos`);

            // Si excedió, bloquear
            if (record.attempts >= MAX_ATTEMPTS && !record.lockedUntil) {
                const lockedUntil = now + LOCKOUT_MS;
                record.lockedUntil = lockedUntil;
                attemptStore.set(userId, record);

                logger.error({
                    userId,
                    lockedUntil: new Date(lockedUntil),
                }, '🔒 [Rate Limiter] Usuario BLOQUEADO por exceder intentos de PIN');
            }
        }
    }
}

/**
 * Reinicia el contador de intentos (llamar en login/validación exitosa)
 */
export function resetAttempts(userId: string): void {
    const hadRecord = attemptStore.has(userId);
    attemptStore.delete(userId);

    if (hadRecord) {
        logger.info({ userId }, '✅ [Rate Limiter] Intentos reiniciados - PIN válido');
    }
}

/**
 * Obtiene estadísticas del rate limiter (para debugging/admin)
 */
export function getRateLimitStats(userId: string): {
    hasRecord: boolean;
    attempts?: number;
    remainingAttempts?: number;
    isLocked?: boolean;
    lockedUntil?: Date | null;
} {
    const record = attemptStore.get(userId);

    if (!record) {
        return { hasRecord: false };
    }

    const now = Date.now();
    const isLocked = record.lockedUntil ? record.lockedUntil > now : false;

    return {
        hasRecord: true,
        attempts: record.attempts,
        remainingAttempts: Math.max(0, MAX_ATTEMPTS - record.attempts),
        isLocked,
        lockedUntil: record.lockedUntil ? new Date(record.lockedUntil) : null,
    };
}

/**
 * Limpia todos los registros (solo para testing)
 */
export function clearAllRecords(): void {
    attemptStore.clear();
    logger.info({}, '🧹 [Rate Limiter] Todos los registros limpiados');
}

// =====================================================
// EXPORTS
// =====================================================

export const RATE_LIMIT_CONFIG = {
    MAX_ATTEMPTS,
    WINDOW_MS,
    LOCKOUT_MS,
} as const;
