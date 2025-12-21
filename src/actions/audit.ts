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

export async function getRecentAuditLogs(limit = 50) {
    try {
        // Hacemos JOIN para obtener el nombre del usuario, o mostramos 'SISTEMA / BOT' si es null/bot
        const result = await query(`
            SELECT 
                a.id,
                a.accion as action,
                a.detalle as details,
                a.fecha as created_at,
                a.usuario as user_id,
                COALESCE(u.name, 'SISTEMA / BOT') as user_name,
                u.role as user_role
            FROM audit_logs a
            LEFT JOIN users u ON a.usuario = u.id::text
            ORDER BY a.fecha DESC
            LIMIT $1
        `, [limit]);

        return { success: true, data: result.rows };
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return { success: false, error: 'No se pudo cargar el historial de seguridad' };
    }
}

/**
 * Log a sensitive action to the audit table.
 * @param usuario ID or Name of the user performing the action
 * @param accion Short code for the action (e.g., 'FORCE_CLOSE')
 * @param detalle Human readable details
 * @param ip Optional IP address
 */
export async function logAction(usuario: string, accion: string, detalle: string, ip?: string) {
    try {
        await query(`
            INSERT INTO audit_logs (usuario, accion, detalle, ip, fecha)
            VALUES ($1, $2, $3, $4, NOW())
        `, [usuario, accion, detalle, ip || 'UNKNOWN']);
        return { success: true };
    } catch (error) {
        console.error('Error logging audit action:', error);
        // We generally don't want audit failure to block the main action, but it should be noted.
        return { success: false, error: 'Audit Log Failed' };
    }
}
