'use server';

/**
 * ============================================================================
 * AUDIT-DASHBOARD-V2: Dashboard de Auditoría Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Usa session headers en lugar de cookies vulnerables
 * - Rate limit 30/min por usuario
 * - PIN ADMIN para exports masivos (>1000)
 * - Meta-auditoría: registra quién accede al audit log
 * - Límite máximo de export 5000
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getSessionSecure } from './auth-v2';
import { ExcelService } from '@/lib/excel-generator';
import { formatDateTimeCL, formatDateCL } from '@/lib/timezone';

type QueryParam = string | number | boolean | Date | string[] | null | undefined;

// ============================================================================
// SCHEMAS
// ============================================================================

const GetAuditLogsSchema = z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(25),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    userId: z.string().optional(),
    actionCode: z.string().optional(),
    severity: z.enum(['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    searchTerm: z.string().max(100).optional(),
    entityType: z.string().optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const AUDIT_VIEWER_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'];
const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];

const ACTION_SEVERITY_MAP: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
    'FORCE_CLOSE': 'CRITICAL', 'INVENTORY_CLEARED': 'CRITICAL', 'PASSWORD_RESET': 'CRITICAL',
    'ROLE_CHANGED': 'CRITICAL', 'USER_DEACTIVATED': 'CRITICAL',
    'TREASURY_TRANSFER': 'HIGH', 'BANK_DEPOSIT': 'HIGH', 'VOID_SALE': 'HIGH',
    'REFUND': 'HIGH', 'SHIFT_HANDOVER': 'HIGH', 'SESSION_CLOSE': 'HIGH',
    'STOCK_ADJUSTED': 'MEDIUM', 'STOCK_TRANSFERRED': 'MEDIUM', 'SALE_CREATED': 'MEDIUM',
    'LOGIN': 'LOW', 'LOGOUT': 'LOW', 'SESSION_START': 'LOW',
};

// ============================================================================
// HELPERS
// ============================================================================

// getSession removed in favor of getSessionSecure

function getSeverity(actionCode: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    return ACTION_SEVERITY_MAP[actionCode] || 'LOW';
}

async function metaAudit(userId: string, action: string, details: Record<string, unknown>): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, $2, 'AUDIT_LOG', $3::jsonb, NOW())
        `, [userId, action, JSON.stringify(details)]);
    } catch (error) {
        // Silently fail meta-audit to avoid loops
        console.error('Meta-audit error:', error);
    }
}

// ============================================================================
// INTERFACES
// ============================================================================

interface AuditLogEntry {
    id: string;
    timestamp: string;
    userId: string;
    userName: string;
    userRole: string;
    locationId: string | null;
    locationName: string | null;
    actionCode: string;
    entityType: string;
    entityId: string;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    justification: string | null;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    ipAddress: string | null;
}

// ============================================================================
// GET AUDIT LOGS
// ============================================================================

/**
 * 📊 Obtener Logs de Auditoría (con rate limit y meta-auditoría)
 */
export async function getAuditLogsSecure(params: z.infer<typeof GetAuditLogsSchema>): Promise<{
    success: boolean;
    data?: AuditLogEntry[];
    total?: number;
    page?: number;
    totalPages?: number;
    error?: string;
}> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };

    if (!AUDIT_VIEWER_ROLES.includes(session.role)) {
        return { success: false, error: 'No tiene permisos para ver auditoría' };
    }

    // Rate limit
    const rl = checkRateLimit(`audit:${session.userId}`);
    if (!rl.allowed) {
        return { success: false, error: 'Demasiadas consultas. Espere un momento.' };
    }

    const validation = GetAuditLogsSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message };
    }

    const { page, limit, startDate, endDate, userId, actionCode, severity, searchTerm, entityType } = validation.data;

    try {
        const whereConditions: string[] = [];
        const queryParams: QueryParam[] = [];
        let paramIndex = 1;

        if (startDate) { whereConditions.push(`al.created_at >= $${paramIndex}::timestamp`); queryParams.push(startDate); paramIndex++; }
        if (endDate) { whereConditions.push(`al.created_at <= $${paramIndex}::timestamp`); queryParams.push(endDate); paramIndex++; }
        if (userId) { whereConditions.push(`al.user_id::text = $${paramIndex}`); queryParams.push(userId); paramIndex++; }
        if (actionCode) { whereConditions.push(`al.action_code = $${paramIndex}`); queryParams.push(actionCode); paramIndex++; }
        if (entityType) { whereConditions.push(`al.entity_type = $${paramIndex}`); queryParams.push(entityType); paramIndex++; }
        if (searchTerm) {
            whereConditions.push(`(al.action_code ILIKE $${paramIndex} OR al.justification ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`);
            queryParams.push(`%${searchTerm}%`);
            paramIndex++;
        }
        if (severity && severity !== 'ALL') {
            const severityActions = Object.entries(ACTION_SEVERITY_MAP).filter(([, sev]) => sev === severity).map(([action]) => action);
            if (severityActions.length > 0) {
                whereConditions.push(`al.action_code = ANY($${paramIndex}::text[])`);
                queryParams.push(severityActions);
                paramIndex++;
            }
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        // Count
        const countRes = await query(`SELECT COUNT(*) as total FROM audit_log al LEFT JOIN users u ON al.user_id::text = u.id::text ${whereClause}`, queryParams);
        const total = Number(countRes.rows[0]?.total || 0);

        // Data
        const offset = (page - 1) * limit;
        queryParams.push(limit, offset);

        const dataSql = `
            SELECT al.id::text, al.created_at as timestamp, al.user_id::text, COALESCE(u.name, 'Sistema') as user_name,
                   COALESCE(u.role, 'SYSTEM') as user_role, al.location_id::text, COALESCE(l.name, '-') as location_name,
                   al.action_code, COALESCE(al.entity_type, '-') as entity_type, COALESCE(al.entity_id, '-') as entity_id,
                   al.old_values, al.new_values, al.justification, al.ip_address
            FROM audit_log al
            LEFT JOIN users u ON al.user_id::text = u.id::text
            LEFT JOIN locations l ON al.location_id::text = l.id::text
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const dataRes = await query(dataSql, queryParams);

        const logs: AuditLogEntry[] = dataRes.rows.map((row: Record<string, unknown>) => ({
            id: String(row.id),
            timestamp: String(row.timestamp),
            userId: String(row.user_id),
            userName: String(row.user_name),
            userRole: String(row.user_role),
            locationId: row.location_id ? String(row.location_id) : null,
            locationName: row.location_name ? String(row.location_name) : null,
            actionCode: String(row.action_code),
            entityType: String(row.entity_type),
            entityId: String(row.entity_id),
            oldValues: (row.old_values as Record<string, unknown>) || null,
            newValues: (row.new_values as Record<string, unknown>) || null,
            justification: row.justification ? String(row.justification) : null,
            severity: getSeverity(String(row.action_code)),
            ipAddress: row.ip_address ? String(row.ip_address) : null,
        }));

        // Meta-auditoría
        await metaAudit(session.userId, 'AUDIT_LOG_VIEW', { page, filters: params });

        return { success: true, data: logs, total, page, totalPages: Math.ceil(total / limit) };

    } catch (error: unknown) {
        logger.error({ error }, '[Audit] Get logs error');
        return { success: false, error: 'Error obteniendo logs' };
    }
}

// ============================================================================
// GET ACTION TYPES
// ============================================================================

export async function getAuditActionTypesSecure(): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const session = await getSessionSecure();
    if (!session || !AUDIT_VIEWER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    try {
        const res = await query(`SELECT DISTINCT action_code FROM audit_log WHERE action_code IS NOT NULL ORDER BY action_code`);
        return { success: true, data: res.rows.map((r: { action_code: string }) => r.action_code) };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// GET USERS
// ============================================================================

export async function getAuditUsersSecure(): Promise<{ success: boolean; data?: Array<{ id: string; name: string }>; error?: string }> {
    const session = await getSessionSecure();
    if (!session || !AUDIT_VIEWER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    try {
        const res = await query(`SELECT DISTINCT u.id::text, u.name FROM audit_log al JOIN users u ON al.user_id::text = u.id::text ORDER BY u.name`);
        return { success: true, data: res.rows };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// GET STATS
// ============================================================================

export async function getAuditStatsSecure(): Promise<{
    success: boolean;
    data?: { totalToday: number; criticalToday: number; topActions: Array<{ action: string; count: number }>; topUsers: Array<{ name: string; count: number }> };
    error?: string;
}> {
    const session = await getSessionSecure();
    if (!session || !AUDIT_VIEWER_ROLES.includes(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }

    try {
        const todayRes = await query(`SELECT COUNT(*) as total FROM audit_log WHERE created_at >= CURRENT_DATE`);
        const criticalActions = Object.entries(ACTION_SEVERITY_MAP).filter(([, sev]) => sev === 'CRITICAL').map(([action]) => action);
        const criticalRes = await query(`SELECT COUNT(*) as total FROM audit_log WHERE created_at >= CURRENT_DATE AND action_code = ANY($1::text[])`, [criticalActions]);
        const topActionsRes = await query(`SELECT action_code as action, COUNT(*) as count FROM audit_log WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY action_code ORDER BY count DESC LIMIT 5`);
        const topUsersRes = await query(`SELECT u.name, COUNT(*) as count FROM audit_log al JOIN users u ON al.user_id::text = u.id::text WHERE al.created_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY u.name ORDER BY count DESC LIMIT 5`);

        return {
            success: true,
            data: {
                totalToday: Number(todayRes.rows[0]?.total || 0),
                criticalToday: Number(criticalRes.rows[0]?.total || 0),
                topActions: topActionsRes.rows.map((r: { action: string; count: string | number }) => ({ action: r.action, count: Number(r.count) })),
                topUsers: topUsersRes.rows.map((r: { name: string; count: string | number }) => ({ name: r.name, count: Number(r.count) })),
            },
        };
    } catch (error: unknown) {
        logger.error({ error }, '[Audit] Stats error');
        return { success: false, error: (error as Error).message };
    }
}

// ============================================================================
// EXPORT LOGS (PIN ADMIN para >1000)
// ============================================================================

// Redundant imports removed

/**
 * 📤 Exportar Logs de Auditoría (MANAGER+)
 */
export async function exportAuditLogsSecure(
    params: { startDate?: string; endDate?: string; actionCode?: string; userId?: string },
    adminPin?: string
): Promise<{ success: boolean; data?: string; filename?: string; error?: string }> {
    const session = await getSessionSecure();
    if (!session) return { success: false, error: 'No autenticado' };
    if (!AUDIT_VIEWER_ROLES.includes(session.role)) return { success: false, error: 'Acceso denegado' };

    try {
        const whereConditions: string[] = [];
        const queryParams: QueryParam[] = [];
        let paramIndex = 1;

        if (params.startDate) { whereConditions.push(`al.created_at >= $${paramIndex}::timestamp`); queryParams.push(params.startDate); paramIndex++; }
        if (params.endDate) { whereConditions.push(`al.created_at <= $${paramIndex}::timestamp`); queryParams.push(params.endDate); paramIndex++; }
        if (params.actionCode) { whereConditions.push(`al.action_code = $${paramIndex}`); queryParams.push(params.actionCode); paramIndex++; }
        if (params.userId) { whereConditions.push(`al.user_id::text = $${paramIndex}`); queryParams.push(params.userId); paramIndex++; }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        // Contar primero
        const countRes = await query(`SELECT COUNT(*) as total FROM audit_log al ${whereClause}`, queryParams);
        const total = Number(countRes.rows[0]?.total || 0);

        // RBAC & PIN: Si más de 500, requiere ser ADMIN. Si más de 1000, requiere PIN ADMIN.
        if (total > 500 && !ADMIN_ROLES.includes(session.role)) {
            return { success: false, error: 'Reportes masivos de auditoría (>500) reservados para administración' };
        }

        if (total > 1000) {
            if (!adminPin) {
                return { success: false, error: 'Se requiere PIN de administrador para exportar más de 1000 registros' };
            }
            const adminRes = await query(`SELECT access_pin FROM users WHERE id = $1`, [session.userId]);
            if (!adminRes.rows[0]?.access_pin || !(await bcrypt.compare(adminPin, adminRes.rows[0].access_pin))) {
                return { success: false, error: 'PIN de seguridad inválido' };
            }
        }

        const res = await query(`
            SELECT 
                al.created_at as timestamp, 
                COALESCE(u.name, 'SISTEMA') as user_name, 
                COALESCE(u.role, '-') as user_role,
                COALESCE(l.name, 'GLOBAL') as location_name, 
                al.action_code, 
                COALESCE(al.entity_type, '-') as entity_type,
                COALESCE(al.justification, '-') as justification,
                al.ip_address
            FROM audit_log al
            LEFT JOIN users u ON al.user_id::text = u.id::text
            LEFT JOIN locations l ON al.location_id::text = l.id::text
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT 5000
        `, queryParams);

        const data = res.rows.map((row: any) => ({
            date: formatDateTimeCL(row.timestamp),
            user: `${row.user_name} [${row.user_role}]`,
            location: row.location_name,
            action: row.action_code,
            entity: row.entity_type,
            ip: row.ip_address || '-',
            notes: row.justification,
        }));

        const excel = new ExcelService();
        const buffer = await excel.generateReport({
            title: 'Registro de Auditoría de Operaciones - Farmacias Vallenar',
            subtitle: `Filtros: ${formatDateCL(params.startDate || new Date())} a ${formatDateCL(params.endDate || new Date())}`,
            sheetName: 'Logs Auditoría',
            creator: session.userName,
            columns: [
                { header: 'Fecha y Hora (CL)', key: 'date', width: 22 },
                { header: 'Usuario y Rol', key: 'user', width: 30 },
                { header: 'Sucursal', key: 'location', width: 20 },
                { header: 'Acción Ejecutada', key: 'action', width: 25 },
                { header: 'Tipo Entidad', key: 'entity', width: 15 },
                { header: 'Dirección IP', key: 'ip', width: 15 },
                { header: 'Resumen / Justificación', key: 'notes', width: 45 },
            ],
            data,
        });

        await metaAudit(session.userId, 'AUDIT_LOG_EXPORT_V2', { rows: data.length, filters: params });
        return { success: true, data: buffer.toString('base64'), filename: `Auditoria_${new Date().toISOString().split('T')[0]}.xlsx` };

    } catch (error: any) {
        logger.error({ error }, '[Audit] Export error');
        return { success: false, error: 'Error exportando logs de auditoría' };
    }
}

// NOTE: ACTION_SEVERITY_MAP, AUDIT_VIEWER_ROLES son constantes internas
// Next.js 16 use server solo permite async functions
