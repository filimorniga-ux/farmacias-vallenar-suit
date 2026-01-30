'use server';

/**
 * ============================================================================
 * USERS-V2: Secure User Management Module
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * SECURITY IMPROVEMENTS:
 * - RBAC: Only ADMIN can create/modify users
 * - PIN hashed with bcrypt (never plaintext)
 * - SERIALIZABLE transactions for data integrity
 * - Input validation with Zod 
 * - Comprehensive audit logging
 * - Rate limiting on PIN resets
 * - Cannot deactivate last ADMIN
 * 
 * MIGRATION PATH:
 * - Deprecates users.ts functions
 * - Requires access_pin_hash column
 * - Run PIN migration script before use
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { randomUUID } from 'crypto';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const RUTSchema = z.string()
    .regex(/^\d{7,8}-[\dkK]$/, 'Formato RUT inválido (ej: 12345678-9)');

const EmailSchema = z.string()
    .email('Email inválido')
    .max(100);

const RoleSchema = z.enum(['CASHIER', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'DRIVER', 'QF', 'RRHH', 'CONTADOR', 'WAREHOUSE', 'WAREHOUSE_CHIEF']);

const PINSchema = z.string()
    .min(4, 'PIN debe tener al menos 4 dígitos')
    .max(6, 'PIN no puede exceder 6 dígitos')
    .regex(/^\d+$/, 'PIN debe contener solo números');

const CreateUserSchema = z.object({
    rut: RUTSchema,
    name: z.string().min(3, 'Nombre muy corto').max(100),
    email: EmailSchema.optional(),
    role: RoleSchema,
    access_pin: PINSchema,
    job_title: z.string().max(50).optional(),
    assigned_location_id: UUIDSchema.optional(),
    base_salary: z.number().min(0, 'Salario debe ser positivo').optional(),
    pension_fund: z.string().max(50).optional(),
    health_system: z.string().max(50).optional(),
    weekly_hours: z.number().min(1).max(168).optional(),
    contact_phone: z.string().max(20).optional(),
    allowed_modules: z.array(z.string()).optional(),
});

const UpdateUserSchema = z.object({
    userId: UUIDSchema,
    name: z.string().min(3).max(100).optional(),
    email: EmailSchema.optional(),
    job_title: z.string().max(50).optional(),
    contact_phone: z.string().max(20).optional(),
    base_salary: z.number().min(0).optional(),
    pension_fund: z.string().max(50).optional(),
    health_system: z.string().max(50).optional(),
    weekly_hours: z.number().min(1).max(168).optional(),
    assigned_location_id: UUIDSchema.optional(),
    allowed_modules: z.array(z.string()).optional(),
});

const ChangeRoleSchema = z.object({
    userId: UUIDSchema,
    newRole: RoleSchema,
    justification: z.string().min(10, 'Justificación requerida (mínimo 10 caracteres)'),
});

const ResetPinSchema = z.object({
    userId: UUIDSchema,
    newPin: PINSchema,
});

const DeactivateUserSchema = z.object({
    userId: UUIDSchema,
    reason: z.string().min(10, 'Razón requerida (mínimo 10 caracteres)'),
});

const GetUsersSchema = z.object({
    locationId: UUIDSchema.optional(),
    role: RoleSchema.optional(),
    isActive: z.boolean().optional(),
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(50),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const BCRYPT_ROUNDS = 10;

// ============================================================================
// TYPES
// ============================================================================

interface UserData {
    id: string;
    rut: string;
    name: string;
    email?: string;
    role: string;
    job_title?: string;
    status: string;
    is_active: boolean;
    assigned_location_id?: string;
    contact_phone?: string;
    base_salary?: number;
    pension_fund?: string;
    health_system?: string;
    weekly_hours?: number;
    created_at: Date;
    updated_at: Date;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current session from headers
 */
/**
 * Get current session (Headers first, then Cookies)
 */
async function getSession(): Promise<{ user?: { id: string; role: string } } | null> {
    try {
        const headersList = await headers();
        const { cookies } = await import('next/headers');

        // 1. Try Headers
        let userId = headersList.get('x-user-id');
        let role = headersList.get('x-user-role');

        // 2. Try Cookies
        if (!userId || !role) {
            const cookieStore = await cookies();
            userId = cookieStore.get('user_id')?.value || null;
            role = cookieStore.get('user_role')?.value || null;
        }

        if (!userId || !role) {
            return null;
        }

        return {
            user: {
                id: userId,
                role: role
            }
        };
    } catch {
        return null;
    }
}

/**
 * Get client IP address
 */
async function getClientIP(): Promise<string> {
    try {
        const headersList = await headers();
        const xForwardedFor = headersList.get('x-forwarded-for');
        if (xForwardedFor) {
            return xForwardedFor.split(',')[0].trim();
        }
        return headersList.get('x-real-ip') || 'unknown';
    } catch {
        return 'unknown';
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
        return { valid: false, error: 'Requiere permisos de ADMIN' };
    }

    return { valid: true, admin };
}

/**
 * Insert audit log for user operations
 */
async function insertUserAudit(client: any, params: {
    actionCode: string;
    userId: string;
    targetUserId: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    justification?: string;
}): Promise<void> {
    try {
        // Remove sensitive fields from audit
        const sanitizeValues = (values?: Record<string, any>) => {
            if (!values) return null;
            const { access_pin, access_pin_hash, ...safe } = values;
            return safe;
        };

        await client.query(`
            INSERT INTO audit_log (
                user_id, action_code, entity_type, entity_id,
                old_values, new_values, justification, created_at
            ) VALUES ($1, $2, 'USER', $3, $4::jsonb, $5::jsonb, $6, NOW())
        `, [
            params.userId,
            params.actionCode,
            params.targetUserId,
            params.oldValues ? JSON.stringify(sanitizeValues(params.oldValues)) : null,
            JSON.stringify(sanitizeValues(params.newValues)),
            params.justification || null
        ]);
    } catch (error) {
        console.error('[USERS-V2] Audit log failed:', error);
        // Don't throw - audit failure shouldn't break operation
    }
}

/**
 * Count active ADMINs
 */
async function countActiveAdmins(client: any): Promise<number> {
    const result = await client.query(`
        SELECT COUNT(*) as count
        FROM users
        WHERE role IN ('ADMIN', 'GERENTE_GENERAL')
        AND is_active = true
    `);
    return parseInt(result.rows[0].count);
}

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * 👤 Create User with Secure PIN
 */
export async function createUserSecure(data: z.infer<typeof CreateUserSchema>): Promise<{
    success: boolean;
    data?: UserData;
    error?: string;
}> {
    // 1. Validate input
    const validated = CreateUserSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Verify ADMIN permission
        const authCheck = await verifyAdminPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // 3. Check if RUT already exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE rut = $1',
            [validated.data.rut]
        );

        if (existingUser.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'El RUT ya está registrado' };
        }

        // 4. Hash PIN with bcrypt
        const bcrypt = await import('bcryptjs');
        const hashedPin = await bcrypt.hash(validated.data.access_pin, BCRYPT_ROUNDS);

        // 5. Create user
        const newUserId = randomUUID();
        const createResult = await client.query(`
            INSERT INTO users (
                id, rut, name, email, role, access_pin_hash,
                job_title, status, is_active, phone,
                base_salary, afp, health_system, weekly_hours,
                assigned_location_id, allowed_modules, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, 'ACTIVE', true, $8,
                $9, $10, $11, $12, $13, $14, NOW(), NOW()
            )
            RETURNING 
                id, rut, name, email, role, job_title, status, is_active,
                assigned_location_id, phone as contact_phone,
                base_salary, afp as pension_fund, health_system, weekly_hours,
                created_at, updated_at
        `, [
            newUserId,
            validated.data.rut,
            validated.data.name,
            validated.data.email || null,
            validated.data.role,
            hashedPin,
            validated.data.job_title || 'CAJERO_VENDEDOR',
            validated.data.contact_phone || null,
            validated.data.base_salary || 0,
            validated.data.pension_fund || null,
            validated.data.health_system || null,
            validated.data.weekly_hours || 45,
            validated.data.assigned_location_id || null,
            validated.data.allowed_modules || null
        ]);

        // 6. Audit log
        await insertUserAudit(client, {
            actionCode: 'USER_CREATED',
            userId: authCheck.admin!.id,
            targetUserId: newUserId,
            newValues: {
                rut: validated.data.rut,
                name: validated.data.name,
                role: validated.data.role,
                created_by: authCheck.admin!.name
            }
        });

        await client.query('COMMIT');

        // NOTIFICATION TRIGGER: New Employee/User
        (async () => {
            try {
                const { createNotificationSecure } = await import('./notifications-v2');
                await createNotificationSecure({
                    type: 'GENERAL', // Or specialized HR type
                    severity: 'INFO',
                    title: 'Nueva Contratación',
                    message: `Se ha registrado un nuevo colaborador: ${validated.data.name} (${validated.data.job_title})`,
                    metadata: { newUserId, role: validated.data.role }
                });
            } catch (e) {
                console.error('[Notification Trigger] Failed', e);
            }
        })();

        revalidatePath('/hr');
        revalidatePath('/settings');

        return {
            success: true,
            data: createResult.rows[0]
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[USERS-V2] Create user error:', error);
        return {
            success: false,
            error: error.message || 'Error al crear usuario'
        };
    } finally {
        client.release();
    }
}

/**
 * ✏️ Update User (ADMIN only)
 */
export async function updateUserSecure(data: z.infer<typeof UpdateUserSchema>): Promise<{
    success: boolean;
    data?: UserData;
    error?: string;
}> {
    // 1. Validate input
    const validated = UpdateUserSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Verify ADMIN permission
        const authCheck = await verifyAdminPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // 3. Get current user state FOR UPDATE
        const currentUser = await client.query(`
            SELECT 
                id, rut, name, email, role, job_title, status, is_active,
                assigned_location_id, phone as contact_phone,
                base_salary, afp as pension_fund, health_system, weekly_hours
            FROM users
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [validated.data.userId]);

        if (currentUser.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado' };
        }

        const oldValues = currentUser.rows[0];

        // 4. Build update query dynamically
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (validated.data.name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            values.push(validated.data.name);
        }
        if (validated.data.email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            values.push(validated.data.email);
        }
        if (validated.data.job_title !== undefined) {
            updates.push(`job_title = $${paramIndex++}`);
            values.push(validated.data.job_title);
        }
        if (validated.data.contact_phone !== undefined) {
            updates.push(`phone = $${paramIndex++}`);
            values.push(validated.data.contact_phone);
        }
        if (validated.data.base_salary !== undefined) {
            updates.push(`base_salary = $${paramIndex++}`);
            values.push(validated.data.base_salary);
        }
        if (validated.data.pension_fund !== undefined) {
            updates.push(`afp = $${paramIndex++}`);
            values.push(validated.data.pension_fund);
        }
        if (validated.data.health_system !== undefined) {
            updates.push(`health_system = $${paramIndex++}`);
            values.push(validated.data.health_system);
        }
        if (validated.data.weekly_hours !== undefined) {
            updates.push(`weekly_hours = $${paramIndex++}`);
            values.push(validated.data.weekly_hours);
        }
        if (validated.data.assigned_location_id !== undefined) {
            updates.push(`assigned_location_id = $${paramIndex++}`);
            values.push(validated.data.assigned_location_id);
        }
        if (validated.data.allowed_modules !== undefined) {
            updates.push(`allowed_modules = $${paramIndex++}`);
            values.push(validated.data.allowed_modules);
        }

        if (updates.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No hay datos para actualizar' };
        }

        updates.push(`updated_at = NOW()`);
        values.push(validated.data.userId);

        // 5. Execute update
        const updateResult = await client.query(`
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING 
                id, rut, name, email, role, job_title, status, is_active,
                assigned_location_id, phone as contact_phone,
                base_salary, afp as pension_fund, health_system, weekly_hours,
                created_at, updated_at
        `, values);

        // 6. Audit log with old/new values
        await insertUserAudit(client, {
            actionCode: 'USER_UPDATED',
            userId: authCheck.admin!.id,
            targetUserId: validated.data.userId,
            oldValues,
            newValues: updateResult.rows[0]
        });

        await client.query('COMMIT');

        revalidatePath('/hr');

        return {
            success: true,
            data: updateResult.rows[0]
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[USERS-V2] Update user error:', error);

        if (error.code === '55P03') { // Lock not available
            return { success: false, error: 'Usuario está siendo modificado por otro proceso' };
        }

        return {
            success: false,
            error: error.message || 'Error al actualizar usuario'
        };
    } finally {
        client.release();
    }
}

/**
 * 🔄 Change User Role (with justification)
 */
export async function changeUserRoleSecure(data: z.infer<typeof ChangeRoleSchema>): Promise<{
    success: boolean;
    error?: string;
}> {
    // 1. Validate input
    const validated = ChangeRoleSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Verify ADMIN permission
        const authCheck = await verifyAdminPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // STRICT SECURITY: Only GERENTE_GENERAL can change roles
        if (authCheck.admin!.role !== 'GERENTE_GENERAL') {
            await client.query('ROLLBACK');
            await insertUserAudit(client, {
                actionCode: 'ROLE_CHANGE_ATTEMPT_DENIED',
                userId: authCheck.admin!.id,
                targetUserId: validated.data.userId,
                justification: 'Attempted to change role without Gerente General privileges'
            });
            return { success: false, error: 'Solo la Gerencia General puede asignar o cambiar roles.' };
        }

        // 3. Cannot change own role
        if (authCheck.admin!.id === validated.data.userId) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No puedes cambiar tu propio rol' };
        }

        // 4. Get current user FOR UPDATE
        const currentUser = await client.query(`
            SELECT id, name, role
            FROM users
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [validated.data.userId]);

        if (currentUser.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado' };
        }

        const oldRole = currentUser.rows[0].role;

        // 5. If removing ADMIN/GERENTE_GENERAL, check not last admin
        if (ADMIN_ROLES.includes(oldRole.toUpperCase()) &&
            !ADMIN_ROLES.includes(validated.data.newRole.toUpperCase())) {

            const adminCount = await countActiveAdmins(client);
            if (adminCount <= 1) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    error: 'No se puede remover el último administrador del sistema'
                };
            }
        }

        // 6. Update role
        await client.query(`
            UPDATE users
            SET role = $1, updated_at = NOW()
            WHERE id = $2
        `, [validated.data.newRole, validated.data.userId]);

        // 7. Audit with justification
        await insertUserAudit(client, {
            actionCode: 'ROLE_CHANGED',
            userId: authCheck.admin!.id,
            targetUserId: validated.data.userId,
            oldValues: { role: oldRole },
            newValues: { role: validated.data.newRole },
            justification: validated.data.justification
        });

        await client.query('COMMIT');

        revalidatePath('/hr');
        revalidatePath('/settings');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[USERS-V2] Change role error:', error);
        return {
            success: false,
            error: error.message || 'Error al cambiar rol'
        };
    } finally {
        client.release();
    }
}

/**
 * 🔑 Reset User PIN (ADMIN only)
 */
export async function resetUserPinSecure(data: z.infer<typeof ResetPinSchema>): Promise<{
    success: boolean;
    error?: string;
}> {
    // 1. Validate input
    const validated = ResetPinSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Verify ADMIN permission
        const authCheck = await verifyAdminPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // 3. Check rate limiting (integrate with rate-limiter.ts)
        const { checkRateLimit, recordFailedAttempt, resetAttempts } =
            await import('@/lib/rate-limiter');

        const rateCheck = checkRateLimit(validated.data.userId);
        if (!rateCheck.allowed) {
            await client.query('ROLLBACK');
            return { success: false, error: rateCheck.reason };
        }

        // 4. Hash new PIN
        const bcrypt = await import('bcryptjs');
        const hashedPin = await bcrypt.hash(validated.data.newPin, BCRYPT_ROUNDS);

        // 5. Update PIN
        const updateResult = await client.query(`
            UPDATE users
            SET access_pin_hash = $1,
                access_pin = NULL,
                updated_at = NOW()
            WHERE id = $2
            RETURNING name
        `, [hashedPin, validated.data.userId]);

        if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado' };
        }

        // 6. Reset rate limit attempts
        resetAttempts(validated.data.userId);

        // 7. Audit
        await insertUserAudit(client, {
            actionCode: 'PIN_RESET',
            userId: authCheck.admin!.id,
            targetUserId: validated.data.userId,
            newValues: {
                reset_by: authCheck.admin!.name,
                user_name: updateResult.rows[0].name
            }
        });

        await client.query('COMMIT');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[USERS-V2] Reset PIN error:', error);
        return {
            success: false,
            error: error.message || 'Error al resetear PIN'
        };
    } finally {
        client.release();
    }
}

/**
 * 🚫 Deactivate User (soft delete)
 */
export async function deactivateUserSecure(data: z.infer<typeof DeactivateUserSchema>): Promise<{
    success: boolean;
    error?: string;
}> {
    // 1. Validate input
    const validated = DeactivateUserSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Verify ADMIN permission
        const authCheck = await verifyAdminPermission(client);
        if (!authCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authCheck.error };
        }

        // 3. Cannot deactivate self
        if (authCheck.admin!.id === validated.data.userId) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No puedes desactivarte a ti mismo' };
        }

        // 4. Get user FOR UPDATE
        const userResult = await client.query(`
            SELECT id, name, role, is_active
            FROM users
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [validated.data.userId]);

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Usuario no encontrado' };
        }

        const user = userResult.rows[0];

        // 5. If is ADMIN, check not last admin
        const userRole = user.role?.toUpperCase();
        if (ADMIN_ROLES.includes(userRole)) {
            const adminCount = await countActiveAdmins(client);
            if (adminCount <= 1) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    error: 'No se puede desactivar el último administrador del sistema'
                };
            }
        }

        // 6. Soft delete (set is_active = false)
        await client.query(`
            UPDATE users
            SET is_active = false,
                status = 'TERMINATED',
                updated_at = NOW()
            WHERE id = $1
        `, [validated.data.userId]);

        // 7. Audit with reason
        await insertUserAudit(client, {
            actionCode: 'USER_DEACTIVATED',
            userId: authCheck.admin!.id,
            targetUserId: validated.data.userId,
            oldValues: { is_active: true, status: user.status },
            newValues: { is_active: false, status: 'TERMINATED' },
            justification: validated.data.reason
        });

        await client.query('COMMIT');

        revalidatePath('/hr');
        revalidatePath('/settings');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[USERS-V2] Deactivate user error:', error);

        if (error.code === '55P03') {
            return { success: false, error: 'Usuario está siendo modificado por otro proceso' };
        }

        return {
            success: false,
            error: error.message || 'Error al desactivar usuario'
        };
    } finally {
        client.release();
    }
}

/**
 * 📋 Get Users (with filters and pagination)
 */
export async function getUsersSecure(filters?: z.infer<typeof GetUsersSchema>): Promise<{
    success: boolean;
    data?: {
        users: UserData[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    error?: string;
}> {
    // 1. Validate filters
    const validated = GetUsersSchema.safeParse(filters || {});
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Filtros inválidos'
        };
    }

    const session = await getSession();
    const ALLOWED_VIEW_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH', 'CONTADOR'];

    if (!session || !session.user) {
        return { success: false, error: 'No autenticado' };
    }

    // Normalize role check
    const userRole = session.user.role?.toUpperCase();
    if (!ALLOWED_VIEW_ROLES.includes(userRole)) {
        return { success: false, error: 'No autorizado para ver empleados' };
    }

    try {
        // 2. Build WHERE clause
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (validated.data.locationId) {
            conditions.push(`assigned_location_id = $${paramIndex++}`);
            params.push(validated.data.locationId);
        }

        if (validated.data.role) {
            conditions.push(`role = $${paramIndex++}`);
            params.push(validated.data.role);
        }

        if (validated.data.isActive !== undefined) {
            conditions.push(`is_active = $${paramIndex++}`);
            params.push(validated.data.isActive);
        }

        // Always show Managers/Admins first in results
        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        // 3. Get total count
        const countResult = await pool.query(`
            SELECT COUNT(*) as total
            FROM users
            ${whereClause}
        `, params);

        const total = parseInt(countResult.rows[0].total);

        // 4. Get paginated users (NEVER return access_pin or access_pin_hash)
        const offset = (validated.data.page - 1) * validated.data.pageSize;

        params.push(validated.data.pageSize);
        params.push(offset);

        const usersResult = await pool.query(`
            SELECT 
                id, rut, name, email, role, job_title, status, is_active,
                assigned_location_id, phone as contact_phone,
                base_salary, afp as pension_fund, health_system, weekly_hours,
                created_at, updated_at
            FROM users
            ${whereClause}
            ORDER BY 
                CASE 
                    WHEN role = 'ADMIN' THEN 1 
                    WHEN role = 'GERENTE_GENERAL' THEN 2
                    WHEN role = 'MANAGER' THEN 3 
                    ELSE 4 
                END,
                name ASC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `, params);

        const totalPages = Math.ceil(total / validated.data.pageSize);

        return {
            success: true,
            data: {
                users: usersResult.rows,
                total,
                page: validated.data.page,
                pageSize: validated.data.pageSize,
                totalPages
            }
        };

    } catch (error: any) {
        console.error('[USERS-V2] Get users error:', error);
        return {
            success: false,
            error: error.message || 'Error al obtener usuarios'
        };
    }
}
