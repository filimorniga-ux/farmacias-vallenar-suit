'use server';

import { query } from '@/lib/db';
import { Location, Terminal, EmployeeProfile } from '@/domain/types';
import { revalidatePath } from 'next/cache';

// --- Types for Inputs ---
export interface LocationInput {
    name: string;
    address: string;
    phone?: string;
    manager_id?: string;
}

export interface TerminalInput {
    name: string;
    location_id: string; // The Store ID
    printer_config?: {
        receipt_printer_id?: string;
        label_printer_id?: string;
    };
}

// --- Data Fetching ---

export async function getLocationsWithTerminals() {
    try {
        await ensureActiveColumn(); // Ensure column exists
        // 1. Fetch Locations
        const locRes = await query('SELECT * FROM locations WHERE is_active = true ORDER BY created_at ASC');
        const locations: Location[] = locRes.rows.map(row => ({
            id: row.id,
            name: row.name,
            address: row.address,
            type: row.type || 'STORE',
            default_warehouse_id: row.default_warehouse_id,
            parent_id: row.parent_id,
            associated_kiosks: [], // Will populate
            config: row.config || {}
        }));

        // 2. Fetch Terminals
        const termRes = await query("SELECT * FROM terminals WHERE status != 'DELETED'");
        const terminals: Terminal[] = termRes.rows.map(row => ({
            id: row.id,
            location_id: row.location_id,
            name: row.name,
            status: row.status,
            config: row.config || {}
        }));

        // 3. Nest Terminals into Locations (for frontend convenience if matching type)
        // Note: The domain type 'Location' has 'associated_kiosks' which is string[] usually. 
        // We might want to just return them separately or map IDs.
        // Let's rely on mapping IDs to 'associated_kiosks' for compatibility.

        locations.forEach(loc => {
            loc.associated_kiosks = terminals
                .filter(t => t.location_id === loc.id)
                .map(t => t.id);
        });

        return { success: true, locations, terminals };

    } catch (error) {
        console.error('Error fetching organization data:', error);
        return { success: false, error: 'Failed to fetch data' };
    }
}


// --- Actions ---

/**
 * Creates a new Branch (Sucursal).
 */
export async function createLocation(data: LocationInput) {
    const { v4: uuidv4 } = await import('uuid');
    const locationId = uuidv4();

    try {
        await ensureParentIdColumn();
        await ensureDefaultWarehouseColumn();
        await ensureActiveColumn();

        await query(`
            INSERT INTO locations (id, name, address, type, created_at, is_active)
            VALUES ($1, $2, $3, 'STORE', NOW(), true)
        `, [locationId, data.name, data.address]);

        revalidatePath('/settings/organization');
        return { success: true, locationId };
    } catch (error) {
        console.error('Error creating location:', error);
        return { success: false, error: 'Database Error' };
    }
}

/**
 * Creates a standalone Warehouse.
 */
export async function createWarehouse(name: string, parentStoreId?: string) {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();

    try {
        await query(`
            INSERT INTO locations (id, name, type, parent_id, created_at, is_active)
            VALUES ($1, $2, 'WAREHOUSE', $3, NOW(), true)
        `, [id, name, parentStoreId || null]);

        revalidatePath('/settings/organization');
        return { success: true, id };
    } catch (error) {
        console.error('Error creating warehouse:', error);
        return { success: false, error: 'Failed to create warehouse' };
    }
}

/**
 * Updates a Location's configuration.
 */
export async function updateLocationConfig(locationId: string, defaultWarehouseId: string) {
    try {
        await ensureDefaultWarehouseColumn();

        await query(`
            UPDATE locations 
            SET default_warehouse_id = $2
            WHERE id = $1
        `, [locationId, defaultWarehouseId]);

        revalidatePath('/settings/organization');
        return { success: true };
    } catch (error) {
        console.error('Error updating location config:', error);
        return { success: false, error: 'Failed to update configuration' };
    }
}

/**
 * Creates a Terminal (Caja) for a Store.
 */
export async function createTerminal(data: TerminalInput) {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();

    try {
        await ensureTerminalConfigColumn();
        const configJson = data.printer_config ? JSON.stringify(data.printer_config) : '{}';

        await query(`
            INSERT INTO terminals (id, location_id, name, status, config, created_at)
            VALUES ($1, $2, $3, 'CLOSED', $4, NOW())
        `, [id, data.location_id, data.name, configJson]);

        revalidatePath('/settings/organization');
        return { success: true, id };

    } catch (error) {
        console.error('Error creating terminal:', error);
        return { success: false, error: 'Failed to create terminal' };
    }
}

// Reuse existing assignEmployeeToLocation, etc.
export async function assignEmployeeToLocation(userId: string, locationId: string) {
    try {
        await ensureUserLocationColumn();
        await query(`UPDATE users SET assigned_location_id = $2 WHERE id = $1`, [userId, locationId]);
        revalidatePath('/settings/organization');
        return { success: true };
    } catch (error) {
        console.error('Error assigning employee:', error);
        return { success: false, error: 'Failed to assign employee' };
    }
}

export async function updateLocationDetails(
    id: string,
    data: { name: string; address?: string; phone?: string; email?: string; manager_id?: string }
) {
    try {
        await ensureExtendedColumns();
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (data.name) { fields.push(`name = $${idx++}`); values.push(data.name); }
        if (data.address !== undefined) { fields.push(`address = $${idx++}`); values.push(data.address); }
        if (data.phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(data.phone); }
        if (data.email !== undefined) { fields.push(`email = $${idx++}`); values.push(data.email); }
        if (data.manager_id !== undefined) { fields.push(`manager_id = $${idx++}`); values.push(data.manager_id || null); }

        if (fields.length === 0) return { success: true };
        values.push(id);
        await query(`UPDATE locations SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        revalidatePath('/settings/organization');
        return { success: true };
    } catch (error) {
        console.error('Error updating details:', error);
        return { success: false, error: 'Update Failed' };
    }
}

export async function deactivateLocation(id: string) {
    try {
        await ensureActiveColumn();
        await query(`UPDATE locations SET is_active = false WHERE id = $1`, [id]);
        revalidatePath('/settings/organization');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Deactivation Failed' };
    }
}

// --- Migrations ---
async function ensureParentIdColumn() { try { await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS parent_id UUID;`); } catch (e) { } }
async function ensureDefaultWarehouseColumn() { try { await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS default_warehouse_id UUID;`); } catch (e) { } }
async function ensureTerminalConfigColumn() { try { await query(`ALTER TABLE terminals ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';`); } catch (e) { } }
async function ensureUserLocationColumn() { try { await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_location_id UUID;`); } catch (e) { } }
async function ensureExtendedColumns() {
    try {
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS email VARCHAR(100);`);
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS manager_id UUID;`);
    } catch (e) { }
}
async function ensureActiveColumn() { try { await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;`); } catch (e) { } }
