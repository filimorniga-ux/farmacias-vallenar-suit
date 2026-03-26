'use server';

/**
 * ============================================================================
 * GET-LOCATIONS-V2: Obtener Ubicaciones Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';

async function getSession(): Promise<{ userId: string; role: string } | null> {
    const session = await getValidatedSession();
    if (!session) return null;
    return { userId: session.userId, role: session.role };
}

/**
 * 📍 Obtener Ubicaciones (Requiere sesión activa)
 */
export async function getLocationsSecure(): Promise<{
    success: boolean;
    locations?: Array<{ id: string; name: string }>;
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const result = await query(
            `SELECT id, name, type FROM locations WHERE is_active = true ORDER BY name ASC`
        );
        return { success: true, locations: result.rows };
    } catch (error: any) {
        return { success: false, error: 'Error obteniendo ubicaciones' };
    }
}
