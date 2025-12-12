'use server';

import { query } from '@/lib/db';
import { Location, EmployeeProfile } from '@/domain/types';
import { revalidatePath } from 'next/cache';

// --- Types for Inputs ---
export interface LocationInput {
    name: string;
    address: string;
    phone?: string;
    manager_id?: string;
}

export async function getLocations() {
    try {
        const result = await query('SELECT id, name FROM locations WHERE is_active = true ORDER BY name ASC');
        return result.rows;
    } catch (error) {
        console.error('Error fetching locations:', error);
        return [];
    }
}

export interface TerminalInput {
    name: string;
    location_id: string; // The Store ID
    printer_config?: {
        receipt_printer_id?: string;
        label_printer_id?: string;
    };
}

// --- Actions ---

/**
 * Creates a new Branch (Sucursal).
 * NO auto-creation of Warehouse.
 */
export async function createLocation(data: LocationInput) {
    const { v4: uuidv4 } = await import('uuid');
    const locationId = uuidv4();

    try {
        await ensureParentIdColumn(); // Keep for hierarchy safety
        await ensureDefaultWarehouseColumn(); // New column

        // Create the Store (Sucursal)
        await query(`
            INSERT INTO locations (id, name, address, type, created_at)
            VALUES ($1, $2, $3, 'STORE', NOW())
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
 * Optional: Can be linked to a store via parent_id (hierarchical) but logic is now flexible.
 */
export async function createWarehouse(name: string, parentStoreId?: string) {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();

    try {
        await query(`
            INSERT INTO locations (id, name, type, parent_id, created_at)
            VALUES ($1, $2, 'WAREHOUSE', $3, NOW())
        `, [id, name, parentStoreId || null]);

        revalidatePath('/settings/organization');
        return { success: true, id };
    } catch (error) {
        console.error('Error creating warehouse:', error);
        return { success: false, error: 'Failed to create warehouse' };
    }
}

/**
 * Updates a Location's configuration, specifically the Default Warehouse.
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

/**
 * Assigns an employee to a location.
 */
export async function assignEmployeeToLocation(userId: string, locationId: string) {
    try {
        await ensureUserLocationColumn();

        await query(`
            UPDATE users 
            SET assigned_location_id = $2
            WHERE id = $1
        `, [userId, locationId]);

        revalidatePath('/settings/organization');
        return { success: true };
    } catch (error) {
        console.error('Error assigning employee:', error);
        return { success: false, error: 'Failed to assign employee' };
    }
}

/**
 * Updates details of a Location (Store/Warehouse).
 */
export async function updateLocationDetails(
    id: string,
    data: { name: string; address?: string; phone?: string; email?: string; manager_id?: string }
) {
    try {
        await ensureExtendedColumns(); // Ensure phone, email, manager_id exist

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (data.name) { fields.push(`name = $${idx}`); values.push(data.name); idx++; }
        if (data.address !== undefined) { fields.push(`address = $${idx}`); values.push(data.address); idx++; }
        if (data.phone !== undefined) { fields.push(`phone = $${idx}`); values.push(data.phone); idx++; }
        if (data.email !== undefined) { fields.push(`email = $${idx}`); values.push(data.email); idx++; }
        if (data.manager_id !== undefined) { fields.push(`manager_id = $${idx}`); values.push(data.manager_id || null); idx++; }

        values.push(id); // ID is the last param

        if (fields.length === 0) return { success: true }; // Nothing to update

        const sql = `UPDATE locations SET ${fields.join(', ')} WHERE id = $${idx}`;
        await query(sql, values);

        revalidatePath('/settings/organization');
        return { success: true };
    } catch (error) {
        console.error('Error updating location:', error);
        return { success: false, error: 'Database Update Failed' };
    }
}

/**
 * Deactivates a location (Soft Delete).
 */
export async function deactivateLocation(id: string) {
    try {
        await ensureActiveColumn();

        await query(`UPDATE locations SET is_active = false WHERE id = $1`, [id]);

        revalidatePath('/settings/organization');
        return { success: true };
    } catch (error) {
        console.error('Error deactivating location:', error);
        return { success: false, error: 'Deactivation Failed' };
    }
}



// --- Schema Helpers (Auto-Migration) ---

async function ensureParentIdColumn() {
    try {
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS parent_id UUID;`);
    } catch (e) { /* ignore if fails on older PG without IF NOT EXISTS support, but keeping simple */ }
}

async function ensureDefaultWarehouseColumn() {
    try {
        await query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE locations ADD COLUMN default_warehouse_id UUID;
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'column default_warehouse_id already exists.';
                END;
            END $$;
        `);
    } catch (e) { console.error('Migration Error (default_warehouse_id):', e); }
}

async function ensureTerminalConfigColumn() {
    try {
        await query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE terminals ADD COLUMN config JSONB DEFAULT '{}';
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'column config already exists.';
                END;
            END $$;
        `);
    } catch (e) { }
}

async function ensureUserLocationColumn() {
    try {
        await query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE users ADD COLUMN assigned_location_id UUID;
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'column assigned_location_id already exists.';
                END;
            END $$;
        `);
    } catch (e) { console.error('Migration Error (assigned_location_id):', e); }
}

async function ensureExtendedColumns() {
    try {
        await query(`
            DO $$ 
            BEGIN 
                BEGIN ALTER TABLE locations ADD COLUMN phone VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE locations ADD COLUMN email VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE locations ADD COLUMN manager_id UUID; EXCEPTION WHEN duplicate_column THEN NULL; END;
            END $$;
        `);
    } catch (e) { console.error('Migration Error (extended columns):', e); }
}

async function ensureActiveColumn() {
    try {
        await query(`
            DO $$ 
            BEGIN 
                BEGIN ALTER TABLE locations ADD COLUMN is_active BOOLEAN DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END;
            END $$;
        `);
    } catch (e) { console.error('Migration Error (is_active):', e); }
}

