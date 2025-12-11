'use server';

import { query } from '@/lib/db';

export async function getAuditLogs(filters?: {
    usuario?: string;
    accion?: string;
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
    limit?: number;
}) {
    try {
        let sql = `SELECT * FROM audit_logs WHERE 1=1`;
        const params: any[] = [];
        let paramIndex = 1;

        if (filters?.usuario) {
            sql += ` AND usuario ILIKE $${paramIndex}`;
            params.push(`%${filters.usuario}%`);
            paramIndex++;
        }

        if (filters?.accion) {
            sql += ` AND accion = $${paramIndex}`;
            params.push(filters.accion);
            paramIndex++;
        }

        if (filters?.startDate) {
            sql += ` AND fecha >= $${paramIndex}`;
            params.push(`${filters.startDate} 00:00:00`);
            paramIndex++;
        }

        if (filters?.endDate) {
            sql += ` AND fecha <= $${paramIndex}`;
            params.push(`${filters.endDate} 23:59:59`);
            paramIndex++;
        }

        sql += ` ORDER BY fecha DESC LIMIT $${paramIndex}`;
        params.push(filters?.limit || 500);

        const result = await query(sql, params);
        return result.rows;
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return [];
    }
}
