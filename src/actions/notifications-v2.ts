'use server';

import { getClient } from '../lib/db';
import { revalidatePath } from 'next/cache';

export type NotificationType = 'HR' | 'INVENTORY' | 'CASH' | 'WMS' | 'SYSTEM' | 'CONFIG' | 'STOCK_CRITICAL' | 'GENERAL';
export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface CreateNotificationDTO {
    type: NotificationType;
    severity?: NotificationSeverity;
    title: string;
    message: string;
    metadata?: Record<string, any>;
    locationId?: string;
    userId?: string;
}

import { randomUUID } from 'crypto';

export async function createNotificationSecure(data: CreateNotificationDTO) {
    const client = await getClient();
    try {
        // Sanitize title and message to prevent XSS
        const sanitizedTitle = data.title.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "").replace(/<img\b[^>]*>/gim, "");
        const sanitizedMessage = data.message.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "").replace(/<img\b[^>]*>/gim, "");

        await client.query(`
            INSERT INTO notifications (
                id, type, severity, title, message, metadata, location_id, user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            randomUUID(),
            data.type,
            data.severity || 'INFO',
            sanitizedTitle,
            sanitizedMessage,
            JSON.stringify(data.metadata || {}),
            data.locationId || null,
            data.userId || null
        ]);

        // No revalidatePath here to avoid excessive cache purging on every event.
        // The UI should poll or revalidate on mount/interaction.
        return { success: true };
    } catch (error) {
        console.error('Failed to create notification:', error);
        // Fail silently to not block main transaction
        return { success: false, error: 'Failed to create notification' };
    } finally {
        client.release();
    }
}

export async function getNotificationsSecure(locationId?: string, limit = 50) {
    const client = await getClient();
    try {
        // Fetch unread first, then read, sorted by newest
        let query = `
            SELECT * FROM notifications 
            WHERE (location_id = $1 OR location_id IS NULL)
        `;
        const params: any[] = [locationId];

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await client.query(query, params);

        const unreadCountRes = await client.query(`
            SELECT COUNT(*) FROM notifications 
            WHERE (location_id = $1 OR location_id IS NULL) AND is_read = FALSE
        `, [locationId]);

        return {
            success: true,
            data: res.rows,
            unreadCount: parseInt(unreadCountRes.rows[0].count)
        };
    } catch (error) {
        console.error('Failed to fetch notifications:', error);
        return { success: false, error: 'Failed to fetch notifications' };
    } finally {
        client.release();
    }
}

export async function markAsReadSecure(notificationIds: string[]) {
    const session = await getSession();
    if (!session) return { success: false, error: 'Usuario no autenticado' };

    const client = await getClient();
    try {
        if (notificationIds.length === 0) return { success: true };

        await client.query(`
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE id = ANY($1::uuid[])
        `, [notificationIds]);

        revalidatePath('/app'); // Revalidate app layout to update badge
        return { success: true };
    } catch (error) {
        console.error('Failed to mark notifications as read:', error);
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
        await client.query(`
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE (location_id = $1 OR location_id IS NULL) AND is_read = FALSE
        `, [locationId]);

        revalidatePath('/app');
        return { success: true };
    } catch (error) {
        console.error('Failed to mark all as read:', error);
        return { success: false, error: 'Failed to update notifications' };
    } finally {
        client.release();
    }
}

export async function notifyManagersSecure(data: { locationId?: string; title: string; message: string; metadata?: any; link?: string }) {
    const client = await getClient();
    try {
        // Find managers to notify
        // If locationId is provided, notify managers of that location + Global Admins
        // If no locationId, notify all managers ?? (Usually better to be specific)

        // For Vallenar: Managers are usually per branch or Global.
        // Let's select users with role IN ('MANAGER','ADMIN','GERENTE_GENERAL') 
        // AND (assigned_location_id = $1 OR assigned_location_id IS NULL OR role = 'ADMIN' OR role = 'GERENTE_GENERAL')

        let userQuery = `
            SELECT id FROM users 
            WHERE role IN ('MANAGER', 'ADMIN', 'GERENTE_GENERAL')
            AND is_active = true
        `;
        const params: any[] = [];

        if (data.locationId) {
            userQuery += ` AND (assigned_location_id = $1 OR assigned_location_id IS NULL OR role IN ('ADMIN', 'GERENTE_GENERAL'))`;
            params.push(data.locationId);
        }

        const res = await client.query(userQuery, params);
        const managerIds = res.rows.map(r => r.id);

        if (managerIds.length === 0) return { success: true };

        // Batch insert notifications
        // We use a loop for simplicity or generate a large INSERT. 
        // Given logical number of managers is low (<20), loop is fine or single INSERT with UNNEST.

        const metadata = { ...data.metadata, actionUrl: data.link || data.metadata?.actionUrl };

        for (const userId of managerIds) {
            await client.query(`
                INSERT INTO notifications (
                    id, type, severity, title, message, metadata, location_id, user_id
                ) VALUES ($1, 'CASH', 'WARNING', $2, $3, $4, $5, $6)
            `, [
                randomUUID(),
                data.title,
                data.message,
                JSON.stringify(metadata),
                data.locationId || null,
                userId
            ]);
        }

        return { success: true, notifiedCount: managerIds.length };

    } catch (error) {
        console.error('Failed to notify managers:', error);
        return { success: false, error: 'Failed to notify managers' };
    } finally {
        client.release();
    }
}
import { headers } from 'next/headers';

async function getSession() {
    const headersList = await headers();
    const userId = headersList.get('x-user-id');
    const userRole = headersList.get('x-user-role');
    const userLocation = headersList.get('x-user-location');

    if (!userId) return null;

    return {
        userId,
        role: userRole || 'GUEST',
        locationId: userLocation
    };
}

export async function getMyNotifications(limit = 20) {
    const session = await getSession();
    if (!session) return { success: false, error: 'Usuario no autenticado' };

    const client = await getClient();
    try {
        // Fetch notifications for:
        // 1. My specific user_id
        // 2. My location (location_id = my_location)
        // 3. Global notifications (location_id IS NULL AND user_id IS NULL)

        const params: any[] = [session.userId];
        let query = `
            SELECT * FROM notifications 
            WHERE user_id = $1
        `;

        // If I have a location, include location-based notifs
        if (session.locationId) {
            query += ` OR location_id = $2`;
            params.push(session.locationId);
        } else {
            // Should I assume NULL location means global? Yes.
            query += ` OR location_id IS NULL`;
        }

        // Also include global non-targeted notifications if strictly needed, 
        // but typically location_id IS NULL covers system-wide.
        // Let's refine logical OR grouping:
        // (user_id = me) OR (location_id = my_loc AND user_id IS NULL) OR (location_id IS NULL AND user_id IS NULL)

        // Simplified for Vallenar typical use:
        // 1. Direct to me (user_id)
        // 2. To my store (location_id) -- usually implied for all staff there? Or just managers?
        //    Let's assume "To my store" means everyone in that store unless user_id is set.

        // Correct Query Re-write:
        // WHERE (user_id = $1)
        //    OR (location_id = $2 AND user_id IS NULL)
        //    OR (location_id IS NULL AND user_id IS NULL) -- Global System

        query = `
            SELECT * FROM notifications 
            WHERE (user_id = $1)
        `;

        if (session.locationId) {
            query += ` OR (location_id = $2 AND user_id IS NULL)`;
        }

        query += ` OR (location_id IS NULL AND user_id IS NULL)`;
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await client.query(query, params);

        // Count unread
        // Similar logic for count
        let countQuery = `
            SELECT COUNT(*) FROM notifications
            WHERE is_read = FALSE AND (
                (user_id = $1)
        `;
        if (session.locationId) {
            countQuery += ` OR (location_id = $2 AND user_id IS NULL)`;
        }
        countQuery += ` OR (location_id IS NULL AND user_id IS NULL) )`;

        const countRes = await client.query(countQuery, filterParamsForCount(params));
        // Helper inside: params for count are just user and location. 
        // Actually simpler to just reuse params.slice(0, used_params_idx) but let's be safe.
        // We can just use the same params array since LIMIT is at the end and not used here.
        // Wait, params has 'limit' at the end. Slice it off.

        const countParams = params.slice(0, params.length - 1);
        const countResExec = await client.query(countQuery, countParams);

        return {
            success: true,
            data: res.rows,
            unreadCount: parseInt(countResExec.rows[0].count)
        };

    } catch (error) {
        console.error('Failed to get my notifications:', error);
        return { success: false, error: 'Failed to fetch personal notifications' };
    } finally {
        client.release();
    }
}

function filterParamsForCount(p: any[]) {
    // Just to keep logic clean in code block above
    return p;
}

export async function deleteOldNotifications(days: number) {
    const session = await getSession();
    if (!session || !['ADMIN', 'GERENTE_GENERAL'].includes(session.role)) {
        return { success: false, error: 'Acceso denegado: Se requieren permisos de administradores' };
    }

    if (days < 7) {
        return { success: false, error: 'El periodo mínimo de retención es de 7 días' };
    }

    const client = await getClient();
    try {
        const res = await client.query(`
            DELETE FROM notifications 
            WHERE created_at < NOW() - make_interval(days => $1)
        `, [days]);

        return { success: true, deletedCount: res.rowCount };
    } catch (error) {
        console.error('Failed to cleanup notifications:', error);
        return { success: false, error: 'Failed to delete old notifications' };
    } finally {
        client.release();
    }
}
