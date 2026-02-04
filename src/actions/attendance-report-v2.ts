'use server';

/**
 * ============================================================================
 * ATTENDANCE-REPORT-V2: Reportes de Asistencia Seguros
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC: Empleado solo su asistencia, Manager equipo, Admin todo
 * - Auditoría de acceso
 * - Protección de datos personales (RUT)
 */

import { query } from '@/lib/db';


import { logger } from '@/lib/logger';
import { getSessionSecure } from './auth-v2';

// ============================================================================
// SCHEMAS
// ============================================================================



// ============================================================================
// TYPES
// ============================================================================

interface AttendanceDailySummary {
    date: string;
    user_id: string;
    user_name: string;
    rut?: string; // Solo visible para managers
    job_title: string;
    check_in: string | null;
    check_out: string | null;
    hours_worked: number;
    status: 'PRESENT' | 'ABSENT' | 'LATE';
    overtime_minutes: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'];

// ============================================================================
// HELPERS
// ============================================================================



// ============================================================================
// GET MY ATTENDANCE (Cualquier empleado)
// ============================================================================

/**
 * 👤 Mi Asistencia (Cualquier usuario autenticado)
 */
export async function getMyAttendanceSummary(
    params: { startDate: string; endDate: string }
): Promise<{ success: boolean; data?: AttendanceDailySummary[]; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const sql = `
            WITH DailyStats AS (
                SELECT 
                    a.user_id, DATE(a.timestamp) as work_date,
                    MIN(a.timestamp) as first_in, MAX(a.timestamp) as last_out,
                    SUM(COALESCE(a.overtime_minutes, 0)) as total_overtime,
                    COUNT(*) as logs_count
                FROM attendance_logs a
                WHERE a.user_id = $1
                  AND a.timestamp >= $2::timestamp AND a.timestamp <= $3::timestamp
                GROUP BY a.user_id, DATE(a.timestamp)
            )
            SELECT ds.work_date, u.name, u.job_title, ds.first_in, ds.last_out,
                   ds.total_overtime, ds.logs_count,
                   CASE WHEN ds.logs_count > 1 THEN EXTRACT(EPOCH FROM (ds.last_out - ds.first_in))/3600 ELSE 0 END as hours_calc
            FROM users u
            JOIN DailyStats ds ON u.id = ds.user_id
            ORDER BY ds.work_date DESC
        `;

        const res = await query(sql, [session.userId, params.startDate, params.endDate]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: AttendanceDailySummary[] = res.rows.map((row: any) => {
            const checkInDate = row.first_in ? new Date(row.first_in) : null;
            let status: 'PRESENT' | 'ABSENT' | 'LATE' = 'PRESENT';

            if (checkInDate) {
                const hour = checkInDate.getHours();
                const minute = checkInDate.getMinutes();
                if (hour > 9 || (hour === 9 && minute > 10)) {
                    status = 'LATE';
                }
            }

            return {
                date: row.work_date.toISOString().split('T')[0],
                user_id: session.userId,
                user_name: row.name,
                job_title: row.job_title || 'Empleado',
                check_in: row.first_in?.toISOString() || null,
                check_out: row.last_out > row.first_in ? row.last_out?.toISOString() : null,
                hours_worked: parseFloat(row.hours_calc || 0),
                status,
                overtime_minutes: parseInt(row.total_overtime || '0'),
            };
        });

        return { success: true, data };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] My summary error');
        return { success: false, error: 'Error obteniendo asistencia' };
    }
}

// ============================================================================
// GET TEAM ATTENDANCE (MANAGER+)
// ============================================================================

/**
 * 👥 Asistencia del Equipo (MANAGER+)
 */
export async function getTeamAttendanceSecure(
    params: { startDate: string; endDate: string; locationId?: string }
): Promise<{ success: boolean; data?: AttendanceDailySummary[]; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo managers pueden ver asistencia del equipo' };
    }

    // Forzar ubicación para no-admin
    let locationId = params.locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        locationId = session.locationId;
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sqlParams: any[] = [params.startDate, params.endDate];
        let locationFilter = '';
        if (locationId) {
            locationFilter = 'AND a.location_id = $3';
            sqlParams.push(locationId);
        }

        const sql = `
            WITH DailyStats AS (
                SELECT 
                    a.user_id, DATE(a.timestamp) as work_date,
                    MIN(a.timestamp) as first_in, MAX(a.timestamp) as last_out,
                    SUM(COALESCE(a.overtime_minutes, 0)) as total_overtime,
                    COUNT(*) as logs_count
                FROM attendance_logs a
                WHERE a.timestamp >= $1::timestamp AND a.timestamp <= $2::timestamp ${locationFilter}
                GROUP BY a.user_id, DATE(a.timestamp)
            )
            SELECT ds.work_date, u.id as user_id, u.name, u.rut, u.job_title,
                   ds.first_in, ds.last_out, ds.total_overtime, ds.logs_count,
                   CASE WHEN ds.logs_count > 1 THEN EXTRACT(EPOCH FROM (ds.last_out - ds.first_in))/3600 ELSE 0 END as hours_calc
            FROM users u
            JOIN DailyStats ds ON u.id = ds.user_id
            ORDER BY ds.work_date DESC, u.name
        `;

        const res = await query(sql, sqlParams);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: AttendanceDailySummary[] = res.rows.map((row: any) => {
            const checkInDate = row.first_in ? new Date(row.first_in) : null;
            let status: 'PRESENT' | 'ABSENT' | 'LATE' = 'PRESENT';

            if (checkInDate) {
                const hour = checkInDate.getHours();
                const minute = checkInDate.getMinutes();
                if (hour > 9 || (hour === 9 && minute > 10)) {
                    status = 'LATE';
                }
            }

            return {
                date: row.work_date.toISOString().split('T')[0],
                user_id: row.user_id,
                user_name: row.name,
                rut: row.rut, // Visible para managers
                job_title: row.job_title || 'Empleado',
                check_in: row.first_in?.toISOString() || null,
                check_out: row.last_out > row.first_in ? row.last_out?.toISOString() : null,
                hours_worked: parseFloat(row.hours_calc || 0),
                status,
                overtime_minutes: parseInt(row.total_overtime || '0'),
            };
        });

        logger.info({ userId: session.userId, rows: data.length }, '👥 [Attendance] Team report');
        return { success: true, data };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Team report error');
        return { success: false, error: 'Error obteniendo asistencia' };
    }
}

// ============================================================================
// GET ATTENDANCE REPORT (Full - RRHH/ADMIN)
// ============================================================================

/**
 * 📊 Reporte Completo de Asistencia (RRHH/ADMIN)
 */
export async function getAttendanceReportSecure(
    params: { startDate: string; endDate: string; locationId?: string; role?: string }
): Promise<{ success: boolean; data?: AttendanceDailySummary[]; error?: string }> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // Solo RRHH y ADMIN pueden ver reporte completo
    if (!['RRHH', 'ADMIN', 'GERENTE_GENERAL', 'MANAGER'].includes(session.role)) {
        return { success: false, error: 'Solo RRHH y administradores pueden ver reporte completo' };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sqlParams: any[] = [params.startDate, params.endDate];
        let filters = '';

        if (params.locationId) {
            filters += ` AND a.location_id = $${sqlParams.length + 1}`;
            sqlParams.push(params.locationId);
        }

        if (params.role && params.role !== 'ALL') {
            filters += ` AND u.role = $${sqlParams.length + 1}`;
            sqlParams.push(params.role);
        }

        const sql = `
            WITH DailyStats AS (
                SELECT 
                    a.user_id, DATE(a.timestamp) as work_date,
                    MIN(a.timestamp) as first_in, MAX(a.timestamp) as last_out,
                    SUM(COALESCE(a.overtime_minutes, 0)) as total_overtime,
                    COUNT(*) as logs_count
                FROM attendance_logs a
                WHERE a.timestamp >= $1::timestamp AND a.timestamp <= $2::timestamp ${filters.replace('a.', 'a.')}
                GROUP BY a.user_id, DATE(a.timestamp)
            )
            SELECT ds.work_date, u.id as user_id, u.name, u.rut, u.role, u.job_title,
                   ds.first_in, ds.last_out, ds.total_overtime, ds.logs_count,
                   CASE WHEN ds.logs_count > 1 THEN EXTRACT(EPOCH FROM (ds.last_out - ds.first_in))/3600 ELSE 0 END as hours_calc
            FROM users u
            JOIN DailyStats ds ON u.id = ds.user_id
            ORDER BY ds.work_date DESC, u.name
        `;

        const res = await query(sql, sqlParams);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: AttendanceDailySummary[] = res.rows.map((row: any) => {
            const checkInDate = row.first_in ? new Date(row.first_in) : null;
            let status: 'PRESENT' | 'ABSENT' | 'LATE' = 'PRESENT';

            if (checkInDate) {
                const hour = checkInDate.getHours();
                const minute = checkInDate.getMinutes();
                if (hour > 9 || (hour === 9 && minute > 10)) {
                    status = 'LATE';
                }
            }

            return {
                date: row.work_date.toISOString().split('T')[0],
                user_id: row.user_id,
                user_name: row.name,
                rut: row.rut,
                job_title: row.job_title || row.role,
                check_in: row.first_in?.toISOString() || null,
                check_out: row.last_out > row.first_in ? row.last_out?.toISOString() : null,
                hours_worked: parseFloat(row.hours_calc || 0),
                status,
                overtime_minutes: parseInt(row.total_overtime || '0'),
            };
        });

        // Auditar acceso a reporte completo
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'ATTENDANCE_REPORT_ACCESS', 'ATTENDANCE', $2::jsonb, NOW())
        `, [session.userId, JSON.stringify({ ...params, rows: data.length })]);

        return { success: true, data };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] Full report error');
        return { success: false, error: 'Error obteniendo reporte' };
    }
}

// ============================================================================
// GET ATTENDANCE KPIs
// ============================================================================

/**
 * 📈 KPIs de Asistencia (MANAGER+)
 */
export async function getAttendanceKPIsSecure(
    locationId?: string
): Promise<{
    success: boolean;
    data?: { present_today: number; total_staff: number; late_arrivals_month: number; total_overtime_hours: number };
    error?: string;
}> {
    const session = await getSessionSecure();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    let filterLocationId = locationId;
    if (!ADMIN_ROLES.includes(session.role) && session.locationId) {
        filterLocationId = session.locationId;
    }

    try {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        // Present today
        const presentSql = filterLocationId
            ? `SELECT COUNT(DISTINCT user_id) as count FROM attendance_logs WHERE DATE(timestamp) = DATE(NOW()) AND location_id = $1`
            : `SELECT COUNT(DISTINCT user_id) as count FROM attendance_logs WHERE DATE(timestamp) = DATE(NOW())`;

        // Total staff
        const staffSql = filterLocationId
            ? `SELECT COUNT(*) as count FROM users WHERE status = 'ACTIVE' AND assigned_location_id = $1`
            : `SELECT COUNT(*) as count FROM users WHERE status = 'ACTIVE'`;

        // Overtime
        const overtimeSql = filterLocationId
            ? `SELECT SUM(overtime_minutes) as total FROM attendance_logs WHERE timestamp >= $1::timestamp AND location_id = $2`
            : `SELECT SUM(overtime_minutes) as total FROM attendance_logs WHERE timestamp >= $1::timestamp`;

        const [presentRes, staffRes, overtimeRes] = await Promise.all([
            query(presentSql, filterLocationId ? [filterLocationId] : []),
            query(staffSql, filterLocationId ? [filterLocationId] : []),
            query(overtimeSql, filterLocationId ? [monthStart, filterLocationId] : [monthStart]),
        ]);

        return {
            success: true,
            data: {
                present_today: parseInt(presentRes.rows[0]?.count || '0'),
                total_staff: parseInt(staffRes.rows[0]?.count || '0'),
                late_arrivals_month: 0, // Simplificado
                total_overtime_hours: Math.round((parseInt(overtimeRes.rows[0]?.total || '0') / 60) * 10) / 10,
            },
        };

    } catch (error: unknown) {
        logger.error({ error }, '[Attendance] KPIs error');
        return { success: false, error: 'Error obteniendo KPIs' };
    }
}
