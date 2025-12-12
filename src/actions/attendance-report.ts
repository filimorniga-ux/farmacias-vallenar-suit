'use server';

import { query } from '../lib/db';

export interface AttendanceDailySummary {
    date: string;
    user_id: string;
    user_name: string;
    rut: string;
    role: string;
    job_title: string;
    check_in: string | null; // ISO string
    check_out: string | null; // ISO string
    hours_worked: number; // hours (decimal)
    status: 'PRESENT' | 'ABSENT' | 'LATE';
    overtime_minutes: number;
}

export async function getAttendanceReport(
    startDate: string,
    endDate: string,
    locationId?: string,
    role?: string
): Promise<AttendanceDailySummary[]> {
    try {
        console.log(`📊 Generating Attendance Report: ${startDate} to ${endDate}`);

        // Base Query
        let sql = `
            WITH DailyStats AS (
                SELECT 
                    a.user_id,
                    DATE(a.timestamp) as work_date,
                    MIN(a.timestamp) as first_in,
                    MAX(a.timestamp) as last_out,
                    SUM(COALESCE(a.overtime_minutes, 0)) as total_overtime,
                    COUNT(*) as logs_count
                FROM attendance_logs a
                WHERE a.timestamp >= $1::timestamp AND a.timestamp <= $2::timestamp
                ${locationId ? `AND a.location_id = $3` : ''}
                GROUP BY a.user_id, DATE(a.timestamp)
            )
            SELECT 
                ds.work_date,
                u.id as user_id,
                u.name as user_name,
                u.rut,
                u.role,
                u.job_title,
                ds.first_in,
                ds.last_out,
                ds.total_overtime,
                -- Verify if only one log exists (likely just check-in, no check-out)
                CASE 
                    WHEN ds.logs_count > 1 THEN EXTRACT(EPOCH FROM (ds.last_out - ds.first_in))/3600
                    ELSE 0 
                END as hours_calculated
            FROM users u
            JOIN DailyStats ds ON u.id = ds.user_id
            WHERE 1=1
            ${role && role !== 'ALL' ? `AND u.role = ${locationId ? '$4' : '$3'}` : ''}
            ORDER BY ds.work_date DESC, u.name ASC
        `;

        const params: any[] = [startDate, endDate];
        if (locationId) params.push(locationId);
        if (role && role !== 'ALL') params.push(role);

        const result = await query(sql, params);

        // Process results
        const summaries: AttendanceDailySummary[] = result.rows.map(row => {
            const checkInDate = row.first_in ? new Date(row.first_in) : null;

            // Check Late Arrival (Fixed 09:10 AM tolerance)
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
                user_name: row.user_name,
                rut: row.rut,
                role: row.role,
                job_title: row.job_title || row.role,
                check_in: row.first_in ? row.first_in.toISOString() : null,
                check_out: row.last_out && row.last_out > row.first_in ? row.last_out.toISOString() : null, // Prevent same CHECK_IN/OUT display if single log
                hours_worked: parseFloat(row.hours_calculated), // Simple diff
                status,
                overtime_minutes: parseInt(row.total_overtime || '0')
            };
        });

        return summaries;

    } catch (error: any) {
        console.error('❌ Error getting attendance report:', error);
        return [];
    }
}

export interface AttendanceKPIs {
    present_today: number;
    total_staff: number;
    late_arrivals_month: number;
    total_overtime_hours: number;
}

export async function getAttendanceKPIs(locationId?: string): Promise<AttendanceKPIs> {
    try {
        const today = new Date().toISOString().split('T')[0];
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        // 1. Present Today
        const presentSql = `
            SELECT COUNT(DISTINCT user_id) as count 
            FROM attendance_logs 
            WHERE DATE(timestamp) = DATE(NOW())
            ${locationId ? `AND location_id = $1` : ''}
        `;

        // 2. Total Staff (Active)
        const staffSql = `
            SELECT COUNT(*) as count 
            FROM users 
            WHERE status = 'ACTIVE'
            ${locationId ? `AND assigned_location_id = $1` : ''}
        `;

        // 3. Late Arrivals (This Month) - > 9:10 AM
        // Using subquery to find first check-in of day
        const lateSql = `
            WITH DailyFirst AS (
                SELECT user_id, DATE(timestamp), MIN(timestamp) as first_in
                FROM attendance_logs
                WHERE timestamp >= $1::timestamp
                ${locationId ? `AND location_id = $2` : ''}
                GROUP BY user_id, DATE(timestamp)
            )
            SELECT COUNT(*) as count
            FROM DailyFirst
            WHERE EXTRACT(HOUR FROM first_in) > 9 
            OR (EXTRACT(HOUR FROM first_in) = 9 AND EXTRACT(MINUTE FROM first_in) > 10)
        `;

        // 4. Overtime (This Month)
        const overtimeSql = `
            SELECT SUM(overtime_minutes) as total
            FROM attendance_logs
            WHERE timestamp >= $1::timestamp
            ${locationId ? `AND location_id = $2` : ''}
        `;

        const [presentRes, staffRes, lateRes, overtimeRes] = await Promise.all([
            query(presentSql, locationId ? [locationId] : []),
            query(staffSql, locationId ? [locationId] : []),
            query(lateSql, locationId ? [monthStart, locationId] : [monthStart]),
            query(overtimeSql, locationId ? [monthStart, locationId] : [monthStart])
        ]);

        return {
            present_today: parseInt(presentRes.rows[0].count),
            total_staff: parseInt(staffRes.rows[0].count),
            late_arrivals_month: parseInt(lateRes.rows[0].count),
            total_overtime_hours: Math.round((parseInt(overtimeRes.rows[0].total || '0') / 60) * 10) / 10
        };

    } catch (error) {
        console.error('Error fetching Attendance KPIs', error);
        return {
            present_today: 0,
            total_staff: 0,
            late_arrivals_month: 0,
            total_overtime_hours: 0
        };
    }
}
