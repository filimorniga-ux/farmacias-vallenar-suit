'use server';

/**
 * ============================================================================
 * GET-PRODUCTS-V2: Búsqueda de Productos Segura
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 */

import { query } from '@/lib/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limiter';

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'];

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined };
    } catch { return null; }
}

interface ProductResult {
    id: string;
    sku: string;
    name: string;
    description: string;
    price: number;
    stock?: number; // Solo visible para managers
    location_name: string;
    format: string;
}

/**
 * 🔍 Buscar Productos (Requiere sesión + rate limit)
 */
export async function getProductsSecure(
    term: string,
    locationId: string
): Promise<{ success: boolean; data?: ProductResult[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // Rate limit 60/min por usuario
    const rl = checkRateLimit(`products:${session.userId}`);
    if (!rl.allowed) {
        return { success: false, error: 'Demasiadas búsquedas. Espere un momento.' };
    }

    if (!term || term.trim().length < 2) {
        return { success: false, error: 'Ingrese al menos 2 caracteres' };
    }

    // Validar UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (locationId && !uuidRegex.test(locationId)) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    // Sanitizar término
    const sanitizedTerm = term.replace(/[<>"'%;()&+]/g, '');

    try {
        const canSeeStock = MANAGER_ROLES.includes(session.role);

        // Robust query: uses COALESCE for columns that may not exist in all environments
        // Avoids referencing ib.barcode and p.is_active directly to prevent schema mismatch errors
        const sql = `
            SELECT
                p.id, p.sku, p.name, '' as description,
                COALESCE(p.format, 'Unidad') as format, l.name as location_name,
                ${canSeeStock ? 'COALESCE(SUM(ib.quantity_real), 0) as stock,' : ''}
                COALESCE(MAX(ib.sale_price), MAX(p.price), 0) as price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text AND ib.location_id::text = $2
            LEFT JOIN locations l ON l.id::text = $2
            WHERE (p.name ILIKE $1 OR p.sku ILIKE $1)
            GROUP BY p.id, p.sku, p.name, l.name, p.format
            LIMIT 20
        `;

        const result = await query(sql, [`%${sanitizedTerm}%`, locationId]);

        const data: ProductResult[] = result.rows.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            sku: row.sku as string,
            name: row.name as string,
            description: row.description as string,
            format: row.format as string,
            price: Number(row.price),
            stock: canSeeStock ? Number(row.stock) : undefined,
            location_name: (row.location_name as string) || 'Sucursal',
        }));

        return { success: true, data };

    } catch (error: unknown) {
        const err = error as Error;
        logger.error({ error: err.message, stack: err.stack }, '[Products] Search error');
        return { success: false, error: `Error en búsqueda: ${err.message}` };
    }
}
