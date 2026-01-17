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
    method: z.enum(['PIN', 'BIOMETRIC', 'MANUAL', 'SYSTEM_AUTO']).default('PIN'),
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

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'];
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
        const { cookies } = await import('next/headers');

        // 1. Try Headers (Middleware injection)
        let userId = headersList.get('x-user-id');
        let role = headersList.get('x-user-role');

        // 2. Fallback to Cookies (Direct usage)
        if (!userId || !role) {
            const cookieStore = await cookies();
            userId = cookieStore.get('user_id')?.value || null;
            role = cookieStore.get('user_role')?.value || null;
        }

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

// ============================================================================
// MONITORIZACIÓN HR (NUEVOS MÉTODOS)
// ============================================================================

/**
 * 🟢 Obtener estado actual de todos los empleados (Monitor en Vivo)
 * Devuelve lista de usuarios activos y su último marcaje de hoy.
 */
export async function getTodayAttendanceSecure(
    locationId?: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // Validar permisos (Solo roles de gestión)
    if (!MANAGER_ROLES.includes(session.role) && session.role !== 'RRHH') {
        return { success: false, error: 'No autorizado para ver monitor en vivo' };
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
                WHERE user_id = u.id AND DATE(timestamp) = CURRENT_DATE
                ORDER BY timestamp DESC
                LIMIT 1
            ) al ON true
            WHERE u.is_active = true
            AND ($1::uuid IS NULL OR u.assigned_location_id = $1 OR al.location_id = $1)
            ORDER BY u.name ASC
        `;

        const res = await client.query(query, [locationId || null]);

        // Mapear status a formato frontend si es necesario
        // Frontend espera: 'IN' | 'OUT' | 'LUNCH' | 'ON_PERMISSION'
        const mappedData = res.rows.map(row => ({
            ...row,
            // Si no hay log hoy, asume OUT. Si hay log, mapea CHECK_IN -> IN, CHECK_OUT -> OUT, etc.
            current_status: mapStatus(row.current_status),
            last_log_timestamp: row.last_log_time ? new Date(row.last_log_time).getTime() : null
        }));

        return { success: true, data: mappedData };

    } catch (error: any) {
        logger.error({ error }, '[Attendance] Get today attendance error');
        return { success: false, error: `Error obteniendo monitor en vivo: ${error.message}` };
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
        case 'LUNCH_RETURN': return 'IN';
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
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role) && session.role !== 'RRHH') {
        return { success: false, error: 'No autorizado' };
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
        const params: any[] = [];
        let paramIndex = 1;

        if (filters.startDate) {
            sql += ` AND a.timestamp >= $${paramIndex++}`;
            params.push(new Date(filters.startDate));
        }
        if (filters.endDate) {
            sql += ` AND a.timestamp <= $${paramIndex++}`;
            params.push(new Date(filters.endDate));
        }
        if (filters.locationId) {
            sql += ` AND a.location_id = $${paramIndex++}`;
            params.push(filters.locationId);
        }
        if (filters.userId) {
            sql += ` AND a.user_id = $${paramIndex++}`;
            params.push(filters.userId);
        }

        sql += ' ORDER BY a.timestamp DESC LIMIT 1000';

        const res = await query(sql, params);
        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Attendance] Get approved history error');
        return { success: false, error: 'Error obteniendo historial: ' + error.message };
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
        // 1. Verificar si YA tiene entrada activa hoy
        const checkRes = await client.query(`
            SELECT id FROM attendance_logs 
            WHERE user_id = $1 
            AND DATE(timestamp) = CURRENT_DATE 
            AND type = 'CHECK_IN'
        `, [userId]);

        // Si ya tiene entrada (o varias), asumimos que está OK.
        // Podríamos refinar para ver si la última es OUT, pero la estrategia es simple:
        // Si hay al menos un IN hoy, no forzamos otro para no duplicar si solo salió a colación.
        // Pero si la última fue OUT, técnicamente está fuera.
        // MEJORA: Verificar si el ÚLTIMO evento es OUT.

        const lastLogRes = await client.query(`
            SELECT type FROM attendance_logs
            WHERE user_id = $1 AND DATE(timestamp) = CURRENT_DATE
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
            INSERT INTO attendance_logs (id, user_id, type, location_id, method, timestamp, observation)
            VALUES ($1, $2, 'CHECK_IN', $3, 'SYSTEM_AUTO', NOW(), 'Activado automáticamente por operación crítica')
        `, [attendanceId, userId, locationId]);

        // 3. Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'AUTO_ATTENDANCE', 'SYSTEM', $2::jsonb, NOW())
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
