'use server';

import { query } from '@/lib/db';
import { checkRateLimit, incrementRateLimit, clearRateLimit, logAuditAction } from './security';
import { EmployeeProfile } from '@/domain/types';

// Re-export secure version for gradual migration
export { authenticateUserSecure, setUserPinSecure, verifySessionSecure } from './auth-v2';

/**
 * 🔐 Authentication Action
 * 
 * @deprecated Use authenticateUserSecure from auth-v2.ts instead.
 * This version compares PIN in plaintext which is a security risk.
 * 
 * MIGRATION STEPS:
 * 1. Run migration: npm run migrate:pins
 * 2. Update imports to use auth-v2.ts
 * 3. Remove this file after all references updated
 */
export async function authenticateUser(userId: string, pin: string, locationId?: string): Promise<{ success: boolean; user?: EmployeeProfile; error?: string }> {
    console.warn('[DEPRECATED] authenticateUser() is deprecated. Use authenticateUserSecure() from auth-v2.ts');
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
        const user = res.rows[0] as EmployeeProfile;

        // 3. Location Authorization Check (New Contextual Auth)
        if (locationId) {
            // Global Roles bypass location check (Case Insensitive + Safe)
            const role = (user.role || '').toUpperCase();
            const isGlobalAdmin = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'DRIVER', 'QF'].includes(role);

            // Check if user is assigned to this location or is global
            if (!isGlobalAdmin && user.assigned_location_id && user.assigned_location_id !== locationId) {
                await logAuditAction(userId, 'LOGIN_BLOCKED_LOCATION', { attempted: locationId, assigned: user.assigned_location_id });
                return { success: false, error: 'No tienes contrato en esta sucursal.' };
            }
        }

        // Initialize Session Data
        await query(`
            UPDATE users 
            SET last_active_at = NOW(), 
                current_context_data = $2,
                token_version = COALESCE(token_version, 1)
            WHERE id = $1
        `, [userId, JSON.stringify({ location_id: locationId || 'HQ' })]);

        // Clear Rate Limit on success
        await clearRateLimit(userId);
        await logAuditAction(user.id, 'LOGIN_SUCCESS', { role: user.role, location: locationId });

        // Ensure token_version is returned (refetch or use what we updated/had)
        // Simple optimization: Just return the user obj, we ensure it has current token_version
        user.token_version = res.rows[0].token_version || 1;

        return { success: true, user: user };

    } catch (error) {
        console.error('Auth Error:', error);
        return { success: false, error: 'Error de servidor' };
    }
}
