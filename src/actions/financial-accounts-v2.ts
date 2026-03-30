'use server';

/**
 * ============================================================================
 * FINANCIAL-ACCOUNTS-V2: Gestión Segura de Cuentas Financieras
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC: Crear/Desactivar solo ADMIN
 * - PIN requerido para operaciones sensibles
 * - Auditoría completa
 * - Filtrado por ubicación
 */

import { pool, query, type PoolClient } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import {
    getActorOrFail,
    PinRbacError,
    ROLE_GROUPS,
    requireRole,
    validatePinForRoles,
} from '@/lib/pin-rbac';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const AccountType = z.enum(['SAFE', 'BANK', 'PETTY_CASH', 'EQUITY']);

const CreateAccountSchema = z.object({
    name: z.string().min(3, 'Mínimo 3 caracteres').max(100),
    type: AccountType,
    locationId: UUIDSchema.optional(),
    initialBalance: z.number().nonnegative().default(0),
});

const UpdateAccountSchema = z.object({
    accountId: UUIDSchema,
    name: z.string().min(3).max(100).optional(),
    locationId: UUIDSchema.nullable().optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

type FinancialAccountsActor = Awaited<ReturnType<typeof getActorOrFail>>;

// ============================================================================
// HELPERS
// ============================================================================

async function requireFinancialAccountsActor(): Promise<FinancialAccountsActor | null> {
    try {
        return await getActorOrFail();
    } catch (error) {
        if (error instanceof PinRbacError) {
            return null;
        }

        throw error;
    }
}

async function validateFinancialAccountsPin(
    client: PoolClient,
    pin: string,
    allowedRoles: readonly string[]
): Promise<{ valid: boolean; authorizedBy?: { id: string; name: string; role: string } }> {
    try {
        const result = await validatePinForRoles(client, pin, allowedRoles, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { valid: false };
        }

        return {
            valid: true,
            authorizedBy: {
                id: result.authorizedBy.id,
                name: result.authorizedBy.name,
                role: result.authorizedBy.role,
            },
        };
    } catch {
        return { valid: false };
    }
}

// ============================================================================
// GET ACCOUNTS
// ============================================================================

/**
 * 📊 Obtener Cuentas Financieras (filtradas por ubicación)
 */
export async function getFinancialAccountsSecure(): Promise<{
    success: boolean;
    data?: Record<string, unknown>[];
    error?: string;
}> {
    const actor = await requireFinancialAccountsActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        let sql = `
            SELECT fa.*, l.name as location_name
            FROM financial_accounts fa
            LEFT JOIN locations l ON fa.location_id = l.id
            WHERE 1=1
        `;
        const params: (string | number | boolean | Date | string[] | null | undefined)[] = [];

        // Filtrar por ubicación si no es admin
        if (!ROLE_GROUPS.ADMIN.includes(actor.role as typeof ROLE_GROUPS.ADMIN[number]) && actor.locationId) {
            sql += ' AND (fa.location_id = $1 OR fa.location_id IS NULL)';
            params.push(actor.locationId);
        }

        sql += ' ORDER BY fa.created_at DESC';

        const res = await query(sql, params);
        return { success: true, data: res.rows };

    } catch (error: unknown) {
        logger.error({ error }, '[FinancialAccounts] Get error');
        return { success: false, error: 'Error obteniendo cuentas' };
    }
}

// ============================================================================
// CREATE ACCOUNT
// ============================================================================

/**
 * ➕ Crear Cuenta Financiera (Solo ADMIN + PIN)
 */
export async function createFinancialAccountSecure(
    data: z.infer<typeof CreateAccountSchema>,
    adminPin: string
): Promise<{ success: boolean; accountId?: string; error?: string }> {
    const actor = await requireFinancialAccountsActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.ADMIN);
    } catch {
        return { success: false, error: 'Requiere permisos de ADMIN' };
    }

    const validated = CreateAccountSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { name, type, locationId, initialBalance } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN ADMIN
        const authResult = await validateFinancialAccountsPin(client, adminPin, ROLE_GROUPS.ADMIN);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador inválido' };
        }

        // Crear cuenta
        const accountId = randomUUID();
        await client.query(`
            INSERT INTO financial_accounts (id, name, type, location_id, balance, is_active, created_at)
            VALUES ($1, $2, $3, $4, $5, true, NOW())
        `, [accountId, name, type, locationId || null, initialBalance]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'FINANCIAL_ACCOUNT_CREATED', 'FINANCIAL_ACCOUNT', $2, $3::jsonb, NOW())
        `, [actor.userId, accountId, JSON.stringify({
            name,
            type,
            location_id: locationId,
            initial_balance: initialBalance,
            created_by: actor.userName || actor.userId,
            authorized_by: authResult.authorizedBy?.id || null,
            authorized_by_name: authResult.authorizedBy?.name || null,
        })]);

        await client.query('COMMIT');

        logger.info({ accountId, name, type }, '➕ [FinancialAccounts] Account created');
        revalidatePath('/settings');
        return { success: true, accountId };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[FinancialAccounts] Create error');
        return { success: false, error: 'Error creando cuenta' };
    } finally {
        client.release();
    }
}

// ============================================================================
// UPDATE ACCOUNT
// ============================================================================

/**
 * ✏️ Actualizar Cuenta Financiera (MANAGER + PIN)
 */
export async function updateFinancialAccountSecure(
    data: z.infer<typeof UpdateAccountSchema>,
    managerPin: string
): Promise<{ success: boolean; error?: string }> {
    const actor = await requireFinancialAccountsActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.MANAGER);
    } catch {
        return { success: false, error: 'Requiere permisos de MANAGER' };
    }

    const validated = UpdateAccountSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { accountId, name, locationId } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN MANAGER
        const authResult = await validateFinancialAccountsPin(client, managerPin, ROLE_GROUPS.MANAGER);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de manager inválido' };
        }

        // Obtener valores anteriores
        const prevRes = await client.query('SELECT * FROM financial_accounts WHERE id = $1', [accountId]);
        if (prevRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Cuenta no encontrada' };
        }
        const prev = prevRes.rows[0];

        // Actualizar
        const updates: string[] = ['updated_at = NOW()'];
        const params: (string | number | boolean | Date | string[] | null | undefined)[] = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (locationId !== undefined) {
            updates.push(`location_id = $${paramIndex++}`);
            params.push(locationId);
        }

        params.push(accountId);
        await client.query(`
            UPDATE financial_accounts SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
        `, params);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, created_at)
            VALUES ($1, 'FINANCIAL_ACCOUNT_UPDATED', 'FINANCIAL_ACCOUNT', $2, $3::jsonb, $4::jsonb, NOW())
        `, [actor.userId, accountId, JSON.stringify({
            name: prev.name,
            location_id: prev.location_id,
        }), JSON.stringify({ name, location_id: locationId })]);

        await client.query('COMMIT');

        logger.info({ accountId }, '✏️ [FinancialAccounts] Account updated');
        revalidatePath('/settings');
        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[FinancialAccounts] Update error');
        return { success: false, error: 'Error actualizando cuenta' };
    } finally {
        client.release();
    }
}

// ============================================================================
// TOGGLE STATUS
// ============================================================================

/**
 * 🔄 Activar/Desactivar Cuenta (Solo ADMIN + PIN)
 */
export async function toggleAccountStatusSecure(
    accountId: string,
    newStatus: boolean,
    adminPin: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(accountId).success) {
        return { success: false, error: 'ID inválido' };
    }

    const actor = await requireFinancialAccountsActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }
    try {
        requireRole(actor, ROLE_GROUPS.ADMIN);
    } catch {
        return { success: false, error: 'Requiere permisos de ADMIN' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN ADMIN
        const authResult = await validateFinancialAccountsPin(client, adminPin, ROLE_GROUPS.ADMIN);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador inválido' };
        }

        // Actualizar
        const result = await client.query(`
            UPDATE financial_accounts SET is_active = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING name
        `, [newStatus, accountId]);

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Cuenta no encontrada' };
        }

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, $2, 'FINANCIAL_ACCOUNT', $3, $4::jsonb, NOW())
        `, [actor.userId, newStatus ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED', accountId, JSON.stringify({
            account_name: result.rows[0].name,
            new_status: newStatus,
            admin_name: actor.userName || actor.userId,
            authorized_by: authResult.authorizedBy?.id || null,
            authorized_by_name: authResult.authorizedBy?.name || null,
        })]);

        await client.query('COMMIT');

        logger.info({ accountId, newStatus }, '🔄 [FinancialAccounts] Status toggled');
        revalidatePath('/settings');
        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[FinancialAccounts] Toggle status error');
        return { success: false, error: 'Error cambiando estado' };
    } finally {
        client.release();
    }
}

// ============================================================================
// BALANCE & HISTORY
// ============================================================================

/**
 * 💰 Obtener Saldo Actual
 */
export async function getAccountBalance(
    accountId: string
): Promise<{ success: boolean; balance?: number; error?: string }> {
    if (!UUIDSchema.safeParse(accountId).success) {
        return { success: false, error: 'ID inválido' };
    }

    const actor = await requireFinancialAccountsActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const res = await query('SELECT balance FROM financial_accounts WHERE id = $1', [accountId]);
        if (res.rowCount === 0) {
            return { success: false, error: 'Cuenta no encontrada' };
        }
        return { success: true, balance: Number(res.rows[0].balance) };
    } catch (error: unknown) {
        logger.error({ error }, '[FinancialAccounts] Get balance error');
        return { success: false, error: 'Error obteniendo saldo' };
    }
}

/**
 * 📜 Historial de Movimientos de la Cuenta
 */
export async function getAccountHistory(
    accountId: string,
    page: number = 1,
    pageSize: number = 20
): Promise<{ success: boolean; data?: Record<string, unknown>[]; total?: number; error?: string }> {
    if (!UUIDSchema.safeParse(accountId).success) {
        return { success: false, error: 'ID inválido' };
    }

    const actor = await requireFinancialAccountsActor();
    if (!actor) {
        return { success: false, error: 'No autenticado' };
    }

    const offset = (page - 1) * Math.min(pageSize, 100);

    try {
        // Count
        const countRes = await query(`
            SELECT COUNT(*) as total FROM treasury_transactions
            WHERE account_id = $1
        `, [accountId]);
        const total = parseInt(countRes.rows[0]?.total || '0');

        // Data
        const res = await query(`
            SELECT tm.*, u.name as user_name
            FROM treasury_transactions tm
            LEFT JOIN users u ON tm.created_by = u.id
            WHERE tm.account_id = $1
            ORDER BY tm.created_at DESC
            LIMIT $2 OFFSET $3
        `, [accountId, pageSize, offset]);

        return { success: true, data: res.rows, total };

    } catch (error: unknown) {
        logger.error({ error }, '[FinancialAccounts] Get history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}
