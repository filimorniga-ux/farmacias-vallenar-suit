'use server';

/**
 * ============================================================================
 * AUTH-RECOVERY-V2: Recuperación Segura de Contraseñas
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIÓN CRÍTICA:
 * - bcrypt para hash de passwords (NO SHA256)
 * - crypto.randomBytes para tokens (más seguro que UUID)
 * - Rate limit: 3 intentos por email por hora
 * - Validación de password: min 8 chars, 1 mayúscula, 1 número
 * - Mismo mensaje si email existe o no (anti-enumeration)
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const EmailSchema = z.string().email('Email inválido').max(255);

const PasswordSchema = z.string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[a-z]/, 'Debe contener al menos una minúscula');

const TokenSchema = z.string().min(32).max(128);

const UUIDSchema = z.string().uuid('ID inválido');

// ============================================================================
// CONSTANTS
// ============================================================================

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRY_HOURS = 1;
const RATE_LIMIT_PER_HOUR = 3;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'https://farmacias.vallenar.cl';

// Rate limiting en memoria
const recoveryRateLimit = new Map<string, { count: number; resetAt: number }>();

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Genera token criptográficamente seguro
 */
function generateSecureToken(): string {
    return randomBytes(32).toString('hex'); // 64 chars hex
}

/**
 * Verificar rate limit para email
 */
function checkEmailRateLimit(email: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const key = `recovery:${email.toLowerCase()}`;
    const entry = recoveryRateLimit.get(key);

    if (!entry || now > entry.resetAt) {
        recoveryRateLimit.set(key, { count: 1, resetAt: now + 3600000 }); // 1 hora
        return { allowed: true };
    }

    if (entry.count >= RATE_LIMIT_PER_HOUR) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000 / 60);
        return { allowed: false, retryAfter };
    }

    entry.count++;
    return { allowed: true };
}

async function auditRecoveryAction(userId: string | null, action: string, details: Record<string, any>): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, $2, 'AUTH_RECOVERY', $3::jsonb, NOW())
        `, [userId, action, JSON.stringify(details)]);
    } catch (error) {
        logger.warn({ error }, '[AuthRecovery] Audit failed');
    }
}

// ============================================================================
// FORGOT PASSWORD
// ============================================================================

/**
 * 📧 Solicitar Recuperación de Contraseña
 * - Rate limited
 * - Anti-enumeration (mismo mensaje si existe o no)
 */
export async function forgotPasswordSecure(
    email: string
): Promise<{ success: boolean; message: string }> {
    // Validar email
    const emailValidation = EmailSchema.safeParse(email);
    if (!emailValidation.success) {
        return { success: false, message: 'Email inválido' };
    }

    const cleanEmail = email.trim().toLowerCase();

    // Rate limit
    const rateCheck = checkEmailRateLimit(cleanEmail);
    if (!rateCheck.allowed) {
        logger.warn({ email: cleanEmail }, '[AuthRecovery] Rate limit exceeded');
        // NO revelar que existe rate limiting específico
        return {
            success: true,
            message: 'Si el correo existe, recibirás un enlace de recuperación.',
        };
    }

    try {
        // Buscar usuario (sin revelar si existe)
        const userRes = await query('SELECT id, name FROM users WHERE LOWER(email) = $1', [cleanEmail]);

        // SIEMPRE retornar el mismo mensaje (anti-enumeration)
        const genericMessage = 'Si el correo existe, recibirás un enlace de recuperación.';

        if (userRes.rowCount === 0) {
            logger.info({ email: cleanEmail }, '[AuthRecovery] User not found (no leak)');
            await auditRecoveryAction(null, 'RECOVERY_ATTEMPT_UNKNOWN_EMAIL', { email: cleanEmail });
            return { success: true, message: genericMessage };
        }

        const user = userRes.rows[0];

        // Generar token seguro
        const token = generateSecureToken();
        const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

        // Eliminar tokens anteriores y crear nuevo
        await query('DELETE FROM password_resets WHERE email = $1', [cleanEmail]);
        await query(
            'INSERT INTO password_resets (email, token, expires_at, created_at) VALUES ($1, $2, $3, NOW())',
            [cleanEmail, token, expiresAt]
        );

        // Generar link
        const resetLink = `${BASE_URL}/reset-password/${token}`;

        // TODO: Enviar email real con nodemailer
        logger.info({
            email: cleanEmail,
            userId: user.id,
            resetLink,
            expiresAt,
        }, '📧 [AuthRecovery] Token generated');

        await auditRecoveryAction(user.id, 'RECOVERY_TOKEN_GENERATED', {
            email: cleanEmail,
            expires_at: expiresAt.toISOString(),
        });

        return { success: true, message: genericMessage };

    } catch (error: any) {
        logger.error({ error }, '[AuthRecovery] Forgot password error');
        return { success: false, message: 'Error procesando solicitud' };
    }
}

// ============================================================================
// RESET PASSWORD
// ============================================================================

/**
 * 🔑 Resetear Contraseña
 * - Usa bcrypt (NO SHA256)
 * - Valida complejidad
 */
export async function resetPasswordSecure(
    token: string,
    newPassword: string
): Promise<{ success: boolean; message: string }> {
    // Validar token
    const tokenValidation = TokenSchema.safeParse(token);
    if (!tokenValidation.success) {
        return { success: false, message: 'Token inválido' };
    }

    // Validar complejidad de password
    const passwordValidation = PasswordSchema.safeParse(newPassword);
    if (!passwordValidation.success) {
        return {
            success: false,
            message: passwordValidation.error.issues[0]?.message || 'Contraseña insegura',
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Buscar token válido
        const tokenRes = await client.query(`
            SELECT email FROM password_resets 
            WHERE token = $1 AND expires_at > NOW()
            FOR UPDATE
        `, [token]);

        if (tokenRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Enlace inválido o expirado' };
        }

        const email = tokenRes.rows[0].email;

        // Hash con bcrypt (CRÍTICO: NO usar SHA256)
        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        // Actualizar contraseña
        const updateRes = await client.query(`
            UPDATE users SET password = $1, updated_at = NOW()
            WHERE LOWER(email) = $2
            RETURNING id
        `, [hashedPassword, email]);

        if (updateRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Usuario no encontrado' };
        }

        const userId = updateRes.rows[0].id;

        // Eliminar token usado
        await client.query('DELETE FROM password_resets WHERE email = $1', [email]);

        // Incrementar token_version para invalidar sesiones
        await client.query(`
            UPDATE users SET token_version = COALESCE(token_version, 0) + 1
            WHERE id = $1
        `, [userId]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'PASSWORD_RESET_SUCCESS', 'AUTH_RECOVERY', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ method: 'token', email })]);

        await client.query('COMMIT');

        logger.info({ userId, email }, '🔑 [AuthRecovery] Password reset successful');
        return { success: true, message: 'Contraseña actualizada correctamente' };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[AuthRecovery] Reset password error');
        return { success: false, message: 'Error actualizando contraseña' };
    } finally {
        client.release();
    }
}

// ============================================================================
// VALIDATE TOKEN
// ============================================================================

/**
 * ✅ Validar Token sin Resetear
 */
export async function validateResetToken(
    token: string
): Promise<{ valid: boolean; email?: string; expiresAt?: Date }> {
    const tokenValidation = TokenSchema.safeParse(token);
    if (!tokenValidation.success) {
        return { valid: false };
    }

    try {
        const res = await query(`
            SELECT email, expires_at FROM password_resets
            WHERE token = $1 AND expires_at > NOW()
        `, [token]);

        if (res.rowCount === 0) {
            return { valid: false };
        }

        return {
            valid: true,
            email: res.rows[0].email,
            expiresAt: res.rows[0].expires_at,
        };

    } catch (error) {
        logger.error({ error }, '[AuthRecovery] Validate token error');
        return { valid: false };
    }
}

// ============================================================================
// REVOKE ALL TOKENS (ADMIN)
// ============================================================================

/**
 * 🚫 Revocar Todos los Tokens de un Usuario (Solo ADMIN)
 */
export async function revokeAllTokensSecure(
    userId: string,
    adminPin: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'ID inválido' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN de admin
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');

        const adminsRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role IN ('ADMIN', 'GERENTE_GENERAL') AND is_active = true
        `);

        let validAdmin: { id: string; name: string } | null = null;

        for (const admin of adminsRes.rows) {
            const rateCheck = checkRateLimit(admin.id);
            if (!rateCheck.allowed) continue;

            if (admin.access_pin_hash) {
                const valid = await bcrypt.compare(adminPin, admin.access_pin_hash);
                if (valid) {
                    resetAttempts(admin.id);
                    validAdmin = { id: admin.id, name: admin.name };
                    break;
                }
                recordFailedAttempt(admin.id);
            } else if (admin.access_pin === adminPin) {
                resetAttempts(admin.id);
                validAdmin = { id: admin.id, name: admin.name };
                break;
            }
        }

        if (!validAdmin) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador inválido' };
        }

        // Obtener email del usuario
        const userRes = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (userRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado' };
        }

        const userEmail = userRes.rows[0].email;

        // Eliminar tokens
        const deleteRes = await client.query('DELETE FROM password_resets WHERE email = $1', [userEmail.toLowerCase()]);

        // Incrementar token_version
        await client.query(`
            UPDATE users SET token_version = COALESCE(token_version, 0) + 1
            WHERE id = $1
        `, [userId]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'TOKENS_REVOKED', 'AUTH_RECOVERY', $2, $3::jsonb, NOW())
        `, [validAdmin.id, userId, JSON.stringify({
            target_user: userId,
            tokens_deleted: deleteRes.rowCount,
            admin_name: validAdmin.name,
        })]);

        await client.query('COMMIT');

        logger.info({ userId, adminId: validAdmin.id }, '🚫 [AuthRecovery] All tokens revoked');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[AuthRecovery] Revoke tokens error');
        return { success: false, error: 'Error revocando tokens' };
    } finally {
        client.release();
    }
}
