'use server';

/**
 * 📊 AUDIT DASHBOARD - SERVER ACTIONS
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Server actions para el dashboard de auditoría con:
 * - Paginación
 * - Filtros avanzados (fecha, usuario, acción, severidad)
 * - Búsqueda de texto
 * - Exportación a Excel
 * - Control de acceso RBAC
 * 
 * @version 1.0.0
 * @date 2024-12-24
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';

// =====================================================
// SCHEMAS DE VALIDACIÓN
// =====================================================

const UUIDSchema = z.string().uuid({ message: "ID inválido" });

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

// =====================================================
// CONSTANTES
// =====================================================

// Roles que pueden ver el dashboard de auditoría
const AUDIT_VIEWER_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'] as const;

// Mapeo de acciones a severidad
const ACTION_SEVERITY_MAP: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
    // CRITICAL - Acciones que afectan seguridad directamente
    'FORCE_CLOSE': 'CRITICAL',
    'INVENTORY_CLEARED': 'CRITICAL',
    'PASSWORD_RESET': 'CRITICAL',
    'ROLE_CHANGED': 'CRITICAL',
    'USER_DEACTIVATED': 'CRITICAL',

    // HIGH - Operaciones financieras significativas
    'TREASURY_TRANSFER': 'HIGH',
    'BANK_DEPOSIT': 'HIGH',
    'VOID_SALE': 'HIGH',
    'REFUND': 'HIGH',
    'SHIFT_HANDOVER': 'HIGH',
    'QUICK_HANDOVER': 'HIGH',
    'SESSION_CLOSE': 'HIGH',

    // MEDIUM - Operaciones de inventario y ventas
    'STOCK_ADJUSTED': 'MEDIUM',
    'STOCK_TRANSFERRED': 'MEDIUM',
    'BATCH_CREATED': 'MEDIUM',
    'SALE_CREATED': 'MEDIUM',
    'REMITTANCE_CONFIRMED': 'MEDIUM',

    // LOW - Acciones rutinarias
    'LOGIN': 'LOW',
    'LOGOUT': 'LOW',
    'SESSION_START': 'LOW',
    'PRICE_UPDATED': 'LOW',
};

// =====================================================
// HELPERS
// =====================================================

/**
 * Verifica que el usuario tenga permisos para ver auditoría
 */
async function verifyAuditAccess(): Promise<{ allowed: boolean; userId?: string; error?: string }> {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('user_id')?.value;
        const userRole = cookieStore.get('user_role')?.value;

        if (!userId || !userRole) {
            return { allowed: false, error: 'No hay sesión activa' };
        }

        if (!AUDIT_VIEWER_ROLES.includes(userRole as any)) {
            return { allowed: false, error: 'No tiene permisos para ver el log de auditoría' };
        }

        return { allowed: true, userId };
    } catch (error) {
        logger.error({ error }, 'Error verifying audit access');
        return { allowed: false, error: 'Error verificando permisos' };
    }
}

/**
 * Determina la severidad de una acción
 */
function getSeverity(actionCode: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    return ACTION_SEVERITY_MAP[actionCode] || 'LOW';
}

// =====================================================
// INTERFACES
// =====================================================

export interface AuditLogEntry {
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
    oldValues: Record<string, any> | null;
    newValues: Record<string, any> | null;
    justification: string | null;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    ipAddress: string | null;
}

export interface AuditLogsResponse {
    success: boolean;
    data?: AuditLogEntry[];
    total?: number;
    page?: number;
    totalPages?: number;
    error?: string;
}

// =====================================================
// SERVER ACTIONS
// =====================================================

/**
 * Obtiene logs de auditoría con paginación y filtros
 */
export async function getAuditLogs(params: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    userId?: string;
    actionCode?: string;
    severity?: 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    searchTerm?: string;
    entityType?: string;
}): Promise<AuditLogsResponse> {

    // 1. Verificar acceso
    const access = await verifyAuditAccess();
    if (!access.allowed) {
        return { success: false, error: access.error };
    }

    // 2. Validar parámetros
    const validation = GetAuditLogsSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Parámetros inválidos' };
    }

    const { page, limit, startDate, endDate, userId, actionCode, severity, searchTerm, entityType } = validation.data;

    try {
        // 3. Construir query dinámica
        let whereConditions: string[] = [];
        let queryParams: any[] = [];
        let paramIndex = 1;

        if (startDate) {
            whereConditions.push(`al.created_at >= $${paramIndex}::timestamp`);
            queryParams.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereConditions.push(`al.created_at <= $${paramIndex}::timestamp`);
            queryParams.push(endDate);
            paramIndex++;
        }

        if (userId) {
            whereConditions.push(`al.user_id::text = $${paramIndex}`);
            queryParams.push(userId);
            paramIndex++;
        }

        if (actionCode) {
            whereConditions.push(`al.action_code = $${paramIndex}`);
            queryParams.push(actionCode);
            paramIndex++;
        }

        if (entityType) {
            whereConditions.push(`al.entity_type = $${paramIndex}`);
            queryParams.push(entityType);
            paramIndex++;
        }

        if (searchTerm) {
            whereConditions.push(`(
                al.action_code ILIKE $${paramIndex} OR
                al.justification ILIKE $${paramIndex} OR
                u.name ILIKE $${paramIndex}
            )`);
            queryParams.push(`%${searchTerm}%`);
            paramIndex++;
        }

        // Filtro de severidad (aplicado en cliente por simplicidad, o podemos usar CASE)
        let severityFilter = '';
        if (severity && severity !== 'ALL') {
            const severityActions = Object.entries(ACTION_SEVERITY_MAP)
                .filter(([_, sev]) => sev === severity)
                .map(([action]) => action);

            if (severityActions.length > 0) {
                whereConditions.push(`al.action_code = ANY($${paramIndex}::text[])`);
                queryParams.push(severityActions);
                paramIndex++;
            }
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // 4. Contar total
        const countSql = `
            SELECT COUNT(*) as total
            FROM audit_log al
            LEFT JOIN users u ON al.user_id::text = u.id::text
            ${whereClause}
        `;
        const countRes = await query(countSql, queryParams);
        const total = Number(countRes.rows[0]?.total || 0);

        // 5. Obtener datos paginados
        const offset = (page - 1) * limit;
        queryParams.push(limit);
        queryParams.push(offset);

        const dataSql = `
            SELECT 
                al.id::text as id,
                al.created_at as timestamp,
                al.user_id::text as user_id,
                COALESCE(u.name, 'Sistema') as user_name,
                COALESCE(u.role, 'SYSTEM') as user_role,
                al.location_id::text as location_id,
                COALESCE(l.name, '-') as location_name,
                al.action_code,
                COALESCE(al.entity_type, '-') as entity_type,
                COALESCE(al.entity_id, '-') as entity_id,
                al.old_values,
                al.new_values,
                al.justification,
                al.ip_address
            FROM audit_log al
            LEFT JOIN users u ON al.user_id::text = u.id::text
            LEFT JOIN locations l ON al.location_id::text = l.id::text
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const dataRes = await query(dataSql, queryParams);

        // 6. Mapear resultados
        const logs: AuditLogEntry[] = dataRes.rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            userId: row.user_id,
            userName: row.user_name,
            userRole: row.user_role,
            locationId: row.location_id,
            locationName: row.location_name,
            actionCode: row.action_code,
            entityType: row.entity_type,
            entityId: row.entity_id,
            oldValues: row.old_values ? (typeof row.old_values === 'string' ? JSON.parse(row.old_values) : row.old_values) : null,
            newValues: row.new_values ? (typeof row.new_values === 'string' ? JSON.parse(row.new_values) : row.new_values) : null,
            justification: row.justification,
            severity: getSeverity(row.action_code),
            ipAddress: row.ip_address,
        }));

        return {
            success: true,
            data: logs,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };

    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching audit logs');
        return { success: false, error: error.message || 'Error obteniendo logs' };
    }
}

/**
 * Obtiene las acciones únicas para el filtro
 */
export async function getAuditActionTypes(): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const access = await verifyAuditAccess();
    if (!access.allowed) {
        return { success: false, error: access.error };
    }

    try {
        const res = await query(`
            SELECT DISTINCT action_code 
            FROM audit_log 
            WHERE action_code IS NOT NULL
            ORDER BY action_code
        `);

        return { success: true, data: res.rows.map(r => r.action_code) };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene los usuarios para el filtro
 */
export async function getAuditUsers(): Promise<{ success: boolean; data?: Array<{ id: string; name: string }>; error?: string }> {
    const access = await verifyAuditAccess();
    if (!access.allowed) {
        return { success: false, error: access.error };
    }

    try {
        const res = await query(`
            SELECT DISTINCT u.id::text as id, u.name
            FROM audit_log al
            JOIN users u ON al.user_id::text = u.id::text
            ORDER BY u.name
        `);

        return { success: true, data: res.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene estadísticas de auditoría
 */
export async function getAuditStats(): Promise<{
    success: boolean;
    data?: {
        totalToday: number;
        criticalToday: number;
        topActions: Array<{ action: string; count: number }>;
        topUsers: Array<{ name: string; count: number }>;
    };
    error?: string;
}> {
    const access = await verifyAuditAccess();
    if (!access.allowed) {
        return { success: false, error: access.error };
    }

    try {
        // Total de hoy
        const todayRes = await query(`
            SELECT COUNT(*) as total
            FROM audit_log
            WHERE created_at >= CURRENT_DATE
        `);

        // Críticos de hoy
        const criticalActions = Object.entries(ACTION_SEVERITY_MAP)
            .filter(([_, sev]) => sev === 'CRITICAL')
            .map(([action]) => action);

        const criticalRes = await query(`
            SELECT COUNT(*) as total
            FROM audit_log
            WHERE created_at >= CURRENT_DATE
            AND action_code = ANY($1::text[])
        `, [criticalActions]);

        // Top acciones
        const topActionsRes = await query(`
            SELECT action_code as action, COUNT(*) as count
            FROM audit_log
            WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY action_code
            ORDER BY count DESC
            LIMIT 5
        `);

        // Top usuarios
        const topUsersRes = await query(`
            SELECT u.name, COUNT(*) as count
            FROM audit_log al
            JOIN users u ON al.user_id::text = u.id::text
            WHERE al.created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY u.name
            ORDER BY count DESC
            LIMIT 5
        `);

        return {
            success: true,
            data: {
                totalToday: Number(todayRes.rows[0]?.total || 0),
                criticalToday: Number(criticalRes.rows[0]?.total || 0),
                topActions: topActionsRes.rows.map(r => ({ action: r.action, count: Number(r.count) })),
                topUsers: topUsersRes.rows.map(r => ({ name: r.name, count: Number(r.count) })),
            },
        };
    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching audit stats');
        return { success: false, error: error.message };
    }
}

/**
 * Exporta logs de auditoría para Excel (retorna datos formateados)
 */
export async function exportAuditLogs(params: {
    startDate?: string;
    endDate?: string;
    actionCode?: string;
    userId?: string;
}): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const access = await verifyAuditAccess();
    if (!access.allowed) {
        return { success: false, error: access.error };
    }

    try {
        let whereConditions: string[] = [];
        let queryParams: any[] = [];
        let paramIndex = 1;

        if (params.startDate) {
            whereConditions.push(`al.created_at >= $${paramIndex}::timestamp`);
            queryParams.push(params.startDate);
            paramIndex++;
        }

        if (params.endDate) {
            whereConditions.push(`al.created_at <= $${paramIndex}::timestamp`);
            queryParams.push(params.endDate);
            paramIndex++;
        }

        if (params.actionCode) {
            whereConditions.push(`al.action_code = $${paramIndex}`);
            queryParams.push(params.actionCode);
            paramIndex++;
        }

        if (params.userId) {
            whereConditions.push(`al.user_id::text = $${paramIndex}`);
            queryParams.push(params.userId);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        const res = await query(`
            SELECT 
                al.created_at as "Fecha",
                COALESCE(u.name, 'Sistema') as "Usuario",
                COALESCE(u.role, 'SYSTEM') as "Rol",
                COALESCE(l.name, '-') as "Sucursal",
                al.action_code as "Acción",
                COALESCE(al.entity_type, '-') as "Tipo Entidad",
                COALESCE(al.justification, '-') as "Justificación",
                al.old_values as "Valores Anteriores",
                al.new_values as "Valores Nuevos"
            FROM audit_log al
            LEFT JOIN users u ON al.user_id::text = u.id::text
            LEFT JOIN locations l ON al.location_id::text = l.id::text
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT 10000
        `, queryParams);

        // Formatear para Excel
        const data = res.rows.map(row => ({
            ...row,
            'Fecha': new Date(row['Fecha']).toLocaleString('es-CL'),
            'Valores Anteriores': row['Valores Anteriores'] ? JSON.stringify(row['Valores Anteriores']) : '-',
            'Valores Nuevos': row['Valores Nuevos'] ? JSON.stringify(row['Valores Nuevos']) : '-',
        }));

        return { success: true, data };
    } catch (error: any) {
        logger.error({ err: error }, 'Error exporting audit logs');
        return { success: false, error: error.message };
    }
}

// =====================================================
// EXPORTS
// =====================================================

export { ACTION_SEVERITY_MAP, AUDIT_VIEWER_ROLES };
