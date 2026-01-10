'use server';

import { query } from '@/lib/db';

export async function getFiltersAction() {
    try {
        const categories = await query('SELECT id, name FROM categories ORDER BY name ASC');
        const laboratories = await query('SELECT id, name FROM laboratories ORDER BY name ASC');
        const actions = await query('SELECT id, name FROM therapeutic_actions ORDER BY name ASC');

        return {
            categories: categories.rows,
            laboratories: laboratories.rows,
            actions: actions.rows
        };
    } catch (error) {
        console.error('❌ Error fetching filters:', error);
        return { categories: [], laboratories: [], actions: [] };
    }
}
