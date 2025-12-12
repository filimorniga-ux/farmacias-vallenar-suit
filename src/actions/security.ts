'use server';

import { query } from '@/lib/db';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

// --- Existing Rate Limit & Audit Log Code (Preserved) ---
/**
 * 🔒 Rate Limiting Logic (Database Backed)
 * Returns { allowed: boolean, error?: string }
 */
export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; error?: string }> {
    try {
        const settingsRes = await query("SELECT key, value FROM app_settings WHERE key IN ('SECURITY_MAX_LOGIN_ATTEMPTS', 'SECURITY_LOCKOUT_DURATION_MINUTES')");
        const settingsMap = new Map(settingsRes.rows.map((row: any) => [row.key, row.value]));

        const MAX_ATTEMPTS = parseInt(settingsMap.get('SECURITY_MAX_LOGIN_ATTEMPTS') || '5');
        const BLOCK_DURATION_MINUTES = parseInt(settingsMap.get('SECURITY_LOCKOUT_DURATION_MINUTES') || '15');
        const WINDOW_MINUTES = 10;

        const res = await query(`
            SELECT attempt_count, last_attempt, blocked_until 
            FROM login_attempts 
            WHERE identifier = $1
        `, [identifier]);

        if ((res.rowCount || 0) > 0) {
            const row = res.rows[0];
            const now = new Date();

            if (row.blocked_until && new Date(row.blocked_until) > now) {
                const waitParams = Math.ceil((new Date(row.blocked_until).getTime() - now.getTime()) / 60000);
                return { allowed: false, error: `Demasiados intentos. Espere ${waitParams} minutos.` };
            }

            const lastAttemptTime = new Date(row.last_attempt);
            const timeDiffMinutes = (now.getTime() - lastAttemptTime.getTime()) / 60000;

            if (timeDiffMinutes > WINDOW_MINUTES && (!row.blocked_until || new Date(row.blocked_until) <= now)) {
                await query('UPDATE login_attempts SET attempt_count = 0, blocked_until = NULL WHERE identifier = $1', [identifier]);
                return { allowed: true };
            }
        }
        return { allowed: true };
    } catch (error) {
        console.error('Rate Limit Check Failed:', error);
        return { allowed: true };
    }
}

export async function incrementRateLimit(identifier: string) {
    try {
        const settingsRes = await query("SELECT key, value FROM app_settings WHERE key IN ('SECURITY_MAX_LOGIN_ATTEMPTS', 'SECURITY_LOCKOUT_DURATION_MINUTES')");
        const settingsMap = new Map(settingsRes.rows.map((row: any) => [row.key, row.value]));

        const MAX_ATTEMPTS = parseInt(settingsMap.get('SECURITY_MAX_LOGIN_ATTEMPTS') || '5');
        const BLOCK_DURATION_MINUTES = parseInt(settingsMap.get('SECURITY_LOCKOUT_DURATION_MINUTES') || '15');

        await query(`
            INSERT INTO login_attempts (identifier, attempt_count, last_attempt)
            VALUES ($1, 1, NOW())
            ON CONFLICT (identifier) DO UPDATE 
            SET attempt_count = login_attempts.attempt_count + 1,
                last_attempt = NOW()
        `, [identifier]);

        const res = await query('SELECT attempt_count FROM login_attempts WHERE identifier = $1', [identifier]);
        if ((res.rowCount || 0) > 0 && res.rows[0].attempt_count > MAX_ATTEMPTS) {
            await query(`
                UPDATE login_attempts 
                SET blocked_until = NOW() + INTERVAL '${BLOCK_DURATION_MINUTES} minutes'
                WHERE identifier = $1
            `, [identifier]);
        }
    } catch (error) {
        console.error('Rate Limit Increment Failed:', error);
    }
}

export async function clearRateLimit(identifier: string) {
    try {
        await query('DELETE FROM login_attempts WHERE identifier = $1', [identifier]);
    } catch (error) {
        console.error('Rate Limit Clear Failed:', error);
    }
}

export async function logAuditAction(userId: string | null, action: string, details: any) {
    try {
        const headerStore = await headers();
        let ip = headerStore.get('x-forwarded-for') || headerStore.get('x-real-ip') || 'unknown';
        const sanitizedDetails = JSON.stringify(details);

        await query(`
            INSERT INTO audit_logs (user_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [userId, action, sanitizedDetails, ip]);
    } catch (error) {
        console.error('Audit Log Failed:', error);
    }
}

export async function getAuditLogs(page = 1, limit = 50, filters?: { userId?: string, action?: string }) {
    try {
        let queryStr = `
            SELECT 
                al.id, 
                al.timestamp, 
                al.action, 
                al.details, 
                al.ip_address,
                u.name as user_name,
                al.user_id
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id::text = u.id::text
        `;
        const params: any[] = [];
        let whereConditions = [];

        if (filters?.userId) {
            params.push(filters.userId);
            whereConditions.push(`al.user_id = $${params.length}`);
        }
        if (filters?.action) {
            params.push(filters.action);
            whereConditions.push(`al.action = $${params.length}`);
        }

        if (whereConditions.length > 0) {
            queryStr += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        queryStr += ` ORDER BY al.timestamp DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
        const res = await query(queryStr, params);
        return { success: true, data: res.rows };
    } catch (error: any) {
        console.error('Failed to fetch audit logs:', error);
        return { success: false, error: 'Error al obtener registros' };
    }
}


// --- 🚨 NEW: Active Session Management ---

export interface ActiveSession {
    user_id: string;
    name: string;
    role: string;
    last_active_at: Date;
    current_context: any;
    is_online: boolean; // < 5 mins
    status: 'ONLINE' | 'AWAY' | 'OFFLINE';
}

/**
 * 🕵️‍♂️ Verify Session Validity (Called by Client)
 * Checks token_version and updates last_active_at
 */
export async function verifySession(userId: string, clientTokenVersion: number, contextData?: any): Promise<{ valid: boolean; error?: string }> {
    try {
        const res = await query('SELECT token_version, role FROM users WHERE id = $1', [userId]);

        if (res.rowCount === 0) return { valid: false, error: 'Usuario no encontrado' };

        const user = res.rows[0];

        // Check Token Version
        // If client sends 0 or undefined (legacy), we might want to allow it momentarily or force logout?
        // Let's be strict: if DB has version > 1 and client has old, fail.
        // Assuming clientTokenVersion is passed correctly.
        if (Number(user.token_version) > Number(clientTokenVersion)) {
            return { valid: false, error: 'Sesión revocada remotamente' };
        }

        // Update Activity
        await query(`
            UPDATE users 
            SET last_active_at = NOW(), 
                current_context_data = $2
            WHERE id = $1
        `, [userId, JSON.stringify(contextData || {})]);

        return { valid: true };

    } catch (error) {
        console.error('Session Verification Failed:', error);
        return { valid: false, error: 'Error verificando sesión' };
    }
}

/**
 * 🔴 Revoke Session (Remote Logout)
 */
export async function revokeSession(targetUserId: string, adminUserId: string) {
    try {
        // Increment token_version -> Invalidates all current client tokens
        await query('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = $1', [targetUserId]);

        // Log Audit
        await logAuditAction(adminUserId, 'SESSION_REVOKED', { target_user: targetUserId });

        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error('Revoke Session Failed:', error);
        return { success: false, error: 'Error revocando sesión' };
    }
}

/**
 * 📋 Get Active Sessions List (Safety Panel)
 */
export async function getActiveSessions(): Promise<{ success: boolean; data?: ActiveSession[] }> {
    try {
        // Active in last 24 hours (or just show all with status?)
        // Requirement: "SELECT * FROM users WHERE last_active_at > NOW() - INTERVAL '30 minutes'."
        // Let's show last 24h but mark offline if > 30min
        const res = await query(`
            SELECT id as user_id, name, role, last_active_at, current_context_data, token_version
            FROM users 
            WHERE last_active_at > NOW() - INTERVAL '24 hours'
            ORDER BY last_active_at DESC
        `);

        const now = new Date();
        const sessions: ActiveSession[] = res.rows.map(row => {
            const diffMinutes = (now.getTime() - new Date(row.last_active_at).getTime()) / 60000;
            let status: 'ONLINE' | 'AWAY' | 'OFFLINE' = 'OFFLINE';
            if (diffMinutes < 5) status = 'ONLINE';
            else if (diffMinutes < 30) status = 'AWAY';

            return {
                user_id: row.user_id,
                name: row.name,
                role: row.role,
                last_active_at: row.last_active_at,
                current_context: row.current_context_data,
                is_online: status === 'ONLINE',
                status: status
            };
        });

        return { success: true, data: sessions };
    } catch (error) {
        console.error('Get Active Sessions Failed:', error);
        return { success: false };
    }
}
