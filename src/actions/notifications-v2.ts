'use server';

import { getClient, type PoolClient } from '../lib/db';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'crypto';
import { headers } from 'next/headers';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
    | 'HR' | 'INVENTORY' | 'CASH' | 'WMS' | 'SYSTEM'
    | 'CONFIG' | 'STOCK_CRITICAL' | 'GENERAL' | 'PROCUREMENT' | 'TRANSFER';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface CreateNotificationDTO {
    type: NotificationType;
    severity?: NotificationSeverity;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    locationId?: string;
    userId?: string;
    /** URL de destino al hacer click (ej: '/wms', '/logistica') */
    actionUrl?: string;
    /**
     * Clave única para deduplicar. Si ya existe una notificación con esta clave
     * en las últimas `dedupWindowHours` horas, se omite la inserción.
     * Ejemplo: 'stock_critical:loc-123:2026-02-25'
     */
    dedupKey?: string;
    dedupWindowHours?: number;
}

// ─── Internal session helper ─────────────────────────────────────────────────

async function getSession() {
    const headersList = await headers();
    const userId = headersList.get('x-user-id');
    const userRole = headersList.get('x-user-role');
    const userLocation = headersList.get('x-user-location');
    if (!userId) return null;
    return { userId, role: userRole || 'GUEST', locationId: userLocation };
}

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Crea una notificación con soporte de deduplicación.
 * Si `dedupKey` está presente, hace UPSERT: si ya existe la clave en las últimas
 * `dedupWindowHours` horas (default 1h), NO inserta un duplicado.
 */
export async function createNotificationSecure(data: CreateNotificationDTO) {
    const client = await getClient();
    try {
        const sanitize = (s: string) =>
            s.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
                .replace(/<img\b[^>]*>/gim, '');

        const title = sanitize(data.title);
        const message = sanitize(data.message);
        const metadata = { ...data.metadata, actionUrl: data.actionUrl ?? data.metadata?.actionUrl };

        if (data.dedupKey) {
            const windowHours = data.dedupWindowHours ?? 1;
            // Upsert ignorando si ya existe dentro de la ventana de tiempo
            await client.query(`
                INSERT INTO notifications (id, type, severity, title, message, metadata, location_id, user_id, action_url, dedup_key)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (dedup_key)
                DO UPDATE SET
                    updated_at = NOW()
                WHERE notifications.created_at < NOW() - make_interval(hours => $11)
            `, [
                randomUUID(),
                data.type,
                data.severity ?? 'INFO',
                title,
                message,
                JSON.stringify(metadata),
                data.locationId ?? null,
                data.userId ?? null,
                data.actionUrl ?? null,
                data.dedupKey,
                windowHours,
            ]);
        } else {
            await client.query(`
                INSERT INTO notifications (id, type, severity, title, message, metadata, location_id, user_id, action_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                randomUUID(),
                data.type,
                data.severity ?? 'INFO',
                title,
                message,
                JSON.stringify(metadata),
                data.locationId ?? null,
                data.userId ?? null,
                data.actionUrl ?? null,
            ]);
        }

        return { success: true };
    } catch (error) {
        logger.warn({ error }, '[Notifications] createNotificationSecure failed (non-blocking)');
        return { success: false, error: 'Failed to create notification' };
    } finally {
        client.release();
    }
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function getNotificationsSecure(locationId?: string, limit = 60) {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'Usuario no autenticado' };
    }

    let client: PoolClient | null = null;
    try {
        client = await getClient();
        const currentUserId = session.userId;

        const params: unknown[] = [locationId ?? null];
        let whereClause = `WHERE (location_id = $1 OR location_id IS NULL)`;

        whereClause += ` AND (user_id = $2 OR user_id IS NULL)`;
        params.push(currentUserId);

        const query = `
            SELECT id, type, severity, title, message, metadata, action_url,
                   is_read, location_id, user_id, created_at, dedup_key
            FROM notifications
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${params.length + 1}
        `;
        params.push(limit);

        const [res, countRes] = await Promise.all([
            client.query(query, params),
            client.query(
                `SELECT COUNT(*) FROM notifications ${whereClause} AND is_read = FALSE`,
                params.slice(0, params.length - 1)
            ),
        ]);

        return {
            success: true,
            data: res.rows,
            unreadCount: parseInt(countRes.rows[0]?.count ?? '0', 10),
        };
    } catch (error: unknown) {
        logger.error({ error, locationId }, '[Notifications] getNotificationsSecure failed');
        Sentry.captureException(error, { tags: { module: 'notifications-v2', action: 'getNotificationsSecure' } });
        return { success: false, error: 'Failed to fetch notifications' };
    } finally {
        client?.release();
    }
}

/** Conteo rápido de no leídas (sin traer todo el payload) */
export async function getUnreadCountSecure(locationId?: string): Promise<number> {
    const session = await getSession();
    let client: PoolClient | null = null;
    try {
        client = await getClient();
        const params: unknown[] = [locationId ?? null];
        let where = `WHERE is_read = FALSE AND (location_id = $1 OR location_id IS NULL)`;
        if (session?.userId) {
            where += ` AND (user_id = $2 OR user_id IS NULL)`;
            params.push(session.userId);
        } else {
            where += ` AND user_id IS NULL`;
        }
        const res = await client.query(`SELECT COUNT(*) FROM notifications ${where}`, params);
        return parseInt(res.rows[0]?.count ?? '0', 10);
    } catch {
        return 0;
    } finally {
        client?.release();
    }
}

// ─── Mark as Read ─────────────────────────────────────────────────────────────

export async function markAsReadSecure(notificationIds: string[]) {
    const session = await getSession();
    if (!session) return { success: false, error: 'Usuario no autenticado' };
    if (notificationIds.length === 0) return { success: true };

    const client = await getClient();
    try {
        await client.query(`
            UPDATE notifications SET is_read = TRUE
            WHERE id = ANY($1::uuid[])
        `, [notificationIds]);
        return { success: true };
    } catch (error) {
        logger.error({ error }, '[Notifications] markAsReadSecure failed');
        return { success: false, error: 'Failed to update notifications' };
    } finally {
        client.release();
    }
}

export async function markAllAsReadSecure(locationId?: string) {
    const session = await getSession();
    if (!session) return { success: false, error: 'Usuario no autenticado' };

    const client = await getClient();
    try {
        // FIX B5: Filtrar también por user_id para no marcar notificaciones de otros usuarios
        await client.query(`
            UPDATE notifications SET is_read = TRUE
            WHERE is_read = FALSE
              AND (location_id = $1 OR location_id IS NULL)
              AND (user_id = $2 OR user_id IS NULL)
        `, [locationId ?? null, session.userId]);
        return { success: true };
    } catch (error) {
        logger.error({ error }, '[Notifications] markAllAsReadSecure failed');
        return { success: false, error: 'Failed to mark notifications as read' };
    } finally {
        client.release();
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteNotificationSecure(notificationIds: string[]) {
    const session = await getSession();
    if (!session) return { success: false, error: 'Usuario no autenticado' };
    if (notificationIds.length === 0) return { success: true };

    const client = await getClient();
    try {
        const isAdmin = ['ADMIN', 'GERENTE_GENERAL'].includes(session.role);
        // Admins pueden eliminar cualquier notificación; usuarios normales solo las suyas
        const query = isAdmin
            ? `DELETE FROM notifications WHERE id = ANY($1::uuid[])`
            : `DELETE FROM notifications WHERE id = ANY($1::uuid[]) AND (user_id = $2 OR user_id IS NULL)`;
        const params = isAdmin ? [notificationIds] : [notificationIds, session.userId];

        const res = await client.query(query, params);
        return { success: true, deletedCount: res.rowCount };
    } catch (error) {
        logger.error({ error }, '[Notifications] deleteNotificationSecure failed');
        return { success: false, error: 'Failed to delete notifications' };
    } finally {
        client.release();
    }
}

// ─── Notify Managers (FIX B3: tipo dinámico) ─────────────────────────────────

export async function notifyManagersSecure(data: {
    locationId?: string;
    title: string;
    message: string;
    type?: NotificationType;
    severity?: NotificationSeverity;
    metadata?: Record<string, unknown>;
    actionUrl?: string;
    dedupKey?: string;
}) {
    const client = await getClient();
    try {
        let userQuery = `
            SELECT id FROM users
            WHERE role IN ('MANAGER', 'ADMIN', 'GERENTE_GENERAL') AND is_active = true
        `;
        const params: unknown[] = [];
        if (data.locationId) {
            userQuery += ` AND (assigned_location_id = $1 OR assigned_location_id IS NULL OR role IN ('ADMIN', 'GERENTE_GENERAL'))`;
            params.push(data.locationId);
        }

        const res = await client.query(userQuery, params);
        const managerIds: string[] = res.rows.map((r: { id: string }) => r.id);
        if (managerIds.length === 0) return { success: true };

        const metadata = { ...data.metadata, actionUrl: data.actionUrl };

        // FIX B3: Usar tipo dinámico, no hardcodear 'CASH'
        for (const userId of managerIds) {
            const dedupKey = data.dedupKey ? `${data.dedupKey}:user:${userId}` : undefined;
            const insertParams: unknown[] = [
                randomUUID(),
                data.type ?? 'SYSTEM',           // ← tipo dinámico
                data.severity ?? 'INFO',
                data.title,
                data.message,
                JSON.stringify(metadata),
                data.locationId ?? null,
                userId,
                data.actionUrl ?? null,
            ];

            if (dedupKey) {
                insertParams.push(dedupKey);
                await client.query(`
                    INSERT INTO notifications (id, type, severity, title, message, metadata, location_id, user_id, action_url, dedup_key)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (dedup_key) DO NOTHING
                `, insertParams);
            } else {
                await client.query(`
                    INSERT INTO notifications (id, type, severity, title, message, metadata, location_id, user_id, action_url)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, insertParams);
            }
        }

        return { success: true, notifiedCount: managerIds.length };
    } catch (error) {
        logger.error({ error }, '[Notifications] notifyManagersSecure failed');
        return { success: false, error: 'Failed to notify managers' };
    } finally {
        client.release();
    }
}

// ─── Push Token ───────────────────────────────────────────────────────────────

/** Guarda el FCM/APNs token del dispositivo actual del usuario */
export async function savePushTokenSecure(token: string) {
    const session = await getSession();
    if (!session) return { success: false, error: 'Usuario no autenticado' };

    const client = await getClient();
    try {
        await client.query(`
            UPDATE users SET push_token = $1 WHERE id = $2::uuid
        `, [token, session.userId]);
        return { success: true };
    } catch (error) {
        logger.error({ error }, '[Notifications] savePushTokenSecure failed');
        return { success: false, error: 'Failed to save push token' };
    } finally {
        client.release();
    }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function deleteOldNotifications(days: number) {
    const session = await getSession();
    if (!session || !['ADMIN', 'GERENTE_GENERAL'].includes(session.role)) {
        return { success: false, error: 'Acceso denegado: solo administradores pueden ejecutar esta acción' };
    }
    if (days < 7) {
        return { success: false, error: 'El periodo mínimo de retención es de 7 días' };
    }

    const client = await getClient();
    try {
        const res = await client.query(`
            DELETE FROM notifications WHERE created_at < NOW() - make_interval(days => $1)
        `, [days]);
        return { success: true, deletedCount: res.rowCount };
    } catch (error) {
        logger.error({ error }, '[Notifications] deleteOldNotifications failed');
        return { success: false, error: 'Failed to delete old notifications' };
    } finally {
        client.release();
    }
}

// ─── Legacy compatibility ─────────────────────────────────────────────────────
// Mantenemos getMyNotifications exportado para no romper imports existentes
export { getNotificationsSecure as getMyNotifications };
