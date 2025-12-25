'use server';

/**
 * ============================================================================
 * PUBLIC-CATALOG-V2: Catálogo Público Seguro
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - Rate limiting: 30/min por IP
 * - Caché de 5 minutos
 * - Sanitización del término
 * - Solo productos VISIBLE
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

interface PublicPriceInfo {
    id: string;
    sku: string;
    name: string;
    price: number;
    available: boolean;
    location_name: string;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMIT_PER_MINUTE = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const key = `public:${ip}`;
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

const priceCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getCacheKey(type: string, params: any): string {
    return `public:${type}:${JSON.stringify(params)}`;
}

function getFromCache(key: string): any | null {
    const entry = priceCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        priceCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key: string, data: any): void {
    priceCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
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
    return term.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s\-\.]/g, '').slice(0, 100);
}

// ============================================================================
// CHECK PRODUCT PRICE
// ============================================================================

/**
 * 🔍 Consultar Precio de Producto (Público con Rate Limit)
 */
export async function checkProductPriceSecure(
    term: string,
    locationId: string
): Promise<{ success: boolean; data?: PublicPriceInfo[]; error?: string }> {
    const ip = await getClientIP();

    // Rate limit
    if (!checkRateLimit(ip)) {
        logger.warn({ ip }, '[PublicCatalog] Rate limit exceeded');
        return { success: false, error: 'Demasiadas consultas. Espere un momento.' };
    }

    // Validar inputs
    const termValidation = SearchTermSchema.safeParse(term);
    if (!termValidation.success) {
        return { success: false, error: 'Ingrese al menos 3 caracteres' };
    }

    if (!UUIDSchema.safeParse(locationId).success) {
        return { success: false, error: 'Sucursal inválida' };
    }

    const sanitizedTerm = sanitizeTerm(term);

    // Verificar caché
    const cacheKey = getCacheKey('price', { term: sanitizedTerm, locationId });
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const sql = `
            SELECT 
                p.id, p.sku, p.name, l.name as location_name,
                COALESCE(SUM(ib.quantity_real), 0) as total_stock,
                COALESCE(MAX(ib.sale_price), MAX(p.price_sell_box), 0) as price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text AND ib.location_id::text = $2
            LEFT JOIN locations l ON l.id::text = $2
            WHERE (p.name ILIKE $1 OR p.sku ILIKE $1)
              AND (p.is_visible = true OR p.is_visible IS NULL)
            GROUP BY p.id, p.sku, p.name, l.name
            LIMIT 20
        `;

        const result = await query(sql, [`%${sanitizedTerm}%`, locationId]);

        const data: PublicPriceInfo[] = result.rows.map((row: any) => ({
            id: row.id,
            sku: row.sku,
            name: row.name,
            price: Number(row.price),
            available: Number(row.total_stock) > 0, // NO exponer cantidad exacta
            location_name: row.location_name || 'Sucursal',
        }));

        setCache(cacheKey, data);
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[PublicCatalog] Price check error');
        return { success: false, error: 'Error consultando precios' };
    }
}

// ============================================================================
// GET PUBLIC CATEGORIES
// ============================================================================

/**
 * 📂 Obtener Categorías Públicas
 */
export async function getPublicCategoriesSecure(
    locationId: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const ip = await getClientIP();

    if (!checkRateLimit(ip)) {
        return { success: false, error: 'Demasiadas consultas' };
    }

    const cacheKey = getCacheKey('categories', { locationId });
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const res = await query(`
            SELECT DISTINCT category FROM products 
            WHERE category IS NOT NULL AND (is_visible = true OR is_visible IS NULL)
            ORDER BY category
        `);

        const data = res.rows.map((r: any) => r.category);
        setCache(cacheKey, data);
        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[PublicCatalog] Categories error');
        return { success: false, error: 'Error obteniendo categorías' };
    }
}

// ============================================================================
// GET PROMOTIONS
// ============================================================================

/**
 * 🏷️ Obtener Promociones Activas
 */
export async function getPromotionsSecure(
    locationId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const ip = await getClientIP();

    if (!checkRateLimit(ip)) {
        return { success: false, error: 'Demasiadas consultas' };
    }

    const cacheKey = getCacheKey('promotions', { locationId });
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { success: true, data: cached };
    }

    try {
        const res = await query(`
            SELECT id, name, discount_percent, valid_until
            FROM promotions
            WHERE is_active = true 
              AND (location_id IS NULL OR location_id = $1)
              AND valid_until > NOW()
            ORDER BY discount_percent DESC
            LIMIT 10
        `, [locationId]);

        setCache(cacheKey, res.rows);
        return { success: true, data: res.rows };

    } catch (error: any) {
        // Tabla puede no existir
        return { success: true, data: [] };
    }
}
