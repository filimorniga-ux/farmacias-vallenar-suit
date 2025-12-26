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
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

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
    locationId: UUIDSchema,
    allowedUsers: z.array(UUIDSchema).optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined };
    } catch {
        return null;
    }
}

async function validateAdminPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; admin?: { id: string; name: string } }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');

        const adminsRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [ADMIN_ROLES]);

        for (const admin of adminsRes.rows) {
            const rateCheck = checkRateLimit(admin.id);
            if (!rateCheck.allowed) continue;

            if (admin.access_pin_hash) {
                const valid = await bcrypt.compare(pin, admin.access_pin_hash);
                if (valid) {
                    resetAttempts(admin.id);
                    return { valid: true, admin: { id: admin.id, name: admin.name } };
                }
                recordFailedAttempt(admin.id);
            } else if (admin.access_pin === pin) {
                resetAttempts(admin.id);
                return { valid: true, admin: { id: admin.id, name: admin.name } };
            }
        }
        return { valid: false };
    } catch {
        return { valid: false };
    }
}

// ============================================================================
// GET ORGANIZATION STRUCTURE
// ============================================================================

/**
 * 🏢 Obtener Estructura Organizacional (con RBAC)
 */
export async function getOrganizationStructureSecure(): Promise<{
    success: boolean;
    data?: { locations: any[]; terminals: any[] };
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        let locationFilter = '';
        const params: any[] = [];

        if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
            locationFilter = 'WHERE l.id = $1';
            params.push(session.locationId);
        } else if (!ADMIN_ROLES.includes(session.role)) {
            locationFilter = 'WHERE l.is_active = true';
        }

        const res = await query(`
            SELECT 
                l.id, l.name, l.address, l.type, l.phone, l.email, l.manager_id,
                l.is_active, l.default_warehouse_id, l.created_at,
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
            terminals: row.terminals,
        }));

        const terminals = res.rows.flatMap((row: any) => row.terminals);

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
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
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
            return { success: false, error: 'PIN de administrador inválido' };
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
        `, [authResult.admin!.id, locationId, JSON.stringify({
            name,
            address,
            type,
            created_by: authResult.admin!.name,
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
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
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
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const managersRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [MANAGER_ROLES]);

        let validManager: { id: string; name: string } | null = null;
        for (const user of managersRes.rows) {
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) continue;

            if (user.access_pin_hash) {
                const valid = await bcrypt.compare(managerPin, user.access_pin_hash);
                if (valid) {
                    resetAttempts(user.id);
                    validManager = { id: user.id, name: user.name };
                    break;
                }
                recordFailedAttempt(user.id);
            } else if (user.access_pin === managerPin) {
                resetAttempts(user.id);
                validManager = { id: user.id, name: user.name };
                break;
            }
        }

        if (!validManager) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de manager inválido' };
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
        `, [validManager.id, locationId, JSON.stringify({
            name: prev.name,
            address: prev.address,
        }), JSON.stringify({ name, address, phone, email })]);

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
    const validated = CreateTerminalSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { name, locationId, allowedUsers } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN ADMIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador inválido' };
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
            INSERT INTO terminals (id, location_id, name, status, is_active, allowed_users, created_at)
            VALUES ($1, $2, $3, 'CLOSED', true, $4, NOW())
        `, [terminalId, locationId, name, allowedUsers || []]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'TERMINAL_CREATED', 'TERMINAL', $2, $3::jsonb, NOW())
        `, [authResult.admin!.id, terminalId, JSON.stringify({
            name,
            location_id: locationId,
            created_by: authResult.admin!.name,
        })]);

        await client.query('COMMIT');

        logger.info({ terminalId, name, locationId }, '💻 [Network] Terminal created');
        revalidatePath('/settings/organization');
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
            return { success: false, error: 'PIN de administrador inválido' };
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
        `, [authResult.admin!.id, userId, JSON.stringify({
            assigned_location_id: locationId,
            assigned_by: authResult.admin!.name,
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
            return { success: false, error: 'PIN de administrador inválido' };
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
        `, [authResult.admin!.id, locationId, JSON.stringify({
            reason,
            deactivated_by: authResult.admin!.name,
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

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL', 'MANAGER'];
    if (!ADMIN_ROLES.includes(session.role)) {
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
        `, [session.userId, locationId, JSON.stringify({ config: oldConfig }), JSON.stringify({ config })]);

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
