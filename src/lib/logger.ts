import { query } from '@/lib/db';

export async function logAction(usuario: string, accion: string, detalle: string) {
    try {
        const sql = `
            INSERT INTO audit_logs (usuario, accion, detalle)
            VALUES ($1, $2, $3)
        `;
        await query(sql, [usuario, accion, detalle]);
    } catch (error) {
        console.error('Error logging action:', error);
        // We don't want to crash the app if logging fails, so we just log the error to console
    }
}
