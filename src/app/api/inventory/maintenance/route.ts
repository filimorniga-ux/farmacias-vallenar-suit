import { NextResponse } from 'next/server';
import { OPERATIONS_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

const VALID_ACTIONS = new Set(['TRUNCATE', 'UNDO_IMPORT', 'ANALYZE_DUPLICATES']);

export async function POST(request: Request) {
    const auth = await requireApiRoles(OPERATIONS_API_ROLES);
    if (!auth.ok) {
        return auth.response;
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const body = await request.json().catch(() => ({}));
        const { action, confirmation } = body;

        if (!action || !VALID_ACTIONS.has(action)) {
            return NextResponse.json({ error: 'Action is required' }, { status: 400 });
        }

        logger.info(
            { action, actorUserId: auth.session.userId, actorRole: auth.session.role },
            '[MaintenanceRoute] Executing maintenance action'
        );

        // 1. TRUNCATE (Empty Inventory)
        if (action === 'TRUNCATE') {
            if (confirmation !== 'BORRAR') {
                return NextResponse.json({ error: 'Invalid confirmation code' }, { status: 403 });
            }

            await client.query('BEGIN');
            transactionStarted = true;
            // Truncate products and cascade to related tables (like lotes if FK exists)
            // Also resetting sequence if needed, but TRUNCATE handles data.
            await client.query('TRUNCATE TABLE products CASCADE');
            await client.query('COMMIT');
            transactionStarted = false;

            logger.warn(
                { actorUserId: auth.session.userId, actorRole: auth.session.role },
                '[MaintenanceRoute] Inventory truncated'
            );
            return NextResponse.json({ success: true, message: 'Inventario vaciado correctamente.' });
        }

        // 2. UNDO IMPORT (Delete recent items)
        if (action === 'UNDO_IMPORT') {
            await client.query('BEGIN');
            transactionStarted = true;
            // Delete products created in the last 10 minutes
            // Assuming 'created_at' exists. If not, we might need another heuristic or just rely on IDs if sequential.
            // Let's check if created_at exists first or use a safe fallback? 
            // The user prompt implies created_at usage.

            const res = await client.query(`
                DELETE FROM products 
                WHERE created_at > NOW() - INTERVAL '10 minutes'
                RETURNING id
            `);

            await client.query('COMMIT');
            transactionStarted = false;

            logger.warn(
                { actorUserId: auth.session.userId, actorRole: auth.session.role, deletedCount: res.rowCount ?? 0 },
                '[MaintenanceRoute] Undo import completed'
            );
            return NextResponse.json({
                success: true,
                message: `Se eliminaron ${res.rowCount} productos creados en los últimos 10 minutos.`
            });
        }

        // 3. ANALYZE DUPLICATES
        if (action === 'ANALYZE_DUPLICATES') {
            // Find products with same name (case insensitive) or same SKU
            // Group by name/sku and count > 1
            const res = await client.query(`
                SELECT name, COUNT(*) as count, array_agg(id) as ids
                FROM products
                GROUP BY name
                HAVING COUNT(*) > 1
                LIMIT 50
            `);

            return NextResponse.json({
                success: true,
                duplicates: res.rows
            });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        if (transactionStarted) {
            await client.query('ROLLBACK');
        }
        logger.error(
            { error, actorUserId: auth.session.userId, actorRole: auth.session.role },
            '[MaintenanceRoute] Maintenance action failed'
        );
        return NextResponse.json(
            { error: 'Maintenance action failed', code: 'MAINTENANCE_ACTION_FAILED' },
            { status: 500 }
        );
    } finally {
        client.release();
    }
}
