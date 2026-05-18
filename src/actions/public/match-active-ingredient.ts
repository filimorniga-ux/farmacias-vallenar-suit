'use server';

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
    enforcePublicSearchGuard,
    normalizePublicSearchTerm,
} from './public-search-guard';

/**
 * Busca si el nombre del producto contiene algún principio activo conocido en la base de datos ISP.
 * Retorna el principio activo más largo encontrado (para priorizar "PARACETAMOL COMPUESTO" sobre "PARACETAMOL").
 */
export async function matchActiveIngredientAction(productName: string): Promise<string | null> {
    if (!await enforcePublicSearchGuard('match-active-ingredient')) return null;

    const cleanProductName = normalizePublicSearchTerm(productName);
    if (cleanProductName.length < 2) return null;

    try {
        // Normalizamos el nombre del producto para la búsqueda
        const normalizedName = cleanProductName.toUpperCase();

        // Buscamos principios activos que estén contenidos dentro del nombre del producto.
        // Ordenamos por longitud descendente para encontrar la coincidencia más específica.
        // Ej: Si el nombre tiene "PARACETAMOL CAFEINA", queremos que haga match con eso antes que solo "PARACETAMOL".
        const sql = `
            SELECT active_ingredient
            FROM bioequivalents
            WHERE $1 ILIKE '%' || active_ingredient || '%'
            ORDER BY LENGTH(active_ingredient) DESC
            LIMIT 1;
        `;

        const result = await query(sql, [normalizedName]);

        if (result.rows.length > 0) {
            return result.rows[0].active_ingredient;
        }

        return null;
    } catch (error) {
        logger.error({ error }, '[PublicSearch] Active ingredient match failed');
        return null;
    }
}
