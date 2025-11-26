'use server';

import { query } from '@/lib/db';

export async function getAuditLogs() {
    try {
        const sql = `
            SELECT * FROM audit_logs
            ORDER BY fecha DESC
            LIMIT 100
        `;
        const result = await query(sql);
        return result.rows;
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        return [];
    }
}
