'use server';

/**
 * ============================================================================
 * NETWORK-V2: Gestión de Red Organizacional Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES CRÍTICAS:
 * - ELIMINADOS todos los AUTO-DDL (ensure*Column)
 * - PIN ADMIN para crear/eliminar sucursales
 * - SERIALIZABLE para cambios organizacionales
 * - Auditoría completa
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import {
    getActorOrFail,
    PinRbacError,
    requireRole,
    ROLE_GROUPS,
    validatePinForRoles,
} from '@/lib/pin-rbac';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const CreateLocationSchema = z.object({
    name: z.string().min(3).max(100),
    address: z.string().min(5).max(200),
    phone: z.string().max(50).optional(),
    email: z.string().email().optional(),
    type: z.enum(['STORE', 'WAREHOUSE', 'HQ']).default('STORE'),
});

const UpdateLocationSchema = z.object({
    locationId: UUIDSchema,
    name: z.string().min(3).max(100).optional(),
    address: z.string().min(5).max(200).optional(),
    phone: z.string().max(50).optional(),
    email: z.string().email().optional(),
    managerId: UUIDSchema.optional(),
});

const CreateTerminalSchema = z.object({
    name: z.string().min(2).max(50),
    module_number: z.string().max(20).optional(),
    locationId: UUIDSchema,
    allowedUsers: z.array(UUIDSchema).optional(),
});

const UpdateTerminalSchema = z.object({
    terminalId: UUIDSchema,
    name: z.string().min(2).max(50).optional(),
    module_number: z.string().max(20).optional(),
    allowedUsers: z.array(UUIDSchema).optional(),
    isActive: z.boolean().optional(),
});



// ============================================================================
// CONSTANTS
// ============================================================================

type NetworkActor = Awaited<ReturnType<typeof getActorOrFail>>;

// ============================================================================
// HELPERS
// ============================================================================

async function requireNetworkActor(): Promise<NetworkActor | null> {
    try {
        return await getActorOrFail();
    } catch (error) {
        if (error instanceof PinRbacError) {
            return null;
        }

        throw error;
    }
}

async function validateAdminPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; admin?: { id: string; name: string; role: string }; error?: string }> {
    try {
        const result = await validatePinForRoles(client, pin, ROLE_GROUPS.ADMIN, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { valid: false, error: result.error || 'PIN de administrador inválido' };
        }

        return {
            valid: true,
            admin: {
                id: result.authorizedBy.id,
                name: result.authorizedBy.name,
                role: result.authorizedBy.role,
            },
        };
    } catch {
        return { valid: false, error: 'Error validando PIN' };
    }
}

async function validateManagerPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; manager?: { id: string; name: string; role: string }; error?: string }> {
    try {
        const result = await validatePinForRoles(client, pin, ROLE_GROUPS.MANAGER, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { valid: false, error: result.error || 'PIN de manager inválido' };
        }

        return {
            valid: true,
            manager: {
                id: result.authorizedBy.id,
                name: result.authorizedBy.name,
                role: result.authorizedBy.role,
            },
        };
    } catch {
        return { valid: false, error: 'Error validando PIN' };
    }
}

// ============================================================================
// GET ORGANIZATION STRUCTURE
// ============================================================================

/**
 * 🏢 Obtener Estructura Organizacional (con RBAC)
 */
export async function getOrganizationStructureSecure(explicitUserId?: string): Promise<{
    success: boolean;
    data?: { locations: any[]; terminals: any[] };
    error?: string;
}> {
    console.time('⏱️ [Network] getOrganizationStructureSecure');
    const actor = await requireNetworkActor();
    void explicitUserId; // Legacy compatibility: retained in signature but no longer trusted as identity source.

    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        let locationFilter = '';
        const params: any[] = [];
        const userRole = actor.role.toUpperCase();

        if (!ROLE_GROUPS.MANAGER.includes(userRole as typeof ROLE_GROUPS.MANAGER[number]) && actor.locationId) {
            locationFilter = 'WHERE l.id = $1';
            params.push(actor.locationId);
        } else if (!ROLE_GROUPS.MANAGER.includes(userRole as typeof ROLE_GROUPS.MANAGER[number])) {
            locationFilter = 'WHERE l.is_active = true';
        }

        console.log('📡 [Network] Fetching structure for user role:', userRole);
        const res = await query(`
            SELECT 
                l.id, l.name, l.address, l.type, l.phone, l.email, l.manager_id,
                l.is_active, l.default_warehouse_id, l.created_at, l.config,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', t.id,
                            'name', t.name,
                            'status', t.status,
                            'is_active', t.is_active
                        ) ORDER BY t.name
                    ) FILTER (WHERE t.id IS NOT NULL AND t.is_active = true),
                    '[]'
                ) as terminals
            FROM locations l
            LEFT JOIN terminals t ON t.location_id = l.id
            ${locationFilter}
            GROUP BY l.id
            ORDER BY l.name
        `, params);

        const locations = res.rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            address: row.address,
            type: row.type,
            phone: row.phone,
            email: row.email,
            manager_id: row.manager_id,
            is_active: row.is_active,
            config: row.config,
            terminals: row.terminals,
        }));

        const terminals = res.rows.flatMap((row: any) => row.terminals);

        console.timeEnd('⏱️ [Network] getOrganizationStructureSecure');
        return { success: true, data: { locations, terminals } };

    } catch (error: any) {
        logger.error({ error }, '[Network] Get structure error');
        return { success: false, error: 'Error obteniendo estructura' };
    }
}

// ============================================================================
// CREATE LOCATION
// ============================================================================

/**
 * 🏪 Crear Ubicación (Solo ADMIN + PIN)
 */
export async function createLocationSecure(
    data: z.infer<typeof CreateLocationSchema>,
    adminPin: string
): Promise<{ success: boolean; locationId?: string; error?: string }> {
    const actor = await requireNetworkActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.ADMIN);
    } catch {
        return { success: false, error: 'Requiere permisos de ADMIN o GERENTE_GENERAL' };
    }

    const validated = CreateLocationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { name, address, phone, email, type } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validar PIN ADMIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error || 'PIN de administrador inválido' };
        }

        // Crear ubicación
        const locationId = randomUUID();
        await client.query(`
            INSERT INTO locations (id, name, address, phone, email, type, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
        `, [locationId, name, address, phone, email, type]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'LOCATION_CREATED', 'LOCATION', $2, $3::jsonb, NOW())
        `, [actor.userId, locationId, JSON.stringify({
            name,
            address,
            type,
            created_by: actor.userName || actor.userId,
            authorized_by: authResult.admin!.name,
            authorized_by_id: authResult.admin!.id,
        })]);

        await client.query('COMMIT');

        logger.info({ locationId, name }, '🏪 [Network] Location created');
        revalidatePath('/settings/organization');
        return { success: true, locationId };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Network] Create location error');
        return { success: false, error: 'Error creando ubicación' };
    } finally {
        client.release();
    }
}

// ============================================================================
// UPDATE LOCATION
// ============================================================================

/**
 * ✏️ Actualizar Ubicación (MANAGER + PIN)
 */
export async function updateLocationSecure(
    data: z.infer<typeof UpdateLocationSchema>,
    managerPin: string
): Promise<{ success: boolean; error?: string }> {
    const actor = await requireNetworkActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.MANAGER);
    } catch {
        return { success: false, error: 'Requiere permisos de MANAGER' };
    }

    const validated = UpdateLocationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { locationId, name, address, phone, email, managerId } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN MANAGER
        const pinResult = await validateManagerPin(client, managerPin);
        const validManager = pinResult.valid ? pinResult.manager! : null;
        if (!validManager) {
            await client.query('ROLLBACK');
            return { success: false, error: pinResult.error || 'PIN de manager inválido' };
        }

        // Obtener valores anteriores
        const prevRes = await client.query('SELECT * FROM locations WHERE id = $1', [locationId]);
        if (prevRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Ubicación no encontrada' };
        }
        const prev = prevRes.rows[0];

        // Actualizar
        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [];
        let idx = 1;

        if (name) { updates.push(`name = $${idx++}`); params.push(name); }
        if (address) { updates.push(`address = $${idx++}`); params.push(address); }
        if (phone !== undefined) { updates.push(`phone = $${idx++}`); params.push(phone); }
        if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email); }
        if (managerId !== undefined) { updates.push(`manager_id = $${idx++}`); params.push(managerId); }

        params.push(locationId);
        await client.query(`UPDATE locations SET ${updates.join(', ')} WHERE id = $${idx}`, params);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, created_at)
            VALUES ($1, 'LOCATION_UPDATED', 'LOCATION', $2, $3::jsonb, $4::jsonb, NOW())
        `, [actor.userId, locationId, JSON.stringify({
            name: prev.name,
            address: prev.address,
        }), JSON.stringify({
            name,
            address,
            phone,
            email,
            authorized_by: validManager.name,
            authorized_by_id: validManager.id,
        })]);

        await client.query('COMMIT');

        logger.info({ locationId }, '✏️ [Network] Location updated');
        revalidatePath('/settings/organization');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Network] Update location error');
        return { success: false, error: 'Error actualizando ubicación' };
    } finally {
        client.release();
    }
}

// ============================================================================
// CREATE TERMINAL
// ============================================================================

/**
 * 💻 Crear Terminal (ADMIN + PIN)
 */
export async function createTerminalSecure(
    data: z.infer<typeof CreateTerminalSchema>,
    adminPin: string
): Promise<{ success: boolean; terminalId?: string; error?: string }> {
    const actor = await requireNetworkActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.ADMIN);
    } catch {
        return { success: false, error: 'Requiere permisos de ADMIN o GERENTE_GENERAL' };
    }

    const validated = CreateTerminalSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { name, module_number, locationId, allowedUsers } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN ADMIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error || 'PIN de administrador inválido' };
        }

        // Verificar ubicación existe
        const locRes = await client.query('SELECT id FROM locations WHERE id = $1', [locationId]);
        if (locRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Ubicación no encontrada' };
        }

        // Crear terminal
        const terminalId = randomUUID();
        await client.query(`
            INSERT INTO terminals (id, location_id, name, module_number, status, is_active, allowed_users, created_at)
            VALUES ($1, $2, $3, $4, 'CLOSED', true, $5, NOW())
        `, [terminalId, locationId, name, module_number || null, allowedUsers || []]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'TERMINAL_CREATE', 'TERMINAL', $2, $3::jsonb, NOW())
        `, [actor.userId, terminalId, JSON.stringify({
            name,
            location_id: locationId,
            created_by: actor.userName || actor.userId,
            authorized_by: authResult.admin!.name,
            authorized_by_id: authResult.admin!.id,
        })]);

        await client.query('COMMIT');

        logger.info({ terminalId, name, locationId }, '💻 [Network] Terminal created');
        revalidatePath('/settings/organization');
        revalidatePath('/settings');
        return { success: true, terminalId };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Network] Create terminal error');
        return { success: false, error: 'Error creando terminal' };
    } finally {
        client.release();
    }
}

// ============================================================================
// UPDATE TERMINAL
// ============================================================================

/**
 * 💻 Actualizar Terminal (ADMIN + PIN)
 */
export async function updateTerminalSecure(
    data: z.infer<typeof UpdateTerminalSchema>,
    adminPin: string
): Promise<{ success: boolean; error?: string }> {
    const actor = await requireNetworkActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.ADMIN);
    } catch {
        return { success: false, error: 'Requiere permisos de ADMIN o GERENTE_GENERAL' };
    }

    const validated = UpdateTerminalSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { terminalId, name, module_number, allowedUsers, isActive } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN ADMIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error || 'PIN de administrador inválido' };
        }

        // Obtener valores anteriores
        const prevRes = await client.query('SELECT * FROM terminals WHERE id = $1', [terminalId]);
        if (prevRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Terminal no encontrada' };
        }
        const prev = prevRes.rows[0];

        // Actualizar
        const updates: string[] = ['updated_at = NOW()'];
        const params: any[] = [];
        let idx = 1;

        if (name) { updates.push(`name = $${idx++}`); params.push(name); }
        if (module_number !== undefined) { updates.push(`module_number = $${idx++}`); params.push(module_number); }
        if (allowedUsers !== undefined) { updates.push(`allowed_users = $${idx++}`); params.push(allowedUsers); }
        if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); params.push(isActive); }

        params.push(terminalId);
        await client.query(`UPDATE terminals SET ${updates.join(', ')} WHERE id = $${idx}`, params);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, created_at)
            VALUES ($1, 'TERMINAL_UPDATE', 'TERMINAL', $2, $3::jsonb, $4::jsonb, NOW())
        `, [actor.userId, terminalId, JSON.stringify({
            name: prev.name,
            is_active: prev.is_active,
        }), JSON.stringify({
            name,
            is_active: isActive,
            authorized_by: authResult.admin!.name,
            authorized_by_id: authResult.admin!.id,
        })]);

        await client.query('COMMIT');

        logger.info({ terminalId }, '💻 [Network] Terminal updated');
        revalidatePath('/settings/organization');
        revalidatePath('/settings');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Network] Update terminal error');
        return { success: false, error: 'Error actualizando terminal: ' + (error.message || error) };
    } finally {
        client.release();
    }
}

// ============================================================================
// DELETE TERMINAL
// ============================================================================

/**
 * 🗑️ Eliminar/Desactivar Terminal (ADMIN + PIN)
 */
export async function deleteTerminalSecure(
    terminalId: string,
    adminPin: string
): Promise<{ success: boolean; error?: string }> {
    const actor = await requireNetworkActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.ADMIN);
    } catch {
        return { success: false, error: 'Requiere permisos de ADMIN o GERENTE_GENERAL' };
    }

    if (!UUIDSchema.safeParse(terminalId).success) {
        return { success: false, error: 'ID inválido' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN ADMIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error || 'PIN de administrador inválido' };
        }

        // Verificar si tiene sesiones
        const sessionCheck = await client.query('SELECT id FROM cash_register_sessions WHERE terminal_id = $1 LIMIT 1', [terminalId]);
        if ((sessionCheck.rowCount || 0) > 0) {
            // Soft delete
            await client.query('UPDATE terminals SET is_active = false, status = \'CLOSED\', updated_at = NOW() WHERE id = $1', [terminalId]);
        } else {
            // Hard delete
            await client.query('DELETE FROM terminals WHERE id = $1', [terminalId]);
        }

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, created_at)
            VALUES ($1, 'TERMINAL_DELETE', 'TERMINAL', $2, NOW())
        `, [actor.userId, terminalId]);

        await client.query('COMMIT');

        logger.info({ terminalId }, '🗑️ [Network] Terminal deleted');
        revalidatePath('/settings/organization');
        revalidatePath('/settings');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Network] Delete terminal error');
        return { success: false, error: 'Error eliminando terminal' };
    } finally {
        client.release();
    }
}


// ============================================================================
// ASSIGN EMPLOYEE
// ============================================================================

/**
 * 👤 Asignar Empleado a Ubicación (ADMIN + PIN)
 */
export async function assignEmployeeSecure(
    userId: string,
    locationId: string,
    adminPin: string
): Promise<{ success: boolean; error?: string }> {
    const actor = await requireNetworkActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.ADMIN);
    } catch {
        return { success: false, error: 'Requiere permisos de ADMIN o GERENTE_GENERAL' };
    }

    if (!UUIDSchema.safeParse(userId).success || !UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN ADMIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error || 'PIN de administrador inválido' };
        }

        // Actualizar asignación
        await client.query(`
            UPDATE users SET assigned_location_id = $2, updated_at = NOW()
            WHERE id = $1
        `, [userId, locationId]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'EMPLOYEE_ASSIGNED', 'USER', $2, $3::jsonb, NOW())
        `, [actor.userId, userId, JSON.stringify({
            assigned_location_id: locationId,
            assigned_by: actor.userName || actor.userId,
            authorized_by: authResult.admin!.name,
            authorized_by_id: authResult.admin!.id,
        })]);

        await client.query('COMMIT');

        logger.info({ userId, locationId }, '👤 [Network] Employee assigned');
        revalidatePath('/settings/organization');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Network] Assign employee error');
        return { success: false, error: 'Error asignando empleado' };
    } finally {
        client.release();
    }
}

// ============================================================================
// DEACTIVATE LOCATION
// ============================================================================

/**
 * 🚫 Desactivar Ubicación (ADMIN + PIN + razón)
 */
export async function deactivateLocationSecure(
    locationId: string,
    adminPin: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const actor = await requireNetworkActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.ADMIN);
    } catch {
        return { success: false, error: 'Requiere permisos de ADMIN o GERENTE_GENERAL' };
    }

    if (!UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'ID inválido' };
    }

    if (!reason || reason.length < 10) {
        return { success: false, error: 'La razón debe tener al menos 10 caracteres' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN ADMIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error || 'PIN de administrador inválido' };
        }

        // Desactivar
        await client.query(`
            UPDATE locations SET is_active = false, updated_at = NOW()
            WHERE id = $1
        `, [locationId]);

        // Desactivar terminales asociados
        await client.query(`
            UPDATE terminals SET is_active = false, updated_at = NOW()
            WHERE location_id = $1
        `, [locationId]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'LOCATION_DEACTIVATED', 'LOCATION', $2, $3::jsonb, NOW())
        `, [actor.userId, locationId, JSON.stringify({
            reason,
            deactivated_by: actor.userName || actor.userId,
            authorized_by: authResult.admin!.name,
            authorized_by_id: authResult.admin!.id,
        })]);

        await client.query('COMMIT');

        logger.info({ locationId, reason }, '🚫 [Network] Location deactivated');
        revalidatePath('/settings/organization');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Network] Deactivate location error');
        return { success: false, error: 'Error desactivando ubicación' };
    } finally {
        client.release();
    }
}

// ============================================================================
// UPDATE LOCATION CONFIG
// ============================================================================

/**
 * ⚙️ Actualizar Configuración de Ubicación (ADMIN)
 * Permite actualizar solo la config JSON de la ubicación
 */
export async function updateLocationConfigSecure(
    locationId: string,
    config: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    const actor = await requireNetworkActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.MANAGER);
    } catch {
        return { success: false, error: 'Requiere permisos de administrador' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Verificar existencia
        const locRes = await client.query(
            'SELECT id, config FROM locations WHERE id = $1 FOR UPDATE NOWAIT',
            [locationId]
        );

        if (locRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Ubicación no encontrada' };
        }

        const oldConfig = locRes.rows[0].config;

        // Actualizar config
        await client.query(`
            UPDATE locations 
            SET config = $2, updated_at = NOW()
            WHERE id = $1
        `, [locationId, JSON.stringify(config)]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, created_at)
            VALUES ($1, 'LOCATION_CONFIG_UPDATED', 'LOCATION', $2, $3::jsonb, $4::jsonb, NOW())
        `, [actor.userId, locationId, JSON.stringify({ config: oldConfig }), JSON.stringify({ config })]);

        await client.query('COMMIT');

        logger.info({ locationId }, '⚙️ [Network] Location config updated');
        revalidatePath('/settings');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Network] Update config error');
        return { success: false, error: 'Error actualizando configuración' };
    } finally {
        client.release();
    }
}
