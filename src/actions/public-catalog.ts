'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { query } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface PublicPriceInfo {
    id: string;
    sku: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    location_name: string;
    format: string;
}

const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const publicCatalogRateLimits = new Map<string, { count: number; resetAt: number }>();
const LOCATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getClientIP(): Promise<string> {
    try {
        const headersList = await headers();
        return headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
            || headersList.get('x-real-ip')
            || 'unknown';
    } catch {
        return 'unknown';
    }
}

function checkPublicCatalogRateLimit(ip: string): boolean {
    const now = Date.now();
    const key = `public-catalog-legacy:${ip}`;
    const entry = publicCatalogRateLimits.get(key);

    if (!entry || now > entry.resetAt) {
        publicCatalogRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT_PER_MINUTE) {
        return false;
    }

    entry.count++;
    return true;
}

function sanitizeTerm(term: string): string {
    return term
        .replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s\-\.]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
}

export async function checkProductPrice(term: string, locationId: string): Promise<{ success: boolean; data?: PublicPriceInfo[]; error?: string }> {
    noStore();

    const ip = await getClientIP();

    if (!checkPublicCatalogRateLimit(ip)) {
        logger.warn({ ip }, '[PublicCatalogLegacy] Rate limit exceeded');
        return { success: false, error: 'Demasiadas consultas. Espere un momento.' };
    }

    const sanitizedTerm = sanitizeTerm(term || '');

    if (sanitizedTerm.length < 3) {
        return { success: false, error: 'Ingrese al menos 3 caracteres.' };
    }

    if (!LOCATION_ID_PATTERN.test(locationId)) {
        return { success: false, error: 'Seleccione una sucursal.' };
    }

    try {
        // Query Logic:
        // 1. Search in PRODUCTS table by Name, SKU, or Barcode
        // 2. JOIN with INVENTORY_BATCHES to get stock specifically for the requested Location
        // 3. SUM stock (in case of multiple batches)
        // 4. MAX price (usually price is consistent, but safeguard)

        // Note: We use LEFT JOIN to show product even if out of stock, 
        // BUT strict requirement is "price/stock per branch". 
        // If no inventory record exists for that branch, stock is 0.

        const sql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                '' as description,
                '' as format,
                l.name as location_name,
                COALESCE(SUM(ib.quantity_real), 0) as total_stock,
                COALESCE(MAX(ib.sale_price), MAX(p.price_sell_box), 0) as price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text AND ib.location_id::text = $2
            LEFT JOIN locations l ON l.id::text = $2
            WHERE (
                p.name ILIKE $1 
                OR p.sku ILIKE $1
                OR NULLIF(to_jsonb(ib)->>'barcode', '') = $3
            )
              AND COALESCE(NULLIF(to_jsonb(p)->>'is_visible', '')::boolean, true) = true
            GROUP BY p.id, p.sku, p.name, l.name, p.price_sell_box
            LIMIT 20
        `;

        const result = await query(sql, [`%${sanitizedTerm}%`, locationId, sanitizedTerm]);

        const products: PublicPriceInfo[] = result.rows.map(row => ({
            id: row.id,
            sku: row.sku,
            name: row.name,
            description: row.description || '',
            format: row.format || 'Unidad',
            price: Number(row.price),
            stock: Number(row.total_stock),
            location_name: row.location_name || 'Sucursal Seleccionada'
        }));

        return { success: true, data: products };

    } catch (error: unknown) {
        logger.error({ error }, '[PublicCatalogLegacy] Price check error');
        return { success: false, error: 'Error al consultar precios.' };
    }
}
