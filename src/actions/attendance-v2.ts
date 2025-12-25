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
import { z } from 'zod';
import { headers } from 'next/headers';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const AttendanceType = z.enum(['CHECK_IN', 'BREAK_START', 'BREAK_END', 'CHECK_OUT']);

const RegisterAttendanceSchema = z.object({
    userId: UUIDSchema,
    type: AttendanceType,
    locationId: UUIDSchema,
    method: z.enum(['PIN', 'BIOMETRIC', 'MANUAL']).default('PIN'),
    observation: z.string().max(500).optional(),
    evidencePhotoUrl: z.string().url().optional(),
    overtimeMinutes: z.number().int().min(0).max(480).default(0), // Máximo 8 horas
});

const OvertimeApprovalSchema = z.object({
    managerId: UUIDSchema,
    attendanceId: UUIDSchema,
    managerPin: z.string().min(4),
    approved: z.boolean(),
    notes: z.string().max(500).optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const OVERTIME_THRESHOLD_MINUTES = 240; // 4 horas sin aprobación

// Secuencia válida de marcajes
const VALID_SEQUENCE: Record<string, string[]> = {
    'CHECK_IN': [],                    // Puede iniciar sin previo
    'BREAK_START': ['CHECK_IN', 'BREAK_END'],
    'BREAK_END': ['BREAK_START'],
    'CHECK_OUT': ['CHECK_IN', 'BREAK_END'],
};

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        if (!userId || !role) return null;
        return { userId, role };
    } catch {
        return null;
    }
}

async function validateManagerPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; manager?: { id: string; name: string }; error?: string }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const bcrypt = await import('bcryptjs');

        const usersRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [MANAGER_ROLES]);

        for (const user of usersRes.rows) {
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) continue;

            if (user.access_pin_hash) {
                const valid = await bcrypt.compare(pin, user.access_pin_hash);
                if (valid) {
                    resetAttempts(user.id);
                    return { valid: true, manager: { id: user.id, name: user.name } };
                }
                recordFailedAttempt(user.id);
            } else if (user.access_pin === pin) {
                resetAttempts(user.id);
                return { valid: true, manager: { id: user.id, name: user.name } };
            }
        }
        return { valid: false, error: 'PIN de manager inválido' };
    } catch (error) {
        return { valid: false, error: 'Error validando PIN' };
    }
}

async function getLastAttendanceType(client: any, userId: string): Promise<string | null> {
    const res = await client.query(`
        SELECT type FROM attendance_logs
        WHERE user_id = $1 AND DATE(timestamp) = CURRENT_DATE
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
    data: z.infer<typeof RegisterAttendanceSchema>
): Promise<{ success: boolean; attendanceId?: string; error?: string }> {
    const validated = RegisterAttendanceSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { userId, type, locationId, method, observation, evidencePhotoUrl, overtimeMinutes } = validated.data;

    // Verificar overtime
    if (overtimeMinutes > OVERTIME_THRESHOLD_MINUTES) {
        return {
            success: false,
            error: `Overtime mayor a ${OVERTIME_THRESHOLD_MINUTES / 60} horas requiere aprobación de manager`,
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

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
                WHERE user_id = $1 AND DATE(timestamp) = CURRENT_DATE AND type = 'CHECK_IN'
                AND NOT EXISTS (
                    SELECT 1 FROM attendance_logs al2
                    WHERE al2.user_id = $1 AND DATE(al2.timestamp) = CURRENT_DATE AND al2.type = 'CHECK_OUT'
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

    } catch (error: any) {
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
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        let sql = `
            SELECT id, type, location_id, method, timestamp, observation, overtime_minutes
            FROM attendance_logs
            WHERE user_id = $1
        `;
        const params: any[] = [session.userId];
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

    } catch (error: any) {
        logger.error({ error }, '[Attendance] Get history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}

/**
 * 👥 Historial del Equipo (Solo MANAGER)
 */
export async function getTeamAttendanceHistory(
    filters?: { locationId?: string; startDate?: Date; endDate?: Date }
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden ver historial del equipo' };
    }

    try {
        let sql = `
            SELECT a.*, u.name as user_name, u.role as user_role
            FROM attendance_logs a
            JOIN users u ON a.user_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (filters?.locationId) {
            sql += ` AND a.location_id = $${paramIndex++}`;
            params.push(filters.locationId);
        }
        if (filters?.startDate) {
            sql += ` AND a.timestamp >= $${paramIndex++}`;
            params.push(filters.startDate);
        }
        if (filters?.endDate) {
            sql += ` AND a.timestamp <= $${paramIndex++}`;
            params.push(filters.endDate);
        }

        sql += ' ORDER BY a.timestamp DESC LIMIT 500';

        const res = await query(sql, params);
        return { success: true, data: res.rows };

    } catch (error: any) {
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
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // Solo puede ver su propio overtime o si es manager
    if (session.userId !== userId && !MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'No autorizado' };
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

    } catch (error: any) {
        logger.error({ error }, '[Attendance] Calculate overtime error');
        return { success: false, error: 'Error calculando overtime' };
    }
}

/**
 * ✅ Aprobar Overtime (PIN MANAGER)
 */
export async function approveOvertimeSecure(
    data: z.infer<typeof OvertimeApprovalSchema>
): Promise<{ success: boolean; error?: string }> {
    const validated = OvertimeApprovalSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { managerId, attendanceId, managerPin, approved, notes } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN
        const authResult = await validateManagerPin(client, managerPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: authResult.error };
        }

        // Actualizar
        const res = await client.query(`
            UPDATE attendance_logs
            SET overtime_approved = $2, overtime_approved_by = $3, overtime_approval_notes = $4
            WHERE id = $1 AND overtime_minutes > 0
        `, [attendanceId, approved, authResult.manager!.id, notes]);

        if (res.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Registro no encontrado o sin overtime' };
        }

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'OVERTIME_APPROVED', 'ATTENDANCE', $2, $3::jsonb, NOW())
        `, [authResult.manager!.id, attendanceId, JSON.stringify({ approved, notes })]);

        await client.query('COMMIT');

        logger.info({ attendanceId, approved }, '✅ [Attendance] Overtime approved');
        return { success: true };

    } catch (error: any) {
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
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (session.userId !== userId && !MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'No autorizado' };
    }

    try {
        const res = await query(`
            SELECT 
                COUNT(DISTINCT DATE(timestamp)) as days_worked,
                COALESCE(SUM(CASE WHEN type = 'CHECK_OUT' THEN 
                    EXTRACT(EPOCH FROM (timestamp - (
                        SELECT timestamp FROM attendance_logs al2 
                        WHERE al2.user_id = attendance_logs.user_id 
                        AND DATE(al2.timestamp) = DATE(attendance_logs.timestamp)
                        AND al2.type = 'CHECK_IN'
                        ORDER BY al2.timestamp DESC LIMIT 1
                    ))) / 3600 
                ELSE 0 END), 0) as total_hours,
                COALESCE(SUM(overtime_minutes), 0) as overtime_minutes
            FROM attendance_logs
            WHERE user_id = $1
            AND EXTRACT(MONTH FROM timestamp) = $2
            AND EXTRACT(YEAR FROM timestamp) = $3
        `, [userId, month, year]);

        return {
            success: true,
            data: {
                daysWorked: parseInt(res.rows[0]?.days_worked || '0'),
                totalHours: parseFloat(res.rows[0]?.total_hours || '0'),
                overtimeMinutes: parseInt(res.rows[0]?.overtime_minutes || '0'),
                lateCount: 0, // TODO: Implementar lógica de atrasos
            },
        };

    } catch (error: any) {
        logger.error({ error }, '[Attendance] Get summary error');
        return { success: false, error: 'Error obteniendo resumen' };
    }
}
