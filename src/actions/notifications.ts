'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';

export interface Notification {
    id: string;
    user_id: string;
    type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ALERT';
    title: string;
    message: string;
    link?: string;
    is_read: boolean;
    created_at: Date;
}

// --- Data Fetching ---

export async function getUserNotifications(userId: string): Promise<{ success: boolean; data?: Notification[]; unreadCount?: number; error?: string }> {
    try {
        await ensureNotificationsTable(); // Auto-migrate

        // Fetch unread + last 5 read
        const res = await query(`
            (SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC)
            UNION ALL
            (SELECT * FROM notifications WHERE user_id = $1 AND is_read = true ORDER BY created_at DESC LIMIT 5)
            ORDER BY created_at DESC
        `, [userId]);

        const notifications = res.rows;
        const unreadCount = notifications.filter(n => !n.is_read).length;

        return { success: true, data: notifications, unreadCount };
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return { success: false, error: 'Failed to load notifications' };
    }
}

// --- Actions ---

export async function createNotification(
    userId: string,
    title: string,
    message: string,
    type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ALERT' = 'INFO',
    link?: string
) {
    try {
        await ensureNotificationsTable();
        const id = uuidv4();
        await query(`
            INSERT INTO notifications (id, user_id, type, title, message, link, is_read, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
        `, [id, userId, type, title, message, link]);

        // We can't easily revalidatePath for specific user components without a global specific path or tag
        // Ideally frontend polls or uses Server Side Events. For now, we rely on page reloads or polling.
        return { success: true };
    } catch (error) {
        console.error('Error creating notification:', error);
        return { success: false, error: 'Failed to create notification' };
    }
}

export async function markAsRead(notificationId: string) {
    try {
        await query(`UPDATE notifications SET is_read = true WHERE id = $1`, [notificationId]);
        return { success: true };
    } catch (error) {
        console.error('Error marking as read:', error);
        return { success: false, error: 'Failed to update' };
    }
}

export async function notifyManagers(locationId: string, title: string, message: string, link?: string) {
    try {
        // Find all managers for this location (or generic ADMINs if desired, but request says "Gerente")
        // Assuming 'MANAGER' role users assigned to this location OR global admins.
        // Let's target strictly assigned MANAGERS for now.
        const res = await query(`
            SELECT id FROM users 
            WHERE (role = 'MANAGER' OR role = 'ADMIN') 
            AND (assigned_location_id = $1 OR assigned_location_id IS NULL)
        `, [locationId]);

        const managers = res.rows;

        for (const manager of managers) {
            await createNotification(manager.id, title, message, 'ALERT', link);
        }

        return { success: true, count: managers.length };
    } catch (error) {
        console.error('Error notifying managers:', error);
        return { success: false, error: 'Failed to notify managers' };
    }
}

// --- Migrations ---

async function ensureNotificationsTable() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL,
                type VARCHAR(20) DEFAULT 'INFO',
                title TEXT NOT NULL,
                message TEXT,
                link TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        // Index for speed
        await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);`);
    } catch (e) {
        // Ignore if exists race condition
    }
}
