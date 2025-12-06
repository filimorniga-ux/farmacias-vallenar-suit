'use server';

import { query } from '../lib/db';

export async function registerAttendance(
    userId: string,
    type: 'CHECK_IN' | 'BREAK_START' | 'BREAK_END' | 'CHECK_OUT',
    locationId: string,
    method: string = 'PIN',
    observation?: string,
    evidencePhotoUrl?: string,
    overtimeMinutes: number = 0
) {
    try {
        console.log(`🕒 Registrando asistencia: ${userId} - ${type} @ ${locationId}`);

        const result = await query(
            `INSERT INTO attendance_logs (user_id, type, location_id, method, timestamp, observation, evidence_photo_url, overtime_minutes) 
             VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7) 
             RETURNING *`,
            [userId, type, locationId, method, observation, evidencePhotoUrl, overtimeMinutes]
        );

        return { success: true, data: result.rows[0] };
    } catch (error: any) {
        console.error('❌ Error in registerAttendance:', error);
        return { success: false, error: error.message };
    }
}

export async function getAttendanceHistory(filters?: { userId?: string, locationId?: string, startDate?: Date, endDate?: Date }) {
    try {
        let sql = `SELECT a.*, u."fullName" as user_name 
                   FROM attendance_logs a 
                   LEFT JOIN users u ON a.user_id = u.id 
                   WHERE 1=1`;
        const params: any[] = [];
        let paramCount = 1;

        if (filters?.userId) {
            sql += ` AND a.user_id = $${paramCount++}`;
            params.push(filters.userId);
        }

        if (filters?.locationId) {
            sql += ` AND a.location_id = $${paramCount++}`;
            params.push(filters.locationId);
        }

        if (filters?.startDate) {
            sql += ` AND a.timestamp >= $${paramCount++}`;
            params.push(filters.startDate);
        }

        if (filters?.endDate) {
            sql += ` AND a.timestamp <= $${paramCount++}`;
            params.push(filters.endDate);
        }

        sql += ` ORDER BY a.timestamp DESC LIMIT 500`;

        const result = await query(sql, params);
        return { success: true, data: result.rows };
    } catch (error: any) {
        console.error('❌ Error in getAttendanceHistory:', error);
        return { success: false, error: error.message };
    }
}
