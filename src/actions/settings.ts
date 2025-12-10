'use server';

import { query } from '@/lib/db';
import { logAuditAction } from './security';
import { revalidatePath } from 'next/cache';

/**
 * 🌍 Get Global Setting
 * Retrieves a value from app_settings by key.
 */
export async function getGlobalSetting(key: string): Promise<string | null> {
    try {
        const res = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
        if (res.rowCount === 0) return null;
        return res.rows[0].value;
    } catch (error) {
        console.error(`Error fetching setting ${key}:`, error);
        return null; // Fail safe
    }
}

/**
 * ✏️ Update Global Setting
 * Updates a value in app_settings.
 */
export async function updateGlobalSetting(key: string, value: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
        await query(
            'INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
            [key, value]
        );

        // Audit Log
        await logAuditAction(userId, 'UPDATE_GLOBAL_SETTING', { key, newValue: value });

        revalidatePath('/settings');
        return { success: true, message: 'Configuración actualizada.' };
    } catch (error) {
        console.error(`Error updating setting ${key}:`, error);
        return { success: false, message: 'Error al actualizar configuración.' };
    }
}
