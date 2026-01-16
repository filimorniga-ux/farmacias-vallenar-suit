'use server';

/**
 * ============================================================================
 * GET-LOCATIONS-V2: Obtener Ubicaciones Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { headers } from 'next/headers';

async function getSession(): Promise<{ userId: string; role: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        if (!userId || !role) return null;
        return { userId, role };
    } catch { return null; }
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
