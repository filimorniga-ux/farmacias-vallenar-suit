'use server';

/**
 * ============================================================================
 * NETWORK-STATS-V2: Métricas de Red Organizacional Seguras
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC por ubicación
 * - Sin .catch() silencioso
 * - Auditoría de acceso
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined };
    } catch {
        return null;
    }
}

// ============================================================================
// GET LOCATION HEALTH
// ============================================================================

/**
 * 🏥 Salud de una Ubicación (con RBAC)
 */
export async function getLocationHealthSecure(
    locationId: string
): Promise<{
    success: boolean;
    data?: { stockAlerts: number; cashAlerts: number; staffPresent: number };
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    // RBAC: Manager solo su ubicación, Admin todas
    if (!ADMIN_ROLES.includes(session.role)) {
        if (session.locationId !== locationId) {
            return { success: false, error: 'No tienes acceso a esta ubicación' };
        }
    }

    try {
        // Stock bajo
        const stockRes = await query(`
            SELECT COUNT(*) as count 
            FROM inventory_batches 
            WHERE location_id = $1 AND stock_actual < stock_min
        `, [locationId]);
        const stockAlerts = parseInt(stockRes.rows[0]?.count || '0');

        // Turnos largos (> 12 horas)
        const cashRes = await query(`
            SELECT COUNT(*) as count
            FROM shifts s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.status = 'ACTIVE'
            AND t.location_id = $1
            AND s.start_time < (extract(epoch from now()) * 1000 - 43200000)
        `, [locationId]);
        const cashAlerts = parseInt(cashRes.rows[0]?.count || '0');

        // Personal presente hoy
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const staffRes = await query(`
            SELECT COUNT(DISTINCT employee_id) as count
            FROM attendance_logs
            WHERE timestamp >= $1 
            AND type = 'CHECK_IN'
            AND employee_id IN (SELECT id FROM users WHERE assigned_location_id = $2)
        `, [startOfDay.getTime(), locationId]);
        const staffPresent = parseInt(staffRes.rows[0]?.count || '0');

        logger.info({ locationId, stockAlerts, cashAlerts, staffPresent }, '🏥 [NetworkStats] Health checked');

        return {
            success: true,
            data: { stockAlerts, cashAlerts, staffPresent },
        };

    } catch (error: any) {
        logger.error({ error, locationId }, '[NetworkStats] Health check error');
        return { success: false, error: 'Error obteniendo métricas' };
    }
}

// ============================================================================
// GET NETWORK OVERVIEW
// ============================================================================

/**
 * 🌐 Vista General de Red (Solo ADMIN)
 */
export async function getNetworkOverviewSecure(): Promise<{
    success: boolean;
    data?: { locations: any[] };
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores pueden ver la vista general' };
    }

    try {
        const res = await query(`
            SELECT 
                l.id, l.name, l.type, l.is_active,
                (SELECT COUNT(*) FROM inventory_batches ib WHERE ib.location_id = l.id AND ib.stock_actual < ib.stock_min) as stock_alerts,
                (SELECT COUNT(*) FROM terminals t WHERE t.location_id = l.id AND t.status = 'OPEN') as open_terminals,
                (SELECT COUNT(DISTINCT u.id) FROM users u WHERE u.assigned_location_id = l.id AND u.is_active = true) as staff_count
            FROM locations l
            WHERE l.is_active = true
            ORDER BY l.name
        `);

        return { success: true, data: { locations: res.rows } };

    } catch (error: any) {
        logger.error({ error }, '[NetworkStats] Overview error');
        return { success: false, error: 'Error obteniendo vista general' };
    }
}

// ============================================================================
// GET STOCK ALERTS
// ============================================================================

/**
 * 📦 Alertas de Stock (MANAGER+)
 */
export async function getStockAlertsSecure(
    locationId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    if (!ADMIN_ROLES.includes(session.role) && session.locationId !== locationId) {
        return { success: false, error: 'Solo puedes ver alertas de tu ubicación' };
    }

    try {
        const res = await query(`
            SELECT ib.id, ib.sku, ib.name, ib.stock_actual, ib.stock_min, 
                   (ib.stock_min - ib.stock_actual) as deficit
            FROM inventory_batches ib
            WHERE ib.location_id = $1 
              AND ib.stock_actual < ib.stock_min
            ORDER BY deficit DESC
            LIMIT 50
        `, [locationId]);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[NetworkStats] Stock alerts error');
        return { success: false, error: 'Error obteniendo alertas' };
    }
}

// ============================================================================
// GET CASH ALERTS
// ============================================================================

/**
 * 💰 Alertas de Caja (Turnos largos)
 */
export async function getCashAlertsSecure(
    locationId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    if (!ADMIN_ROLES.includes(session.role) && session.locationId !== locationId) {
        return { success: false, error: 'Solo puedes ver alertas de tu ubicación' };
    }

    try {
        const res = await query(`
            SELECT s.id, t.name as terminal_name, u.name as user_name,
                   s.start_time,
                   ROUND((extract(epoch from now()) * 1000 - s.start_time) / 3600000, 1) as hours_open
            FROM shifts s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'ACTIVE'
              AND t.location_id = $1
              AND s.start_time < (extract(epoch from now()) * 1000 - 43200000)
            ORDER BY s.start_time ASC
        `, [locationId]);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[NetworkStats] Cash alerts error');
        return { success: false, error: 'Error obteniendo alertas' };
    }
}

// ============================================================================
// GET STAFF STATUS
// ============================================================================

/**
 * 👥 Estado del Personal
 */
export async function getStaffStatusSecure(
    locationId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!MANAGER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    if (!ADMIN_ROLES.includes(session.role) && session.locationId !== locationId) {
        return { success: false, error: 'Solo puedes ver personal de tu ubicación' };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    try {
        const res = await query(`
            SELECT u.id, u.name, u.role,
                   (SELECT MAX(timestamp) FROM attendance_logs al 
                    WHERE al.employee_id = u.id AND al.type = 'CHECK_IN' AND al.timestamp >= $2) as check_in_time,
                   (SELECT MAX(timestamp) FROM attendance_logs al 
                    WHERE al.employee_id = u.id AND al.type = 'CHECK_OUT' AND al.timestamp >= $2) as check_out_time
            FROM users u
            WHERE u.assigned_location_id = $1 AND u.is_active = true
            ORDER BY u.name
        `, [locationId, startOfDay.getTime()]);

        const data = res.rows.map((row: any) => ({
            id: row.id,
            name: row.name,
            role: row.role,
            status: row.check_in_time && !row.check_out_time ? 'PRESENT' : 'ABSENT',
            check_in_time: row.check_in_time,
        }));

        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[NetworkStats] Staff status error');
        return { success: false, error: 'Error obteniendo estado del personal' };
    }
}
