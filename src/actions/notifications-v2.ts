'use server';

import { getClient, type PoolClient } from '../lib/db';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'crypto';
import { getValidatedSession } from '@/lib/server-session';
import { z } from 'zod';

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
    const session = await getValidatedSession();
    if (!session) return null;
    return { userId: session.userId, role: session.role, locationId: session.locationId };
}

const GLOBAL_NOTIFICATION_ROLES = new Set(['ADMIN', 'GERENTE_GENERAL']);
const UUIDSchema = z.string().uuid('ID inválido');

function normalizeRole(role?: string | null) {
    return String(role || '').trim().toUpperCase();
}

function sanitizeRequestedLocationId(locationId?: string) {
    if (!locationId) {
        return undefined;
    }

    return UUIDSchema.safeParse(locationId).success ? locationId : undefined;
}

function resolveEffectiveNotificationLocation(
    session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
    requestedLocationId?: string,
) {
    const sanitizedRequestedLocationId = sanitizeRequestedLocationId(requestedLocationId);
    const normalizedRole = normalizeRole(session.role);
    const isGlobal = GLOBAL_NOTIFICATION_ROLES.has(normalizedRole);

    if (isGlobal) {
        return { success: true as const, locationId: sanitizedRequestedLocationId ?? session.locationId ?? null };
    }

    if (!session.locationId) {
        return { success: false as const, error: 'No tienes una ubicación asignada' };
    }

    return { success: true as const, locationId: session.locationId };
}

async function getNotificationContext(requestedLocationId?: string) {
    const session = await getSession();
    if (!session) {
        return { success: false as const, error: 'Usuario no autenticado' };
    }

    const effectiveLocation = resolveEffectiveNotificationLocation(session, requestedLocationId);
    if (!effectiveLocation.success) {
        return { success: false as const, error: effectiveLocation.error };
    }

    return {
        success: true as const,
        session,
        effectiveLocationId: effectiveLocation.locationId,
    };
}

function buildLocationScope(locationId: string | null, startIndex: number) {
    if (locationId) {
        return {
            clause: `(n.location_id = $${startIndex}::uuid OR n.location_id IS NULL)`,
            params: [locationId] as unknown[],
        };
    }

    return {
        clause: 'n.location_id IS NULL',
        params: [] as unknown[],
    };
}

const READ_STATE_SQL = `
    CASE
        WHEN n.user_id IS NULL THEN (nr.read_at IS NOT NULL)
        ELSE COALESCE(nr.read_at IS NOT NULL, n.is_read)
    END
`;

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
    const context = await getNotificationContext(locationId);
    if (!context.success) {
        return { success: false, error: context.error };
    }

    let client: PoolClient | null = null;
    try {
        client = await getClient();
        const currentUserId = context.session.userId;
        const locationScope = buildLocationScope(context.effectiveLocationId, 2);
        const params: unknown[] = [currentUserId, ...locationScope.params];
        const limitParam = params.length + 1;
        const visibleNotificationsCte = `
            WITH visible_notifications AS (
                SELECT
                    n.id,
                    n.type,
                    n.severity,
                    n.title,
                    n.message,
                    n.metadata,
                    n.action_url,
                    ${READ_STATE_SQL} AS is_read,
                    n.location_id,
                    n.user_id,
                    n.created_at,
                    n.dedup_key
                FROM notifications n
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.id
                 AND nr.user_id = $1::uuid
                WHERE ${locationScope.clause}
                  AND (n.user_id = $1::uuid OR n.user_id IS NULL)
                  AND nr.deleted_at IS NULL
            )
        `;

        const [res, countRes] = await Promise.all([
            client.query(
                `
                ${visibleNotificationsCte}
                SELECT id, type, severity, title, message, metadata, action_url,
                       is_read, location_id, user_id, created_at, dedup_key
                FROM visible_notifications
                ORDER BY created_at DESC
                LIMIT $${limitParam}
                `,
                [...params, limit],
            ),
            client.query(
                `
                ${visibleNotificationsCte}
                SELECT COUNT(*) FROM visible_notifications WHERE is_read = FALSE
                `,
                params,
            ),
        ]);

        return {
            success: true,
            data: res.rows,
            unreadCount: parseInt(countRes.rows[0]?.count ?? '0', 10),
        };
    } catch (error: unknown) {
        logger.error({ error, requestedLocationId: locationId }, '[Notifications] getNotificationsSecure failed');
        Sentry.captureException(error, { tags: { module: 'notifications-v2', action: 'getNotificationsSecure' } });
        return { success: false, error: 'Failed to fetch notifications' };
    } finally {
        client?.release();
    }
}

/** Conteo rápido de no leídas (sin traer todo el payload) */
export async function getUnreadCountSecure(locationId?: string): Promise<number> {
    const context = await getNotificationContext(locationId);
    if (!context.success) {
        return 0;
    }

    let client: PoolClient | null = null;
    try {
        client = await getClient();
        const locationScope = buildLocationScope(context.effectiveLocationId, 2);
        const params: unknown[] = [context.session.userId, ...locationScope.params];
        const res = await client.query(
            `
            WITH visible_notifications AS (
                SELECT ${READ_STATE_SQL} AS is_read
                FROM notifications n
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.id
                 AND nr.user_id = $1::uuid
                WHERE ${locationScope.clause}
                  AND (n.user_id = $1::uuid OR n.user_id IS NULL)
                  AND nr.deleted_at IS NULL
            )
            SELECT COUNT(*) FROM visible_notifications WHERE is_read = FALSE
            `,
            params,
        );
        return parseInt(res.rows[0]?.count ?? '0', 10);
    } catch {
        return 0;
    } finally {
        client?.release();
    }
}

// ─── Mark as Read ─────────────────────────────────────────────────────────────

export async function markAsReadSecure(notificationIds: string[]) {
    const context = await getNotificationContext();
    if (!context.success) return { success: false, error: context.error };
    if (notificationIds.length === 0) return { success: true };

    const client = await getClient();
    try {
        const locationScope = buildLocationScope(context.effectiveLocationId, 3);
        await client.query(
            `
            WITH visible_notifications AS (
                SELECT n.id
                FROM notifications n
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.id
                 AND nr.user_id = $2::uuid
                WHERE n.id = ANY($1::uuid[])
                  AND ${locationScope.clause}
                  AND (n.user_id = $2::uuid OR n.user_id IS NULL)
                  AND nr.deleted_at IS NULL
            )
            INSERT INTO notification_reads (
                id, notification_id, user_id, read_at, deleted_at, created_at, updated_at
            )
            SELECT gen_random_uuid(), vn.id, $2::uuid, NOW(), NULL, NOW(), NOW()
            FROM visible_notifications vn
            ON CONFLICT (notification_id, user_id)
            DO UPDATE SET
                read_at = COALESCE(notification_reads.read_at, EXCLUDED.read_at),
                deleted_at = NULL,
                updated_at = NOW()
            `,
            [notificationIds, context.session.userId, ...locationScope.params],
        );
        return { success: true };
    } catch (error) {
        logger.error({ error }, '[Notifications] markAsReadSecure failed');
        return { success: false, error: 'Failed to update notifications' };
    } finally {
        client.release();
    }
}

export async function markAllAsReadSecure(locationId?: string) {
    const context = await getNotificationContext(locationId);
    if (!context.success) return { success: false, error: context.error };

    const client = await getClient();
    try {
        const locationScope = buildLocationScope(context.effectiveLocationId, 2);
        await client.query(
            `
            WITH visible_notifications AS (
                SELECT n.id
                FROM notifications n
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.id
                 AND nr.user_id = $1::uuid
                WHERE ${locationScope.clause}
                  AND (n.user_id = $1::uuid OR n.user_id IS NULL)
                  AND nr.deleted_at IS NULL
                  AND NOT (${READ_STATE_SQL})
            )
            INSERT INTO notification_reads (
                id, notification_id, user_id, read_at, deleted_at, created_at, updated_at
            )
            SELECT gen_random_uuid(), vn.id, $1::uuid, NOW(), NULL, NOW(), NOW()
            FROM visible_notifications vn
            ON CONFLICT (notification_id, user_id)
            DO UPDATE SET
                read_at = COALESCE(notification_reads.read_at, EXCLUDED.read_at),
                deleted_at = NULL,
                updated_at = NOW()
            `,
            [context.session.userId, ...locationScope.params],
        );
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
    const context = await getNotificationContext();
    if (!context.success) return { success: false, error: context.error };
    if (notificationIds.length === 0) return { success: true };

    const client = await getClient();
    try {
        const locationScope = buildLocationScope(context.effectiveLocationId, 3);
        const res = await client.query(
            `
            WITH visible_notifications AS (
                SELECT n.id
                FROM notifications n
                LEFT JOIN notification_reads nr
                  ON nr.notification_id = n.id
                 AND nr.user_id = $2::uuid
                WHERE n.id = ANY($1::uuid[])
                  AND ${locationScope.clause}
                  AND (n.user_id = $2::uuid OR n.user_id IS NULL)
                  AND nr.deleted_at IS NULL
            ),
            upserted AS (
                INSERT INTO notification_reads (
                    id, notification_id, user_id, read_at, deleted_at, created_at, updated_at
                )
                SELECT gen_random_uuid(), vn.id, $2::uuid, NULL, NOW(), NOW(), NOW()
                FROM visible_notifications vn
                ON CONFLICT (notification_id, user_id)
                DO UPDATE SET
                    deleted_at = NOW(),
                    updated_at = NOW()
                RETURNING notification_id
            )
            SELECT COUNT(*)::int AS count FROM upserted
            `,
            [notificationIds, context.session.userId, ...locationScope.params],
        );
        return { success: true, deletedCount: Number(res.rows[0]?.count || 0) };
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
