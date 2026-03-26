'use server';

/**
 * ============================================================================
 * LOGGER-ACTION-V2: Logging con Auditoría
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getValidatedSession } from '@/lib/server-session';

async function getSession(): Promise<{ userId: string } | null> {
    const session = await getValidatedSession();
    if (!session) return null;
    return { userId: session.userId };
}

/**
 * 📝 Log de Acción con Auditoría
 */
export async function logActionSecure(
    action: string,
    detail: string,
    entityType?: string
): Promise<{ success: boolean }> {
    const session = await getSession();

    // Log al sistema
    logger.info({ userId: session?.userId, action, detail }, 'User Action Logged');

    // Si hay sesión, registrar en audit_log
    if (session?.userId) {
        try {
            await query(`
                INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            ) VALUES ($1, $2, $3, $4::jsonb, NOW())
            `, [session.userId, action, entityType || 'USER_ACTION', JSON.stringify({ detail })]);
        } catch (err: any) {
            logger.warn({ err: err.message, actionCode: action }, 'Audit log insertion failed in logActionSecure (possibly missing action code)');
        }
    }

    return { success: true };
}
