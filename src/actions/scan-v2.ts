'use server';

/**
 * ============================================================================
 * SCAN-V2: Escaneo de Productos Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Validación de sesión activa
 * - Rate limit: 100 escaneos/minuto
 * - Auditoría de escaneos
 * - Validación de ubicación
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');
const CodeSchema = z.string().min(1).max(50);

// ============================================================================
// TYPES
// ============================================================================

interface ScanResult {
    id: string;
    sku: string;
    barcode?: string;
    name: string;
    price: number;
    stock: number;
    is_restricted: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCAN_RATE_LIMIT_PER_MINUTE = 100;

// Rate limiting en memoria
const scanRateLimit = new Map<string, { count: number; resetAt: number }>();

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined };
    } catch {
        return null;
    }
}

function checkScanRateLimit(userId: string): boolean {
    const now = Date.now();
    const key = `scan:${userId}`;
    const entry = scanRateLimit.get(key);

    if (!entry || now > entry.resetAt) {
        scanRateLimit.set(key, { count: 1, resetAt: now + 60000 }); // 1 minuto
        return true;
    }

    if (entry.count >= SCAN_RATE_LIMIT_PER_MINUTE) {
        return false;
    }

    entry.count++;
    return true;
}

// ============================================================================
// SCAN PRODUCT
// ============================================================================

/**
 * 📦 Escanear Producto (con validación)
 */
export async function scanProductSecure(
    code: string,
    locationId: string
): Promise<{ success: boolean; data?: ScanResult; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!CodeSchema.safeParse(code).success) {
        return { success: false, error: 'Código inválido' };
    }

    if (!UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    // Validar que el usuario pertenezca a la ubicación
    if (session.locationId && session.locationId !== locationId) {
        return { success: false, error: 'No tienes acceso a esta ubicación' };
    }

    // Rate limit
    if (!checkScanRateLimit(session.userId)) {
        logger.warn({ userId: session.userId }, '[Scan] Rate limit exceeded');
        return { success: false, error: `Límite de ${SCAN_RATE_LIMIT_PER_MINUTE} escaneos por minuto` };
    }

    try {
        const cleanCode = code.trim().toUpperCase();

        const res = await query(`
            SELECT 
                id, sku, 
                COALESCE(barcode, sku) as barcode,
                name,
                price_sell_box as price,
                stock_actual as stock,
                condition
            FROM inventory_batches
            WHERE location_id = $1 
              AND (UPPER(sku) = $2 OR UPPER(barcode) = $2)
            LIMIT 1
        `, [locationId, cleanCode]);

        if (res.rows.length === 0) {
            return { success: false, error: 'Producto no encontrado' };
        }

        const row = res.rows[0];

        const result: ScanResult = {
            id: row.id,
            sku: row.sku,
            barcode: row.barcode,
            name: row.name,
            price: parseFloat(row.price) || 0,
            stock: parseInt(row.stock) || 0,
            is_restricted: row.condition === 'R' || row.condition === 'RR',
        };

        // Auditar escaneo (async, no bloquea)
        query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'PRODUCT_SCANNED', 'PRODUCT', $2, $3::jsonb, NOW())
        `, [session.userId, result.id, JSON.stringify({
            code: cleanCode,
            location_id: locationId,
            sku: result.sku,
        })]).catch(() => { }); // Silently ignore audit errors

        return { success: true, data: result };

    } catch (error: any) {
        logger.error({ error }, '[Scan] Error');
        return { success: false, error: 'Error de lectura' };
    }
}

// ============================================================================
// BATCH SCAN
// ============================================================================

/**
 * 📦 Escanear Múltiples Productos
 */
export async function scanBatchSecure(
    codes: string[],
    locationId: string
): Promise<{ success: boolean; data?: ScanResult[]; errors?: string[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    if (!UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    if (!Array.isArray(codes) || codes.length === 0 || codes.length > 50) {
        return { success: false, error: 'Debe proporcionar entre 1 y 50 códigos' };
    }

    // Rate limit para todo el batch
    if (!checkScanRateLimit(session.userId)) {
        return { success: false, error: `Límite de escaneos excedido` };
    }

    const results: ScanResult[] = [];
    const errors: string[] = [];

    for (const code of codes) {
        const result = await scanProductSecure(code, locationId);
        if (result.success && result.data) {
            results.push(result.data);
        } else {
            errors.push(`${code}: ${result.error}`);
        }
    }

    return { success: true, data: results, errors: errors.length > 0 ? errors : undefined };
}

// ============================================================================
// SCAN HISTORY
// ============================================================================

/**
 * 📜 Historial de Escaneos de la Sesión
 */
export async function getScanHistorySecure(
    sessionId?: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const sql = `
            SELECT al.entity_id, al.new_values, al.created_at
            FROM audit_log al
            WHERE al.user_id = $1 
              AND al.action_code = 'PRODUCT_SCANNED'
              AND al.created_at > NOW() - INTERVAL '8 hours'
            ORDER BY al.created_at DESC
            LIMIT 100
        `;

        const res = await query(sql, [session.userId]);

        return { success: true, data: res.rows };

    } catch (error: any) {
        logger.error({ error }, '[Scan] History error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}
