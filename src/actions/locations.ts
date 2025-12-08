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
            associated_kiosks: row.associated_kiosks || [],
            parent_id: row.parent_id,
            default_warehouse_id: row.default_warehouse_id
        }));

        return { success: true, data: locations };
    } catch (error: any) {
        // Self-Healing: Create table if it doesn't exist (Error 42P01: undefined_table)
        if (error.code === '42P01') {
            console.warn('⚠️ Locations table missing. Auto-creating...');
            try {
                await query(`
                    CREATE TABLE IF NOT EXISTS locations (
                        id UUID PRIMARY KEY,
                        name TEXT NOT NULL,
                        address TEXT,
                        type TEXT DEFAULT 'STORE',
                        associated_kiosks JSONB DEFAULT '[]',
                        created_at TIMESTAMP DEFAULT NOW()
                    );
                `);

                // Seed it
                const { v4: uuidv4 } = await import('uuid');
                const defaultId = uuidv4();
                await query(`
                    INSERT INTO locations (id, name, address, type)
                    VALUES ($1, 'Farmacia Central', 'Calle Principal 123', 'STORE')
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
            } catch (createError) {
                console.error('❌ Failed to create locations table:', createError);
                return { success: false, error: 'Database Schema Error: Could not create table' };
            }
        }

        console.error('Error fetching locations:', error);
        return { success: false, error: 'Failed to fetch locations' };
    }
}
