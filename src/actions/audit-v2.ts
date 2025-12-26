'use server';

import { query, pool } from '@/lib/db';
import { headers } from 'next/headers';

/**
 * AUDIT-V2: Sistema de Auditoría Forense Mejorado
 * 
 * Este módulo reemplaza gradualmente a audit.ts con:
 * - Contexto completo (terminal, sesión, location)
 * - Captura de cambios (old_values, new_values)
 * - Flags de revisión
 * - Correlación de requests
 */

// =====================================================
// TIPOS
// =====================================================

export interface AuditEventInput {
    // Contexto de negocio
    actionCategory: 'CASH' | 'SALE' | 'INVENTORY' | 'AUTH' | 'CONFIG' | 'ADMIN' | 'SYSTEM' | 'REPORT';
    actionType: string;
    actionStatus?: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'PENDING';

    // Actor
    userId?: string;
    impersonatedBy?: string;

    // Contexto de ubicación
    locationId?: string;
    terminalId?: string;
    sessionId?: string;

    // Recurso afectado
    resourceType?: string;
    resourceId?: string;

    // Datos del cambio
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    deltaAmount?: number;

    // Flags
    requiresManagerReview?: boolean;

    // Metadata (auto-populated si no se provee)
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    correlationId?: string;
}

export interface AuditEvent extends AuditEventInput {
    id: string;
    eventId: string;
    userRole?: string;
    createdAt: Date;
    reviewedBy?: string;
    reviewedAt?: Date;
    reviewNotes?: string;
}

// =====================================================
// FUNCIONES PRINCIPALES
// =====================================================

/**
 * Registra un evento de auditoría con contexto completo.
 * 
 * @example
 * await logAuditEvent({
 *     actionCategory: 'SALE',
 *     actionType: 'CREATE_SALE',
 *     userId: currentUser.id,
 *     terminalId: terminal.id,
 *     sessionId: session.id,
 *     resourceType: 'SALE',
 *     resourceId: newSale.id,
 *     newValues: { total: newSale.total, items: newSale.items.length },
 *     deltaAmount: newSale.total
 * });
 */
export async function logAuditEvent(input: AuditEventInput): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
        // Auto-populate metadata from request headers if available
        let ipAddress = input.ipAddress;
        let userAgent = input.userAgent;

        try {
            // Next.js 15+: headers() returns a Promise
            const headersList = await headers();
            ipAddress = ipAddress || headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || undefined;
            userAgent = userAgent || headersList.get('user-agent') || undefined;
        } catch {
            // headers() might fail in some contexts (e.g., direct DB scripts)
        }

        // Obtener rol del usuario si tenemos userId
        let userRole: string | null = null;
        if (input.userId) {
            try {
                const userRes = await query('SELECT role FROM users WHERE id = $1', [input.userId]);
                userRole = userRes.rows[0]?.role || null;
            } catch {
                // Non-blocking
            }
        }

        const result = await query(`
            INSERT INTO audit_events (
                action_category, action_type, action_status,
                user_id, user_role, impersonated_by,
                location_id, terminal_id, session_id,
                resource_type, resource_id,
                old_values, new_values, delta_amount,
                requires_manager_review,
                ip_address, user_agent, request_id, correlation_id
            ) VALUES (
                $1, $2, $3,
                $4, $5, $6,
                $7, $8, $9,
                $10, $11,
                $12, $13, $14,
                $15,
                $16::inet, $17, $18, $19
            )
            RETURNING id, event_id
        `, [
            input.actionCategory,
            input.actionType,
            input.actionStatus || 'SUCCESS',
            input.userId || null,
            userRole,
            input.impersonatedBy || null,
            input.locationId || null,
            input.terminalId || null,
            input.sessionId || null,
            input.resourceType || null,
            input.resourceId || null,
            input.oldValues ? JSON.stringify(input.oldValues) : null,
            input.newValues ? JSON.stringify(input.newValues) : null,
            input.deltaAmount || null,
            input.requiresManagerReview || false,
            ipAddress,
            userAgent,
            input.requestId || null,
            input.correlationId || null
        ]);

        return {
            success: true,
            eventId: result.rows[0]?.event_id
        };

    } catch (error: any) {
        console.error('❌ [Audit-V2] Error logging event:', error.message);

        // Fallback a tabla legacy si la nueva no existe
        if (error.code === '42P01') { // relation does not exist
            console.warn('⚠️ [Audit-V2] New table not found, falling back to legacy audit_logs');
            return await fallbackToLegacyAudit(input);
        }

        return { success: false, error: error.message };
    }
}

/**
 * Fallback a la tabla legacy audit_logs si audit_events no existe
 */
async function fallbackToLegacyAudit(input: AuditEventInput): Promise<{ success: boolean; error?: string }> {
    try {
        await query(`
            INSERT INTO audit_logs (usuario, accion, detalle, ip, fecha)
            VALUES ($1, $2, $3, $4, NOW())
        `, [
            input.userId || 'SYSTEM',
            `${input.actionCategory}:${input.actionType}`,
            JSON.stringify({
                resource: input.resourceType,
                resourceId: input.resourceId,
                delta: input.deltaAmount,
                values: input.newValues
            }),
            input.ipAddress || 'UNKNOWN'
        ]);
        return { success: true };
    } catch (error: any) {
        console.error('❌ [Audit-V2] Legacy fallback also failed:', error.message);
        return { success: false, error: error.message };
    }
}

// =====================================================
// QUERIES DE AUDITORÍA
// =====================================================

/**
 * Obtiene eventos de auditoría con filtros
 */
export async function getAuditEvents(filters: {
    userId?: string;
    locationId?: string;
    terminalId?: string;
    sessionId?: string;
    actionCategory?: string;
    actionType?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: string;
    endDate?: string;
    onlyPendingReview?: boolean;
    limit?: number;
    offset?: number;
}): Promise<{ success: boolean; data?: AuditEvent[]; total?: number; error?: string }> {
    try {
        const conditions: string[] = ['1=1'];
        const params: any[] = [];
        let paramIndex = 1;

        if (filters.userId) {
            conditions.push(`user_id = $${paramIndex++}`);
            params.push(filters.userId);
        }
        if (filters.locationId) {
            conditions.push(`location_id = $${paramIndex++}`);
            params.push(filters.locationId);
        }
        if (filters.terminalId) {
            conditions.push(`terminal_id = $${paramIndex++}`);
            params.push(filters.terminalId);
        }
        if (filters.sessionId) {
            conditions.push(`session_id = $${paramIndex++}`);
            params.push(filters.sessionId);
        }
        if (filters.actionCategory) {
            conditions.push(`action_category = $${paramIndex++}`);
            params.push(filters.actionCategory);
        }
        if (filters.actionType) {
            conditions.push(`action_type = $${paramIndex++}`);
            params.push(filters.actionType);
        }
        if (filters.resourceType) {
            conditions.push(`resource_type = $${paramIndex++}`);
            params.push(filters.resourceType);
        }
        if (filters.resourceId) {
            conditions.push(`resource_id = $${paramIndex++}`);
            params.push(filters.resourceId);
        }
        if (filters.startDate) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(`${filters.startDate} 00:00:00`);
        }
        if (filters.endDate) {
            conditions.push(`created_at <= $${paramIndex++}`);
            params.push(`${filters.endDate} 23:59:59`);
        }
        if (filters.onlyPendingReview) {
            conditions.push(`requires_manager_review = TRUE AND reviewed_at IS NULL`);
        }

        const limit = filters.limit || 100;
        const offset = filters.offset || 0;

        const whereClause = conditions.join(' AND ');

        // Count total
        const countRes = await query(
            `SELECT COUNT(*) as total FROM audit_events WHERE ${whereClause}`,
            params
        );
        const total = Number(countRes.rows[0].total);

        // Get data
        const dataRes = await query(`
            SELECT 
                ae.*,
                u.name as user_name,
                t.name as terminal_name,
                l.name as location_name,
                ru.name as reviewer_name
            FROM audit_events ae
            LEFT JOIN users u ON ae.user_id = u.id
            LEFT JOIN terminals t ON ae.terminal_id = t.id
            LEFT JOIN locations l ON ae.location_id = l.id
            LEFT JOIN users ru ON ae.reviewed_by = ru.id
            WHERE ${whereClause}
            ORDER BY ae.created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `, [...params, limit, offset]);

        return {
            success: true,
            data: dataRes.rows,
            total
        };

    } catch (error: any) {
        console.error('❌ [Audit-V2] Error fetching events:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene eventos pendientes de revisión para managers
 */
export async function getPendingReviews(locationId?: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
        let whereClause = 'WHERE requires_manager_review = TRUE AND reviewed_at IS NULL';
        const params: any[] = [];

        if (locationId) {
            whereClause += ' AND (location_id = $1 OR location_id IS NULL)';
            params.push(locationId);
        }

        const result = await query(`
            SELECT 
                ae.*,
                u.name as user_name,
                t.name as terminal_name,
                l.name as location_name,
                EXTRACT(EPOCH FROM (NOW() - ae.created_at))/3600 as hours_pending
            FROM audit_events ae
            LEFT JOIN users u ON ae.user_id = u.id
            LEFT JOIN terminals t ON ae.terminal_id = t.id
            LEFT JOIN locations l ON ae.location_id = l.id
            ${whereClause}
            ORDER BY 
                CASE ae.action_category 
                    WHEN 'CASH' THEN 1 
                    WHEN 'SALE' THEN 2 
                    ELSE 3 
                END,
                ae.created_at ASC
            LIMIT 100
        `, params);

        return { success: true, data: result.rows };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Marca un evento como revisado
 */
export async function reviewAuditEvent(
    eventId: string,
    reviewerId: string,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const result = await query(`
            UPDATE audit_events
            SET reviewed_by = $1,
                reviewed_at = NOW(),
                review_notes = $2
            WHERE id = $3
              AND requires_manager_review = TRUE
              AND reviewed_at IS NULL
            RETURNING id
        `, [reviewerId, notes || null, eventId]);

        if (result.rowCount === 0) {
            return { success: false, error: 'Evento no encontrado o ya fue revisado' };
        }

        // Log the review action itself
        await logAuditEvent({
            actionCategory: 'ADMIN',
            actionType: 'REVIEW_AUDIT_EVENT',
            userId: reviewerId,
            resourceType: 'AUDIT_EVENT',
            resourceId: eventId,
            newValues: { notes }
        });

        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// =====================================================
// HELPERS
// =====================================================

/**
 * Genera un ID de correlación para agrupar eventos relacionados
 */
export async function generateCorrelationId(): Promise<string> {
    return `CORR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/**
 * Wrapper para crear un contexto de auditoría que se reutiliza
 */
export async function createAuditContext(baseContext: Partial<AuditEventInput>) {
    const correlationId = await generateCorrelationId();

    return {
        correlationId,
        log: async (event: Partial<AuditEventInput>) => {
            return logAuditEvent({
                ...baseContext,
                ...event,
                correlationId
            } as AuditEventInput);
        }
    };
}

// =====================================================
// COMPATIBILIDAD CON LEGACY
// =====================================================

/**
 * Alias de compatibilidad con la función antigua logAction
 * @deprecated Usar logAuditEvent en su lugar
 */
export async function logAction(
    usuario: string,
    accion: string,
    detalle: string,
    ip?: string
): Promise<{ success: boolean; error?: string }> {
    return logAuditEvent({
        actionCategory: 'ADMIN',
        actionType: accion,
        userId: usuario,
        newValues: { detail: detalle },
        ipAddress: ip
    });
}
