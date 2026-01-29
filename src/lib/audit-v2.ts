/**
 * Sistema de Auditoría Forense v2.0
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Este módulo proporciona funciones para registrar acciones auditables
 * con integridad, trazabilidad y cumplimiento fiscal.
 */

'use server';

import { query, pool } from '@/lib/db';
import { headers } from 'next/headers';

// =====================================================
// TIPOS
// =====================================================

export type AuditActionCode =
    // Financieras
    | 'SALE_CREATE'
    | 'SALE_VOID'
    | 'SALE_REFUND'
    | 'SALE_DISCOUNT'
    | 'PRICE_CHANGE'
    | 'STOCK_ADJUST'
    | 'CASH_MOVEMENT'
    | 'TREASURY_TRANSFER'
    | 'REMITTANCE_CREATE'
    | 'REMITTANCE_CONFIRM'
    // Operacionales
    | 'SESSION_OPEN'
    | 'SESSION_CLOSE'
    | 'SESSION_FORCE_CLOSE'
    | 'SESSION_AUTO_CLOSE'
    | 'RECONCILIATION'
    | 'RECONCILIATION_JUSTIFY'
    // Seguridad
    | 'USER_LOGIN'
    | 'USER_LOGOUT'
    | 'USER_LOGIN_FAILED'
    | 'USER_LOCKED'
    | 'USER_UNLOCKED'
    | 'PASSWORD_CHANGE'
    | 'PASSWORD_RESET'
    | 'PERMISSION_CHANGE'
    | 'ROLE_CHANGE'
    // Configuración
    | 'CONFIG_CHANGE'
    | 'TERMINAL_CREATE'
    | 'TERMINAL_UPDATE'
    | 'TERMINAL_DELETE'
    | 'LOCATION_CREATE'
    | 'LOCATION_UPDATE'
    // Compliance
    | 'DTE_EMIT'
    | 'DTE_VOID'
    | 'DTE_CREDIT_NOTE'
    | 'CAF_LOAD'
    | 'SII_CONFIG_CHANGE'
    // Reportería
    | 'REPORT_GENERATE'
    | 'REPORT_EXPORT'
    | 'DATA_EXPORT_BULK'
    // Asistencia
    | 'ATTENDANCE_CHECK_IN'
    | 'ATTENDANCE_CHECK_OUT'
    | 'ATTENDANCE_BREAK_START'
    | 'ATTENDANCE_BREAK_END'
    | 'ATTENDANCE_PERMISSION_START'
    | 'ATTENDANCE_PERMISSION_END'
    | 'ATTENDANCE_MEDICAL_LEAVE'
    | 'ATTENDANCE_EMERGENCY';

export type EntityType =
    | 'SALE'
    | 'SESSION'
    | 'TERMINAL'
    | 'USER'
    | 'PRODUCT'
    | 'INVENTORY'
    | 'LOCATION'
    | 'CONFIG'
    | 'DTE'
    | 'RECONCILIATION'
    | 'REPORT'
    | 'LEGACY';

export interface AuditContext {
    userId?: string;
    userName?: string;
    userRole?: string;
    sessionId?: string;
    terminalId?: string;
    locationId?: string;
}

export interface AuditPayload {
    action: AuditActionCode;
    entityType: EntityType;
    entityId?: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    metadata?: Record<string, any>;
    justification?: string;
    authorizedBy?: string;
}

export interface AuditResult {
    success: boolean;
    auditId?: string;
    error?: string;
}

// Acciones que requieren auditoría exitosa obligatoria
const CRITICAL_ACTIONS: AuditActionCode[] = [
    'SALE_VOID',
    'SALE_REFUND',
    'PRICE_CHANGE',
    'SESSION_FORCE_CLOSE',
    'RECONCILIATION',
    'DTE_VOID',
    'PERMISSION_CHANGE',
    'SII_CONFIG_CHANGE',
    'DATA_EXPORT_BULK'
];

// Acciones que requieren justificación
const JUSTIFICATION_REQUIRED: AuditActionCode[] = [
    'SALE_VOID',
    'SALE_REFUND',
    'PRICE_CHANGE',
    'STOCK_ADJUST',
    'SESSION_FORCE_CLOSE',
    'RECONCILIATION',
    'RECONCILIATION_JUSTIFY',
    'USER_UNLOCKED',
    'PASSWORD_RESET',
    'PERMISSION_CHANGE',
    'ROLE_CHANGE',
    'CONFIG_CHANGE',
    'TERMINAL_DELETE',
    'LOCATION_CREATE',
    'DTE_VOID',
    'DTE_CREDIT_NOTE',
    'SII_CONFIG_CHANGE',
    'DATA_EXPORT_BULK'
];

// =====================================================
// FUNCIONES PRINCIPALES
// =====================================================

/**
 * Registra una acción en el log de auditoría.
 * 
 * @param context - Contexto del usuario y sesión
 * @param payload - Datos de la acción a registrar
 * @returns Resultado con ID de auditoría o error
 * 
 * @example
 * ```typescript
 * await auditLog(
 *   { userId: 'xxx', terminalId: 'yyy' },
 *   { 
 *     action: 'SALE_CREATE', 
 *     entityType: 'SALE', 
 *     entityId: 'sale-123',
 *     newValues: { total: 15000 }
 *   }
 * );
 * ```
 */
export async function auditLog(
    context: AuditContext,
    payload: AuditPayload
): Promise<AuditResult> {
    try {
        // Validar justificación para acciones que la requieren
        if (JUSTIFICATION_REQUIRED.includes(payload.action)) {
            if (!payload.justification || payload.justification.trim().length < 10) {
                const errorMsg = `La acción ${payload.action} requiere justificación de al menos 10 caracteres`;

                // Para acciones críticas, fallar completamente
                if (CRITICAL_ACTIONS.includes(payload.action)) {
                    return { success: false, error: errorMsg };
                }

                // Para otras, registrar sin justificación pero con warning
                console.warn(`[AUDIT] Warning: ${errorMsg}`);
            }
        }

        // Obtener metadata de request
        let ipAddress = 'UNKNOWN';
        let userAgent = 'UNKNOWN';
        let requestId = crypto.randomUUID();

        try {
            // Next.js 15+: headers() returns a Promise
            const headersList = await headers();
            ipAddress = headersList.get('x-forwarded-for') ||
                headersList.get('x-real-ip') ||
                'UNKNOWN';
            userAgent = headersList.get('user-agent') || 'UNKNOWN';
            requestId = headersList.get('x-request-id') || requestId;
        } catch (e) {
            // headers() puede fallar fuera de un request context
            console.warn('[AUDIT] Could not get request headers');
        }

        const result = await query(`
            INSERT INTO audit_log (
                user_id, user_name, user_role,
                session_id, terminal_id, location_id,
                action_code, entity_type, entity_id,
                old_values, new_values, metadata,
                justification, authorized_by,
                ip_address, user_agent, request_id,
                client_timestamp
            ) VALUES (
                $1::uuid, $2, $3,
                $4::uuid, $5::uuid, $6::uuid,
                $7, $8, $9,
                $10::jsonb, $11::jsonb, $12::jsonb,
                $13, $14::uuid,
                $15::inet, $16, $17::uuid,
                NOW()
            )
            RETURNING id
        `, [
            context.userId || null,
            context.userName || null,
            context.userRole || null,
            context.sessionId || null,
            context.terminalId || null,
            context.locationId || null,
            payload.action,
            payload.entityType,
            payload.entityId || null,
            payload.oldValues ? JSON.stringify(payload.oldValues) : null,
            payload.newValues ? JSON.stringify(payload.newValues) : null,
            payload.metadata ? JSON.stringify(payload.metadata) : null,
            payload.justification || null,
            payload.authorizedBy || null,
            ipAddress !== 'UNKNOWN' ? ipAddress : null,
            userAgent,
            requestId
        ]);

        return { success: true, auditId: result.rows[0].id };

    } catch (error: any) {
        console.error('❌ [AUDIT] Failed to log action:', error);

        // Para acciones críticas, el fallo de auditoría es fatal
        if (CRITICAL_ACTIONS.includes(payload.action)) {
            throw new Error(`AUDIT_CRITICAL_FAILURE: ${payload.action} - ${error.message}`);
        }

        return { success: false, error: error.message };
    }
}

/**
 * Ejecuta una operación con auditoría transaccional.
 * Si la auditoría falla, la operación se revierte.
 * 
 * @param context - Contexto del usuario y sesión
 * @param payload - Datos de auditoría
 * @param operation - Función async a ejecutar
 * @returns Resultado de la operación
 * 
 * @example
 * ```typescript
 * const result = await withAudit(
 *   { userId: 'xxx' },
 *   { action: 'PRICE_CHANGE', entityType: 'PRODUCT', entityId: 'prod-123', justification: 'Ajuste por promoción' },
 *   async () => {
 *     return await updateProductPrice(productId, newPrice);
 *   }
 * );
 * ```
 */
export async function withAudit<T>(
    context: AuditContext,
    payload: AuditPayload,
    operation: () => Promise<T>
): Promise<T> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Ejecutar operación principal
        const result = await operation();

        // Registrar auditoría dentro de la misma transacción
        await client.query(`
            INSERT INTO audit_log (
                user_id, user_name, user_role,
                session_id, terminal_id, location_id,
                action_code, entity_type, entity_id,
                old_values, new_values, metadata,
                justification, authorized_by
            ) VALUES (
                $1::uuid, $2, $3,
                $4::uuid, $5::uuid, $6::uuid,
                $7, $8, $9,
                $10::jsonb, $11::jsonb, $12::jsonb,
                $13, $14::uuid
            )
        `, [
            context.userId || null,
            context.userName || null,
            context.userRole || null,
            context.sessionId || null,
            context.terminalId || null,
            context.locationId || null,
            payload.action,
            payload.entityType,
            payload.entityId || null,
            payload.oldValues ? JSON.stringify(payload.oldValues) : null,
            payload.newValues ? JSON.stringify(payload.newValues) : null,
            payload.metadata ? JSON.stringify(payload.metadata) : null,
            payload.justification || null,
            payload.authorizedBy || null
        ]);

        await client.query('COMMIT');
        return result;

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Verifica la integridad de la cadena de auditoría.
 * Detecta registros con checksum incorrecto o cadena rota.
 * 
 * @param limit - Número máximo de registros a verificar
 * @returns Lista de anomalías detectadas
 */
export async function verifyAuditChainIntegrity(limit = 1000): Promise<{
    isValid: boolean;
    totalChecked: number;
    anomalies: Array<{
        id: string;
        created_at: string;
        issue: string;
    }>;
}> {
    try {
        const result = await query(`
            WITH chain_check AS (
                SELECT 
                    id,
                    created_at,
                    checksum,
                    previous_checksum,
                    LAG(checksum) OVER (ORDER BY created_at, id) AS expected_previous
                FROM audit_log
                ORDER BY created_at DESC
                LIMIT $1
            )
            SELECT 
                id,
                created_at,
                checksum,
                previous_checksum,
                expected_previous,
                CASE 
                    WHEN previous_checksum = 'GENESIS_BLOCK' THEN 'GENESIS'
                    WHEN previous_checksum = expected_previous THEN 'VALID'
                    WHEN expected_previous IS NULL THEN 'FIRST_AFTER_GENESIS'
                    ELSE 'BROKEN_CHAIN'
                END AS chain_status
            FROM chain_check
            WHERE (
                previous_checksum != expected_previous 
                AND previous_checksum != 'GENESIS_BLOCK'
                AND expected_previous IS NOT NULL
            )
        `, [limit]);

        const anomalies = result.rows.map(row => ({
            id: row.id,
            created_at: row.created_at,
            issue: `Chain broken: expected ${row.expected_previous}, found ${row.previous_checksum}`
        }));

        return {
            isValid: anomalies.length === 0,
            totalChecked: limit,
            anomalies
        };

    } catch (error: any) {
        console.error('[AUDIT] Chain verification failed:', error);
        return {
            isValid: false,
            totalChecked: 0,
            anomalies: [{ id: 'N/A', created_at: new Date().toISOString(), issue: error.message }]
        };
    }
}

/**
 * Obtiene el historial de auditoría de una entidad específica.
 * 
 * @param entityType - Tipo de entidad
 * @param entityId - ID de la entidad
 * @param limit - Número máximo de registros
 */
export async function getEntityAuditTrail(
    entityType: EntityType,
    entityId: string,
    limit = 50
): Promise<Array<{
    id: string;
    created_at: string;
    action_code: string;
    user_name: string;
    old_values: any;
    new_values: any;
    justification: string | null;
}>> {
    try {
        const result = await query(`
            SELECT 
                id,
                created_at,
                action_code,
                user_name,
                old_values,
                new_values,
                justification
            FROM audit_log
            WHERE entity_type = $1 AND entity_id = $2
            ORDER BY created_at DESC
            LIMIT $3
        `, [entityType, entityId, limit]);

        return result.rows;
    } catch (error) {
        console.error('[AUDIT] Failed to get entity trail:', error);
        return [];
    }
}

/**
 * Obtiene resumen de actividad sospechosa.
 * 
 * @param locationId - Filtrar por ubicación (opcional)
 * @param hours - Horas hacia atrás (default 24)
 */
export async function getSuspiciousActivity(
    locationId?: string,
    hours = 24
): Promise<Array<{
    created_at: string;
    user_name: string;
    action_code: string;
    severity: string;
    entity_type: string;
    entity_id: string;
    justification: string | null;
}>> {
    try {
        let queryStr = `
            SELECT 
                al.created_at,
                al.user_name,
                al.action_code,
                ac.severity,
                al.entity_type,
                al.entity_id,
                al.justification
            FROM audit_log al
            JOIN audit_action_catalog ac ON al.action_code = ac.code
            WHERE ac.severity IN ('HIGH', 'CRITICAL')
            AND al.created_at > NOW() - INTERVAL '${hours} hours'
        `;

        const params: any[] = [];

        if (locationId) {
            params.push(locationId);
            queryStr += ` AND al.location_id = $1::uuid`;
        }

        queryStr += ` ORDER BY al.created_at DESC LIMIT 100`;

        const result = await query(queryStr, params);
        return result.rows;

    } catch (error) {
        console.error('[AUDIT] Failed to get suspicious activity:', error);
        return [];
    }
}

// =====================================================
// FUNCIONES DE COMPATIBILIDAD CON SISTEMA LEGACY
// =====================================================

/**
 * Función de compatibilidad con el sistema de auditoría anterior.
 * @deprecated Use auditLog() en su lugar
 */
export async function logAction(
    usuario: string,
    accion: string,
    detalle: string,
    ip?: string
): Promise<{ success: boolean; error?: string }> {
    // Mapear acciones legacy a nuevas
    const actionMap: Record<string, AuditActionCode> = {
        'LOGIN': 'USER_LOGIN',
        'LOGOUT': 'USER_LOGOUT',
        'FORCE_CLOSE': 'SESSION_FORCE_CLOSE',
        'FORCE_CLOSE_SUCCESS': 'SESSION_FORCE_CLOSE',
        'OPEN_SHIFT': 'SESSION_OPEN',
        'CLOSE_SHIFT': 'SESSION_CLOSE'
    };

    const mappedAction = actionMap[accion] || 'CONFIG_CHANGE';

    return auditLog(
        {
            userId: isValidUUID(usuario) ? usuario : undefined,
            userName: usuario
        },
        {
            action: mappedAction,
            entityType: 'LEGACY',
            metadata: { legacy_action: accion, legacy_detail: detalle }
        }
    );
}

// Helper para validar UUID
function isValidUUID(id?: string | null): boolean {
    if (!id) return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(id);
}
