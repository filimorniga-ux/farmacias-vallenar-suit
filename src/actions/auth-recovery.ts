'use server';

import { query } from '@/lib/db';
import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { logAuditAction } from './security'; // Audit Logger
import crypto from 'crypto';
import { getGlobalSetting } from './settings';

// --- Configuration ---
// In a real app, use environment variables for SMTP
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.ethereal.email';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || 'user';
const SMTP_PASS = process.env.SMTP_PASS || 'pass';

/**
 * 📧 Forgot Password Action
 * Generates a reset token and sends it via email (simulated in Dev).
 */
export async function forgotPassword(email: string): Promise<{ success: boolean; message: string; error?: string }> {
    try {
        const cleanEmail = email.trim().toLowerCase();

        // 1. Verify User Exists
        const userRes = await query('SELECT id, name FROM users WHERE lower(email) = $1', [cleanEmail]);

        if (userRes.rowCount === 0) {
            const adminEmail = await getGlobalSetting('ADMIN_EMAIL');
            // Log for dev/audit
            console.log(`[AUTH-RECOVERY] User not found (${cleanEmail}). Alerting Admin at: ${adminEmail} (simulated)`);
            return { success: true, message: 'Si el correo existe, recibirás un enlace de recuperación.' };
        }

        const user = userRes.rows[0];

        // 2. Generate Token
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 Hour Expiration

        // 3. Store in DB
        await query('DELETE FROM password_resets WHERE email = $1', [cleanEmail]);
        await query(
            'INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)',
            [cleanEmail, token, expiresAt]
        );

        // 4. Send Email (Simulation / Transport)
        // Retrieve Dynamic Admin Email from DB
        const adminEmail = await getGlobalSetting('ADMIN_EMAIL') || 'soporte@farmaciasvallenar.cl'; // Fallback

        const resetLink = `http://localhost:3000/reset-password/${token}`;

        console.log('---------------------------------------------------');
        console.log(`📧 SENDING RECOVERY EMAIL TO: ${cleanEmail}`);
        console.log(`👤 USER: ${user.name}`);
        console.log(`👑 ADMIN ALERT COPY TO: ${adminEmail}`);
        console.log(`🔗 LINK: ${resetLink}`);
        console.log('---------------------------------------------------');

        // Audit
        await logAuditAction(user.id, 'RECOVERY_TOKEN_GENERATED', { method: 'email' });

        return { success: true, message: 'Enlace de recuperación enviado.' };

    } catch (error) {
        console.error('Forgot Password Error:', error);
        return { success: false, message: 'Error al procesar solicitud.', error: String(error) };
    }
}

/**
 * 🔑 Reset Password Action
 * Validates token and updates user password.
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string; error?: string }> {
    try {
        // 1. Validate Token
        const tokenRes = await query(
            'SELECT email FROM password_resets WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (tokenRes.rowCount === 0) {
            return { success: false, message: 'Enlace inválido o expirado.', error: 'Invalid Token' };
        }

        const email = tokenRes.rows[0].email;

        // 2. Update User Password
        // In real world: Hash password here.
        // For this demo: using plain text or simple hash? 
        // Existing seed uses: crypto.createHash('sha256').update(pin).digest('hex') for PINs.
        // Let's use generic hash for password.
        const hashedPassword = crypto.createHash('sha256').update(newPassword).digest('hex');

        await query('UPDATE users SET password = $1 WHERE lower(email) = $2 RETURNING id', [hashedPassword, email]);

        // Get User ID for audit
        const userRes = await query('SELECT id FROM users WHERE lower(email) = $1', [email]);
        const userId = userRes.rows[0]?.id;

        // 3. Delete Used Token
        await query('DELETE FROM password_resets WHERE email = $1', [email]);

        // Audit
        await logAuditAction(userId, 'PASSWORD_RESET_SUCCESS', { method: 'token' });

        return { success: true, message: 'Contraseña actualizada correctamente.' };

    } catch (error) {
        console.error('Reset Password Error:', error);
        return { success: false, message: 'Error al actualizar contraseña.', error: String(error) };
    }
}
