
'use server';

import { query } from '../lib/db';

export interface PublicLocation {
    id: string;
    name: string;
    address: string;
    type: 'STORE' | 'WAREHOUSE' | 'HQ';
}

/**
 * 🌍 Public: Get Locations
 * Accessible without authentication to allow context selection before login.
 * Returns only non-sensitive data.
 */
export async function getPublicLocations(): Promise<{ success: boolean; data?: PublicLocation[]; error?: string }> {
    try {
        const res = await query(`
            SELECT id, name, address, type 
            FROM locations 
            WHERE (is_active = true OR is_active IS NULL)
            ORDER BY name ASC
        `);

        return { success: true, data: res.rows };
    } catch (error) {
        console.error('Failed to fetch public locations:', error);
        return { success: false, error: 'Error al cargar sucursales.' };
    }
}
