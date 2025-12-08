'use server';

import { query } from '../lib/db';
import { Location } from '../domain/types';

export async function getLocations(): Promise<{ success: boolean; data?: Location[]; error?: string }> {
    try {
        const result = await query(
            "SELECT * FROM locations ORDER BY name ASC"
        );

        if (result.rows.length === 0) {
            // Auto-seed if empty
            const { v4: uuidv4 } = await import('uuid');
            const defaultId = uuidv4();
            await query(`
                INSERT INTO locations (id, name, address, type, created_at)
                VALUES ($1, 'Farmacia Central', 'Calle Principal 123', 'STORE', NOW())
            `, [defaultId]);

            return {
                success: true,
                data: [{
                    id: defaultId,
                    name: 'Farmacia Central',
                    address: 'Calle Principal 123',
                    type: 'STORE',
                    associated_kiosks: []
                }]
            };
        }

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
