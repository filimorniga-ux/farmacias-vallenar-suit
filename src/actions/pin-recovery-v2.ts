'use server';

/**
 * ============================================================================
 * PIN-RECOVERY: Recuperación de PIN de acceso por administrador
 * El admin solicita un PIN temporal, que llega al Correo Maestro.
 * ============================================================================
 */

import { query, pool } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { sendPinResetEmail } from '@/lib/mailer';
import bcrypt from 'bcryptjs';

const UUIDOrVarcharSchema = z.string().min(1);

// Genera un PIN numérico de 6 dígitos
function generateTemporaryPin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 📲 Solicitar PIN Temporal para un usuario (Solo ADMIN / GERENTE_GENERAL)
 * - El PIN temporal se envía al Correo Maestro de Recuperación
 * - El usuario deberá cambiar el PIN al primer login
 */
export async function requestPinReset(
    targetUserId: string,
    adminPin: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDOrVarcharSchema.safeParse(targetUserId).success) {
        return { success: false, error: 'ID de usuario inválido' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Validar PIN del admin solicitante
        const adminsRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users
            WHERE role IN ('ADMIN', 'GERENTE_GENERAL') AND is_active = true
        `);

        let adminUser: { id: string; name: string } | null = null;

        for (const admin of adminsRes.rows) {
            if (admin.access_pin_hash) {
                const valid = await bcrypt.compare(adminPin, admin.access_pin_hash);
                if (valid) {
                    adminUser = { id: admin.id, name: admin.name };
                    break;
                }
            } else if (admin.access_pin === adminPin) {
                adminUser = { id: admin.id, name: admin.name };
                break;
            }
        }

        if (!adminUser) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador incorrecto' };
        }

        // 2. Obtener datos del usuario destino
        const userRes = await client.query(
            'SELECT id, name, role, email FROM users WHERE id = $1 AND is_active = true',
            [targetUserId]
        );

        if ((userRes.rowCount ?? 0) === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado o inactivo' };
        }

        const targetUser = userRes.rows[0];

        // 3. Obtener Correo Maestro de Recuperación desde configuración
        const configRes = await client.query(
            `SELECT value FROM system_settings WHERE key = 'master_recovery_email' LIMIT 1`
        );

        const masterEmail = configRes.rows[0]?.value || targetUser.email;

        if (!masterEmail) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No hay Correo Maestro configurado en Ajustes' };
        }

        // 4. Invalidar PINs temporales anteriores para este usuario
        await client.query('DELETE FROM pin_resets WHERE user_id = $1', [targetUserId]);

        // 5. Generar PIN temporal y guardarlo
        const temporaryPin = generateTemporaryPin();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

        await client.query(`
            INSERT INTO pin_resets (user_id, temporary_pin, expires_at, created_by)
            VALUES ($1, $2, $3, $4)
        `, [targetUserId, temporaryPin, expiresAt, adminUser.id]);

        // 6. Enviar email al Correo Maestro
        const emailResult = await sendPinResetEmail({
            masterEmail,
            targetUserName: targetUser.name,
            targetUserRole: targetUser.role,
            temporaryPin,
            expiresAt,
            requestedBy: adminUser.name,
        });

        if (!emailResult.success) {
            // Si el email falló, revertir para no dejar PIN huérfano
            await client.query('ROLLBACK');
            logger.error({ error: emailResult.error }, '[PinRecovery] Email send failed');
            return { success: false, error: 'Error enviando el correo. Verifica la config de email.' };
        }

        // 7. Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'PIN_RESET_REQUESTED', 'USERS', $2, $3::jsonb, NOW())
        `, [adminUser.id, targetUserId, JSON.stringify({
            target_user: targetUser.name,
            master_email: masterEmail,
            expires_at: expiresAt.toISOString(),
        })]);

        await client.query('COMMIT');

        logger.info({
            targetUserId,
            adminId: adminUser.id,
            masterEmail,
        }, '🔐 [PinRecovery] Temporary PIN sent');

        return { success: true };

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[PinRecovery] requestPinReset failed');
        return { success: false, error: 'Error procesando solicitud' };
    } finally {
        client.release();
    }
}

/**
 * 🔑 Verificar si el PIN del usuario es un PIN temporal
 * Se usa en el login para forzar el cambio inmediato
 */
export async function checkIfIsPinTemporary(
    userId: string,
    pin: string
): Promise<{ isTemporary: boolean }> {
    try {
        const res = await query(`
            SELECT id FROM pin_resets
            WHERE user_id = $1
              AND temporary_pin = $2
              AND expires_at > NOW()
              AND used_at IS NULL
        `, [userId, pin]);

        return { isTemporary: (res.rowCount ?? 0) > 0 };
    } catch {
        return { isTemporary: false };
    }
}

/**
 * ✅ Aplicar el cambio de PIN (cuando usuario ingresa con PIN temporal)
 * Fuerza al usuario a crear un PIN nuevo permanente
 */
export async function applyPinReset(
    userId: string,
    temporaryPin: string,
    newPin: string
): Promise<{ success: boolean; error?: string }> {
    if (!newPin || newPin.length < 4) {
        return { success: false, error: 'El PIN debe tener al menos 4 dígitos' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar que el PIN temporal sea válido
        const resetRes = await client.query(`
            SELECT id FROM pin_resets
            WHERE user_id = $1
              AND temporary_pin = $2
              AND expires_at > NOW()
              AND used_at IS NULL
            FOR UPDATE
        `, [userId, temporaryPin]);

        if ((resetRes.rowCount ?? 0) === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN temporal inválido o expirado' };
        }

        const pinResetId = resetRes.rows[0].id;

        // Hash del nuevo PIN
        const newPinHash = await bcrypt.hash(newPin, 12);

        // Actualizar el PIN del usuario
        await client.query(`
            UPDATE users
            SET access_pin = $1, access_pin_hash = $2, updated_at = NOW()
            WHERE id = $3
        `, [newPin, newPinHash, userId]);

        // Marcar el PIN temporal como usado
        await client.query(`
            UPDATE pin_resets SET used_at = NOW() WHERE id = $1
        `, [pinResetId]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'PIN_RESET_APPLIED', 'USERS', $2::jsonb, NOW())
        `, [userId, JSON.stringify({ method: 'temporary_pin' })]);

        await client.query('COMMIT');

        logger.info({ userId }, '✅ [PinRecovery] PIN changed successfully');
        return { success: true };

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[PinRecovery] applyPinReset failed');
        return { success: false, error: 'Error actualizando PIN' };
    } finally {
        client.release();
    }
}
