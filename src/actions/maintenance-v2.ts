'use server';

/**
 * ============================================================================
 * MAINTENANCE-V2: Mantenimiento de Sistema Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Solo ADMIN puede ejecutar mantenimiento
 * - PIN requerido para operaciones destructivas
 * - Rate limit: 1 ejecución por hora
 * - Notificación a managers de cierres forzados
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MAX_SHIFT_HOURS = 20;
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'; // UUID válido para SYSTEM

// Rate limiting
const maintenanceRateLimit = new Map<string, number>();
const MAINTENANCE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora

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

async function validateAdminPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; admin?: { id: string; name: string } }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');

        const adminsRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [ADMIN_ROLES]);

        for (const admin of adminsRes.rows) {
            const rateCheck = checkRateLimit(admin.id);
            if (!rateCheck.allowed) continue;

            if (admin.access_pin_hash) {
                const valid = await bcrypt.compare(pin, admin.access_pin_hash);
                if (valid) {
                    resetAttempts(admin.id);
                    return { valid: true, admin: { id: admin.id, name: admin.name } };
                }
                recordFailedAttempt(admin.id);
            } else if (admin.access_pin === pin) {
                resetAttempts(admin.id);
                return { valid: true, admin: { id: admin.id, name: admin.name } };
            }
        }
        return { valid: false };
    } catch {
        return { valid: false };
    }
}

function checkMaintenanceRateLimit(operation: string): boolean {
    const now = Date.now();
    const lastRun = maintenanceRateLimit.get(operation);
    if (lastRun && now - lastRun < MAINTENANCE_COOLDOWN_MS) {
        return false;
    }
    maintenanceRateLimit.set(operation, now);
    return true;
}

// ============================================================================
// AUTO CLOSE GHOST SESSIONS
// ============================================================================

/**
 * 🧹 Cerrar Sesiones Olvidadas (Solo ADMIN + PIN)
 */
export async function autoCloseGhostSessionsSecure(
    adminPin: string
): Promise<{ success: boolean; count?: number; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores pueden ejecutar mantenimiento' };
    }

    // Rate limit
    if (!checkMaintenanceRateLimit('ghost_sessions')) {
        return { success: false, error: 'Mantenimiento ya ejecutado recientemente. Espere 1 hora.' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador inválido' };
        }

        // Buscar sesiones fantasma
        const ghostsRes = await client.query(`
            SELECT 
                s.id as session_id,
                s.terminal_id,
                s.user_id,
                s.opened_at,
                t.name as terminal_name,
                t.location_id,
                u.name as user_name
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'OPEN'
              AND s.opened_at < NOW() - INTERVAL '${MAX_SHIFT_HOURS} hours'
        `);

        const ghosts = ghostsRes.rows;
        let closedCount = 0;

        for (const ghost of ghosts) {
            const hoursOpen = (Date.now() - new Date(ghost.opened_at).getTime()) / (1000 * 60 * 60);
            const reason = `AUTO-CIERRE SISTEMA: Sesión olvidada por ${hoursOpen.toFixed(1)} horas. Cerrado por ${authResult.admin!.name}`;

            // Cerrar sesión
            await client.query(`
                UPDATE cash_register_sessions 
                SET status = 'CLOSED', closed_at = NOW(), notes = $2, closed_by_user_id = $3
                WHERE id = $1 AND status = 'OPEN'
            `, [ghost.session_id, reason, SYSTEM_USER_ID]);

            // Notificar a managers de la ubicación
            const managersRes = await client.query(`
                SELECT id FROM users 
                WHERE role IN ('MANAGER', 'ADMIN', 'GERENTE_GENERAL')
                AND (assigned_location_id = $1 OR assigned_location_id IS NULL)
                AND is_active = true
            `, [ghost.location_id]);

            for (const manager of managersRes.rows) {
                await client.query(`
                    INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
                    VALUES ($1, $2, 'ALERT', $3, $4, false, NOW())
                `, [
                    randomUUID(),
                    manager.id,
                    `⚠️ Sesión Cerrada Automáticamente`,
                    `Terminal: ${ghost.terminal_name}, Cajero: ${ghost.user_name || 'N/A'}, Horas abierta: ${hoursOpen.toFixed(1)}h`
                ]);
            }

            closedCount++;
        }

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'MAINTENANCE_GHOST_SESSIONS', 'SYSTEM', $2::jsonb, NOW())
        `, [authResult.admin!.id, JSON.stringify({
            sessions_closed: closedCount,
            admin_name: authResult.admin!.name,
        })]);

        await client.query('COMMIT');

        logger.info({ closedCount, adminId: authResult.admin!.id }, '🧹 [Maintenance] Ghost sessions closed');
        return { success: true, count: closedCount };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Maintenance] Ghost sessions error');
        return { success: false, error: 'Error cerrando sesiones' };
    } finally {
        client.release();
    }
}

// ============================================================================
// SYSTEM INCIDENTS
// ============================================================================

/**
 * 🚨 Obtener Incidencias Recientes (filtradas por ubicación)
 */
export async function getRecentSystemIncidentsSecure(): Promise<{
    success: boolean;
    data?: any[];
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        let locationFilter = '';
        const params: any[] = [];

        if (!ADMIN_ROLES.includes(session.role)) {
            const userRes = await query('SELECT assigned_location_id FROM users WHERE id = $1', [session.userId]);
            const locationId = userRes.rows[0]?.assigned_location_id;
            if (locationId) {
                locationFilter = 'AND t.location_id = $1';
                params.push(locationId);
            }
        }

        const res = await query(`
            SELECT 
                s.id,
                t.name as terminal_name,
                t.location_id,
                u.name as cashier_name,
                s.closed_at,
                s.notes
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id::text = u.id
            WHERE s.closed_by_user_id = $${params.length + 1}::uuid
              AND s.closed_at > NOW() - INTERVAL '24 hours'
              ${locationFilter}
            ORDER BY s.closed_at DESC
        `, [...params, SYSTEM_USER_ID]);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Maintenance] Get incidents error');
        return { success: false, error: 'Error obteniendo incidencias' };
    }
}

// ============================================================================
// SYSTEM HEALTH CHECK
// ============================================================================

/**
 * 🏥 Verificación de Salud del Sistema
 */
export async function runSystemHealthCheck(): Promise<{
    success: boolean;
    data?: {
        database: boolean;
        openSessions: number;
        pendingNotifications: number;
        lastAuditEntry: Date | null;
    };
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores' };
    }

    try {
        // Test DB
        const dbTest = await query('SELECT 1 as test');
        const dbOk = dbTest.rows[0]?.test === 1;

        // Open sessions
        const sessionsRes = await query(`SELECT COUNT(*) as count FROM cash_register_sessions WHERE status = 'OPEN'`);
        const openSessions = parseInt(sessionsRes.rows[0]?.count || '0');

        // Pending notifications
        const notifsRes = await query(`SELECT COUNT(*) as count FROM notifications WHERE is_read = false`);
        const pendingNotifications = parseInt(notifsRes.rows[0]?.count || '0');

        // Last audit
        const auditRes = await query(`SELECT created_at FROM audit_log ORDER BY created_at DESC LIMIT 1`);
        const lastAuditEntry = auditRes.rows[0]?.created_at || null;

        return {
            success: true,
            data: {
                database: dbOk,
                openSessions,
                pendingNotifications,
                lastAuditEntry,
            },
        };

    } catch (error: any) {
        logger.error({ error }, '[Maintenance] Health check error');
        return { success: false, error: 'Error en verificación' };
    }
}

// ============================================================================
// CLEANUP OLD DATA
// ============================================================================

/**
 * 🗑️ Limpiar Datos Antiguos (Solo ADMIN + PIN)
 */
export async function cleanupOldDataSecure(
    daysOld: number,
    adminPin: string
): Promise<{ success: boolean; deleted?: Record<string, number>; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores' };
    }

    if (daysOld < 30) {
        return { success: false, error: 'Mínimo 30 días de antigüedad' };
    }

    // Rate limit
    if (!checkMaintenanceRateLimit('cleanup')) {
        return { success: false, error: 'Limpieza ya ejecutada recientemente. Espere 1 hora.' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN
        const authResult = await validateAdminPin(client, adminPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN de administrador inválido' };
        }

        const deleted: Record<string, number> = {};

        // Limpiar notificaciones leídas antiguas
        const notifsRes = await client.query(`
            DELETE FROM notifications 
            WHERE is_read = true AND created_at < NOW() - INTERVAL '1 day' * $1
        `, [daysOld]);
        deleted.notifications = notifsRes.rowCount || 0;

        // Limpiar tickets completados
        const ticketsRes = await client.query(`
            DELETE FROM queue_tickets 
            WHERE status IN ('COMPLETED', 'CANCELLED') AND created_at < NOW() - INTERVAL '1 day' * $1
        `, [daysOld]);
        deleted.queue_tickets = ticketsRes.rowCount || 0;

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'MAINTENANCE_CLEANUP', 'SYSTEM', $2::jsonb, NOW())
        `, [authResult.admin!.id, JSON.stringify({
            days_old: daysOld,
            deleted,
            admin_name: authResult.admin!.name,
        })]);

        await client.query('COMMIT');

        logger.info({ deleted, daysOld }, '🗑️ [Maintenance] Cleanup completed');
        return { success: true, deleted };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Maintenance] Cleanup error');
        return { success: false, error: 'Error en limpieza' };
    } finally {
        client.release();
    }
}

// ============================================================================
// MAINTENANCE LOG
// ============================================================================

/**
 * 📜 Log de Mantenimientos
 */
export async function getMaintenanceLogSecure(): Promise<{
    success: boolean;
    data?: any[];
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores' };
    }

    try {
        const res = await query(`
            SELECT al.*, u.name as admin_name
            FROM audit_log al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE al.action_code LIKE 'MAINTENANCE_%'
            ORDER BY al.created_at DESC
            LIMIT 50
        `);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Maintenance] Get log error');
        return { success: false, error: 'Error obteniendo log' };
    }
}
