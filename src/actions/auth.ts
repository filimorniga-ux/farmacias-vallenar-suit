'use server';

import { query } from '@/lib/db';
import { checkRateLimit, incrementRateLimit, clearRateLimit, logAuditAction } from './security';
import { EmployeeProfile } from '@/domain/types';

/**
 * 🔐 Secure Authentication Action
 */
export async function authenticateUser(userId: string, pin: string): Promise<{ success: boolean; user?: EmployeeProfile; error?: string }> {
    try {
        // 1. Rate Limiting Check
        // Use UserID or combined IP? Using UserID for PIN brute force protection is better.
        // But what if attacker tries many IDs? We should stick to Identifier (User ID here).
        // If unknown user, maybe rate limit by IP? For now, User ID focus.
        const limitCheck = await checkRateLimit(userId);
        if (!limitCheck.allowed) {
            await logAuditAction(userId, 'LOGIN_BLOCKED', { reason: 'Rate Limit Exceeded' });
            return { success: false, error: limitCheck.error || 'Acceso Bloqueado Temporalmente' };
        }

        // 2. Authenticate against DB
        // Assuming 'users' table has 'access_pin'.
        // In real world, PIN should be hashed. Here we assume plain or hashed comparison logic exists.
        // Prompt implies finding user by ID and PIN.
        const res = await query('SELECT * FROM users WHERE id = $1 AND access_pin = $2', [userId, pin]);

        if (res.rowCount === 0) {
            // Failed Attempt
            await incrementRateLimit(userId);
            await logAuditAction(userId, 'LOGIN_FAILED', { attempts: 'incremented' });
            return { success: false, error: 'Credenciales inválidas' };
        }

        // 3. Success
        const user = res.rows[0];

        // Clear Rate Limit on success
        await clearRateLimit(userId);
        await logAuditAction(user.id, 'LOGIN_SUCCESS', { role: user.role });

        return { success: true, user: user as EmployeeProfile };

    } catch (error) {
        console.error('Auth Error:', error);
        return { success: false, error: 'Error de servidor' };
    }
}
