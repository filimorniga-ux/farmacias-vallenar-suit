'use server';

/**
 * ============================================================================
 * NOTIFICATIONS-V2: Sistema de Notificaciones Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES DE SEGURIDAD:
 * - ELIMINADO ensureNotificationsTable() (auto-DDL peligroso)
 * - Sanitización de title/message (strip HTML)
 * - Rate limit: max 10 notificaciones por usuario por hora
 * - Auditoría de notificaciones tipo ALERT
 * - Solo puede marcar como leídas sus propias notificaciones
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const NotificationType = z.enum(['INFO', 'WARNING', 'SUCCESS', 'ALERT']);

const CreateNotificationSchema = z.object({
    userId: UUIDSchema,
    title: z.string().min(1).max(200),
    message: z.string().max(1000),
    type: NotificationType.default('INFO'),
    link: z.string().url().optional(),
});

const NotifyManagersSchema = z.object({
    locationId: UUIDSchema,
    title: z.string().min(1).max(200),
    message: z.string().max(1000),
    link: z.string().url().optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const RATE_LIMIT_PER_HOUR = 10;

// Rate limiting en memoria
const notificationRateLimit = new Map<string, { count: number; resetAt: number }>();

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

/**
 * Sanitizar contenido (eliminar HTML tags)
 */
function sanitizeContent(text: string): string {
    return text
        .replace(/<[^>]*>/g, '') // Eliminar tags HTML
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .trim();
}

/**
 * Verificar rate limit
 */
function checkNotificationRateLimit(userId: string): boolean {
    const now = Date.now();
    const key = `notif:${userId}`;
    const entry = notificationRateLimit.get(key);

    if (!entry || now > entry.resetAt) {
        notificationRateLimit.set(key, { count: 1, resetAt: now + 3600000 }); // 1 hora
        return true;
    }

    if (entry.count >= RATE_LIMIT_PER_HOUR) {
        return false;
    }

    entry.count++;
    return true;
}

// ============================================================================
// NOTIFICACIONES DEL USUARIO
// ============================================================================

/**
 * 🔔 Obtener Mis Notificaciones
 */
export async function getMyNotifications(): Promise<{
    success: boolean;
    data?: any[];
    unreadCount?: number;
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        // Obtener no leídas + últimas 10 leídas
        const res = await query(`
            (SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC)
            UNION ALL
            (SELECT * FROM notifications WHERE user_id = $1 AND is_read = true ORDER BY created_at DESC LIMIT 10)
            ORDER BY created_at DESC
        `, [session.userId]);

        const unreadCount = res.rows.filter(n => !n.is_read).length;

        return { success: true, data: res.rows, unreadCount };

    } catch (error: any) {
        logger.error({ error }, '[Notifications] Get error');
        return { success: false, error: 'Error obteniendo notificaciones' };
    }
}

// ============================================================================
// CREAR NOTIFICACIONES
// ============================================================================

/**
 * 📨 Crear Notificación Segura
 * - Sanitiza contenido
 * - Rate limiting
 * - Audita ALERT
 */
export async function createNotificationSecure(
    data: z.infer<typeof CreateNotificationSchema>
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const validated = CreateNotificationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { userId, title, message, type, link } = validated.data;

    // Rate limit
    if (!checkNotificationRateLimit(session.userId)) {
        return {
            success: false,
            error: `Límite de ${RATE_LIMIT_PER_HOUR} notificaciones por hora alcanzado`,
        };
    }

    // Sanitizar
    const sanitizedTitle = sanitizeContent(title);
    const sanitizedMessage = sanitizeContent(message);

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const notificationId = randomUUID();
        await client.query(`
            INSERT INTO notifications (id, user_id, type, title, message, link, is_read, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
        `, [notificationId, userId, type, sanitizedTitle, sanitizedMessage, link]);

        // Auditar si es ALERT
        if (type === 'ALERT') {
            await client.query(`
                INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
                VALUES ($1, 'ALERT_NOTIFICATION_SENT', 'NOTIFICATION', $2, $3::jsonb, NOW())
            `, [session.userId, notificationId, JSON.stringify({
                target_user: userId,
                title: sanitizedTitle,
            })]);
        }

        await client.query('COMMIT');

        logger.info({ notificationId, type, targetUser: userId }, '📨 [Notifications] Created');
        return { success: true, notificationId };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Notifications] Create error');
        return { success: false, error: 'Error creando notificación' };
    } finally {
        client.release();
    }
}

// ============================================================================
// MARCAR COMO LEÍDAS
// ============================================================================

/**
 * ✅ Marcar como Leída (Solo propias)
 */
export async function markAsReadSecure(
    notificationId: string
): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!UUIDSchema.safeParse(notificationId).success) {
        return { success: false, error: 'ID inválido' };
    }

    try {
        // Solo puede marcar sus propias notificaciones
        const res = await query(`
            UPDATE notifications 
            SET is_read = true 
            WHERE id = $1 AND user_id = $2
        `, [notificationId, session.userId]);

        if (res.rowCount === 0) {
            return { success: false, error: 'Notificación no encontrada o no es tuya' };
        }

        return { success: true };

    } catch (error: any) {
        logger.error({ error }, '[Notifications] Mark as read error');
        return { success: false, error: 'Error actualizando notificación' };
    }
}

/**
 * ✅ Marcar Todas como Leídas
 */
export async function markAllAsReadSecure(): Promise<{ success: boolean; count?: number; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const res = await query(`
            UPDATE notifications 
            SET is_read = true 
            WHERE user_id = $1 AND is_read = false
        `, [session.userId]);

        logger.info({ userId: session.userId, count: res.rowCount }, '✅ [Notifications] All marked as read');
        return { success: true, count: res.rowCount || 0 };

    } catch (error: any) {
        logger.error({ error }, '[Notifications] Mark all as read error');
        return { success: false, error: 'Error actualizando notificaciones' };
    }
}

// ============================================================================
// NOTIFICAR MANAGERS
// ============================================================================

/**
 * 📢 Notificar a Managers (con Auditoría)
 */
export async function notifyManagersSecure(
    data: z.infer<typeof NotifyManagersSchema>
): Promise<{ success: boolean; count?: number; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const validated = NotifyManagersSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { locationId, title, message, link } = validated.data;

    // Sanitizar
    const sanitizedTitle = sanitizeContent(title);
    const sanitizedMessage = sanitizeContent(message);

    try {
        // Encontrar managers de la ubicación
        const managersRes = await query(`
            SELECT id FROM users 
            WHERE (role IN ('MANAGER', 'ADMIN', 'GERENTE_GENERAL'))
            AND (assigned_location_id = $1 OR assigned_location_id IS NULL)
            AND is_active = true
        `, [locationId]);

        let count = 0;
        for (const manager of managersRes.rows) {
            const result = await createNotificationSecure({
                userId: manager.id,
                title: sanitizedTitle,
                message: sanitizedMessage,
                type: 'ALERT',
                link,
            });
            if (result.success) count++;
        }

        logger.info({ locationId, count }, '📢 [Notifications] Managers notified');
        return { success: true, count };

    } catch (error: any) {
        logger.error({ error }, '[Notifications] Notify managers error');
        return { success: false, error: 'Error notificando managers' };
    }
}

// ============================================================================
// LIMPIEZA (ADMIN)
// ============================================================================

/**
 * 🗑️ Eliminar Notificaciones Antiguas (Solo ADMIN)
 */
export async function deleteOldNotifications(
    daysOld: number = 30
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!ADMIN_ROLES.includes(session.role)) {
        return { success: false, error: 'Solo administradores pueden eliminar notificaciones' };
    }

    if (daysOld < 7) {
        return { success: false, error: 'Mínimo 7 días de antigüedad' };
    }

    try {
        const res = await query(`
            DELETE FROM notifications 
            WHERE created_at < NOW() - INTERVAL '1 day' * $1
            AND is_read = true
        `, [daysOld]);

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, 'NOTIFICATIONS_CLEANED', 'NOTIFICATION', $2::jsonb, NOW())
        `, [session.userId, JSON.stringify({ days_old: daysOld, deleted_count: res.rowCount })]);

        logger.info({ deletedCount: res.rowCount, daysOld }, '🗑️ [Notifications] Old notifications deleted');
        return { success: true, deletedCount: res.rowCount || 0 };

    } catch (error: any) {
        logger.error({ error }, '[Notifications] Delete old error');
        return { success: false, error: 'Error eliminando notificaciones' };
    }
}

// Los tipos (CreateNotificationSchema, NotifyManagersSchema) son internos
// No se exportan porque 'use server' solo permite exportar funciones async
