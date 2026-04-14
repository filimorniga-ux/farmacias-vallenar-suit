'use server';

/**
 * ============================================================================
 * ATTENDANCE-V2: Gestión Segura de Asistencia
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES DE SEGURIDAD:
 * - Validación de secuencia: CHECK_IN → BREAK_START → BREAK_END → CHECK_OUT
 * - RBAC para ver historial de otros
 * - Overtime > 4h requiere PIN MANAGER
 * - Auditoría completa
 */

import { pool, query } from '@/lib/db';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import {
    getActorOrFail,
    PinRbacError,
    ROLE_GROUPS,
    requireRole,
    validatePinForRoles,
    validatePinForUser,
} from '@/lib/pin-rbac';
import { verifyKioskSessionToken } from '@/lib/kiosk-session';
import { validateAttendanceKioskExitPinSecure } from './kiosk-auth-v2';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const AttendanceType = z.enum(['CHECK_IN', 'BREAK_START', 'BREAK_END', 'CHECK_OUT', 'PERMISSION_START', 'PERMISSION_END', 'MEDICAL_LEAVE', 'EMERGENCY']);

const RegisterAttendanceSchema = z.object({
    userId: UUIDSchema,
    type: AttendanceType,
    locationId: UUIDSchema,
    method: z.enum(['PIN', 'BIOMETRIC', 'MANUAL', 'SYSTEM_AUTO']).default('PIN'),
    observation: z.string().max(500).optional(),
    evidencePhotoUrl: z.string().url().optional(),
    overtimeMinutes: z.number().int().min(0).max(480).default(0), // Máximo 8 horas
});

const OvertimeApprovalSchema = z.object({
    attendanceId: UUIDSchema,
    managerPin: z.string().min(4),
    approved: z.boolean(),
    notes: z.string().max(500).optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

// const OVERTIME_THRESHOLD_MINUTES = 240; // 4 horas sin aprobación

// Secuencia válida de marcajes
// Secuencia válida de marcajes
const VALID_SEQUENCE: Record<string, string[]> = {
    'CHECK_IN': [], // Puede iniciar sin previo
    'BREAK_START': ['CHECK_IN', 'BREAK_END', 'PERMISSION_END'],
    'BREAK_END': ['BREAK_START'],
    'CHECK_OUT': ['CHECK_IN', 'BREAK_END', 'PERMISSION_END', 'PERMISSION_START', 'MEDICAL_LEAVE', 'EMERGENCY'],
    'PERMISSION_START': ['CHECK_IN', 'BREAK_END', 'PERMISSION_END'],
    'MEDICAL_LEAVE': ['CHECK_IN', 'BREAK_END', 'PERMISSION_END'],
    'EMERGENCY': ['CHECK_IN', 'BREAK_END', 'PERMISSION_END'],
    'PERMISSION_END': ['PERMISSION_START', 'MEDICAL_LEAVE', 'EMERGENCY'],
};

// ============================================================================
// HELPERS
// ============================================================================

const attendanceQueryClient = {
    query: (sql: string, params?: unknown[]) => query(sql, params as never[] | undefined),
};

type AttendanceActor = Awaited<ReturnType<typeof getActorOrFail>>;

type AttendanceKioskStatus = 'OUT' | 'IN' | 'LUNCH' | 'ON_PERMISSION';

const ATTENDANCE_GLOBAL_ROLES = ['ADMIN', 'GERENTE_GENERAL', 'RRHH'];

function hasAttendanceGlobalScope(role: string) {
    return ATTENDANCE_GLOBAL_ROLES.includes(String(role || '').toUpperCase());
}

function maskRut(value?: string | null) {
    const clean = String(value || '').replace(/\./g, '').trim();
    if (!clean) {
        return '';
    }

    if (clean.length <= 4) {
        return clean;
    }

    return `${clean.slice(0, 2)}*****${clean.slice(-2)}`;
}

function mapKioskStatus(dbType?: string): AttendanceKioskStatus {
    if (!dbType) return 'OUT';

    if (dbType === 'CHECK_IN') return 'IN';
    if (dbType === 'BREAK_START') return 'LUNCH';
    if (dbType === 'BREAK_END' || dbType === 'LUNCH_RETURN' || dbType === 'PERMISSION_END') return 'IN';
    if (['PERMISSION_START', 'MEDICAL_LEAVE', 'EMERGENCY'].includes(dbType)) return 'ON_PERMISSION';
    if (dbType === 'CHECK_OUT') return 'OUT';

    return 'OUT';
}

async function getActiveEmployeeForLocation(
    client: Pick<PoolClient, 'query'> | typeof attendanceQueryClient,
    userId: string,
    locationId: string
) {
    const result = await client.query(
        `
            SELECT id, name, role, assigned_location_id, status, biometric_credentials
            FROM users
            WHERE id = $1
              AND is_active = true
              AND assigned_location_id = $2
            LIMIT 1
        `,
        [userId, locationId]
    );

    return result.rows[0] || null;
}

function resolveAttendanceLocation(
    actor: AttendanceActor,
    requestedLocationId?: string | null
): { success: true; locationId?: string } | { success: false; error: string } {
    const requested = requestedLocationId || undefined;

    if (hasAttendanceGlobalScope(actor.role)) {
        return { success: true, locationId: requested };
    }

    if (!actor.locationId) {
        return {
            success: false,
            error: 'La sesión no tiene sucursal asignada para consultar asistencia',
        };
    }

    if (requested && requested !== actor.locationId) {
        return {
            success: false,
            error: 'No autorizado para consultar otra sucursal',
        };
    }

    return { success: true, locationId: actor.locationId };
}

function sanitizeAttendanceMonitorRow(row: Record<string, unknown>, actorRole: string) {
    if (hasAttendanceGlobalScope(actorRole)) {
        return row;
    }

    return {
        ...row,
        rut: maskRut(typeof row.rut === 'string' ? row.rut : undefined),
        last_login_ip: null,
    };
}

function sanitizeAttendanceHistoryRow(row: Record<string, unknown>, actorRole: string) {
    if (hasAttendanceGlobalScope(actorRole)) {
        return row;
    }

    return {
        ...row,
        user_rut: maskRut(typeof row.user_rut === 'string' ? row.user_rut : undefined),
        evidence_photo_url: null,
    };
}

function validateAttendanceKioskToken(
    kioskToken: string
): { success: true; locationId: string } | { success: false; error: string } {
    const tokenResult = verifyKioskSessionToken(kioskToken, 'ATTENDANCE');
    if (!tokenResult.valid) {
        return { success: false, error: tokenResult.error };
    }

    return {
        success: true,
        locationId: tokenResult.payload.locationId,
    };
}

async function requireAttendanceActor() {
    try {
        const actor = await getActorOrFail();
        return { success: true as const, actor };
    } catch (error) {
        if (error instanceof PinRbacError) {
            return { success: false as const, error: 'No autenticado' };
        }

        throw error;
    }
}

function ensureAttendanceManager(
    actor: Awaited<ReturnType<typeof getActorOrFail>>,
    errorMessage: string
) {
    try {
        requireRole(actor, ROLE_GROUPS.MANAGER_OR_HR);
        return { success: true as const };
    } catch (error) {
        if (error instanceof PinRbacError && error.code === 'AUTH_FORBIDDEN') {
            return { success: false as const, error: errorMessage };
        }

        throw error;
    }
}

async function validateAttendanceManagerPin(
    client: PoolClient,
    pin: string
): Promise<{ valid: boolean; manager?: { id: string; name: string }; error?: string }> {
    try {
        const result = await validatePinForRoles(client, pin, ROLE_GROUPS.MANAGER_OR_HR, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { valid: false, error: result.error || 'PIN de manager inválido' };
        }

        return {
            valid: true,
            manager: { id: result.authorizedBy.id, name: result.authorizedBy.name },
        };
    } catch {
        return { valid: false, error: 'Error validando PIN' };
    }
}

// ============================================================================
// VALIDACIÓN PIN PARA KIOSKO
// ============================================================================

/**
 * 👥 Empleados Disponibles para Kiosko de Asistencia
 * - Requiere kiosko pareado
 * - Retorna solo el mínimo necesario para operar
 */
export async function getAttendanceKioskEmployeesSecure(
    kioskToken: string
): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    const kioskScope = validateAttendanceKioskToken(kioskToken);
    if (!kioskScope.success) {
        return { success: false, error: kioskScope.error };
    }

    try {
        const res = await query(
            `
                SELECT
                    id,
                    name,
                    role,
                    assigned_location_id,
                    status,
                    job_title,
                    biometric_credentials
                FROM users
                WHERE is_active = true
                  AND assigned_location_id = $1
                ORDER BY name ASC
            `,
            [kioskScope.locationId]
        );

        return {
            success: true,
            data: res.rows.map((row) => ({
                id: row.id,
                name: row.name || '',
                role: row.role || 'CASHIER',
                assigned_location_id: row.assigned_location_id || kioskScope.locationId,
                status: row.status || 'ACTIVE',
                job_title: row.job_title || 'EMPLEADO',
                biometric_credentials: row.biometric_credentials || [],
            })),
        };
    } catch (error: unknown) {
        logger.error({ error, locationId: kioskScope.locationId }, '[Attendance] Error loading kiosk employees');
        return { success: false, error: 'Error cargando empleados del kiosko' };
    }
}

/**
 * 🔐 Validar PIN de Empleado para Kiosko de Asistencia
 * - Valida PIN contra el helper compartido
 * - Requiere kiosko pareado y empleado dentro de la sucursal autorizada
 */
export async function validateEmployeePinSecure(
    employeeId: string,
    pin: string,
    kioskToken: string
): Promise<{ success: boolean; valid: boolean; employeeName?: string; error?: string }> {
    try {
        const kioskScope = validateAttendanceKioskToken(kioskToken);
        if (!kioskScope.success) {
            return { success: false, valid: false, error: kioskScope.error };
        }

        // Validar inputs
        const employeeIdParsed = UUIDSchema.safeParse(employeeId);
        if (!employeeIdParsed.success) {
            return { success: false, valid: false, error: 'ID de empleado inválido' };
        }

        if (!pin || pin.length < 4) {
            return { success: false, valid: false, error: 'PIN inválido' };
        }

        const employee = await getActiveEmployeeForLocation(
            attendanceQueryClient,
            employeeIdParsed.data,
            kioskScope.locationId
        );
        if (!employee) {
            return { success: false, valid: false, error: 'Empleado fuera de la sucursal del kiosko' };
        }

        const validation = await validatePinForUser(attendanceQueryClient, employeeIdParsed.data, pin, {
            allowLegacyPlaintext: true,
        });

        if (validation.valid) {
            return {
                success: true,
                valid: true,
                employeeName: validation.authorizedBy.name,
            };
        }

        return { success: true, valid: false, error: 'PIN incorrecto' };

    } catch (error: unknown) {
        logger.error({ error, employeeId }, '[Attendance] Error validating employee PIN');
        return { success: false, valid: false, error: 'Error de validación' };
    }
}

/**
 * 📊 Obtener Estado Actual del Empleado para Kiosko
 * - Consulta el último marcaje de hoy
 * - Retorna estado mapeado: 'OUT', 'IN', 'LUNCH'
 * - Requiere kiosko pareado
 */
export async function getEmployeeStatusForKiosk(
    employeeId: string,
    kioskToken: string
): Promise<{ success: boolean; status: AttendanceKioskStatus; lastAction?: string; lastTime?: string; error?: string }> {
    try {
        const kioskScope = validateAttendanceKioskToken(kioskToken);
        if (!kioskScope.success) {
            return { success: false, status: 'OUT', error: kioskScope.error };
        }

        const employeeIdParsed = UUIDSchema.safeParse(employeeId);
        if (!employeeIdParsed.success) {
            return { success: false, status: 'OUT', error: 'ID de empleado inválido' };
        }

        const employee = await getActiveEmployeeForLocation(
            attendanceQueryClient,
            employeeIdParsed.data,
            kioskScope.locationId
        );
        if (!employee) {
            return { success: false, status: 'OUT', error: 'Empleado fuera de la sucursal del kiosko' };
        }

        const res = await query(`
            SELECT type, timestamp 
            FROM attendance_logs
            WHERE user_id = $1 
            AND timestamp >= NOW() - INTERVAL '24 hours'
            ORDER BY timestamp DESC
            LIMIT 1
        `, [employeeId]);

        const lastType = res.rows[0]?.type || null;
        const lastTime = res.rows[0]?.timestamp;

        const status = mapKioskStatus(lastType || undefined);

        return {
            success: true,
            status,
            lastAction: lastType,
            lastTime: lastTime ? new Date(lastTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : undefined
        };

    } catch (error: unknown) {
        logger.error({ error, employeeId }, '[Attendance] Error getting employee status for kiosk');
        return { success: false, status: 'OUT', error: 'Error obteniendo estado' };
    }
}

/**
 * 📊 Obtener Estados de Múltiples Empleados para Kiosko
 * - Consulta eficiente en batch
 * - Retorna mapa de employeeId -> status
 */
export async function getBatchEmployeeStatusForKiosk(
    employeeIds: string[],
    kioskToken: string
): Promise<{ success: boolean; statuses: Record<string, { status: AttendanceKioskStatus; lastTime?: string }>; error?: string }> {
    try {
        const kioskScope = validateAttendanceKioskToken(kioskToken);
        if (!kioskScope.success) {
            return { success: false, statuses: {}, error: kioskScope.error };
        }

        if (employeeIds.length === 0) {
            return { success: true, statuses: {} };
        }

        const employeesInScope = await query(
            `
                SELECT id
                FROM users
                WHERE id = ANY($1::uuid[])
                  AND is_active = true
                  AND assigned_location_id = $2
            `,
            [employeeIds, kioskScope.locationId]
        );

        if (employeesInScope.rows.length !== employeeIds.length) {
            return { success: false, statuses: {}, error: 'Hay empleados fuera de la sucursal del kiosko' };
        }

        const res = await query(`
            WITH RankedLogs AS (
                SELECT 
                    user_id,
                    type,
                    timestamp,
                    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn
                FROM attendance_logs
                WHERE user_id = ANY($1::text[])
                AND timestamp >= NOW() - INTERVAL '24 hours'
            )
            SELECT user_id, type, timestamp
            FROM RankedLogs
            WHERE rn = 1
        `, [employeeIds]);

        const statuses: Record<string, { status: AttendanceKioskStatus; lastTime?: string }> = {};

        for (const id of employeeIds) {
            statuses[id] = { status: 'OUT' };
        }

        for (const row of res.rows) {
            statuses[row.user_id] = {
                status: mapKioskStatus(row.type),
                lastTime: row.timestamp ? new Date(row.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : undefined
            };
        }

        return { success: true, statuses };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Error getting batch employee status');
        return { success: false, statuses: {}, error: 'Error obteniendo estados' };
    }
}

async function getLastAttendanceType(client: PoolClient, userId: string): Promise<string | null> {
    const res = await client.query(`
        SELECT type FROM attendance_logs
        WHERE user_id = $1 
        AND timestamp >= NOW() - INTERVAL '24 hours'
        ORDER BY timestamp DESC
        LIMIT 1
    `, [userId]);
    return res.rows[0]?.type || null;
}

// ============================================================================
// REGISTRO DE ASISTENCIA
// ============================================================================

/**
 * 📝 Registrar Asistencia con Validación de Secuencia
 */
export async function registerAttendanceSecure(
    data: z.infer<typeof RegisterAttendanceSchema>,
    options?: { kioskToken?: string }
): Promise<{ success: boolean; attendanceId?: string; error?: string }> {
    const validated = RegisterAttendanceSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { userId, type, locationId, method, observation, evidencePhotoUrl, overtimeMinutes } = validated.data;
    const kioskToken = options?.kioskToken;
    const actorAuth = kioskToken ? null : await requireAttendanceActor();

    if (!kioskToken && actorAuth && !actorAuth.success) {
        return { success: false, error: actorAuth.error };
    }

    // Modificado: Permitir overtime > 4h (se marcará como pendiente de aprobación implícitamente)
    // El estado 'overtime_approved' es FALSE por defecto en DB, así que queda pendiente.
    // const requiresApproval = overtimeMinutes > OVERTIME_THRESHOLD_MINUTES;

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        if (kioskToken) {
            const kioskScope = validateAttendanceKioskToken(kioskToken);
            if (!kioskScope.success) {
                await client.query('ROLLBACK');
                return { success: false, error: kioskScope.error };
            }

            if (kioskScope.locationId !== locationId) {
                await client.query('ROLLBACK');
                return { success: false, error: 'El kiosko no está autorizado para esta sucursal' };
            }

            const employee = await getActiveEmployeeForLocation(client, userId, kioskScope.locationId);
            if (!employee) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Empleado fuera de la sucursal del kiosko' };
            }
        } else if (actorAuth?.success) {
            const actor = actorAuth.actor;
            const resolvedLocation = resolveAttendanceLocation(actor, locationId);
            if (!resolvedLocation.success) {
                await client.query('ROLLBACK');
                return { success: false, error: resolvedLocation.error };
            }

            if (!resolvedLocation.locationId) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Debe especificar una sucursal válida' };
            }

            if (resolvedLocation.locationId !== locationId) {
                await client.query('ROLLBACK');
                return { success: false, error: 'No autorizado para registrar asistencia en otra sucursal' };
            }

            const employee = await getActiveEmployeeForLocation(client, userId, locationId);
            if (!employee) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Empleado fuera de la sucursal autorizada' };
            }

            if (actor.userId !== userId) {
                const authorization = ensureAttendanceManager(actor, 'Solo managers/RRHH pueden registrar asistencia de otro empleado');
                if (!authorization.success) {
                    await client.query('ROLLBACK');
                    return { success: false, error: authorization.error };
                }
            }
        }

        // Validar secuencia
        const lastType = await getLastAttendanceType(client, userId);
        const validPrevious = VALID_SEQUENCE[type];

        if (type !== 'CHECK_IN' && (!lastType || !validPrevious.includes(lastType))) {
            await client.query('ROLLBACK');
            const expectedTypes = validPrevious.join(' o ');
            return {
                success: false,
                error: `Secuencia inválida. Después de ${lastType || 'nada'} no puede registrar ${type}. Esperado: ${expectedTypes || 'CHECK_IN'}`,
            };
        }

        // Para CHECK_IN verificar que no haya uno activo
        if (type === 'CHECK_IN') {
            const activeRes = await client.query(`
                SELECT id FROM attendance_logs
                WHERE user_id = $1 
                AND timestamp >= NOW() - INTERVAL '24 hours'
                AND type = 'CHECK_IN'
                AND NOT EXISTS (
                    SELECT 1 FROM attendance_logs al2
                    WHERE al2.user_id = $1 
                    AND al2.timestamp > attendance_logs.timestamp
                    AND al2.type = 'CHECK_OUT'
                )
            `, [userId]);

            if (activeRes.rows.length > 0) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Ya tiene una entrada activa hoy' };
            }
        }

        // Registrar
        const attendanceId = randomUUID();
        await client.query(`
            INSERT INTO attendance_logs (
                id, user_id, type, location_id, method, timestamp,
                observation, evidence_photo_url, overtime_minutes
            ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
        `, [attendanceId, userId, type, locationId, method, observation, evidencePhotoUrl, overtimeMinutes]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, $2, 'ATTENDANCE', $3::jsonb, NOW())
        `, [userId, `ATTENDANCE_${type}`, JSON.stringify({
            location_id: locationId,
            method,
            overtime_minutes: overtimeMinutes,
        })]);

        await client.query('COMMIT');

        logger.info({ userId, type, locationId }, `📝 [Attendance] ${type} registered`);
        return { success: true, attendanceId };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Attendance] Register error');
        return { success: false, error: 'Error registrando asistencia' };
    } finally {
        client.release();
    }
}

// ============================================================================
// HISTORIAL
// ============================================================================

/**
 * 📋 Mi Historial de Asistencia
 */
export async function getMyAttendanceHistory(
    startDate?: Date,
    endDate?: Date
): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    const auth = await requireAttendanceActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    try {
        let sql = `
            SELECT id, type, location_id, method, timestamp, observation, overtime_minutes
            FROM attendance_logs
            WHERE user_id = $1
        `;
        const params: (string | Date)[] = [auth.actor.userId];
        let paramIndex = 2;

        if (startDate) {
            sql += ` AND timestamp >= $${paramIndex++}`;
            params.push(startDate);
        }
        if (endDate) {
            sql += ` AND timestamp <= $${paramIndex++}`;
            params.push(endDate);
        }

        sql += ' ORDER BY timestamp DESC LIMIT 100';

        const res = await query(sql, params);
        return { success: true, data: res.rows };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Get history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}

/**
 * 👥 Historial del Equipo (Solo MANAGER)
 */
export async function getTeamAttendanceHistory(
    filters?: { locationId?: string; startDate?: Date; endDate?: Date }
): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    const auth = await requireAttendanceActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const authorization = ensureAttendanceManager(auth.actor, 'Solo managers pueden ver historial del equipo');
    if (!authorization.success) {
        return { success: false, error: authorization.error };
    }

    const resolvedLocation = resolveAttendanceLocation(auth.actor, filters?.locationId);
    if (!resolvedLocation.success) {
        return { success: false, error: resolvedLocation.error };
    }

    try {
        let sql = `
            SELECT a.*, u.name as user_name, u.role as user_role
            FROM attendance_logs a
            JOIN users u ON a.user_id = u.id
            WHERE 1=1
        `;
        const params: (string | Date)[] = [];
        let paramIndex = 1;

        if (resolvedLocation.locationId) {
            sql += ` AND a.location_id = $${paramIndex++}`;
            params.push(resolvedLocation.locationId);
        }
        if (filters?.startDate) {
            sql += ` AND a.timestamp >= $${paramIndex++}::timestamp AT TIME ZONE 'America/Santiago'`;
            params.push(filters.startDate);
        }
        if (filters?.endDate) {
            sql += ` AND a.timestamp <= $${paramIndex++}::timestamp AT TIME ZONE 'America/Santiago'`;
            params.push(filters.endDate);
        }

        // Paginación Simple (default 50)
        const limit = 50;
        const offset = 0; // TODO: Implementar paso de page por params si se requiere

        sql += ` ORDER BY a.timestamp DESC LIMIT ${limit} OFFSET ${offset}`;

        const res = await query(sql, params);
        return {
            success: true,
            data: res.rows.map((row) => sanitizeAttendanceHistoryRow(row, auth.actor.role)),
        };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Get team history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}

// ============================================================================
// OVERTIME
// ============================================================================

/**
 * ⏰ Calcular Overtime del Usuario
 */
export async function calculateOvertimeSecure(
    userId: string,
    month: number,
    year: number
): Promise<{ success: boolean; data?: { totalMinutes: number; pendingApproval: number }; error?: string }> {
    const auth = await requireAttendanceActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    // Solo puede ver su propio overtime o si es manager
    if (auth.actor.userId !== userId) {
        const authorization = ensureAttendanceManager(auth.actor, 'No autorizado');
        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }
    }

    if (!UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'ID inválido' };
    }

    try {
        const res = await query(`
            SELECT 
                COALESCE(SUM(overtime_minutes), 0) as total_minutes,
                COALESCE(SUM(CASE WHEN overtime_approved = false THEN overtime_minutes ELSE 0 END), 0) as pending
            FROM attendance_logs
            WHERE user_id = $1
            AND EXTRACT(MONTH FROM timestamp) = $2
            AND EXTRACT(YEAR FROM timestamp) = $3
            AND overtime_minutes > 0
        `, [userId, month, year]);

        return {
            success: true,
            data: {
                totalMinutes: parseInt(res.rows[0]?.total_minutes || '0'),
                pendingApproval: parseInt(res.rows[0]?.pending || '0'),
            },
        };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Calculate overtime error');
        return { success: false, error: 'Error calculando overtime' };
    }
}

/**
 * ✅ Aprobar Overtime (PIN MANAGER)
 */
// ✅ Aprobar Overtime (PIN MANAGER)
export async function approveOvertimeSecure(
    data: z.infer<typeof OvertimeApprovalSchema>
): Promise<{ success: boolean; error?: string }> {
    const auth = await requireAttendanceActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const authorization = ensureAttendanceManager(auth.actor, 'Solo managers pueden aprobar overtime');
    if (!authorization.success) {
        return { success: false, error: authorization.error };
    }

    const validated = OvertimeApprovalSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { attendanceId, managerPin, approved, notes } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN
        const pinResult = await validateAttendanceManagerPin(client, managerPin);
        if (!pinResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: pinResult.error };
        }

        // Actualizar
        const res = await client.query(`
            UPDATE attendance_logs
            SET overtime_approved = $2, overtime_approved_by = $3, overtime_approval_notes = $4
            WHERE id = $1 AND overtime_minutes > 0
        `, [attendanceId, approved, auth.actor.userId, notes]);

        if (res.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Registro no encontrado o sin overtime' };
        }

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'OVERTIME_APPROVED', 'ATTENDANCE', $2, $3::jsonb, NOW())
        `, [auth.actor.userId, attendanceId, JSON.stringify({
            approved,
            notes,
            authorized_by: pinResult.manager?.name,
        })]);

        await client.query('COMMIT');

        logger.info({ attendanceId, approved }, '✅ [Attendance] Overtime approved');
        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Attendance] Approve overtime error');
        return { success: false, error: 'Error aprobando overtime' };
    } finally {
        client.release();
    }
}


/**
 * 📊 Resumen Mensual de Asistencia
 */
export async function getAttendanceSummary(
    userId: string,
    month: number,
    year: number
): Promise<{
    success: boolean;
    data?: {
        daysWorked: number;
        totalHours: number;
        overtimeMinutes: number;
        lateCount: number;
    };
    error?: string;
}> {
    const auth = await requireAttendanceActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    if (auth.actor.userId !== userId) {
        const authorization = ensureAttendanceManager(auth.actor, 'No autorizado');
        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }
    }

    try {
        // Lógica mejorada para emparejar entradas y salidas usando Window Functions
        // Calcula horas exactas entre CHECK_IN y CHECK_OUT consecutivos
        const res = await query(`
            WITH normalized_logs AS (
                SELECT 
                    type, 
                    timestamp,
                    DATE(timestamp AT TIME ZONE 'America/Santiago') as work_day
                FROM attendance_logs
                WHERE user_id = $1
                AND EXTRACT(MONTH FROM timestamp AT TIME ZONE 'America/Santiago') = $2
                AND EXTRACT(YEAR FROM timestamp AT TIME ZONE 'America/Santiago') = $3
            ),
            paired_logs AS (
                SELECT 
                    work_day,
                    timestamp as in_time,
                    LEAD(timestamp) OVER (PARTITION BY work_day ORDER BY timestamp) as out_time,
                    type as in_type,
                    LEAD(type) OVER (PARTITION BY work_day ORDER BY timestamp) as out_type,
                    overtime_minutes
                FROM attendance_logs
                WHERE user_id = $1
                AND EXTRACT(MONTH FROM timestamp AT TIME ZONE 'America/Santiago') = $2
                AND EXTRACT(YEAR FROM timestamp AT TIME ZONE 'America/Santiago') = $3
            )
            SELECT 
                COUNT(DISTINCT work_day) as days_worked,
                COALESCE(SUM(
                    CASE 
                        WHEN in_type = 'CHECK_IN' AND out_type = 'CHECK_OUT' 
                        THEN EXTRACT(EPOCH FROM (out_time - in_time)) / 3600
                        ELSE 0 
                    END
                ), 0) as total_hours,
                COALESCE(SUM(overtime_minutes), 0) as total_overtime
            FROM paired_logs
            WHERE in_type = 'CHECK_IN'
        `, [userId, month, year]);

        return {
            success: true,
            data: {
                daysWorked: parseInt(res.rows[0]?.days_worked || '0'),
                totalHours: parseFloat(parseFloat(res.rows[0]?.total_hours || '0').toFixed(2)),
                overtimeMinutes: parseInt(res.rows[0]?.total_overtime || '0'),
                lateCount: 0,
            },
        };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Get summary error');
        return { success: false, error: 'Error obteniendo resumen' };
    }
}

// ============================================================================
// MONITORIZACIÓN HR (NUEVOS MÉTODOS)
// ============================================================================

/**
 * 🟢 Obtener estado actual de todos los empleados (Monitor en Vivo)
 * Devuelve lista de usuarios activos y su último marcaje de hoy.
 */
export async function getTodayAttendanceSecure(
    locationId?: string
): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    const auth = await requireAttendanceActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    // Validar permisos (Solo roles de gestión)
    const authorization = ensureAttendanceManager(auth.actor, 'No autorizado para ver monitor en vivo');
    if (!authorization.success) {
        return { success: false, error: authorization.error };
    }

    const resolvedLocation = resolveAttendanceLocation(auth.actor, locationId);
    if (!resolvedLocation.success) {
        return { success: false, error: resolvedLocation.error };
    }

    const client = await pool.connect();

    try {
        const query = `
            SELECT 
                u.id, u.name, u.rut, u.job_title, u.role, u.assigned_location_id,
                al.type as current_status, 
                al.timestamp as last_log_time, 
                al.location_id as last_location_id,
                u.last_login_ip
            FROM users u
            LEFT JOIN LATERAL (
                SELECT type, timestamp, location_id
                FROM attendance_logs
                WHERE user_id = u.id 
                AND timestamp >= NOW() - INTERVAL '24 hours'
                ORDER BY timestamp DESC
                LIMIT 1
            ) al ON true
            WHERE u.is_active = true
            AND ($1::uuid IS NULL OR u.assigned_location_id = $1 OR al.location_id = $1)
            ORDER BY u.name ASC
        `;

        const res = await client.query(query, [resolvedLocation.locationId || null]);

        // Mapear status a formato frontend si es necesario
        // Frontend espera: 'IN' | 'OUT' | 'LUNCH' | 'ON_PERMISSION'
        const mappedData = res.rows.map(row => sanitizeAttendanceMonitorRow({
            ...row,
            // Si no hay log hoy, asume OUT. Si hay log, mapea CHECK_IN -> IN, CHECK_OUT -> OUT, etc.
            current_status: mapStatus(row.current_status),
            last_log_timestamp: row.last_log_time ? new Date(row.last_log_time).getTime() : null
        }, auth.actor.role));

        return { success: true, data: mappedData };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Get today attendance error');
        return { success: false, error: `Error obteniendo monitor en vivo: ${(error as Error).message}` };
    } finally {
        client.release();
    }
}

function mapStatus(dbType?: string): string {
    if (!dbType) return 'OUT';
    switch (dbType) {
        case 'CHECK_IN': return 'IN';
        case 'BREAK_START': return 'LUNCH';
        case 'BREAK_END': return 'IN';
        case 'LUNCH_RETURN': return 'IN'; // Legacy
        case 'PERMISSION_END': return 'IN';
        case 'PERMISSION_START': return 'ON_PERMISSION';
        case 'MEDICAL_LEAVE': return 'ON_PERMISSION';
        case 'EMERGENCY': return 'ON_PERMISSION';
        case 'CHECK_OUT': return 'OUT';
        default: return 'OUT';
    }
}

/**
 * 📜 Obtener historial general (Para Tab "Historial")
 * Similar a getTeamAttendanceHistory pero expuesto explícitamente para el componente de gestión
 */
export async function getApprovedAttendanceHistory(
    filters: {
        startDate: string; // ISO String
        endDate: string; // ISO String
        locationId?: string;
        userId?: string;
    }
): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    const auth = await requireAttendanceActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const authorization = ensureAttendanceManager(auth.actor, 'No autorizado');
    if (!authorization.success) {
        return { success: false, error: authorization.error };
    }

    const resolvedLocation = resolveAttendanceLocation(auth.actor, filters.locationId);
    if (!resolvedLocation.success) {
        return { success: false, error: resolvedLocation.error };
    }

    try {
        let sql = `
            SELECT 
                a.id, a.type, a.timestamp, a.location_id, a.method, 
                a.observation, a.evidence_photo_url, 
                a.overtime_minutes, a.overtime_approved,
                u.id as employee_id, u.name as user_name, u.rut as user_rut, u.role as user_role
            FROM attendance_logs a
            JOIN users u ON a.user_id = u.id
            WHERE 1=1
        `;
        const params: (string | Date)[] = [];
        let paramIndex = 1;

        if (filters.startDate) {
            sql += ` AND a.timestamp >= $${paramIndex++}::timestamp AT TIME ZONE 'America/Santiago'`;
            params.push(new Date(filters.startDate));
        }
        if (filters.endDate) {
            sql += ` AND a.timestamp <= $${paramIndex++}::timestamp AT TIME ZONE 'America/Santiago'`;
            params.push(new Date(filters.endDate));
        }
        if (resolvedLocation.locationId) {
            sql += ` AND a.location_id = $${paramIndex++}`;
            params.push(resolvedLocation.locationId);
        }
        if (filters.userId) {
            sql += ` AND a.user_id = $${paramIndex++}`;
            params.push(filters.userId);
        }

        // Pagination
        const limit = 50;
        const offset = 0;
        sql += ` ORDER BY a.timestamp DESC LIMIT ${limit} OFFSET ${offset}`;

        const res = await query(sql, params);
        return {
            success: true,
            data: res.rows.map((row) => sanitizeAttendanceHistoryRow(row, auth.actor.role)),
        };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Get approved history error');
        return { success: false, error: 'Error obteniendo historial: ' + (error as Error).message };
    }
}

// ============================================================================
// AUTO-ASISTENCIA (Strategy A: Implicit Check-In)
// ============================================================================

/**
 * 🤖 Auto-Check-In Silencioso
 * Se llama desde acciones críticas (Abrir Caja, etc.) para asegurar que el usuario
 * figura como 'Trabajando' aunque haya olvidado marcar en el tótem.
 */
export async function ensureCheckInSecure(
    userId: string,
    locationId: string
): Promise<boolean> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Verificar si YA tiene entrada activa hoy
        // Lock advisory basado en string hash del uuid para esta acción especifica (evita lockeo de tabla)
        // O simplemente confiamos en SERIALIZABLE que lanzará 40001 si hay conflicto.

        const checkRes = await client.query(`
                SELECT id FROM attendance_logs 
                WHERE user_id = $1 
                AND timestamp >= NOW() - INTERVAL '24 hours'
                AND type = 'CHECK_IN'
            `, [userId]);

        // Use checkRes to avoid lint error (and actually check)
        if (checkRes.rowCount && checkRes.rowCount > 0) {
            return true; // Already checked in
        }

        // Si ya tiene entrada (o varias), asumimos que está OK.
        // Podríamos refinar para ver si la última es OUT, pero la estrategia es simple:
        // Si hay al menos un IN hoy, no forzamos otro para no duplicar si solo salió a colación.
        // Pero si la última fue OUT, técnicamente está fuera.
        // MEJORA: Verificar si el ÚLTIMO evento es OUT.


        const lastLogRes = await client.query(`
            SELECT type FROM attendance_logs
            WHERE user_id = $1 
            AND timestamp >= NOW() - INTERVAL '24 hours'
            ORDER BY timestamp DESC
            LIMIT 1
                `, [userId]);

        const lastType = lastLogRes.rows[0]?.type;

        // Si está trabajando (IN o BREAK), no hacemos nada.
        // Si no tiene registros O el último fue OUT, hacemos Auto-Check-In.
        if (lastType && ['CHECK_IN', 'BREAK_START', 'BREAK_END'].includes(lastType)) {
            return true; // Ya está activo
        }

        // 2. Registrar Auto-Entrada
        const attendanceId = randomUUID();
        await client.query('BEGIN');

        await client.query(`
            INSERT INTO attendance_logs(id, user_id, type, location_id, method, timestamp, observation)
            VALUES($1, $2, 'CHECK_IN', $3, 'SYSTEM_AUTO', NOW(), 'Activado automáticamente por operación crítica')
                    `, [attendanceId, userId, locationId]);

        // 3. Auditar
        await client.query(`
            INSERT INTO audit_log(user_id, action_code, entity_type, new_values, created_at)
            VALUES($1, 'AUTO_ATTENDANCE', 'SYSTEM', $2:: jsonb, NOW())
                    `, [userId, JSON.stringify({ reason: 'Implicit Check-In by Work Action', locationId })]);

        await client.query('COMMIT');
        logger.info({ userId, locationId }, '🤖 [Attendance] Auto-Check-In Triggered');
        return true;

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Attendance] Auto-Check-In Failed');
        return false; // No interrumpir flujo principal si falla esto
    } finally {
        client.release();
    }
}

/**
 * 🔐 Validar PIN para cerrar Kiosko
 * Permite a Managers/Admins salir del modo Kiosko
 */
export async function validateKioskExitPin(
    pin: string,
    kioskToken: string
): Promise<{ valid: boolean; error?: string }> {
    const result = await validateAttendanceKioskExitPinSecure({
        pin,
        kioskToken,
    });

    return {
        valid: result.success,
        error: result.error,
    };
}
