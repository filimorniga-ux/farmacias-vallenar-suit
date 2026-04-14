'use server';

/**
 * ============================================================================
 * RECONCILIATION-V2: Secure Financial Reconciliation Module
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * SECURITY IMPROVEMENTS:
 * - SERIALIZABLE transactions for data integrity
 * - Manager PIN validation (bcrypt)
 * - RBAC enforcement (MANAGER/ADMIN only)
 * - Mandatory audit logging (fails if audit fails)
 * - Zod validation for all inputs
 * - Rate limiting on reconciliation attempts
 * - SQL injection prevention
 * 
 * FIXES VULNERABILITIES:
 * - REC-001: No SERIALIZABLE transactions
 * - REC-002: No manager PIN validation
 * - REC-003: No RBAC verification
 * - REC-004: Silent audit log failures
 * - REC-005: SQL injection in notes
 * - REC-006: No rate limiting
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { resolveActorResult } from './actor-result';
import { resolveScopedLocation } from './scoped-location';
import {
    PinRbacError,
    ROLE_GROUPS,
    requireRole,
    type PinRbacActor,
    validatePinForRoles,
} from '@/lib/pin-rbac';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const PerformReconciliationSchema = z.object({
    sessionId: UUIDSchema,
    realClosingAmount: z.number().min(0, 'Monto no puede ser negativo'),
    managerNotes: z.string().min(10, 'Notas deben tener al menos 10 caracteres'),
    managerPin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN debe ser numérico'),
});

const ApproveReconciliationSchema = z.object({
    sessionId: UUIDSchema,
    adminPin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN debe ser numérico'),
    approvalNotes: z.string().min(10),
});

const GetHistorySchema = z.object({
    locationId: UUIDSchema.optional(),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    minDiscrepancy: z.number().optional(),
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(50),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const LARGE_DISCREPANCY_THRESHOLD = 50000; // CLP - requires admin approval

// ============================================================================
// TYPES
// ============================================================================

interface ReconciliationResult {
    expectedAmount: number;
    realAmount: number;
    difference: number;
    requiresApproval: boolean;
}

type ReconciliationActor = PinRbacActor;

type ScopedSession = {
    id: string;
    opening_amount: number;
    closing_amount: number;
    difference: number;
    status: string;
    terminal_id: string;
    location_id: string | null;
    reconciled_by?: string | null;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
 * Validate manager PIN with bcrypt
 */
async function requireReconciliationActor(
    allowedRoles?: readonly string[],
    forbiddenMessage = 'Permisos insuficientes'
): Promise<
    | { success: true; actor: ReconciliationActor }
    | { success: false; error: string }
> {
    const actorResult = await resolveActorResult();
    if (!actorResult.success) {
        return actorResult;
    }

    try {
        const actor = allowedRoles
            ? requireRole(actorResult.actor, allowedRoles)
            : actorResult.actor;
        return { success: true, actor };
    } catch (error) {
        if (!(error instanceof PinRbacError)) {
            throw error;
        }

        return {
            success: false,
            error: forbiddenMessage,
        };
    }
}

function hasGlobalReconciliationScope(actor: ReconciliationActor): boolean {
    return ROLE_GROUPS.ADMIN.includes(actor.role as typeof ROLE_GROUPS.ADMIN[number]);
}

function canActorAccessReconciliationLocation(actor: ReconciliationActor, locationId: string | null | undefined): boolean {
    return resolveScopedLocation(
        actor,
        locationId || undefined,
        () => hasGlobalReconciliationScope(actor),
    ).success;
}

async function getScopedSessionForReconciliation(
    client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> },
    sessionId: string,
    actor: ReconciliationActor,
    forUpdate: boolean = false,
): Promise<
    | { success: true; session: ScopedSession }
    | { success: false; error: string }
> {
    const result = await client.query(
        `
        SELECT
            s.id,
            s.opening_amount,
            s.closing_amount,
            s.difference,
            s.status,
            s.terminal_id,
            t.location_id,
            s.reconciled_by
        FROM cash_register_sessions s
        LEFT JOIN terminals t ON t.id = s.terminal_id
        WHERE s.id = $1
        ${forUpdate ? 'FOR UPDATE NOWAIT' : ''}
    `,
        [sessionId],
    );

    if (result.rows.length === 0) {
        return { success: false, error: 'Sesión no encontrada' };
    }

    const session = result.rows[0] as unknown as ScopedSession;
    if (!canActorAccessReconciliationLocation(actor, session.location_id)) {
        return { success: false, error: 'Acceso denegado para la sucursal de la sesión' };
    }

    return { success: true, session };
}

async function validateReconciliationPin(
    client: any,
    pin: string,
    requiredRoles: readonly string[]
): Promise<{
    valid: boolean;
    authorizer?: { id: string; name: string; role: string };
    error?: string;
}> {
    try {
        const result = await validatePinForRoles(client, pin, requiredRoles, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { valid: false, error: result.error || 'PIN inválido' };
        }

        return {
            valid: true,
            authorizer: {
                id: result.authorizedBy.id,
                name: result.authorizedBy.name,
                role: result.authorizedBy.role,
            },
        };
    } catch (error) {
        console.error('[RECONCILIATION-V2] PIN validation error:', error);
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Insert audit log (mandatory - fail if error)
 */
async function insertReconciliationAudit(client: any, params: {
    actionCode: string;
    userId: string;
    sessionId: string;
    oldValues?: Record<string, any>;
    newValues: Record<string, any>;
    notes?: string;
}): Promise<void> {
    const ipAddress = await getClientIP();

    await client.query(`
        INSERT INTO audit_log (
            user_id, action_code, entity_type, entity_id,
            old_values, new_values, justification, ip_address, created_at
        ) VALUES ($1, $2, 'SESSION', $3, $4::jsonb, $5::jsonb, $6, $7, NOW())
    `, [
        params.userId,
        params.actionCode,
        params.sessionId,
        params.oldValues ? JSON.stringify(params.oldValues) : null,
        JSON.stringify(params.newValues),
        params.notes || null,
        ipAddress
    ]);
}

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * 💰 Calculate Discrepancy (Read-only)
 */
export async function calculateDiscrepancySecure(sessionId: string): Promise<{
    success: boolean;
    data?: ReconciliationResult;
    error?: string;
}> {
    const auth = await requireReconciliationActor(
        ROLE_GROUPS.MANAGER,
        'Solo managers pueden consultar discrepancias'
    );
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    // Validate input
    const validated = UUIDSchema.safeParse(sessionId);
    if (!validated.success) {
        return { success: false, error: 'Session ID inválido' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Calculate expected amount
        const scopedSession = await getScopedSessionForReconciliation(client, validated.data, auth.actor);
        if (!scopedSession.success) {
            await client.query('ROLLBACK');
            return { success: false, error: scopedSession.error };
        }

        const session = scopedSession.session;
        const metricsResult = await client.query(`
            SELECT 
                COALESCE((SELECT SUM(total) FROM sales WHERE shift_id = $1 AND payment_method = 'CASH'), 0) as cash_sales,
                COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = $1 AND type = 'EXPENSE'), 0) as expenses,
                COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = $1 AND type = 'WITHDRAWAL'), 0) as withdrawals,
                COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = $1 AND type = 'DEPOSIT'), 0) as deposits
        `, [validated.data]);

        const m = metricsResult.rows[0];
        const expectedAmount = Number(session.opening_amount)
            + Number(m.cash_sales)
            + Number(m.deposits)
            - Number(m.expenses)
            - Number(m.withdrawals);

        const realAmount = Number(session.closing_amount) || 0;
        const difference = realAmount - expectedAmount;
        const requiresApproval = Math.abs(difference) >= LARGE_DISCREPANCY_THRESHOLD;

        await client.query('COMMIT');

        return {
            success: true,
            data: {
                expectedAmount,
                realAmount,
                difference,
                requiresApproval
            }
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[RECONCILIATION-V2] Calculate discrepancy error:', error);
        return {
            success: false,
            error: error.message || 'Error calculando discrepancia'
        };
    } finally {
        client.release();
    }
}

/**
 * ✅ Perform Reconciliation (Manager PIN Required)
 */
export async function performReconciliationSecure(data: z.infer<typeof PerformReconciliationSchema>): Promise<{
    success: boolean;
    data?: ReconciliationResult;
    error?: string;
}> {
    const auth = await requireReconciliationActor(
        ROLE_GROUPS.MANAGER,
        'Solo managers pueden conciliar sesiones'
    );
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    // 1. Validate input
    const validated = PerformReconciliationSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validate manager PIN
        const pinCheck = await validateReconciliationPin(client, validated.data.managerPin, ROLE_GROUPS.MANAGER);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: pinCheck.error };
        }

        // 3. Lock and get session FOR UPDATE
        const scopedSession = await getScopedSessionForReconciliation(
            client,
            validated.data.sessionId,
            auth.actor,
            true,
        );
        if (!scopedSession.success) {
            await client.query('ROLLBACK');
            return { success: false, error: scopedSession.error };
        }

        const session = scopedSession.session;
        const oldClosingAmount = session.closing_amount;
        const oldDifference = session.difference;

        if (session.status === 'RECONCILED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Sesión ya fue conciliada' };
        }

        if (session.status === 'APPROVED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Sesión ya fue aprobada' };
        }

        if (session.status !== 'CLOSED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'La sesión debe estar cerrada antes de conciliar' };
        }

        // 4. Calculate expected amount
        const metricsResult = await client.query(`
            SELECT 
                COALESCE((SELECT SUM(total) FROM sales WHERE shift_id = $1 AND payment_method = 'CASH'), 0) as cash_sales,
                COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = $1 AND type = 'EXPENSE'), 0) as expenses,
                COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = $1 AND type = 'WITHDRAWAL'), 0) as withdrawals,
                COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = $1 AND type = 'DEPOSIT'), 0) as deposits
        `, [validated.data.sessionId]);

        const m = metricsResult.rows[0];
        const expectedAmount = Number(session.opening_amount)
            + Number(m.cash_sales)
            + Number(m.deposits)
            - Number(m.expenses)
            - Number(m.withdrawals);

        const realAmount = validated.data.realClosingAmount;
        const difference = realAmount - expectedAmount;
        const requiresApproval = Math.abs(difference) >= LARGE_DISCREPANCY_THRESHOLD;

        // 5. Update session (use parameterized query to prevent SQL injection)
        await client.query(`
            UPDATE cash_register_sessions
            SET 
                closing_amount = $1,
                difference = $2,
                status = 'RECONCILED',
                notes = COALESCE(notes, '') || $3,
                reconciled_at = NOW(),
                reconciled_by = $4,
                updated_at = NOW()
            WHERE id = $5
        `, [
            realAmount,
            difference,
            ` | [CONCILIADO ${new Date().toISOString()}]: ${validated.data.managerNotes}`,
            auth.actor.userId,
            validated.data.sessionId
        ]);

        // 6. Mandatory audit log (will throw if fails)
        await insertReconciliationAudit(client, {
            actionCode: 'SESSION_RECONCILED',
            userId: auth.actor.userId,
            sessionId: validated.data.sessionId,
            oldValues: {
                closing_amount: oldClosingAmount,
                difference: oldDifference,
                status: session.status
            },
            newValues: {
                closing_amount: realAmount,
                difference,
                expected_amount: expectedAmount,
                reconciled_by: auth.actor.userName,
                authorized_by: pinCheck.authorizer?.name,
                requires_admin_approval: requiresApproval
            },
            notes: validated.data.managerNotes
        });

        await client.query('COMMIT');

        revalidatePath('/reports');
        revalidatePath('/dashboard');
        revalidatePath('/finance/treasury');

        return {
            success: true,
            data: {
                expectedAmount,
                realAmount,
                difference,
                requiresApproval
            }
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[RECONCILIATION-V2] Perform reconciliation error:', error);

        if (error.code === '55P03') { // Lock not available
            return { success: false, error: 'Sesión está siendo procesada por otro usuario' };
        }

        return {
            success: false,
            error: error.message || 'Error al conciliar sesión'
        };
    } finally {
        client.release();
    }
}

/**
 * 🔐 Approve Large Discrepancy (Admin PIN Required)
 */
export async function approveReconciliationSecure(data: z.infer<typeof ApproveReconciliationSchema>): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await requireReconciliationActor(
        ROLE_GROUPS.ADMIN,
        'Solo administradores pueden aprobar conciliaciones'
    );
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    // 1. Validate input
    const validated = ApproveReconciliationSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validate ADMIN PIN (stricter than manager)
        const pinCheck = await validateReconciliationPin(client, validated.data.adminPin, ROLE_GROUPS.ADMIN);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador inválido' };
        }

        // 3. Lock session
        const scopedSession = await getScopedSessionForReconciliation(
            client,
            validated.data.sessionId,
            auth.actor,
            true,
        );
        if (!scopedSession.success) {
            await client.query('ROLLBACK');
            return { success: false, error: scopedSession.error };
        }

        const session = scopedSession.session;

        if (session.status !== 'RECONCILED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Sesión no está reconciliada' };
        }

        // 4. Update with admin approval
        await client.query(`
            UPDATE cash_register_sessions
            SET 
                status = 'APPROVED',
                notes = COALESCE(notes, '') || $1,
                approved_at = NOW(),
                approved_by = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [
            ` | [APROBADO ${new Date().toISOString()}]: ${validated.data.approvalNotes}`,
            auth.actor.userId,
            validated.data.sessionId
        ]);

        // 5. Audit
        await insertReconciliationAudit(client, {
            actionCode: 'RECONCILIATION_APPROVED',
            userId: auth.actor.userId,
            sessionId: validated.data.sessionId,
            oldValues: { status: 'RECONCILED' },
            newValues: {
                status: 'APPROVED',
                approved_by: auth.actor.userName,
                authorized_by: pinCheck.authorizer?.name,
                discrepancy: session.difference
            },
            notes: validated.data.approvalNotes
        });

        await client.query('COMMIT');

        revalidatePath('/reports');
        revalidatePath('/finance/treasury');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[RECONCILIATION-V2] Approve reconciliation error:', error);
        return {
            success: false,
            error: error.message || 'Error al aprobar conciliación'
        };
    } finally {
        client.release();
    }
}

/**
 * 📋 Get Reconciliation History (Paginated, Filtered)
 */
export async function getReconciliationHistorySecure(filters?: z.infer<typeof GetHistorySchema>): Promise<{
    success: boolean;
    data?: {
        records: any[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    error?: string;
}> {
    const auth = await requireReconciliationActor(
        ROLE_GROUPS.MANAGER,
        'Solo managers pueden ver el historial de conciliaciones'
    );
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    // 1. Validate filters
    const validated = GetHistorySchema.safeParse(filters || {});
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Filtros inválidos'
        };
    }

    try {
        // 2. Build WHERE clause
        const conditions: string[] = ['status IN (\'RECONCILED\', \'APPROVED\')'];
        const params: any[] = [];
        let paramIndex = 1;

        const effectiveLocationId = hasGlobalReconciliationScope(auth.actor)
            ? validated.data.locationId
            : auth.actor.locationId;

        if (!hasGlobalReconciliationScope(auth.actor) && !effectiveLocationId) {
            return { success: false, error: 'Manager sin ubicación asignada' };
        }

        if (effectiveLocationId) {
            conditions.push(`terminal_id IN (SELECT id FROM terminals WHERE location_id = $${paramIndex++})`);
            params.push(effectiveLocationId);
        }

        if (validated.data.startDate) {
            conditions.push(`reconciled_at >= $${paramIndex++}`);
            params.push(validated.data.startDate);
        }

        if (validated.data.endDate) {
            conditions.push(`reconciled_at <= $${paramIndex++}`);
            params.push(validated.data.endDate);
        }

        if (validated.data.minDiscrepancy !== undefined) {
            conditions.push(`ABS(difference) >= $${paramIndex++}`);
            params.push(validated.data.minDiscrepancy);
        }

        const whereClause = conditions.join(' AND ');

        // 3. Get total count
        const countResult = await pool.query(`
            SELECT COUNT(*) as total
            FROM cash_register_sessions
            WHERE ${whereClause}
        `, params);

        const total = parseInt(countResult.rows[0].total);

        // 4. Get paginated records
        const offset = (validated.data.page - 1) * validated.data.pageSize;

        params.push(validated.data.pageSize);
        params.push(offset);

        const recordsResult = await pool.query(`
            SELECT 
                s.id,
                s.terminal_id,
                s.opening_amount,
                s.closing_amount,
                s.difference,
                s.status,
                s.reconciled_at,
                s.reconciled_by,
                s.approved_at,
                s.approved_by,
                s.notes,
                u1.name as reconciled_by_name,
                u2.name as approved_by_name
            FROM cash_register_sessions s
            LEFT JOIN users u1 ON s.reconciled_by = u1.id
            LEFT JOIN users u2 ON s.approved_by = u2.id
            WHERE ${whereClause}
            ORDER BY s.reconciled_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `, params);

        const totalPages = Math.ceil(total / validated.data.pageSize);

        return {
            success: true,
            data: {
                records: recordsResult.rows,
                total,
                page: validated.data.page,
                pageSize: validated.data.pageSize,
                totalPages
            }
        };

    } catch (error: any) {
        console.error('[RECONCILIATION-V2] Get history error:', error);
        return {
            success: false,
            error: error.message || 'Error obteniendo historial'
        };
    }
}
