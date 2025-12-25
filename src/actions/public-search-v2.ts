'use server';

/**
 * ============================================================================
 * PUBLIC-SEARCH-V2: Búsqueda Pública Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Rate limiting: 20/min por IP
 * - Sanitización del término
 * - NUNCA retornar stock exacto
 * - Caché de 2 minutos
 */

import { query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');
const SearchTermSchema = z.string().min(3).max(100);

// ============================================================================
// TYPES
// ============================================================================

interface PublicProduct {
    id: string;
    name: string;
    dci: string | null;
    status: 'Disponible' | 'Agotado';
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMIT_PER_MINUTE = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const key = `search:${ip}`;
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
        return true;
    }

    if (entry.count >= RATE_LIMIT_PER_MINUTE) {
        return false;
    }

    entry.count++;
    return true;
}

// ============================================================================
// CACHE
// ============================================================================

const searchCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

function getCacheKey(term: string): string {
    return `search:${term.toLowerCase()}`;
}

function getFromCache(key: string): any | null {
    const entry = searchCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        searchCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: any): void {
    searchCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================================
// HELPERS
// ============================================================================

async function getClientIP(): Promise<string> {
    try {
        const headersList = await headers();
        return headersList.get('x-forwarded-for')?.split(',')[0] ||
            headersList.get('x-real-ip') ||
            'unknown';
    } catch {
        return 'unknown';
    }
}

function sanitizeTerm(term: string): string {
    // Solo alfanumérico, espacios y algunos caracteres seguros
    return term.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s\-\.]/g, '').trim().slice(0, 100);
}

// ============================================================================
// SEARCH PUBLIC PRODUCTS
// ============================================================================

/**
 * 🔍 Buscar Productos Públicos (con Rate Limit)
 */
export async function searchPublicProductsSecure(
    term: string
): Promise<{ success: boolean; data?: PublicProduct[]; error?: string }> {
    const ip = await getClientIP();

    // Rate limit
    if (!checkRateLimit(ip)) {
        logger.warn({ ip }, '[PublicSearch] Rate limit exceeded');
        return { success: false, error: 'Demasiadas búsquedas. Espere un momento.' };
    }

    // Validar
    const termValidation = SearchTermSchema.safeParse(term);
    if (!termValidation.success) {
        return { success: false, error: 'Ingrese al menos 3 caracteres' };
    }

    const sanitizedTerm = sanitizeTerm(term);
    if (sanitizedTerm.length < 3) {
        return { success: false, error: 'Término de búsqueda inválido' };
    }

    // Verificar caché
    const cacheKey = getCacheKey(sanitizedTerm);
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        // IMPORTANTE: Seleccionamos stock para calcular status, pero NO lo retornamos
        const sql = `
            SELECT id, name, dci, stock
            FROM products
            WHERE (name ILIKE $1 OR dci ILIKE $1)
              AND (is_visible = true OR is_visible IS NULL)
            LIMIT 20
        `;

        const result = await query(sql, [`%${sanitizedTerm}%`]);

        // Transformar - NUNCA exponer stock exacto
        const data: PublicProduct[] = result.rows.map((row: any) => ({
            id: row.id.toString(),
            name: row.name,
            dci: row.dci || null,
            status: Number(row.stock) > 0 ? 'Disponible' : 'Agotado',
        }));

        setCache(cacheKey, data);
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[PublicSearch] Search error');
        return { success: false, error: 'Error en búsqueda' };
    }
}

// ============================================================================
// GET PRODUCT AVAILABILITY
// ============================================================================

/**
 * ✅ Verificar Disponibilidad (sin revelar stock exacto)
 */
export async function getProductAvailabilitySecure(
    productId: string,
    locationId?: string
): Promise<{ success: boolean; available?: boolean; locationName?: string; error?: string }> {
    const ip = await getClientIP();

    if (!checkRateLimit(ip)) {
        return { success: false, error: 'Demasiadas consultas' };
    }

    if (!UUIDSchema.safeParse(productId).success) {
        return { success: false, error: 'ID de producto inválido' };
    }

    try {
        let sql = `
            SELECT 
                COALESCE(SUM(ib.quantity_real), 0) as total_stock,
                l.name as location_name
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text
            LEFT JOIN locations l ON ib.location_id = l.id
            WHERE p.id::text = $1
        `;
        const params: any[] = [productId];

        if (locationId && UUIDSchema.safeParse(locationId).success) {
            sql = `
                SELECT 
                    COALESCE(SUM(ib.quantity_real), 0) as total_stock,
                    l.name as location_name
                FROM products p
                LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text AND ib.location_id::text = $2
                LEFT JOIN locations l ON l.id::text = $2
                WHERE p.id::text = $1
                GROUP BY l.name
            `;
            params.push(locationId);
        } else {
            sql += ' GROUP BY l.name';
        }

        const result = await query(sql, params);

        const totalStock = result.rows.reduce((sum: number, row: any) => sum + Number(row.total_stock), 0);

        return {
            success: true,
            available: totalStock > 0, // Solo boolean, NO cantidad
            locationName: result.rows[0]?.location_name,
        };

    } catch (error: any) {
        logger.error({ error }, '[PublicSearch] Availability error');
        return { success: false, error: 'Error verificando disponibilidad' };
    }
}
