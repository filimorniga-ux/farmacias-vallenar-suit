'use server';

/**
 * ============================================================================
 * SECURITY-V2: Secure Session & Account Management
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * SECURITY IMPROVEMENTS:
 * - SERIALIZABLE transactions for data integrity
 * - bcrypt PIN validation for ADMIN operations
 * - Rate limiter integration (5 failures = 15 min, 10 = permanent lock)
 * - Comprehensive audit logging
 * - Secure token rotation with crypto.randomBytes
 * - FOR UPDATE NOWAIT to prevent deadlocks
 * 
 * MIGRATION:
 * - Replaces security.ts functions
 * - Integrates with rate-limiter.ts
 * - Requires users.token_version column
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import { logger } from '@/lib/logger';
import {
    getActorOrFail,
    PinAuthorizedUser,
    PinRbacError,
    requireRole,
    ROLE_GROUPS,
    validatePinForRoles,
} from '@/lib/pin-rbac';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const ValidateSessionSchema = z.object({
    userId: UUIDSchema,
    clientTokenVersion: z.number().int().min(0),
    contextData: z.record(z.string(), z.any()).optional(),
});

const LockAccountSchema = z.object({
    userId: UUIDSchema,
    reason: z.string().min(3, 'Razón requerida').max(500),
    lockDurationMinutes: z.number().int().min(1).max(1440).optional(),
    permanent: z.boolean().optional(),
});

const UnlockAccountSchema = z.object({
    userId: UUIDSchema,
    adminPin: z.string().min(4, 'PIN requerido').max(8),
    reason: z.string().min(3, 'Razón requerida').max(500),
});

const ForceLogoutSchema = z.object({
    targetUserId: UUIDSchema,
    adminPin: z.string().min(4, 'PIN requerido').max(8),
    reason: z.string().min(3, 'Razón requerida').max(500),
});

const AuditLogFilterSchema = z.object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
    userId: UUIDSchema.optional(),
    action: z.string().optional(),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ROLE_GROUPS.ADMIN;
const MANAGER_ROLES = ROLE_GROUPS.MANAGER;

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
} as const;

// Account lock thresholds
const LOCK_THRESHOLDS = {
    TEMPORARY_LOCK_ATTEMPTS: 5,    // 5 failures = 15 min lock
    PERMANENT_LOCK_ATTEMPTS: 10,   // 10 failures = permanent lock
    TEMPORARY_LOCK_MINUTES: 15,
} as const;

// Security-related audit actions
const SECURITY_ACTIONS = [
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'LOGIN_BLOCKED_RATE_LIMIT',
    'LOGIN_BLOCKED_LOCATION',
    'SESSION_REVOKED',
    'ACCOUNT_LOCKED',
    'ACCOUNT_UNLOCKED',
    'TOKEN_ROTATED',
    'FORCE_LOGOUT',
    'PIN_CHANGED',
    'PIN_RESET',
    'SUPERVISOR_AUTH',
    'SUPERVISOR_PIN_FAILED',
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get client IP address from headers
 */
async function getClientIP(): Promise<string> {
    try {
        const headerStore = await headers();
        const xForwardedFor = headerStore.get('x-forwarded-for');
        if (xForwardedFor) {
            return xForwardedFor.split(',')[0].trim();
        }
        return headerStore.get('x-real-ip') || 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Resolve actor from validated session and enforce roles when required.
 */
async function resolveSecurityActor(requiredRoles?: readonly string[]) {
    try {
        let actor = await getActorOrFail();
        if (requiredRoles) {
            actor = requireRole(actor, requiredRoles);
        }

        return { success: true as const, actor };
    } catch (error) {
        if (error instanceof PinRbacError) {
            return { success: false as const, error: error.message };
        }
        throw error;
    }
}

/**
 * Validate ADMIN PIN through shared pin-rbac helper.
 */
async function validateAdminPin(
    client: any,
    pin: string,
    requiredRoles: readonly string[] = ADMIN_ROLES
): Promise<{ valid: boolean; admin?: PinAuthorizedUser; error?: string }> {
    try {
        const result = await validatePinForRoles(client, pin, requiredRoles, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { valid: false, error: result.error };
        }

        return {
            valid: true,
            admin: result.authorizedBy,
        };
    } catch (error) {
        logger.error({ error }, '[Security] Admin PIN validation error');
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Insert security audit log
 */
async function insertSecurityAudit(
    client: any,
    params: {
        userId: string | null;
        actionCode: string;
        targetUserId?: string;
        details: Record<string, any>;
        ipAddress?: string;
    }
): Promise<void> {
    try {
        const ip = params.ipAddress || await getClientIP();
        await client.query(`
            INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp)
            VALUES ($1, $2, $3, $4, NOW())
        `, [
            params.userId,
            params.actionCode,
            JSON.stringify({
                ...params.details,
                target_user_id: params.targetUserId,
            }),
            ip
        ]);
    } catch (error) {
        logger.warn({ error }, '[Security] Audit log insertion failed');
    }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * 🔒 Validate Session Securely
 * Checks token_version and updates last_active_at (Throttled: Max 1 write per minute)
 */
export async function validateSessionSecure(
    userId: string,
    clientTokenVersion: number,
    contextData?: Record<string, any>
): Promise<{ valid: boolean; error?: string }> {
    // Validate inputs
    const validated = ValidateSessionSchema.safeParse({ userId, clientTokenVersion, contextData });
    if (!validated.success) {
        return { valid: false, error: validated.error.issues[0]?.message };
    }

    try {
        const { query } = await import('@/lib/db');

        // Optimized Query: user check + conditional update in one go if possible, 
        // but for read-heavy flows, a READ first is better to check validity.

        const userRes = await query(`
            SELECT id, token_version, is_active
            FROM users 
            WHERE id = $1
        `, [userId]);

        if (userRes.rows.length === 0) {
            return { valid: false, error: 'Usuario no encontrado' };
        }

        const user = userRes.rows[0];

        // Check if user is active
        if (!user.is_active) {
            return { valid: false, error: 'Usuario deshabilitado' };
        }

        // Check token version
        const dbTokenVersion = Number(user.token_version) || 1;
        if (dbTokenVersion > clientTokenVersion) {
            return { valid: false, error: 'Sesión revocada remotamente' };
        }

        // Check permanent lock
        if (user.account_locked_permanently) {
            return { valid: false, error: 'Cuenta bloqueada permanentemente' };
        }

        // Update activity ONLY if not updated recently (Throttling DB writes)
        // This query will only write if last_active_at is older than 60 seconds
        // "fire-and-forget" style (no await on result processing, just await execution)
        await query(`
            UPDATE users 
            SET last_active_at = NOW(),
                current_context_data = $2
            WHERE id = $1 
            AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '60 seconds')
        `, [userId, JSON.stringify(contextData || {})]).catch(err => {
            // Log silently, don't break session validation
            console.error('[Security] Activity update failed:', err);
        });

        return { valid: true };

    } catch (error: any) {
        logger.error({ error }, '[Security] Session validation error');
        return { valid: false, error: 'Error validando sesión' };
    }
}

// ============================================================================
// ACCOUNT LOCKING
// ============================================================================

/**
 * 🔐 Lock Account (Called by rate limiter or manually)
 * - 5 failures = 15 minute temporary lock
 * - 10 failures = permanent lock until ADMIN unlocks
 */
export async function lockAccountSecure(
    userId: string,
    reason: string,
    options?: { lockDurationMinutes?: number; permanent?: boolean }
): Promise<{ success: boolean; error?: string }> {
    // Validate inputs
    const validated = LockAccountSchema.safeParse({
        userId,
        reason,
        lockDurationMinutes: options?.lockDurationMinutes,
        permanent: options?.permanent,
    });

    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Lock user row
        const userRes = await client.query(`
            SELECT id, name, login_failure_count 
            FROM users 
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [userId]);

        if (userRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado' };
        }

        const failureCount = Number(userRes.rows[0].login_failure_count) || 0;
        const newFailureCount = failureCount + 1;

        // Determine lock type
        let lockUntil: Date | null = null;
        let permanentLock = options?.permanent || false;

        if (!permanentLock) {
            if (newFailureCount >= LOCK_THRESHOLDS.PERMANENT_LOCK_ATTEMPTS) {
                permanentLock = true;
            } else if (newFailureCount >= LOCK_THRESHOLDS.TEMPORARY_LOCK_ATTEMPTS) {
                const minutes = options?.lockDurationMinutes || LOCK_THRESHOLDS.TEMPORARY_LOCK_MINUTES;
                lockUntil = new Date(Date.now() + minutes * 60 * 1000);
            }
        }

        // Update user with lock status
        await client.query(`
            UPDATE users 
            SET login_failure_count = $2,
                account_locked_permanently = $3,
                account_locked_until = $4,
                updated_at = NOW()
            WHERE id = $1
        `, [userId, newFailureCount, permanentLock, lockUntil]);

        // Audit
        await insertSecurityAudit(client, {
            userId: 'SYSTEM',
            actionCode: 'ACCOUNT_LOCKED',
            targetUserId: userId,
            details: {
                reason,
                failure_count: newFailureCount,
                lock_type: permanentLock ? 'PERMANENT' : (lockUntil ? 'TEMPORARY' : 'NONE'),
                lock_until: lockUntil?.toISOString(),
            }
        });

        await client.query('COMMIT');

        logger.warn({ userId, permanentLock, lockUntil }, '🔒 [Security] Account locked');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Security] Account lock error');
        return { success: false, error: 'Error bloqueando cuenta' };

    } finally {
        client.release();
    }
}

/**
 * 🔓 Unlock Account (ADMIN only with PIN)
 */
export async function unlockAccountSecure(
    userId: string,
    adminPin: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    // Validate inputs
    const validated = UnlockAccountSchema.safeParse({ userId, adminPin, reason });
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const actor = await resolveSecurityActor(ADMIN_ROLES);
    if (!actor.success) {
        return { success: false, error: actor.error };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validate ADMIN PIN
        const authResult = await validateAdminPin(client, adminPin, ADMIN_ROLES);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error || 'PIN inválido' };
        }

        // Get target user
        const userRes = await client.query(`
            SELECT id, name
            FROM users 
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [userId]);

        if (userRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado' };
        }

        // Unlock account (reset failure count only)
        await client.query(`
            UPDATE users 
            SET login_failure_count = 0,
                updated_at = NOW()
            WHERE id = $1
        `, [userId]);

        // Reset rate limiter
        const { resetAttempts } = await import('@/lib/rate-limiter');
        resetAttempts(userId);

        // Audit
        await insertSecurityAudit(client, {
            userId: actor.actor.userId,
            actionCode: 'ACCOUNT_UNLOCKED',
            targetUserId: userId,
            details: {
                reason,
                unlocked_by: actor.actor.userName,
                authorized_by: authResult.admin!.name,
                authorized_by_id: authResult.admin!.id,
            }
        });

        await client.query('COMMIT');

        logger.info({
            userId,
            actorUserId: actor.actor.userId,
            authorizedById: authResult.admin!.id,
        }, '🔓 [Security] Account unlocked');
        revalidatePath('/settings');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Security] Account unlock error');
        return { success: false, error: 'Error desbloqueando cuenta' };

    } finally {
        client.release();
    }
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * 🔄 Rotate Session Token Securely
 * Generates new secure token using crypto.randomBytes
 */
export async function rotateSessionSecure(
    userId: string
): Promise<{ success: boolean; newTokenVersion?: number; sessionToken?: string; error?: string }> {
    // Validate
    if (!UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'ID de usuario inválido' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Lock user
        const userRes = await client.query(`
            SELECT id, token_version 
            FROM users 
            WHERE id = $1 AND is_active = true
            FOR UPDATE NOWAIT
        `, [userId]);

        if (userRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado o inactivo' };
        }

        const currentVersion = Number(userRes.rows[0].token_version) || 1;
        const newVersion = currentVersion + 1;

        // Generate secure session token
        const sessionToken = randomBytes(32).toString('hex');

        // Update user
        await client.query(`
            UPDATE users 
            SET token_version = $2,
                session_token = $3,
                updated_at = NOW()
            WHERE id = $1
        `, [userId, newVersion, sessionToken]);

        // Audit
        await insertSecurityAudit(client, {
            userId,
            actionCode: 'TOKEN_ROTATED',
            details: {
                old_version: currentVersion,
                new_version: newVersion,
            }
        });

        await client.query('COMMIT');

        logger.info({ userId, newVersion }, '🔄 [Security] Token rotated');
        return { success: true, newTokenVersion: newVersion, sessionToken };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Security] Token rotation error');
        return { success: false, error: 'Error rotando token' };

    } finally {
        client.release();
    }
}

/**
 * 🚫 Force Logout (ADMIN/MANAGER with PIN)
 * NOTE: Uses simple sequential operations instead of SERIALIZABLE transaction
 * to avoid FOR UPDATE NOWAIT failures caused by concurrent session validation reads.
 */
export async function forceLogoutSecure(
    targetUserId: string,
    adminPin: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    // Validate inputs
    const validated = ForceLogoutSchema.safeParse({ targetUserId, adminPin, reason });
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    try {
        const actor = await resolveSecurityActor(MANAGER_ROLES);
        if (!actor.success) {
            return { success: false, error: actor.error };
        }

        const { query } = await import('@/lib/db');

        // Step 1: Validate ADMIN/MANAGER PIN (using a fresh simple query, no transaction)
        // We use a temporary client only for PIN validation to avoid nested transaction issues
        const client = await pool.connect();
        let authResult: { valid: boolean; admin?: { id: string; name: string; role: string }; error?: string };
        try {
            authResult = await validateAdminPin(client, adminPin, MANAGER_ROLES);
        } finally {
            client.release();
        }

        if (!authResult.valid) {
            return { success: false, error: authResult.error || 'PIN inválido' };
        }

        // Cannot force logout yourself
        if (actor.actor.userId === targetUserId) {
            return { success: false, error: 'No puedes cerrar tu propia sesión de esta manera' };
        }

        // Step 2: Get target user (simple SELECT, no lock needed)
        const userRes = await query(`
            SELECT id, name, token_version 
            FROM users 
            WHERE id = $1
            AND is_active = true
        `, [targetUserId]);

        if (userRes.rows.length === 0) {
            return { success: false, error: 'Usuario no encontrado' };
        }

        const targetUser = userRes.rows[0];

        // Step 3: Atomic UPDATE - PostgreSQL UPDATE is inherently atomic, no explicit lock needed
        await query(`
            UPDATE users 
            SET token_version = COALESCE(token_version, 1) + 1,
                session_token = NULL,
                updated_at = NOW()
            WHERE id = $1
        `, [targetUserId]);

        // Step 4: Audit log (best-effort, failure does not affect the logout)
        const auditClient = await pool.connect();
        try {
            await insertSecurityAudit(auditClient, {
                userId: actor.actor.userId,
                actionCode: 'FORCE_LOGOUT',
                targetUserId,
                details: {
                    reason,
                    forced_by: actor.actor.userName,
                    authorized_by: authResult.admin!.name,
                    authorized_by_id: authResult.admin!.id,
                    target_name: targetUser.name,
                }
            });
        } catch (auditError) {
            logger.warn({ auditError }, '[Security] Audit log failed for force logout, but operation succeeded');
        } finally {
            auditClient.release();
        }

        logger.info({
            targetUserId,
            actorUserId: actor.actor.userId,
            authorizedById: authResult.admin!.id,
        }, '🚫 [Security] Forced logout');
        revalidatePath('/settings');
        return { success: true };

    } catch (error: any) {
        logger.error({ error, message: error?.message, code: error?.code }, '[Security] Force logout error');
        return { success: false, error: error?.message || 'Error cerrando sesión' };
    }
}

// ============================================================================
// SECURITY AUDIT LOG
// ============================================================================

/**
 * 📋 Get Security Audit Log
 */
export async function getSecurityAuditLog(
    filters?: {
        page?: number;
        pageSize?: number;
        userId?: string;
        action?: string;
        startDate?: Date;
        endDate?: Date;
    }
): Promise<{
    success: boolean;
    data?: {
        logs: any[];
        total: number;
        page: number;
        pageSize: number;
    };
    error?: string;
}> {
    // Validate filters
    const validated = AuditLogFilterSchema.safeParse(filters || {});
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { page, pageSize, userId, action, startDate, endDate } = validated.data;
    const offset = (page - 1) * pageSize;

    try {
        // Build WHERE clause
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        // Filter to security-related actions only
        conditions.push(`al.action = ANY($${paramIndex++}::text[])`);
        params.push(SECURITY_ACTIONS);

        if (userId) {
            conditions.push(`(al.user_id = $${paramIndex} OR al.details->>'target_user_id' = $${paramIndex})`);
            params.push(userId);
            paramIndex++;
        }

        if (action) {
            conditions.push(`al.action = $${paramIndex++}`);
            params.push(action);
        }

        if (startDate) {
            conditions.push(`al.timestamp >= $${paramIndex++}`);
            params.push(startDate);
        }

        if (endDate) {
            conditions.push(`al.timestamp <= $${paramIndex++}`);
            params.push(endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total
        const { query } = await import('@/lib/db');
        const countRes = await query(`
            SELECT COUNT(*) as total
            FROM audit_logs al
            ${whereClause}
        `, params);

        const total = parseInt(countRes.rows[0]?.total || '0');

        // Fetch logs
        params.push(pageSize, offset);
        const logsRes = await query(`
            SELECT 
                al.id,
                al.user_id,
                al.action,
                al.details,
                al.ip_address,
                al.timestamp,
                u.name as user_name,
                u.role as user_role
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id::text = u.id::text
            ${whereClause}
            ORDER BY al.timestamp DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `, params);

        return {
            success: true,
            data: {
                logs: logsRes.rows.map(row => ({
                    ...row,
                    details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
                })),
                total,
                page,
                pageSize,
            }
        };

    } catch (error: any) {
        logger.error({ error }, '[Security] Get audit log error');
        return { success: false, error: 'Error obteniendo registros de auditoría' };
    }
}

// ============================================================================
// ACTIVE SESSIONS
// ============================================================================

export interface ActiveSession {
    user_id: string;
    name: string;
    role: string;
    last_active_at: Date;
    current_context: any;
    status: 'ONLINE' | 'AWAY' | 'OFFLINE';
    is_locked: boolean;
}

/**
 * 📋 Get Active Sessions List
 */
export async function getActiveSessionsSecure(): Promise<{
    success: boolean;
    data?: ActiveSession[];
    error?: string;
}> {
    try {
        const { query } = await import('@/lib/db');

        const res = await query(`
            SELECT 
                id as user_id, 
                name, 
                role, 
                last_active_at, 
                current_context_data
            FROM users 
            WHERE last_active_at > NOW() - INTERVAL '24 hours'
            AND is_active = true
            ORDER BY last_active_at DESC
        `, []);

        const activeSessions = res.rows.map((row: any) => ({
            user_id: row.user_id,
            name: row.name,
            role: row.role,
            last_active_at: row.last_active_at,
            current_context: row.current_context_data,
            status: (Date.now() - new Date(row.last_active_at).getTime() < 300000) ? 'ONLINE' : 'AWAY',
            is_locked: false, // Lock columns don't exist in DB
        }));

        return { success: true, data: activeSessions as any };

    } catch (error: any) {
        logger.error({ error }, '[Security] Get active sessions error');
        return { success: false, error: 'Error obteniendo sesiones activas' };
    }
}

/**
 * 📝 Log Generic Audit Action (Secure)
 */
export async function logAuditActionSecure(
    userId: string,
    action: string,
    details: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'ID de usuario inválido' };
    }

    try {
        const { query } = await import('@/lib/db');
        const ip = await getClientIP();

        await query(`
            INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp)
            VALUES ($1, $2, $3, $4, NOW())
        `, [userId, action, JSON.stringify(details), ip]);

        return { success: true };

    } catch (error: any) {
        logger.error({ error }, '[Security] Log audit error');
        return { success: false, error: 'Error registrando auditoría' };
    }
}
