'use server';

import { getClient } from '../lib/db';
import { revalidatePath } from 'next/cache';

export type NotificationType = 'HR' | 'INVENTORY' | 'CASH' | 'WMS' | 'SYSTEM' | 'CONFIG' | 'STOCK_CRITICAL' | 'GENERAL';
export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface CreateNotificationDTO {
    type: NotificationType;
    severity?: NotificationSeverity;
    title: string;
    message: string;
    metadata?: Record<string, any>;
    locationId?: string;
    userId?: string;
}

export async function createNotificationSecure(data: CreateNotificationDTO) {
    const client = await getClient();
    try {
        await client.query(`
            INSERT INTO notifications (
                type, severity, title, message, metadata, location_id, user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            data.type,
            data.severity || 'INFO',
            data.title,
            data.message,
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

export async function notifyManagersSecure(data: { locationId?: string; title: string; message: string; metadata?: any }) {
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

        for (const userId of managerIds) {
            await client.query(`
                INSERT INTO notifications (
                    type, severity, title, message, metadata, location_id, user_id
                ) VALUES ('CASH', 'WARNING', $1, $2, $3, $4, $5)
            `, [
                data.title,
                data.message,
                JSON.stringify(data.metadata || {}),
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
