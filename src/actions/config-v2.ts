'use server';

/**
 * ============================================================================
 * CONFIG-V2: Gestión Segura de Configuración del Sistema
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * ============================================================================
 * 
 * CARACTERÍSTICAS:
 * - Encriptación AES-256-GCM para valores sensibles
 * - RBAC: Solo ADMIN puede modificar configuraciones
 * - Caché en memoria con TTL
 * - Auditoría de todos los cambios
 * - Validación de valores según tipo
 * 
 * @version 1.0.0
 * @date 2024-01-09
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// ============================================================================
// TIPOS
// ============================================================================

export interface SystemConfig {
    id: string;
    config_key: string;
    config_value: string | null;
    is_encrypted: boolean;
    config_type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'ENCRYPTED';
    description: string | null;
    category: string;
    created_at: string;
    updated_at: string;
}

export interface AIConfig {
    provider: 'OPENAI' | 'GEMINI' | 'ANTHROPIC' | null;
    apiKey: string | null;
    model: string | null;
    maxTokens: number;
    temperature: number;
    monthlyLimit: number;
    fallbackProvider: 'OPENAI' | 'GEMINI' | 'NONE' | null;
    isConfigured: boolean;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const ADMIN_ROLES = ['ADMIN', 'GERENTE_GENERAL'];
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Caché en memoria
const configCache = new Map<string, { value: string | null; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Keys que requieren encriptación automática
const ENCRYPTED_KEYS = [
    'AI_API_KEY',
    'SII_CERT_PASSWORD',
    'PAYMENT_GATEWAY_KEY',
    'SMTP_PASSWORD',
    'API_SECRET_KEY',
];

// ============================================================================
// SCHEMAS DE VALIDACIÓN
// ============================================================================

const ConfigKeySchema = z.string()
    .min(1)
    .max(100)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Key debe ser UPPER_SNAKE_CASE');

const SaveConfigSchema = z.object({
    key: ConfigKeySchema,
    value: z.string().max(10000),
    isEncrypted: z.boolean().optional(),
    description: z.string().max(500).optional(),
    category: z.string().max(50).optional(),
});

// ============================================================================
// HELPERS DE ENCRIPTACIÓN
// ============================================================================

/**
 * Obtiene la clave de encriptación del entorno
 */
function getEncryptionKey(): Buffer {
    const key = process.env.CONFIG_ENCRYPTION_KEY;
    
    if (!key) {
        // En desarrollo, usar una clave derivada del DATABASE_URL
        const fallback = process.env.DATABASE_URL || 'farmacias-vallenar-default-key-32b';
        return crypto.createHash('sha256').update(fallback).digest();
    }
    
    // Si la clave tiene 64 caracteres, es hex
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }
    
    // Si no, derivar con SHA-256
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encripta un valor usando AES-256-GCM
 */
function encryptValue(plaintext: string): string {
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        // Formato: iv:authTag:encrypted (todo en hex)
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        logger.error({ error }, '[Config] Encryption failed');
        throw new Error('Error de encriptación');
    }
}

/**
 * Desencripta un valor usando AES-256-GCM
 */
function decryptValue(encryptedValue: string): string {
    try {
        const parts = encryptedValue.split(':');
        
        if (parts.length !== 3) {
            throw new Error('Formato de encriptación inválido');
        }
        
        const [ivHex, authTagHex, encrypted] = parts;
        const key = getEncryptionKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        logger.error({ error }, '[Config] Decryption failed');
        throw new Error('Error de desencriptación');
    }
}

/**
 * Enmascara un valor sensible para logs
 */
function maskSensitiveValue(value: string): string {
    if (value.length <= 8) return '****';
    return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}

// ============================================================================
// HELPERS DE SESIÓN
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

function isAdmin(role: string): boolean {
    return ADMIN_ROLES.includes(role);
}

// ============================================================================
// FUNCIONES PÚBLICAS
// ============================================================================

/**
 * 💾 Guardar configuración del sistema
 * Solo ADMIN puede ejecutar esta función
 */
export async function saveSystemConfigSecure(
    data: z.infer<typeof SaveConfigSchema>
): Promise<{ success: boolean; error?: string }> {
    
    // Validar entrada
    const validated = SaveConfigSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message || 'Datos inválidos' };
    }
    
    // Verificar sesión y permisos
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }
    
    if (!isAdmin(session.role)) {
        return { success: false, error: 'Acceso denegado: se requiere rol de administrador' };
    }
    
    const { key, value, isEncrypted, description, category } = validated.data;
    
    // Determinar si debe encriptarse
    const shouldEncrypt = isEncrypted || ENCRYPTED_KEYS.includes(key);
    
    // Validar API Key si es AI_API_KEY
    if (key === 'AI_API_KEY' && value.length < 20) {
        return { success: false, error: 'API Key debe tener al menos 20 caracteres' };
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Obtener valor anterior para auditoría
        const prevRes = await client.query(
            'SELECT config_value, is_encrypted FROM system_configs WHERE config_key = $1',
            [key]
        );
        
        const previousValue = prevRes.rows[0]?.config_value;
        const wasEncrypted = prevRes.rows[0]?.is_encrypted;
        
        // Encriptar si es necesario
        const finalValue = shouldEncrypt ? encryptValue(value) : value;
        const configType = shouldEncrypt ? 'ENCRYPTED' : 'STRING';
        
        // Upsert
        await client.query(`
            INSERT INTO system_configs (config_key, config_value, is_encrypted, config_type, description, category, created_by, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
            ON CONFLICT (config_key) DO UPDATE SET
                config_value = EXCLUDED.config_value,
                is_encrypted = EXCLUDED.is_encrypted,
                config_type = EXCLUDED.config_type,
                description = COALESCE(EXCLUDED.description, system_configs.description),
                category = COALESCE(EXCLUDED.category, system_configs.category),
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
        `, [key, finalValue, shouldEncrypt, configType, description || null, category || 'GENERAL', session.userId]);
        
        // Auditar (sin mostrar valores sensibles)
        const auditOldValue = wasEncrypted || shouldEncrypt 
            ? (previousValue ? '***ENCRYPTED***' : null)
            : previousValue;
        const auditNewValue = shouldEncrypt 
            ? maskSensitiveValue(value)
            : value;
        
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, old_values, new_values)
            VALUES ($1, $2, 'SYSTEM_CONFIG', $3, $4::jsonb, $5::jsonb)
        `, [
            session.userId,
            previousValue ? 'CONFIG_UPDATED' : 'CONFIG_CREATED',
            key,
            previousValue ? JSON.stringify({ value: auditOldValue }) : null,
            JSON.stringify({ value: auditNewValue, encrypted: shouldEncrypt })
        ]);
        
        // Si es API Key de IA, auditar específicamente
        if (key === 'AI_API_KEY') {
            await client.query(`
                INSERT INTO audit_log (user_id, action_code, entity_type, new_values)
                VALUES ($1, 'CONFIG_AI_KEY_SET', 'SYSTEM_CONFIG', $2::jsonb)
            `, [session.userId, JSON.stringify({ masked_key: maskSensitiveValue(value) })]);
        }
        
        await client.query('COMMIT');
        
        // Invalidar caché
        configCache.delete(key);
        
        logger.info({ key, encrypted: shouldEncrypt, userId: session.userId }, '✅ Config saved');
        
        revalidatePath('/settings');
        
        return { success: true };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error, key }, '❌ Error saving config');
        return { success: false, error: error.message || 'Error guardando configuración' };
    } finally {
        client.release();
    }
}

/**
 * 📖 Obtener configuración del sistema (uso interno)
 * Desencripta automáticamente valores encriptados
 */
export async function getSystemConfigSecure(key: string): Promise<string | null> {
    
    // Validar key
    if (!ConfigKeySchema.safeParse(key).success) {
        return null;
    }
    
    // Verificar caché
    const cached = configCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    
    try {
        const res = await query(
            'SELECT config_value, is_encrypted FROM system_configs WHERE config_key = $1',
            [key]
        );
        
        if (res.rows.length === 0) {
            configCache.set(key, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
            return null;
        }
        
        const { config_value, is_encrypted } = res.rows[0];
        
        if (!config_value) {
            configCache.set(key, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
            return null;
        }
        
        // Desencriptar si es necesario
        const value = is_encrypted ? decryptValue(config_value) : config_value;
        
        // Guardar en caché
        configCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        
        return value;
        
    } catch (error) {
        logger.error({ error, key }, '[Config] Error getting config');
        return null;
    }
}

/**
 * 📋 Obtener lista de configuraciones (para UI)
 * NO desencripta valores sensibles
 */
export async function getSystemConfigsSecure(
    category?: string
): Promise<{ success: boolean; data?: SystemConfig[]; error?: string }> {
    
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }
    
    // Solo ADMIN puede ver todas las configs
    if (!isAdmin(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }
    
    try {
        let sql = `
            SELECT 
                id, config_key, 
                CASE WHEN is_encrypted THEN '***ENCRYPTED***' ELSE config_value END as config_value,
                is_encrypted, config_type, description, category,
                created_at, updated_at
            FROM system_configs
        `;
        const params: any[] = [];
        
        if (category) {
            sql += ' WHERE category = $1';
            params.push(category);
        }
        
        sql += ' ORDER BY category, config_key';
        
        const res = await query(sql, params);
        
        return { success: true, data: res.rows };
        
    } catch (error: any) {
        logger.error({ error }, '[Config] Error listing configs');
        return { success: false, error: 'Error obteniendo configuraciones' };
    }
}

/**
 * 🤖 Obtener configuración de IA completa
 * Para uso interno del módulo de parsing
 */
export async function getAIConfigSecure(): Promise<AIConfig> {
    try {
        const [provider, apiKey, model, maxTokens, temperature, monthlyLimit, fallback] = await Promise.all([
            getSystemConfigSecure('AI_PROVIDER'),
            getSystemConfigSecure('AI_API_KEY'),
            getSystemConfigSecure('AI_MODEL'),
            getSystemConfigSecure('AI_MAX_TOKENS'),
            getSystemConfigSecure('AI_TEMPERATURE'),
            getSystemConfigSecure('AI_MONTHLY_LIMIT'),
            getSystemConfigSecure('AI_FALLBACK_PROVIDER'),
        ]);
        
        return {
            provider: provider as AIConfig['provider'],
            apiKey: apiKey,
            model: model,
            maxTokens: parseInt(maxTokens || '4096', 10),
            temperature: parseFloat(temperature || '0.1'),
            monthlyLimit: parseInt(monthlyLimit || '1000', 10),
            fallbackProvider: fallback as AIConfig['fallbackProvider'],
            isConfigured: !!(provider && apiKey),
        };
        
    } catch (error) {
        logger.error({ error }, '[Config] Error getting AI config');
        return {
            provider: null,
            apiKey: null,
            model: null,
            maxTokens: 4096,
            temperature: 0.1,
            monthlyLimit: 1000,
            fallbackProvider: null,
            isConfigured: false,
        };
    }
}

/**
 * 🗑️ Eliminar configuración
 * Solo ADMIN
 */
export async function deleteSystemConfigSecure(key: string): Promise<{ success: boolean; error?: string }> {
    
    const session = await getSession();
    if (!session || !isAdmin(session.role)) {
        return { success: false, error: 'Acceso denegado' };
    }
    
    if (!ConfigKeySchema.safeParse(key).success) {
        return { success: false, error: 'Key inválida' };
    }
    
    // No permitir eliminar configs críticas
    const criticalKeys = ['AI_PROVIDER', 'AI_API_KEY'];
    if (criticalKeys.includes(key)) {
        return { success: false, error: 'No se puede eliminar esta configuración crítica' };
    }
    
    try {
        const res = await query(
            'DELETE FROM system_configs WHERE config_key = $1 RETURNING id',
            [key]
        );
        
        if (res.rowCount === 0) {
            return { success: false, error: 'Configuración no encontrada' };
        }
        
        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id)
            VALUES ($1, 'CONFIG_DELETED', 'SYSTEM_CONFIG', $2)
        `, [session.userId, key]);
        
        // Invalidar caché
        configCache.delete(key);
        
        logger.info({ key, userId: session.userId }, '🗑️ Config deleted');
        
        revalidatePath('/settings');
        
        return { success: true };
        
    } catch (error: any) {
        logger.error({ error, key }, '❌ Error deleting config');
        return { success: false, error: 'Error eliminando configuración' };
    }
}

/**
 * 📊 Obtener uso de IA del mes actual
 */
export async function getAIUsageSecure(): Promise<{
    success: boolean;
    data?: {
        totalRequests: number;
        totalTokens: number;
        estimatedCost: number;
        limit: number;
        percentUsed: number;
    };
    error?: string;
}> {
    try {
        const res = await query(`
            SELECT 
                COUNT(*) as total_requests,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(estimated_cost), 0) as estimated_cost
            FROM ai_usage_log
            WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        `);
        
        const monthlyLimit = parseInt(await getSystemConfigSecure('AI_MONTHLY_LIMIT') || '1000', 10);
        const totalRequests = parseInt(res.rows[0].total_requests, 10);
        
        return {
            success: true,
            data: {
                totalRequests,
                totalTokens: parseInt(res.rows[0].total_tokens, 10),
                estimatedCost: parseFloat(res.rows[0].estimated_cost),
                limit: monthlyLimit,
                percentUsed: Math.round((totalRequests / monthlyLimit) * 100),
            }
        };
        
    } catch (error: any) {
        logger.error({ error }, '[Config] Error getting AI usage');
        return { success: false, error: 'Error obteniendo uso de IA' };
    }
}

/**
 * ✅ Verificar si IA está configurada correctamente
 */
export async function checkAIConfiguredSecure(): Promise<{
    configured: boolean;
    provider?: string;
    model?: string;
    error?: string;
}> {
    try {
        const config = await getAIConfigSecure();
        
        if (!config.isConfigured) {
            return {
                configured: false,
                error: 'Configure su API Key de IA en Ajustes → Configuración → IA'
            };
        }
        
        return {
            configured: true,
            provider: config.provider || undefined,
            model: config.model || undefined,
        };
        
    } catch (error) {
        return {
            configured: false,
            error: 'Error verificando configuración de IA'
        };
    }
}

/**
 * 🔄 Limpiar caché de configuración
 * Útil después de cambios masivos
 */
export async function clearConfigCacheSecure(): Promise<{ success: boolean }> {
    const session = await getSession();
    if (!session || !isAdmin(session.role)) {
        return { success: false };
    }
    
    configCache.clear();
    logger.info({ userId: session.userId }, '🔄 Config cache cleared');
    
    return { success: true };
}
