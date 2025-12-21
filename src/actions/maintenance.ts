'use server';

import { query } from '@/lib/db';
import { forceCloseTerminalShift } from './terminals';

const MAX_SHIFT_HOURS = 20;

/**
 * Garbage Collector for Stale Sessions.
 * Finds sessions older than MAX_SHIFT_HOURS and force-closes them.
 * Designed to be run by a cron job or "Lazy Trigger" on Admin Login.
 */
export async function autoCloseGhostSessions() {
    try {
        console.log('🧹 [GC] Iniciando recolección de sesiones olvidadas...');

        // 1. Find Stale Sessions
        // Query: Status OPEN AND opened_at < NOW() - 20 hours
        const result = await query(`
            SELECT 
                s.id as session_id,
                s.terminal_id,
                s.user_id,
                s.opened_at,
                t.name as terminal_name,
                u.name as user_name
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'OPEN'
              AND s.opened_at < NOW() - INTERVAL '20 hours'
        `);

        const ghosts = result.rows;

        if (ghosts.length === 0) {
            console.log('✅ [GC] Sistema limpio. No hay sesiones obsoletas.');
            return { success: true, count: 0 };
        }

        console.log(`⚠️ [GC] Detectadas ${ghosts.length} sesiones obsoletas (> ${MAX_SHIFT_HOURS}h). Procediendo a cierre.`);

        // 2. Iterate and Close
        let closedCount = 0;
        for (const session of ghosts) {
            try {
                const hoursOpen = (Date.now() - new Date(session.opened_at).getTime()) / (1000 * 60 * 60);
                const reason = `AUTO-CIERRE SISTEMA: Sesión olvidada por ${hoursOpen.toFixed(1)} horas.`;

                // Use our upgraded forceClose function
                // 'SYSTEM_BOT' as user ID for audit
                await forceCloseTerminalShift(session.terminal_id, 'SYSTEM_BOT', reason);

                console.log(`🤖 [GC] Cerrada sesión ${session.session_id} en terminal ${session.terminal_name}`);
                closedCount++;
            } catch (err) {
                console.error(`❌ [GC] Error cerrando sesión ${session.session_id}:`, err);
            }
        }

        return { success: true, count: closedCount };

    } catch (error) {
        console.error('❌ [GC] Error crítico durante limpieza:', error);
        return { success: false, error: 'GC Failed' };
    }
}

/**
 * Busca cierres forzados por el sistema en las últimas 24 horas.
 * Esto alimenta la "Tarjeta Roja" del Dashboard.
 */
export async function getRecentSystemIncidents() {
    try {
        const result = await query(`
            SELECT 
                s.id,
                t.name as terminal_name,
                u.name as cashier_name,
                s.end_time,
                s.notes
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.closed_by_user_id = 'SYSTEM_BOT'
              AND s.end_time > NOW() - INTERVAL '24 hours'
            ORDER BY s.end_time DESC
        `);

        return { success: true, data: result.rows };
    } catch (error) {
        console.error('Error fetching system incidents:', error);
        return { success: false, error: 'Error al obtener incidencias' };
    }
}
