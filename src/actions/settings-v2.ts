'use server';

/**
 * ============================================================================
 * SETTINGS-V2: Configuración Segura del Sistema
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - RBAC por categoría (PUBLIC/PRIVATE/CRITICAL)
 * - PIN ADMIN para settings CRITICAL
 * - Lista blanca de keys permitidos
 * - Auditoría con valor anterior
 */

import { pool, query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import {
    getActorOrFail,
    PinRbacError,
    ROLE_GROUPS,
    requireRole,
    validatePinForRoles,
} from '@/lib/pin-rbac';

// ============================================================================
// CONSTANTS
// ============================================================================

// Categorización de settings
const PUBLIC_SETTINGS = [
    'STORE_NAME',
    'STORE_ADDRESS',
    'STORE_PHONE',
    'STORE_RUT',
    'STORE_LOGO_URL',
    'TIMEZONE',
    'CURRENCY',
];

const PRIVATE_SETTINGS = [
    'ADMIN_EMAIL',
    'SUPPORT_EMAIL',
    'MAINTENANCE_MODE',
    'MAX_SHIFT_HOURS',
    'AUTO_CLOSE_ENABLED',
];

const CRITICAL_SETTINGS = [
    'SII_CERT_PATH',
    'SII_CERT_PASSWORD',
    'SII_ENVIRONMENT',
    'PAYMENT_GATEWAY_KEY',
    'SMTP_PASSWORD',
    'API_SECRET_KEY',
];

// Caché para lecturas
const settingsCache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ============================================================================
// HELPERS
// ============================================================================

async function requireSettingsActor() {
    try {
        const actor = await getActorOrFail();
        return { success: true as const, actor };
    } catch (error) {
        if (error instanceof PinRbacError) {
            return { success: false as const, error: 'No autenticado' };
        }

        throw error;
    }
}

function getSettingCategory(key: string): 'PUBLIC' | 'PRIVATE' | 'CRITICAL' | null {
    if (PUBLIC_SETTINGS.includes(key)) return 'PUBLIC';
    if (PRIVATE_SETTINGS.includes(key)) return 'PRIVATE';
    if (CRITICAL_SETTINGS.includes(key)) return 'CRITICAL';
    return null;
}

function ensureSettingsRole(
    actor: Awaited<ReturnType<typeof getActorOrFail>>,
    allowedRoles: readonly string[],
    errorMessage: string
) {
    try {
        requireRole(actor, allowedRoles);
        return { success: true as const };
    } catch (error) {
        if (error instanceof PinRbacError && error.code === 'AUTH_FORBIDDEN') {
            return { success: false as const, error: errorMessage };
        }

        throw error;
    }
}

async function validateSettingsAdminPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; admin?: { id: string; name: string } }> {
    try {
        const result = await validatePinForRoles(client, pin, ROLE_GROUPS.ADMIN, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { valid: false };
        }

        return {
            valid: true,
            admin: {
                id: result.authorizedBy.id,
                name: result.authorizedBy.name,
            },
        };
    } catch {
        return { valid: false };
    }
}

// ============================================================================
// GET PUBLIC SETTING
// ============================================================================

/**
 * 🌐 Obtener Setting Público (sin autenticación)
 */
export async function getPublicSettingSecure(
    key: string
): Promise<{ success: boolean; value?: string | null; error?: string }> {
    if (!PUBLIC_SETTINGS.includes(key)) {
        return { success: false, error: 'Setting no disponible públicamente' };
    }

    // Verificar caché
    const cached = settingsCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
        return { success: true, value: cached.value };
    }

    try {
        const res = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
        const value = res.rows[0]?.value || null;

        // Cachear
        if (value) {
            settingsCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        }

        return { success: true, value };

    } catch (error: any) {
        logger.error({ error, key }, '[Settings] Get public error');
        return { success: false, error: 'Error obteniendo configuración' };
    }
}

// ============================================================================
// GET PRIVATE SETTING
// ============================================================================

/**
 * 🔒 Obtener Setting Privado (con RBAC)
 */
export async function getPrivateSettingSecure(
    key: string
): Promise<{ success: boolean; value?: string | null; error?: string }> {
    const category = getSettingCategory(key);
    if (category === null) {
        return { success: false, error: 'Setting no reconocido' };
    }

    const auth = await requireSettingsActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    // Verificar permisos
    if (category === 'CRITICAL') {
        const authorization = ensureSettingsRole(
            auth.actor,
            ROLE_GROUPS.ADMIN,
            'Solo administradores pueden ver este setting'
        );
        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }
    } else if (category === 'PRIVATE') {
        const authorization = ensureSettingsRole(
            auth.actor,
            ROLE_GROUPS.MANAGER,
            'Permisos insuficientes'
        );
        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }
    }

    try {
        const res = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
        return { success: true, value: res.rows[0]?.value || null };

    } catch (error: any) {
        logger.error({ error, key }, '[Settings] Get private error');
        return { success: false, error: 'Error obteniendo configuración' };
    }
}

// ============================================================================
// UPDATE SETTING
// ============================================================================

/**
 * ✏️ Actualizar Setting (con validación y PIN para CRITICAL)
 */
export async function updateSettingSecure(
    key: string,
    value: string,
    adminPin?: string
): Promise<{ success: boolean; error?: string }> {
    const category = getSettingCategory(key);
    if (category === null) {
        return { success: false, error: 'Setting no reconocido' };
    }

    const auth = await requireSettingsActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    // Verificar permisos por categoría
    if (category === 'CRITICAL') {
        const authorization = ensureSettingsRole(auth.actor, ROLE_GROUPS.ADMIN, 'Solo administradores');
        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }
        if (!adminPin) {
            return { success: false, error: 'Se requiere PIN de administrador para settings críticos' };
        }
    } else if (category === 'PRIVATE') {
        const authorization = ensureSettingsRole(auth.actor, ROLE_GROUPS.MANAGER, 'Permisos insuficientes');
        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }
    } else {
        const authorization = ensureSettingsRole(auth.actor, ROLE_GROUPS.MANAGER, 'Permisos insuficientes');
        if (!authorization.success) {
            return { success: false, error: authorization.error };
        }
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Validar PIN si es CRITICAL
        if (category === 'CRITICAL' && adminPin) {
            const authResult = await validateSettingsAdminPin(client, adminPin);
            if (!authResult.valid) {
                await client.query('ROLLBACK');
                return { success: false, error: 'PIN de administrador inválido' };
            }
        }

        // Obtener valor anterior
        const prevRes = await client.query('SELECT value FROM app_settings WHERE key = $1', [key]);
        const previousValue = prevRes.rows[0]?.value || null;

        // Actualizar o insertar
        await client.query(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
        `, [key, value]);

        // Auditar con valor anterior
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values, created_at)
            VALUES ($1, 'SETTING_UPDATED', 'SETTING', $2, $3::jsonb, $4::jsonb, NOW())
        `, [auth.actor.userId, key, JSON.stringify({ value: previousValue }), JSON.stringify({
            value,
            category,
        })]);

        // Invalidar caché
        settingsCache.delete(key);

        await client.query('COMMIT');

        logger.info({ key, category, userId: auth.actor.userId }, '✏️ [Settings] Updated');
        revalidatePath('/settings');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error, key }, '[Settings] Update error');
        return { success: false, error: 'Error actualizando configuración' };
    } finally {
        client.release();
    }
}

// ============================================================================
// GET ALL SETTINGS
// ============================================================================

/**
 * 📋 Listar Todos los Settings (Solo ADMIN)
 */
export async function getAllSettingsSecure(): Promise<{
    success: boolean;
    data?: { key: string; value: string; category: string; updated_at: Date }[];
    error?: string;
}> {
    const auth = await requireSettingsActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const authorization = ensureSettingsRole(auth.actor, ROLE_GROUPS.ADMIN, 'Solo administradores');
    if (!authorization.success) {
        return { success: false, error: authorization.error };
    }

    try {
        const res = await query(`
            SELECT key, value, updated_at FROM app_settings ORDER BY key
        `);

        const data = res.rows.map((row: any) => ({
            key: row.key,
            value: row.value,
            category: getSettingCategory(row.key) || 'UNKNOWN',
            updated_at: row.updated_at,
        }));

        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Settings] Get all error');
        return { success: false, error: 'Error obteniendo configuraciones' };
    }
}

// ============================================================================
// SETTING HISTORY
// ============================================================================

/**
 * 📜 Historial de Cambios de un Setting
 */
export async function getSettingHistorySecure(
    key: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const auth = await requireSettingsActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const authorization = ensureSettingsRole(auth.actor, ROLE_GROUPS.ADMIN, 'Solo administradores');
    if (!authorization.success) {
        return { success: false, error: authorization.error };
    }

    try {
        const res = await query(`
            SELECT al.*, u.name as user_name
            FROM audit_log al
            LEFT JOIN users u ON al.user_id::text = u.id::text
            WHERE al.entity_type = 'SETTING' AND al.entity_id = $1
            ORDER BY al.created_at DESC
            LIMIT 50
        `, [key]);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error, key }, '[Settings] Get history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}
