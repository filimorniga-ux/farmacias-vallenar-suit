'use server';

/**
 * ============================================================================
 * AUTH-V2: Secure Authentication Module
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * SECURITY IMPROVEMENTS:
 * - PIN hashed with bcrypt (not plaintext comparison)
 * - Input validation with Zod
 * - Timing-safe comparison
 * - Enhanced audit logging
 * - User existence not revealed on failure
 * 
 * MIGRATION:
 * - Requires users.access_pin_hash column (VARCHAR(60))
 * - Run migration script to hash existing PINs
 * - Deprecates auth.ts authenticateUser()
 */

import { query, pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const AuthenticateSchema = z.object({
    userId: z.string().uuid('ID de usuario inválido'),
    pin: z.string()
        .min(4, 'PIN debe tener al menos 4 dígitos')
        .max(8, 'PIN no puede exceder 8 dígitos')
        .regex(/^\d+$/, 'PIN debe contener solo números'),
    locationId: z.string().uuid().optional()
});

const SetPinSchema = z.object({
    userId: z.string().uuid(),
    newPin: z.string()
        .min(4, 'PIN debe tener al menos 4 dígitos')
        .max(8, 'PIN no puede exceder 8 dígitos')
        .regex(/^\d+$/, 'PIN debe contener solo números'),
    adminId: z.string().uuid()
});

const RevokeSessionSchema = z.object({
    targetUserId: z.string().uuid(),
    adminUserId: z.string().uuid()
});

// ============================================================================
// CONSTANTS
// ============================================================================

const GLOBAL_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'DRIVER', 'QF'];
const ADMIN_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'];
const BCRYPT_ROUNDS = 10;

// Memory cache for auth settings to reduce DB roundtrips
const authSettingsCache = {
    maxAttempts: 5,
    lockoutMinutes: 15,
    lastFetched: 0
};
const SETTINGS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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
 * Log audit action with proper error handling
 */
async function auditLog(
    userId: string | null,
    action: string,
    details: Record<string, any>,
    ipAddress?: string
): Promise<void> {
    // We don't await the query to make it non-blocking for the user
    (async () => {
        try {
            const ip = ipAddress || await getClientIP();
            await query(`
                INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp)
                VALUES ($1, $2, $3, $4, NOW())
            `, [userId, action, JSON.stringify(details), ip]);
        } catch (error) {
            console.error('[AUTH-V2] Audit log background failed:', error);
        }
    })();
}

async function fetchAuthSettings() {
    const now = Date.now();
    if (now - authSettingsCache.lastFetched < SETTINGS_CACHE_TTL) {
        return authSettingsCache;
    }

    try {
        const settingsRes = await query(`
            SELECT key, value FROM app_settings 
            WHERE key IN ('SECURITY_MAX_LOGIN_ATTEMPTS', 'SECURITY_LOCKOUT_DURATION_MINUTES')
        `);
        const settingsMap = new Map(settingsRes.rows.map((row: any) => [row.key, row.value]));

        authSettingsCache.maxAttempts = parseInt(settingsMap.get('SECURITY_MAX_LOGIN_ATTEMPTS') || '5', 10);
        authSettingsCache.lockoutMinutes = parseInt(settingsMap.get('SECURITY_LOCKOUT_DURATION_MINUTES') || '15', 10);
        authSettingsCache.lastFetched = now;
    } catch (error) {
        console.error('[AUTH-V2] Failed to fetch auth settings, using defaults', error);
    }
    return authSettingsCache;
}

/**
 * Check rate limit for login attempts
 */
async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; error?: string }> {
    try {
        const { maxAttempts } = await fetchAuthSettings();
        const WINDOW_MINUTES = 10;

        const res = await query(`
            SELECT attempt_count, last_attempt, blocked_until 
            FROM login_attempts 
            WHERE identifier = $1
        `, [identifier]);

        if (res.rowCount && res.rowCount > 0) {
            const row = res.rows[0];
            const now = new Date();

            // Check if currently blocked
            if (row.blocked_until && new Date(row.blocked_until) > now) {
                const waitMinutes = Math.ceil((new Date(row.blocked_until).getTime() - now.getTime()) / 60000);
                return { allowed: false, error: `Demasiados intentos. Espere ${waitMinutes} minutos.` };
            }

            // Reset if window expired
            const lastAttemptTime = new Date(row.last_attempt);
            const timeDiffMinutes = (now.getTime() - lastAttemptTime.getTime()) / 60000;

            if (timeDiffMinutes > WINDOW_MINUTES && (!row.blocked_until || new Date(row.blocked_until) <= now)) {
                // Non-blocking update
                query('UPDATE login_attempts SET attempt_count = 0, blocked_until = NULL WHERE identifier = $1', [identifier]).catch(() => { });
            }
        }
        return { allowed: true };
    } catch (error) {
        console.error('[AUTH-V2] Rate limit check failed:', error);
        return { allowed: true }; // Fail open to not block legitimate users
    }
}

/**
 * Increment rate limit counter - SQL INJECTION FIXED
 */
async function incrementRateLimit(identifier: string): Promise<void> {
    try {
        const { maxAttempts, lockoutMinutes } = await fetchAuthSettings();

        const res = await query(`
            INSERT INTO login_attempts (identifier, attempt_count, last_attempt)
            VALUES ($1, 1, NOW())
            ON CONFLICT (identifier) DO UPDATE 
            SET attempt_count = login_attempts.attempt_count + 1,
                last_attempt = NOW()
            RETURNING attempt_count
        `, [identifier]);

        if (res.rowCount && res.rowCount > 0 && res.rows[0].attempt_count > maxAttempts) {
            await query(`
                UPDATE login_attempts 
                SET blocked_until = NOW() + make_interval(mins => $2)
                WHERE identifier = $1
            `, [identifier, lockoutMinutes]);
        }
    } catch (error) {
        console.error('[AUTH-V2] Rate limit increment failed:', error);
    }
}

/**
 * Clear rate limit on successful login
 */
async function clearRateLimit(identifier: string): Promise<void> {
    try {
        await query('DELETE FROM login_attempts WHERE identifier = $1', [identifier]);
    } catch (error) {
        console.error('[AUTH-V2] Rate limit clear failed:', error);
    }
}

// ============================================================================
// MAIN AUTHENTICATION FUNCTION
// ============================================================================

export interface AuthResult {
    success: boolean;
    user?: {
        id: string;
        name: string;
        role: string;
        assigned_location_id?: string;
        token_version: number;
        [key: string]: any;
    };
    error?: string;
}

/**
 * 🔐 Secure Authentication with bcrypt
 * 
 * @description Authenticates user with hashed PIN comparison
 * @param userId - User UUID
 * @param pin - 4-8 digit PIN
 * @param locationId - Optional location UUID for location-based access control
 * @returns AuthResult with user data or error
 */
export async function authenticateUserSecure(
    userId: string,
    pin: string,
    locationId?: string
): Promise<AuthResult> {
    const ipAddress = await getClientIP();

    // 1. Validate inputs
    const validated = AuthenticateSchema.safeParse({ userId, pin, locationId });
    if (!validated.success) {
        auditLog(userId, 'LOGIN_INVALID_INPUT', {
            error: validated.error.issues[0]?.message
        }, ipAddress); // No await
        return { success: false, error: 'Datos de autenticación inválidos' };
    }

    const { userId: uid, pin: validatedPin, locationId: locId } = validated.data;

    try {
        // 2. Combined Check: Rate Limit + User Fetch in Parallel (optimization)
        const [limitCheck, userRes] = await Promise.all([
            checkRateLimit(uid),
            query(`
                SELECT id, name, role, access_pin, access_pin_hash, 
                       assigned_location_id, token_version, is_active,
                       email, name as "fullName"
                FROM users 
                WHERE id = $1
            `, [uid])
        ]);

        if (!limitCheck.allowed) {
            auditLog(uid, 'LOGIN_BLOCKED_RATE_LIMIT', {
                reason: 'Rate limit exceeded'
            }, ipAddress); // No await
            return { success: false, error: limitCheck.error || 'Acceso bloqueado temporalmente' };
        }

        if (userRes.rowCount === 0) {
            await incrementRateLimit(uid);
            auditLog(uid, 'LOGIN_FAILED', { reason: 'User not found' }, ipAddress); // No await
            // Generic error to not reveal user existence
            return { success: false, error: 'Credenciales inválidas' };
        }

        const user = userRes.rows[0];

        // 4. Check if user is active
        if (user.is_active === false) {
            auditLog(uid, 'LOGIN_FAILED', { reason: 'User disabled' }, ipAddress); // No await
            return { success: false, error: 'Usuario deshabilitado' };
        }

        // 5. Compare PIN - Support both hashed and legacy plaintext
        let pinValid = false;

        if (user.access_pin_hash) {
            // New secure method: bcrypt comparison
            const bcrypt = await import('bcryptjs');
            pinValid = await bcrypt.compare(validatedPin, user.access_pin_hash);
        } else if (user.access_pin) {
            // Legacy fallback: plaintext comparison (will be deprecated)
            // Use timing-safe comparison to prevent timing attacks
            const crypto = await import('crypto');
            const inputBuffer = Buffer.from(validatedPin);
            const storedBuffer = Buffer.from(user.access_pin);

            if (inputBuffer.length === storedBuffer.length) {
                pinValid = crypto.timingSafeEqual(inputBuffer, storedBuffer);
            }

            // Log warning about plaintext PIN
            console.warn(`[AUTH-V2] User ${uid} using legacy plaintext PIN. Migration required.`);
        }

        if (!pinValid) {
            await incrementRateLimit(uid);
            auditLog(uid, 'LOGIN_FAILED', { reason: 'Invalid PIN' }, ipAddress); // No await
            return { success: false, error: 'Credenciales inválidas' };
        }

        // 6. Location authorization check
        if (locId) {
            const role = (user.role || '').toUpperCase();
            const isGlobalRole = GLOBAL_ROLES.includes(role);

            console.log(`[AUTH-DEBUG] User: ${user.name}, Role: ${role}, Global: ${isGlobalRole}, Assigned: ${user.assigned_location_id}, Requested: ${locId}`);

            if (!isGlobalRole && user.assigned_location_id && user.assigned_location_id !== locId) {
                console.log('[AUTH-DEBUG] Location Mismatch Blocked');
                await auditLog(uid, 'LOGIN_BLOCKED_LOCATION', {
                    attempted: locId,
                    assigned: user.assigned_location_id
                }, ipAddress);
                return { success: false, error: 'No tienes contrato en esta sucursal' };
            }
        }

        await Promise.all([
            // 7. Update session data
            query(`
                UPDATE users 
                SET last_active_at = NOW(),
                    last_login_at = NOW(),
                    last_login_ip = $2,
                    current_context_data = $3,
                    token_version = COALESCE(token_version, 1)
                WHERE id = $1
            `, [uid, ipAddress, JSON.stringify({ location_id: locId || 'HQ' })]),

            // 8. Clear rate limit on success
            clearRateLimit(uid),

            // 9. Audit successful login
            auditLog(uid, 'LOGIN_SUCCESS', {
                role: user.role,
                location: locId,
                method: user.access_pin_hash ? 'bcrypt' : 'legacy'
            }, ipAddress)
        ]);

        // 10. Set session cookies for RBAC validation in server actions
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        cookieStore.set('user_id', uid, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 // 24 hours
        });
        cookieStore.set('user_role', user.role, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 // 24 hours
        });

        // 11. Return user (without sensitive data)
        return {
            success: true,
            user: {
                id: user.id,
                name: user.name || user.fullName,
                role: user.role,
                assigned_location_id: user.assigned_location_id,
                token_version: user.token_version || 1,
                email: user.email
            }
        };

    } catch (error) {
        console.error('[AUTH-V2] Authentication error:', error);
        await auditLog(uid, 'LOGIN_ERROR', { error: 'Server error' }, ipAddress);
        return { success: false, error: 'Error de servidor' };
    }
}

// ============================================================================
// PIN MANAGEMENT
// ============================================================================

/**
 * 🔑 Set user PIN with bcrypt hashing
 * 
 * @description Hashes and stores PIN securely. Only admins can set PINs.
 * @param userId - Target user UUID
 * @param newPin - New 4-8 digit PIN
 * @param adminId - Admin user performing the operation
 */
export async function setUserPinSecure(
    userId: string,
    newPin: string,
    adminId: string
): Promise<{ success: boolean; error?: string }> {
    // Validate inputs
    const validated = SetPinSchema.safeParse({ userId, newPin, adminId });
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message || 'Datos inválidos' };
    }

    try {
        // Verify admin permissions
        const adminRes = await query('SELECT role FROM users WHERE id = $1', [adminId]);
        if (adminRes.rowCount === 0) {
            return { success: false, error: 'Administrador no encontrado' };
        }

        const adminRole = adminRes.rows[0].role?.toUpperCase();
        if (!ADMIN_ROLES.includes(adminRole)) {
            await auditLog(adminId, 'PIN_CHANGE_DENIED', {
                target_user: userId,
                reason: 'Insufficient permissions'
            });
            return { success: false, error: 'Sin permisos para cambiar PIN' };
        }

        // Hash the PIN
        const bcrypt = await import('bcryptjs');
        const hashedPin = await bcrypt.hash(newPin, BCRYPT_ROUNDS);

        // Update user
        await query(`
            UPDATE users 
            SET access_pin_hash = $1,
                access_pin = NULL
            WHERE id = $2
        `, [hashedPin, userId]);

        // Audit
        await auditLog(adminId, 'PIN_CHANGED', {
            target_user: userId,
            method: 'bcrypt'
        });

        return { success: true };

    } catch (error) {
        console.error('[AUTH-V2] Set PIN error:', error);
        return { success: false, error: 'Error al actualizar PIN' };
    }
}

/**
 * 🔄 Migrate legacy plaintext PIN to bcrypt hash
 * 
 * @description For self-service PIN migration during login
 */
export async function migratePinToHash(
    userId: string,
    currentPin: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Verify current PIN
        const res = await query('SELECT access_pin, access_pin_hash FROM users WHERE id = $1', [userId]);

        if (res.rowCount === 0) {
            return { success: false, error: 'Usuario no encontrado' };
        }

        const user = res.rows[0];

        // Skip if already migrated
        if (user.access_pin_hash) {
            return { success: true }; // Already secure
        }

        // Verify plaintext PIN
        if (user.access_pin !== currentPin) {
            return { success: false, error: 'PIN incorrecto' };
        }

        // Hash and update
        const bcrypt = await import('bcryptjs');
        const hashedPin = await bcrypt.hash(currentPin, BCRYPT_ROUNDS);

        await query(`
            UPDATE users 
            SET access_pin_hash = $1,
                access_pin = NULL
            WHERE id = $2
        `, [hashedPin, userId]);

        await auditLog(userId, 'PIN_MIGRATED', { method: 'self-service' });

        return { success: true };

    } catch (error) {
        console.error('[AUTH-V2] PIN migration error:', error);
        return { success: false, error: 'Error migrando PIN' };
    }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * 🔴 Revoke Session with permission check
 * 
 * @description Remote logout with admin verification
 */
export async function revokeSessionSecure(
    targetUserId: string,
    adminUserId: string
): Promise<{ success: boolean; error?: string }> {
    // Validate inputs
    const validated = RevokeSessionSchema.safeParse({ targetUserId, adminUserId });
    if (!validated.success) {
        return { success: false, error: 'Datos inválidos' };
    }

    try {
        // Verify admin permissions
        const adminRes = await query('SELECT role, name FROM users WHERE id = $1', [adminUserId]);
        if (adminRes.rowCount === 0) {
            return { success: false, error: 'Administrador no encontrado' };
        }

        const adminRole = adminRes.rows[0].role?.toUpperCase();
        if (!ADMIN_ROLES.includes(adminRole)) {
            await auditLog(adminUserId, 'REVOKE_SESSION_DENIED', {
                target_user: targetUserId,
                reason: 'Insufficient permissions'
            });
            return { success: false, error: 'Sin permisos para revocar sesiones' };
        }

        // Get target user info for audit
        const targetRes = await query('SELECT name, role FROM users WHERE id = $1', [targetUserId]);
        const targetName = targetRes.rows[0]?.name || 'Unknown';

        // Increment token_version to invalidate all sessions
        await query(`
            UPDATE users 
            SET token_version = COALESCE(token_version, 1) + 1 
            WHERE id = $1
        `, [targetUserId]);

        // Audit
        await auditLog(adminUserId, 'SESSION_REVOKED', {
            target_user: targetUserId,
            target_name: targetName,
            admin_name: adminRes.rows[0].name
        });

        revalidatePath('/settings');
        return { success: true };

    } catch (error) {
        console.error('[AUTH-V2] Revoke session error:', error);
        return { success: false, error: 'Error revocando sesión' };
    }
}

/**
 * 🕵️ Verify session validity
 */
export async function verifySessionSecure(
    userId: string,
    clientTokenVersion: number,
    contextData?: Record<string, any>
): Promise<{ valid: boolean; error?: string }> {
    // Validate UUID
    const uuidSchema = z.string().uuid();
    if (!uuidSchema.safeParse(userId).success) {
        return { valid: false, error: 'ID de usuario inválido' };
    }

    try {
        const res = await query('SELECT token_version, role, is_active FROM users WHERE id = $1', [userId]);

        if (res.rowCount === 0) {
            return { valid: false, error: 'Usuario no encontrado' };
        }

        const user = res.rows[0];

        // Check if user is active
        if (user.is_active === false) {
            return { valid: false, error: 'Usuario deshabilitado' };
        }

        // Check token version
        if (Number(user.token_version) > Number(clientTokenVersion)) {
            return { valid: false, error: 'Sesión revocada remotamente' };
        }

        // Update activity
        await query(`
            UPDATE users 
            SET last_active_at = NOW(),
                current_context_data = $2
            WHERE id = $1
        `, [userId, JSON.stringify(contextData || {})]);

        return { valid: true };

    } catch (error) {
        console.error('[AUTH-V2] Session verification error:', error);
        return { valid: false, error: 'Error verificando sesión' };
    }
}

// ============================================================================
// SUPERVISOR PIN VALIDATION
// ============================================================================

/**
 * 🔐 Validate Supervisor PIN for Authorization
 * 
 * @description Validates a supervisor's PIN without revealing user existence.
 * Used for operations that require manager/admin authorization.
 * 
 * @param pin - 4-8 digit PIN to validate
 * @param action - Action being authorized (for audit logging)
 * @returns Result with supervisor ID and name if valid
 */
export async function validateSupervisorPin(
    pin: string,
    action: string = 'SUPERVISOR_AUTH',
    preferredUserId?: string
): Promise<{
    success: boolean;
    supervisorId?: string;
    supervisorName?: string;
    error?: string;
}> {
    // Validate PIN format
    const pinSchema = z.string()
        .min(4, 'PIN debe tener al menos 4 dígitos')
        .max(8, 'PIN no puede exceder 8 dígitos')
        .regex(/^\d+$/, 'PIN debe contener solo números');

    const validated = pinSchema.safeParse(pin);
    if (!validated.success) {
        return { success: false, error: 'Formato de PIN inválido' };
    }

    try {
        // Fetch all supervisors (MANAGER, ADMIN, GERENTE_GENERAL)
        const supervisors = await query(`
            SELECT id, name, access_pin, access_pin_hash, role
            FROM users 
            WHERE role IN ('MANAGER', 'ADMIN', 'GERENTE_GENERAL')
            AND is_active = true
        `);

        if (supervisors.rowCount === 0) {
            return { success: false, error: 'No hay supervisores configurados' };
        }

        // Sort to prioritize preferred user
        const sortedSupervisors = supervisors.rows.sort((a, b) => {
            if (a.id === preferredUserId) return -1;
            if (b.id === preferredUserId) return 1;
            return 0;
        });

        // Try to match PIN with any supervisor
        for (const supervisor of sortedSupervisors) {
            let pinValid = false;

            if (supervisor.access_pin_hash) {
                // Secure: bcrypt comparison
                const bcrypt = await import('bcryptjs');
                pinValid = await bcrypt.compare(pin, supervisor.access_pin_hash);
            } else if (supervisor.access_pin) {
                // Legacy: timing-safe plaintext comparison
                const crypto = await import('crypto');
                const inputBuffer = Buffer.from(pin);
                const storedBuffer = Buffer.from(supervisor.access_pin);

                if (inputBuffer.length === storedBuffer.length) {
                    pinValid = crypto.timingSafeEqual(inputBuffer, storedBuffer);
                }
            }

            if (pinValid) {
                // Audit successful validation
                await auditLog(supervisor.id, action, {
                    authorized: true,
                    method: supervisor.access_pin_hash ? 'bcrypt' : 'legacy'
                });

                return {
                    success: true,
                    supervisorId: supervisor.id,
                    supervisorName: supervisor.name
                };
            }
        }

        // No match found
        await auditLog('SYSTEM', 'SUPERVISOR_PIN_FAILED', {
            action,
            reason: 'Invalid PIN'
        });

        return { success: false, error: 'PIN de autorización inválido' };

    } catch (error) {
        console.error('[AUTH-V2] Supervisor PIN validation error:', error);
        return { success: false, error: 'Error validando PIN' };
    }
}

// ============================================================================
// SESSION HELPER (CENTRALIZED)
// ============================================================================

/**
 * 🕵️ Get Session Secure (Cookies + Headers)
 * 
 * @description Retrieves current session from cookies (primary) or headers (fallback).
 * Critical for RBAC in Server Actions.
 */
export async function getSessionSecure(): Promise<{ userId: string; role: string; locationId?: string; userName?: string } | null> {
    try {
        const { cookies, headers } = await import('next/headers');

        // 1. Try Cookies (Primary for Web UI)
        const cookieStore = await cookies();
        const userIdCookie = cookieStore.get('user_id')?.value;
        const userRoleCookie = cookieStore.get('user_role')?.value;
        const userNameCookie = cookieStore.get('user_name')?.value;

        if (userIdCookie && userRoleCookie) {
            return {
                userId: userIdCookie,
                role: (userRoleCookie || 'USER').toUpperCase(),
                userName: userNameCookie
            };
        }

        // 2. Try Headers (Fallback for Mobile/API/Middleware propagation)
        const headersList = await headers();
        const userIdHeader = headersList.get('x-user-id');
        const roleHeader = headersList.get('x-user-role');
        const locHeader = headersList.get('x-user-location');
        const nameHeader = headersList.get('x-user-name');

        if (userIdHeader && roleHeader) {
            return {
                userId: userIdHeader,
                role: roleHeader.toUpperCase(),
                locationId: locHeader || undefined,
                userName: nameHeader || undefined
            };
        }

        return null;
    } catch (error) {
        console.error('[AUTH-V2] Session retrieval error:', error);
        return null;
    }
}

// ============================================================================
// EXPORTS FOR BACKWARDS COMPATIBILITY
// ============================================================================

/**
 * @deprecated Use authenticateUserSecure instead
 * NOTE: Commented out for Next.js 16 compatibility - "use server" files can only export async functions
 * If you need this alias, import authenticateUserSecure directly or create a re-export file without "use server"
 */
// export const authenticateUser = authenticateUserSecure;
