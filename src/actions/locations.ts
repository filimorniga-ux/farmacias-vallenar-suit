'use server';

import { query } from '../lib/db';
import { Location } from '../domain/types';

export async function getLocations(): Promise<{ success: boolean; data?: Location[]; error?: string }> {
    try {
        const result = await query(
            "SELECT * FROM locations ORDER BY name ASC"
        );

        // if (result.rows.length === 0) { ... } // Removed auto-seeding to allow empty state

        // Map DB result to domain type (handle snake_case if necessary, assuming mostly compatible)
        const locations: Location[] = result.rows.map((row: any) => ({
            id: row.id,
            type: row.type,
            name: row.name,
            address: row.address,
            associated_kiosks: row.associated_kiosks || [],
            parent_id: row.parent_id,
            default_warehouse_id: row.default_warehouse_id,
            config: row.config || undefined,
            is_active: row.is_active !== false // Default to true if null
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
                        config JSONB,
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


export async function createLocation(data: Partial<Location>): Promise<{ success: boolean; data?: Location; error?: string }> {
    try {
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();
        const type = data.type || 'STORE';
        const name = data.name || 'Nueva Sucursal';
        const address = data.address || '';
        const config = data.config ? JSON.stringify(data.config) : null;
        const parentId = data.parent_id || null;
        const defaultWarehouseId = data.default_warehouse_id || null;

        await query(`
            INSERT INTO locations (id, name, type, address, config, parent_id, default_warehouse_id, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [id, name, type, address, config, parentId, defaultWarehouseId, true]);

        return {
            success: true,
            data: {
                id,
                name,
                type: type as any,
                address,
                associated_kiosks: [],
                config: data.config,
                parent_id: parentId || undefined,
                default_warehouse_id: defaultWarehouseId || undefined,
                is_active: true
            }
        };
    } catch (error: any) {
        console.error('Error creating location:', error);
        return { success: false, error: 'Failed to create location' };
    }
}

export async function updateLocation(id: string, data: Partial<Location>): Promise<{ success: boolean; error?: string }> {
    try {
        const fields: string[] = [];
        const values: any[] = [];
        let index = 1;

        if (data.name) { fields.push(`name = $${index++}`); values.push(data.name); }
        if (data.address) { fields.push(`address = $${index++}`); values.push(data.address); }
        if (data.type) { fields.push(`type = $${index++}`); values.push(data.type); }
        if (data.default_warehouse_id) { fields.push(`default_warehouse_id = $${index++}`); values.push(data.default_warehouse_id); }
        if (data.config) { fields.push(`config = $${index++}`); values.push(JSON.stringify(data.config)); }
        if (data.is_active !== undefined) { fields.push(`is_active = $${index++}`); values.push(data.is_active); }

        if (fields.length === 0) return { success: true };

        values.push(id);
        const queryText = `UPDATE locations SET ${fields.join(', ')} WHERE id = $${index}`;

        await query(queryText, values);
        return { success: true };

    } catch (error: any) {
        console.error('Error updating location:', error);

        // Self-Healing: Missing 'config' column?
        if (error.code === '42703' && error.message.includes('config')) {
            console.warn('⚠️ Column config missing in locations. Auto-adding...');
            try {
                await query('ALTER TABLE locations ADD COLUMN IF NOT EXISTS config JSONB');
                // Retry
                return updateLocation(id, data);
            } catch (alterError) {
                return { success: false, error: 'Failed to update schema for config' };
            }
        }

        // Missing 'default_warehouse_id' column?
        if (error.code === '42703' && error.message.includes('default_warehouse_id')) {
            console.warn('⚠️ Column default_warehouse_id missing in locations. Auto-adding...');
            try {
                await query('ALTER TABLE locations ADD COLUMN IF NOT EXISTS default_warehouse_id UUID');
                return updateLocation(id, data);
            } catch (alterError) {
                return { success: false, error: 'Failed to update schema for warehouse link' };
            }
        }

        // Missing 'is_active' column?
        if (error.code === '42703' && error.message.includes('is_active')) {
            console.warn('⚠️ Column is_active missing in locations. Auto-adding...');
            try {
                await query('ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE');
                return updateLocation(id, data);
            } catch (alterError) {
                return { success: false, error: 'Failed to update schema for is_active' };
            }
        }

        return { success: false, error: error.message };
    }
}

async function checkLocationDependencies(id: string) {
    // Check users
    const users = await query("SELECT count(*) FROM users WHERE assigned_location_id = $1 AND status = 'ACTIVE'", [id]);
    if (Number(users.rows[0].count) > 0) return { hasDependencies: true, reason: 'Tiene usuarios activos asignados.' };

    // Check terminals
    const terminals = await query("SELECT count(*) FROM terminals WHERE location_id = $1 AND status != 'DELETED'", [id]);
    if (Number(terminals.rows[0].count) > 0) return { hasDependencies: true, reason: 'Tiene cajas/terminales activos.' };

    return { hasDependencies: false };
}

export async function deleteLocation(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Validate Dependencies
        const check = await checkLocationDependencies(id);
        if (check.hasDependencies) {
            return {
                success: false,
                error: `No se puede eliminar: ${check.reason} (Sugerencia: Cambiar nombre a 'Cerrado' o desactivar)`
            };
        }

        // 2. Perform Hard Delete
        // Check if it's a parent location for others?
        const children = await query('SELECT count(*) FROM locations WHERE parent_id = $1', [id]);
        if (Number(children.rows[0].count) > 0) {
            return { success: false, error: 'No se puede eliminar: Tiene sub-ubicaciones o bodegas vinculadas.' };
        }

        await query('DELETE FROM locations WHERE id = $1', [id]);

        return { success: true };
    } catch (error: any) {
        console.error('Error deleting location:', error);
        // Handle FK violations gracefully
        if (error.code === '23503') { // foreign_key_violation
            return { success: false, error: 'No se puede eliminar: Existen datos históricos (ventas/registros) vinculados.' };
        }
        return { success: false, error: 'Error interno al eliminar ubicación.' };
    }
}
