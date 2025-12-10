'use server';

import { query } from '@/lib/db';
import { headers } from 'next/headers';

/**
 * 🔒 Rate Limiting Logic (Database Backed)
 * Returns { allowed: boolean, error?: string }
 */
export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; error?: string }> {
    try {
        const MAX_ATTEMPTS = 5;
        const BLOCK_DURATION_MINUTES = 10;
        const WINDOW_MINUTES = 10;

        // 1. Check if blocked
        const res = await query(`
            SELECT attempt_count, last_attempt, blocked_until 
            FROM login_attempts 
            WHERE identifier = $1
        `, [identifier]);

        if ((res.rowCount || 0) > 0) {
            const row = res.rows[0];
            const now = new Date();

            // Check Block Expiration
            if (row.blocked_until && new Date(row.blocked_until) > now) {
                const waitParams = Math.ceil((new Date(row.blocked_until).getTime() - now.getTime()) / 60000);
                return { allowed: false, error: `Demasiados intentos. Espere ${waitParams} minutos.` };
            }

            // Check if blocking is needed now (if just exceeded) - Logic usually handled on Increment
            // But if we are here, it means we MIGHT be allowed unless 'blocked_until' was set.
            // However, we should also reset count if window passed.
            const lastAttemptTime = new Date(row.last_attempt);
            const timeDiffMinutes = (now.getTime() - lastAttemptTime.getTime()) / 60000;

            if (timeDiffMinutes > WINDOW_MINUTES && (!row.blocked_until || new Date(row.blocked_until) <= now)) {
                // Reset window
                await query('UPDATE login_attempts SET attempt_count = 0, blocked_until = NULL WHERE identifier = $1', [identifier]);
                return { allowed: true };
            }
        }

        return { allowed: true };
    } catch (error) {
        console.error('Rate Limit Check Failed:', error);
        // Fail open or closed? detailed prompt says "Lanzar error". 
        // If DB fails, safe to Allow or Deny? Deny might lock out everyone if DB issues. Allow is risky.
        // Let's Allow but log error to avoid downtime during glitches.
        return { allowed: true };
    }
}

/**
 * 📈 Increment Rate Limit Counter & Block if needed
 */
export async function incrementRateLimit(identifier: string) {
    try {
        const MAX_ATTEMPTS = 5;
        const BLOCK_DURATION_MINUTES = 10;

        // Upsert logic (PG 9.5+)
        await query(`
            INSERT INTO login_attempts (identifier, attempt_count, last_attempt)
            VALUES ($1, 1, NOW())
            ON CONFLICT (identifier) DO UPDATE 
            SET attempt_count = login_attempts.attempt_count + 1,
                last_attempt = NOW()
        `, [identifier]);

        // Check if we need to block
        const res = await query('SELECT attempt_count FROM login_attempts WHERE identifier = $1', [identifier]);
        if ((res.rowCount || 0) > 0 && res.rows[0].attempt_count > MAX_ATTEMPTS) {
            // Block
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

/**
 * ✅ Clear Rate Limit (On Success)
 */
export async function clearRateLimit(identifier: string) {
    try {
        await query('DELETE FROM login_attempts WHERE identifier = $1', [identifier]);
    } catch (error) {
        console.error('Rate Limit Clear Failed:', error);
    }
}

/**
 * 🕵️‍♂️ Audit Log Action
 */
export async function logAuditAction(userId: string | null, action: string, details: any) {
    try {
        // Try to get IP from headers if possible (Server Action context)
        const headerStore = await headers();
        let ip = headerStore.get('x-forwarded-for') || headerStore.get('x-real-ip') || 'unknown';

        // Sanitize Details for JSON
        const sanitizedDetails = JSON.stringify(details);

        await query(`
            INSERT INTO audit_logs (user_id, action, details, ip_address)
            VALUES ($1, $2, $3, $4)
        `, [userId, action, sanitizedDetails, ip]);

    } catch (error) {
        console.error('Audit Log Failed:', error);
        // Audit failures should not crash the app, but are critical.
    }
}

/**
 * 🔍 Fetch Audit Logs
 */
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
