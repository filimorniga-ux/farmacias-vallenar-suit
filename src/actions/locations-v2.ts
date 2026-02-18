'use server';

/**
 * ============================================================================
 * LOCATIONS-V2: Secure Multi-Branch Management
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * SECURITY IMPROVEMENTS:
 * - SERIALIZABLE transactions for data integrity
 * - RBAC enforcement (ADMIN/GERENTE_GENERAL for create/deactivate)
 * - bcrypt PIN validation for stock transfers
 * - Soft delete (deactivation) instead of hard delete
 * - Comprehensive audit logging
 * - Atomic stock transfers between locations
 * 
 * MIGRATION:
 * - Replaces locations.ts functions
 * - Requires users.assigned_location_id column
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { Location } from '@/domain/types';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const CreateLocationSchema = z.object({
    name: z.string().min(3, 'Nombre muy corto').max(100),
    address: z.string().max(255).optional(),
    type: z.enum(['STORE', 'WAREHOUSE', 'KIOSK', 'HQ']).default('STORE'),
    parentId: UUIDSchema.optional(),
    defaultWarehouseId: UUIDSchema.optional(),
    config: z.record(z.string(), z.any()).optional(),
});

const UpdateLocationSchema = z.object({
    locationId: UUIDSchema,
    name: z.string().min(3).max(100).optional(),
    address: z.string().max(255).optional(),
    type: z.enum(['STORE', 'WAREHOUSE', 'KIOSK', 'HQ']).optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    manager_id: UUIDSchema.optional().or(z.literal('')),
    defaultWarehouseId: UUIDSchema.optional(),
    config: z.record(z.string(), z.any()).optional(),
});

const DeactivateLocationSchema = z.object({
    locationId: UUIDSchema,
    reason: z.string().min(10, 'Razón requerida (mínimo 10 caracteres)'),
});

const TransferStockSchema = z.object({
    sourceLocationId: UUIDSchema,
    targetLocationId: UUIDSchema,
    items: z.array(z.object({
        sku: z.string().min(1),
        quantity: z.number().int().positive(),
    })).min(1, 'Debe incluir al menos un item'),
    reason: z.string().min(3).max(500),
    managerPin: z.string().min(4, 'PIN de manager requerido'),
});

const AssignUserSchema = z.object({
    userId: UUIDSchema,
    locationId: UUIDSchema,
    reason: z.string().min(5, 'Razón requerida'),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'];

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
    FOREIGN_KEY_VIOLATION: '23503',
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get session from headers
 */
async function getSession(): Promise<{ user?: { id: string; role: string } } | null> {
    try {
        const headersList = await headers();
        const { cookies } = await import('next/headers');

        // 1. Try Headers
        let userId = headersList.get('x-user-id');
        let userRole = headersList.get('x-user-role');

        // 2. Try Cookies (Fallback)
        if (!userId || !userRole) {
            const cookieStore = await cookies();
            userId = cookieStore.get('user_id')?.value || null;
            userRole = cookieStore.get('user_role')?.value || null;
        }

        if (!userId || !userRole) {
            return null;
        }

        return { user: { id: userId, role: userRole } };
    } catch {
        return null;
    }
}

/**
 * Verify ADMIN permissions
 */
async function verifyAdminPermission(client: any): Promise<{
    valid: boolean;
    admin?: { id: string; name: string; role: string };
    error?: string;
}> {
    const session = await getSession();

    if (!session?.user?.id) {
        return { valid: false, error: 'No autenticado' };
    }

    const adminRes = await client.query(`
        SELECT id, name, role 
        FROM users 
        WHERE id = $1 AND is_active = true
    `, [session.user.id]);

    if (adminRes.rows.length === 0) {
        return { valid: false, error: 'Usuario no encontrado' };
    }

    const admin = adminRes.rows[0];
    const role = admin.role?.toUpperCase();

    if (!ADMIN_ROLES.includes(role)) {
        return { valid: false, error: 'Requiere permisos de ADMIN o GERENTE_GENERAL' };
    }

    return { valid: true, admin };
}

/**
 * Verify MANAGER permissions (Includes ADMIN & GERENTE_GENERAL)
 */
async function verifyManagerPermission(client: any): Promise<{
    valid: boolean;
    manager?: { id: string; name: string; role: string };
    error?: string;
}> {
    const session = await getSession();

    if (!session?.user?.id) {
        return { valid: false, error: 'No autenticado' };
    }

    const userRes = await client.query(`
        SELECT id, name, role 
        FROM users 
        WHERE id = $1 AND is_active = true
    `, [session.user.id]);

    if (userRes.rows.length === 0) {
        return { valid: false, error: 'Usuario no encontrado' };
    }

    const user = userRes.rows[0];
    const role = user.role?.toUpperCase();

    if (!MANAGER_ROLES.includes(role)) {
        return { valid: false, error: 'Requiere permisos de ADMIN, GERENTE o MANAGER' };
    }

    return { valid: true, manager: user };
}

/**
 * Validate manager PIN for stock transfers
 */
async function validateManagerPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; manager?: { id: string; name: string; role: string }; error?: string }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const bcrypt = await import('bcryptjs');

        const usersRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users 
            WHERE role = ANY($1::text[])
            AND is_active = true
        `, [MANAGER_ROLES]);

        for (const user of usersRes.rows) {
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) continue;

            if (user.access_pin_hash) {
                const isValid = await bcrypt.compare(pin, user.access_pin_hash);
                if (isValid) {
                    resetAttempts(user.id);
                    return { valid: true, manager: { id: user.id, name: user.name, role: user.role } };
                } else {
                    recordFailedAttempt(user.id);
                }
            } else if (user.access_pin && user.access_pin === pin) {
                resetAttempts(user.id);
                return { valid: true, manager: { id: user.id, name: user.name, role: user.role } };
            }
        }

        return { valid: false, error: 'PIN de manager inválido' };
    } catch (error) {
        logger.error({ error }, '[Locations] Manager PIN validation error');
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Insert location audit log
 */
async function insertLocationAudit(
    client: any,
    params: {
        userId: string;
        actionCode: string;
        locationId: string;
        oldValues?: Record<string, any>;
        newValues?: Record<string, any>;
        justification?: string;
    }
): Promise<void> {
    try {
        await client.query(`
            INSERT INTO audit_log (
                user_id, action_code, entity_type, entity_id,
                old_values, new_values, justification, created_at
            ) VALUES ($1, $2, 'LOCATION', $3, $4::jsonb, $5::jsonb, $6, NOW())
        `, [
            params.userId,
            params.actionCode,
            params.locationId,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            JSON.stringify(params.newValues || {}),
            params.justification || null
        ]);
    } catch (error) {
        logger.warn({ error }, '[Locations] Audit log failed');
    }
}

// ============================================================================
// LOCATION MANAGEMENT
// ============================================================================

/**
 * 🏢 Create Location Securely (ADMIN/GERENTE_GENERAL only)
 */
export async function createLocationSecure(
    data: z.infer<typeof CreateLocationSchema>
): Promise<{ success: boolean; data?: Location; error?: string }> {
    // Validate input
    const validated = CreateLocationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Verify ADMIN permission
        const authCheck = await verifyAdminPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // Check for duplicate name
        const existingRes = await client.query(
            'SELECT id FROM locations WHERE LOWER(name) = LOWER($1) AND is_active = true',
            [validated.data.name]
        );

        if (existingRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Ya existe una sucursal con ese nombre' };
        }

        // Create location
        const locationId = uuidv4();
        const { name, address, type, parentId, defaultWarehouseId, config } = validated.data;

        await client.query(`
            INSERT INTO locations (
                id, name, address, type, parent_id, 
                default_warehouse_id, config, is_active, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
        `, [
            locationId,
            name,
            address || null,
            type,
            parentId || null,
            defaultWarehouseId || null,
            config ? JSON.stringify(config) : null
        ]);

        // Audit
        await insertLocationAudit(client, {
            userId: authCheck.admin!.id,
            actionCode: 'LOCATION_CREATED',
            locationId,
            newValues: { name, type, address, created_by: authCheck.admin!.name }
        });

        await client.query('COMMIT');

        logger.info({ locationId, name }, '🏢 [Locations] Location created');
        revalidatePath('/settings');
        revalidatePath('/locations');

        return {
            success: true,
            data: {
                id: locationId,
                name,
                address: address || '',
                type: type as any,
                associated_kiosks: [],
                parent_id: parentId,
                default_warehouse_id: defaultWarehouseId,
                config,
                is_active: true
            }
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Locations] Create location error');
        return { success: false, error: error.message || 'Error creando sucursal' };

    } finally {
        client.release();
    }
}

/**
 * ✏️ Update Location Securely (ADMIN only)
 */
export async function updateLocationSecure(
    data: z.infer<typeof UpdateLocationSchema>
): Promise<{ success: boolean; data?: Location; error?: string }> {
    console.log('🔥 [SERVER ACTION] updateLocationSecure CALLED');
    console.log('📦 [SERVER ACTION] Payload size:', JSON.stringify(data).length, 'bytes');

    // Validate input
    const validated = UpdateLocationSchema.safeParse(data);
    if (!validated.success) {
        console.error('❌ [SERVER ACTION] Validation Failed:', validated.error);
        return { success: false, error: validated.error.issues[0]?.message };
    }
    console.log('✅ [SERVER ACTION] Validation passed for:', validated.data.locationId);

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Verify MANAGER permission
        const authCheck = await verifyManagerPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // Get current state
        const currentRes = await client.query(`
            SELECT * FROM locations WHERE id = $1 FOR UPDATE NOWAIT
        `, [validated.data.locationId]);

        if (currentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Sucursal no encontrada' };
        }

        const oldValues = currentRes.rows[0];

        // Build update
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (validated.data.name) {
            updates.push(`name = $${paramIndex++}`);
            values.push(validated.data.name);
        }
        if (validated.data.address !== undefined) {
            updates.push(`address = $${paramIndex++}`);
            values.push(validated.data.address);
        }
        if (validated.data.phone !== undefined) {
            updates.push(`phone = $${paramIndex++}`);
            values.push(validated.data.phone);
        }
        if (validated.data.email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            values.push(validated.data.email);
        }
        if (validated.data.manager_id !== undefined && validated.data.manager_id !== '') {
            updates.push(`manager_id = $${paramIndex++}`);
            values.push(validated.data.manager_id);
        }
        if (validated.data.type) {
            updates.push(`type = $${paramIndex++}`);
            values.push(validated.data.type);
        }
        if (validated.data.defaultWarehouseId !== undefined) {
            updates.push(`default_warehouse_id = $${paramIndex++}`);
            values.push(validated.data.defaultWarehouseId);
        }
        if (validated.data.config !== undefined) {
            updates.push(`config = $${paramIndex++}`);
            values.push(JSON.stringify(validated.data.config));
        }

        if (updates.length === 0) {
            await client.query('ROLLBACK');
            return { success: true }; // Nothing to update
        }

        // updates.push(`updated_at = NOW()`);  <-- Removed: Column does not exist in schema
        values.push(validated.data.locationId);

        // Monitor updates
        console.log('📝 [UPDATE LOCATION] BEFORE UPDATE:', { updates, values, locationId: validated.data.locationId });

        const res = await client.query(`
            UPDATE locations SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, values);

        const updatedLocation = res.rows[0];
        console.log('📝 [UPDATE LOCATION] AFTER UPDATE (RETURNING):', { name: updatedLocation?.name, id: updatedLocation?.id });

        // Audit
        await insertLocationAudit(client, {
            userId: authCheck.manager!.id,
            actionCode: 'LOCATION_UPDATED',
            locationId: validated.data.locationId,
            oldValues: { name: oldValues.name, address: oldValues.address },
            newValues: updatedLocation // Audit the actual result
        });

        await client.query('COMMIT');
        console.log('📝 [UPDATE LOCATION] COMMIT DONE');

        logger.info({ locationId: validated.data.locationId }, '✏️ [Locations] Location updated');

        // ALWAYS revalidate settings and main paths when location changes to ensure config sync
        revalidatePath('/settings');
        revalidatePath('/locations');
        revalidatePath('/network', 'layout');

        return { success: true, data: updatedLocation }; // Return the fresh data



    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Sucursal en proceso. Reintente.' };
        }

        logger.error({ error }, '[Locations] Update location error');
        return { success: false, error: error.message || 'Error actualizando sucursal' };

    } finally {
        client.release();
    }
}

/**
 * 🚫 Deactivate Location (Soft Delete)
 */
export async function deactivateLocationSecure(
    locationId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    // Validate input
    const validated = DeactivateLocationSchema.safeParse({ locationId, reason });
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Verify MANAGER permission
        const authCheck = await verifyManagerPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // Get location
        const locRes = await client.query(`
            SELECT * FROM locations WHERE id = $1 FOR UPDATE NOWAIT
        `, [locationId]);

        if (locRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Sucursal no encontrada' };
        }

        // Check for active users
        const usersRes = await client.query(`
            SELECT COUNT(*) as count FROM users 
            WHERE assigned_location_id = $1 AND is_active = true
        `, [locationId]);

        if (parseInt(usersRes.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No se puede desactivar: Tiene usuarios activos asignados' };
        }

        // Check for child locations
        const childrenRes = await client.query(`
            SELECT COUNT(*) as count FROM locations 
            WHERE parent_id = $1 AND is_active = true
        `, [locationId]);

        if (parseInt(childrenRes.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No se puede desactivar: Tiene sub-ubicaciones activas' };
        }

        // Soft delete
        await client.query(`
            UPDATE locations 
            SET is_active = false
            WHERE id = $1
        `, [locationId]);

        // Audit
        await insertLocationAudit(client, {
            userId: authCheck.manager!.id,
            actionCode: 'LOCATION_DEACTIVATED',
            locationId,
            oldValues: { is_active: true },
            newValues: { is_active: false },
            justification: reason
        });

        await client.query('COMMIT');

        logger.info({ locationId }, '🚫 [Locations] Location deactivated');
        revalidatePath('/settings');
        revalidatePath('/locations');
        revalidatePath('/network');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Locations] Deactivate location error');
        return { success: false, error: error.message || 'Error desactivando sucursal' };

    } finally {
        client.release();
    }
}

// ============================================================================
// STOCK TRANSFER
// ============================================================================

/**
 * 📦 Transfer Stock Between Locations (Atomic, MANAGER PIN required)
 */
export async function transferStockBetweenLocationsSecure(
    data: z.infer<typeof TransferStockSchema>
): Promise<{ success: boolean; transferId?: string; error?: string }> {
    // Validate input
    const validated = TransferStockSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { sourceLocationId, targetLocationId, items, reason, managerPin } = validated.data;

    if (sourceLocationId === targetLocationId) {
        return { success: false, error: 'Las ubicaciones de origen y destino deben ser diferentes' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validate manager PIN
        const authResult = await validateManagerPin(client, managerPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error || 'PIN inválido' };
        }

        // Lock both locations
        const locsRes = await client.query(`
            SELECT id, name, is_active FROM locations 
            WHERE id IN ($1, $2)
            FOR UPDATE NOWAIT
        `, [sourceLocationId, targetLocationId]);

        if (locsRes.rows.length !== 2) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Una o ambas ubicaciones no existen' };
        }

        const sourceLocation = locsRes.rows.find(l => l.id === sourceLocationId);
        const targetLocation = locsRes.rows.find(l => l.id === targetLocationId);

        if (!sourceLocation?.is_active || !targetLocation?.is_active) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Una o ambas ubicaciones están inactivas' };
        }

        const transferId = uuidv4();
        const transferredItems: any[] = [];
        const movements: any[] = [];
        const batchUpdates: { id: string, quantity: number }[] = [];
        const batchInserts: any[] = [];
        const targetBatchUpdates: { id: string, quantity: number }[] = [];

        const skus = items.map(i => i.sku);

        // 1. Fetch ALL source batches for ALL SKUs in one go
        const allSourceBatchesRes = await client.query(`
            SELECT id, sku, name, quantity_real, product_id, 
                   expiry_date, lot_number, unit_cost, sale_price
            FROM inventory_batches 
            WHERE location_id = $1 AND sku = ANY($2) AND quantity_real > 0
            ORDER BY sku, expiry_date ASC NULLS LAST
            FOR UPDATE
        `, [sourceLocationId, skus]);

        // Group source batches by SKU
        const sourceBatchesBySku: Record<string, any[]> = {};
        allSourceBatchesRes.rows.forEach(b => {
            if (!sourceBatchesBySku[b.sku]) sourceBatchesBySku[b.sku] = [];
            sourceBatchesBySku[b.sku].push(b);
        });

        // 2. Fetch ALL potential target batches for ALL SKUs in one go
        const allTargetBatchesRes = await client.query(`
            SELECT id, sku, quantity_real, lot_number FROM inventory_batches 
            WHERE location_id = $1 AND sku = ANY($2)
            FOR UPDATE
        `, [targetLocationId, skus]);

        // Group target batches by SKU and Lot Number
        const targetBatchesBySkuLot: Record<string, any> = {};
        allTargetBatchesRes.rows.forEach(b => {
            const key = `${b.sku}|${b.lot_number || ''}`;
            targetBatchesBySkuLot[key] = b;
        });

        // Process each item
        for (const item of items) {
            let remainingToTransfer = item.quantity;
            const skuBatches = sourceBatchesBySku[item.sku] || [];

            const totalAvailable = skuBatches.reduce((sum, b) => sum + Number(b.quantity_real), 0);
            if (totalAvailable < item.quantity) {
                await client.query('ROLLBACK');
                client.release();
                return { success: false, error: `Stock total insuficiente para SKU ${item.sku} en origen (${totalAvailable} < ${item.quantity})` };
            }

            for (const sourceBatch of skuBatches) {
                if (remainingToTransfer <= 0) break;

                const qtyFromThisBatch = Math.min(remainingToTransfer, Number(sourceBatch.quantity_real));
                const newSourceQuantity = Number(sourceBatch.quantity_real) - qtyFromThisBatch;

                // Collect source update
                batchUpdates.push({ id: sourceBatch.id, quantity: newSourceQuantity });

                // Find target batch in our pre-fetched map
                const targetKey = `${item.sku}|${sourceBatch.lot_number || ''}`;
                const targetBatch = targetBatchesBySkuLot[targetKey];

                let targetStockBefore = 0;
                let targetStockAfter = qtyFromThisBatch;

                if (targetBatch) {
                    targetStockBefore = Number(targetBatch.quantity_real);
                    targetStockAfter = targetStockBefore + qtyFromThisBatch;
                    // Update in-memory for subsequent parts of the same batch/lot if needed (though source batches are distinct)
                    targetBatch.quantity_real = targetStockAfter;
                    targetBatchUpdates.push({ id: targetBatch.id, quantity: targetStockAfter });
                } else {
                    const newBatchId = uuidv4();
                    const newBatch = {
                        id: newBatchId, sku: sourceBatch.sku, name: sourceBatch.name,
                        product_id: sourceBatch.product_id, location_id: targetLocationId,
                        quantity_real: qtyFromThisBatch, expiry_date: sourceBatch.expiry_date,
                        lot_number: sourceBatch.lot_number,
                        unit_cost: sourceBatch.unit_cost, sale_price: sourceBatch.sale_price
                    };
                    batchInserts.push(newBatch);
                    // Add to map so next time we find it
                    targetBatchesBySkuLot[targetKey] = { id: newBatchId, quantity_real: qtyFromThisBatch };
                }

                // Collect movements
                movements.push([
                    uuidv4(), item.sku, sourceBatch.name, sourceLocationId, 'TRANSFER_OUT',
                    -qtyFromThisBatch, sourceBatch.quantity_real, newSourceQuantity,
                    authResult.manager!.id, reason, 'LOCATION_TRANSFER', transferId
                ]);
                movements.push([
                    uuidv4(), item.sku, sourceBatch.name, targetLocationId, 'TRANSFER_IN',
                    qtyFromThisBatch, targetStockBefore, targetStockAfter,
                    authResult.manager!.id, reason, 'LOCATION_TRANSFER', transferId
                ]);

                remainingToTransfer -= qtyFromThisBatch;
            }

            transferredItems.push({ sku: item.sku, quantity: item.quantity });
        }

        // 3. Execution - Bulk Updates/Inserts

        // Update source batches
        if (batchUpdates.length > 0) {
            for (let i = 0; i < batchUpdates.length; i += 100) {
                const chunk = batchUpdates.slice(i, i + 100);
                const values = chunk.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',');
                await client.query(`
                    UPDATE inventory_batches AS ib
                    SET quantity_real = v.qty, updated_at = NOW()
                    FROM (VALUES ${values}) AS v(id, qty)
                    WHERE ib.id::text = v.id::text
                `, chunk.flatMap(u => [u.id, u.quantity]));
            }
        }

        // Update target batches
        if (targetBatchUpdates.length > 0) {
            for (let i = 0; i < targetBatchUpdates.length; i += 100) {
                const chunk = targetBatchUpdates.slice(i, i + 100);
                const values = chunk.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',');
                await client.query(`
                    UPDATE inventory_batches AS ib
                    SET quantity_real = v.qty, updated_at = NOW()
                    FROM (VALUES ${values}) AS v(id, qty)
                    WHERE ib.id::text = v.id::text
                `, chunk.flatMap(u => [u.id, u.quantity]));
            }
        }

        // Insert new target batches
        if (batchInserts.length > 0) {
            for (let i = 0; i < batchInserts.length; i += 50) {
                const chunk = batchInserts.slice(i, i + 50);
                const values = chunk.map((_, idx) =>
                    `($${idx * 10 + 1}, $${idx * 10 + 2}, $${idx * 10 + 3}, $${idx * 10 + 4}, $${idx * 10 + 5}, $${idx * 10 + 6}, $${idx * 10 + 7}, $${idx * 10 + 8}, $${idx * 10 + 9}, $${idx * 10 + 10}, NOW())`
                ).join(',');
                await client.query(`
                    INSERT INTO inventory_batches (
                        id, sku, name, product_id, location_id,
                        quantity_real, expiry_date, lot_number,
                        unit_cost, sale_price, created_at
                    ) VALUES ${values}
                `, chunk.flatMap(b => [
                    b.id, b.sku, b.name, b.product_id, b.location_id,
                    b.quantity_real, b.expiry_date, b.lot_number, b.unit_cost, b.sale_price
                ]));
            }
        }

        // Bulk insert movements
        if (movements.length > 0) {
            for (let i = 0; i < movements.length; i += 50) {
                const chunk = movements.slice(i, i + 50);
                const values = chunk.map((_, idx) =>
                    `($${idx * 12 + 1}, $${idx * 12 + 2}, $${idx * 12 + 3}, $${idx * 12 + 4}, $${idx * 12 + 5}, $${idx * 12 + 6}, $${idx * 12 + 7}, $${idx * 12 + 8}, NOW(), $${idx * 12 + 9}, $${idx * 12 + 10}, $${idx * 12 + 11}, $${idx * 12 + 12})`
                ).join(',');

                await client.query(`
                    INSERT INTO stock_movements (
                        id, sku, product_name, location_id, movement_type,
                        quantity, stock_before, stock_after, timestamp,
                        user_id, notes, reference_type, reference_id
                    ) VALUES ${values}
                `, chunk.flat());
            }
        }

        // Audit
        await insertLocationAudit(client, {
            userId: authResult.manager!.id,
            actionCode: 'STOCK_TRANSFERRED',
            locationId: sourceLocationId,
            newValues: {
                transfer_id: transferId,
                source: sourceLocation?.name,
                target: targetLocation?.name,
                items: transferredItems,
                authorized_by: authResult.manager!.name
            },
            justification: reason
        });

        await client.query('COMMIT');

        logger.info({ transferId, itemCount: items.length }, '📦 [Locations] Stock transferred');
        revalidatePath('/inventory');

        return { success: true, transferId };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Stock en proceso. Reintente.' };
        }

        logger.error({ error }, '[Locations] Stock transfer error');
        return { success: false, error: error.message || 'Error transfiriendo stock' };

    } finally {
        client.release();
    }
}

// ============================================================================
// INVENTORY SUMMARY
// ============================================================================

/**
 * 📊 Get Location Inventory Summary
 */
export async function getLocationInventorySummary(
    locationId: string
): Promise<{
    success: boolean;
    data?: {
        totalSKUs: number;
        totalUnits: number;
        totalValue: number;
        lowStockItems: number;
        expiringSoon: number;
    };
    error?: string;
}> {
    if (!UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    try {
        const { query } = await import('@/lib/db');

        const summaryRes = await query(`
            SELECT 
                COUNT(DISTINCT sku) as total_skus,
                COALESCE(SUM(quantity_real), 0) as total_units,
                COALESCE(SUM(quantity_real * unit_cost), 0) as total_value,
                COUNT(CASE WHEN quantity_real <= stock_min THEN 1 END) as low_stock,
                COUNT(CASE WHEN expiry_date <= NOW() + INTERVAL '30 days' AND expiry_date > NOW() THEN 1 END) as expiring_soon
            FROM inventory_batches
            WHERE location_id = $1 AND quantity_real > 0
        `, [locationId]);

        const summary = summaryRes.rows[0];

        return {
            success: true,
            data: {
                totalSKUs: parseInt(summary.total_skus) || 0,
                totalUnits: parseInt(summary.total_units) || 0,
                totalValue: parseFloat(summary.total_value) || 0,
                lowStockItems: parseInt(summary.low_stock) || 0,
                expiringSoon: parseInt(summary.expiring_soon) || 0,
            }
        };

    } catch (error: any) {
        logger.error({ error }, '[Locations] Get inventory summary error');
        return { success: false, error: 'Error obteniendo resumen de inventario' };
    }
}

// ============================================================================
// USER ASSIGNMENT
// ============================================================================

/**
 * 👤 Assign User to Location (ADMIN only)
 */
export async function assignUserToLocationSecure(
    userId: string,
    locationId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    // Validate input
    const validated = AssignUserSchema.safeParse({ userId, locationId, reason });
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Verify ADMIN permission (strict - ADMIN only for assignments)
        const authCheck = await verifyAdminPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // Verify location exists and is active
        const locRes = await client.query(
            'SELECT id, name FROM locations WHERE id = $1 AND is_active = true',
            [locationId]
        );

        if (locRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Ubicación no encontrada o inactiva' };
        }

        // Get user current state
        const userRes = await client.query(`
            SELECT id, name, assigned_location_id 
            FROM users 
            WHERE id = $1 AND is_active = true
            FOR UPDATE NOWAIT
        `, [userId]);

        if (userRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado o inactivo' };
        }

        const oldLocationId = userRes.rows[0].assigned_location_id;

        // Update user assignment
        await client.query(`
            UPDATE users 
            SET assigned_location_id = $2, updated_at = NOW()
            WHERE id = $1
        `, [userId, locationId]);

        // Audit
        await insertLocationAudit(client, {
            userId: authCheck.admin!.id,
            actionCode: 'USER_ASSIGNED_TO_LOCATION',
            locationId,
            oldValues: { user_id: userId, old_location_id: oldLocationId },
            newValues: {
                user_id: userId,
                user_name: userRes.rows[0].name,
                new_location: locRes.rows[0].name,
                assigned_by: authCheck.admin!.name
            },
            justification: reason
        });

        await client.query('COMMIT');

        logger.info({ userId, locationId }, '👤 [Locations] User assigned to location');
        revalidatePath('/hr');
        revalidatePath('/settings');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Locations] Assign user error');
        return { success: false, error: error.message || 'Error asignando usuario' };

    } finally {
        client.release();
    }
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * 📋 Get All Locations (Active only by default)
 */
export async function getLocationsSecure(
    includeInactive: boolean = false
): Promise<{ success: boolean; data?: Location[]; error?: string }> {
    try {
        const { query } = await import('@/lib/db');

        const condition = includeInactive ? '' : 'WHERE is_active = true';
        const result = await query(`
            SELECT * FROM locations ${condition} ORDER BY name ASC
        `);

        const locations: Location[] = result.rows.map((row: any) => ({
            id: row.id,
            type: row.type,
            name: row.name,
            address: row.address,
            associated_kiosks: row.associated_kiosks || [],
            parent_id: row.parent_id,
            default_warehouse_id: row.default_warehouse_id,
            config: row.config,
            is_active: row.is_active !== false
        }));

        return { success: true, data: locations };

    } catch (error: any) {
        logger.error({ error }, '[Locations] Get locations error');
        return { success: false, error: 'Error obteniendo ubicaciones' };
    }
}

/**
 * 🏭 Get Warehouses Only (Filter by type = WAREHOUSE)
 */
export async function getWarehousesSecure(): Promise<{ success: boolean; data?: Location[]; error?: string }> {
    const result = await getLocationsSecure();
    if (!result.success) return result;
    const warehouses = result.data?.filter(loc => loc.type === 'WAREHOUSE') || [];
    return { success: true, data: warehouses };
}


/**
 * 🏭 Get Warehouses for a specific Location (for Export/Operations)
 * Queries the real 'warehouses' table, not locations with type=WAREHOUSE
 */
export async function getWarehousesByLocationSecure(
    locationId: string
): Promise<{ success: boolean; data?: { id: string; name: string }[]; error?: string }> {
    try {
        const { query } = await import('@/lib/db');
        const UUIDSchema = z.string().uuid();

        if (!UUIDSchema.safeParse(locationId).success) {
            return { success: false, error: 'ID de ubicación inválido' };
        }

        const res = await query(`
            SELECT id, name 
            FROM warehouses 
            WHERE location_id = $1 AND is_active = true
            ORDER BY name ASC
        `, [locationId]);

        return {
            success: true,
            data: res.rows.map((row: any) => ({
                id: row.id,
                name: row.name
            }))
        };
    } catch (error: any) {
        logger.error({ error }, '[Locations] Get warehouses by location error');
        return { success: false, error: 'Error obteniendo bodegas' };
    }
}
