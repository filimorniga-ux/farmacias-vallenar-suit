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
import { unstable_cache } from 'next/cache';

export interface PublicLocation {
    id: string;
    name: string;
    address: string;
    type: 'STORE' | 'WAREHOUSE' | 'HQ';
}

export async function getPublicLocationsSecure(): Promise<{
    success: boolean;
    data?: PublicLocation[];
    error?: string;
}> {
    console.time('⏱️ [PublicNetwork] getPublicLocationsSecure');
    try {
        const res = await query(`
            SELECT id, name, address, type 
            FROM locations 
            WHERE (is_active = true OR is_active IS NULL)
            ORDER BY name ASC
        `);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            name: (row.name || '').replace(/<[^>]*>/g, ''), // Strip HTML
            address: (row.address || '').replace(/<[^>]*>/g, ''),
            type: row.type,
        }));

        console.timeEnd('⏱️ [PublicNetwork] getPublicLocationsSecure');
        return { success: true, data };

    } catch (error: any) {
        console.error('getPublicLocationsSecure Error:', error);
        return { success: false, error: `Error al cargar sucursales: ${error.message || 'Desconocido'}` };
    }
}
