'use server';

import { query } from '../lib/db';

export async function getLocations() {
    try {
        const result = await query(
            `SELECT id, name FROM locations WHERE is_active = true AND type = 'STORE' ORDER BY name ASC`
        );
        return { success: true, locations: result.rows };
    } catch (error: any) {
        console.error('Error fetching locations:', error);
        return { success: false, error: error.message };
    }
}
