'use server';

import { query } from '../lib/db';
import { Location } from '../domain/types';

export async function getLocations(): Promise<{ success: boolean; data?: Location[]; error?: string }> {
    try {
        const result = await query(
            "SELECT * FROM locations ORDER BY name ASC"
        );

        // Map DB result to domain type (handle snake_case if necessary, assuming mostly compatible)
        const locations: Location[] = result.rows.map((row: any) => ({
            id: row.id,
            type: row.type,
            name: row.name,
            address: row.address,
            associated_kiosks: row.associated_kiosks || []
        }));

        return { success: true, data: locations };
    } catch (error) {
        console.error('Error fetching locations:', error);
        return { success: false, error: 'Failed to fetch locations' };
    }
}
