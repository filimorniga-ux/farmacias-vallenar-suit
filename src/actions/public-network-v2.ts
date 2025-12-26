'use server';

/**
 * ============================================================================
 * PUBLIC-NETWORK-V2: Ubicaciones Públicas Seguras
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Rate limit 10/min por IP
 * - Caché 5 minutos
 * - Sanitización de output
 */

import { query } from '@/lib/db';
import { headers } from 'next/headers';
import { checkRateLimit } from '@/lib/rate-limiter';
import { unstable_cache } from 'next/cache';

interface PublicLocation {
    id: string;
    name: string;
    address: string;
    type: 'STORE' | 'WAREHOUSE' | 'HQ';
}

// Caché de 5 minutos
const getCachedLocations = unstable_cache(
    async (): Promise<PublicLocation[]> => {
        const res = await query(`
            SELECT id, name, address, type 
            FROM locations 
            WHERE (is_active = true OR is_active IS NULL)
            ORDER BY name ASC
        `);

        // Sanitizar output
        return res.rows.map((row: any) => ({
            id: row.id,
            name: (row.name || '').replace(/<[^>]*>/g, ''), // Strip HTML
            address: (row.address || '').replace(/<[^>]*>/g, ''),
            type: row.type,
        }));
    },
    ['public-locations'],
    { revalidate: 300 } // 5 minutos
);

/**
 * 🌍 Obtener Ubicaciones Públicas (con rate limit y caché)
 */
export async function getPublicLocationsSecure(): Promise<{
    success: boolean;
    data?: PublicLocation[];
    error?: string;
}> {
    try {
        // Obtener IP
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for')?.split(',')[0] || 'unknown';

        // Rate limit 10/min por IP
        const rl = checkRateLimit(`public-locations:${ip}`);
        if (!rl.allowed) {
            return { success: false, error: 'Demasiadas solicitudes. Intente en un momento.' };
        }

        const data = await getCachedLocations();
        return { success: true, data };

    } catch (error) {
        return { success: false, error: 'Error al cargar sucursales.' };
    }
}
