import { pool } from '@/lib/db';
import { ADMIN_API_ROLES, requireApiRoles } from '@/lib/api-auth';
import { API_NO_STORE_HEADERS } from '@/lib/api-cache';
import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const startTime = Date.now();
    
    try {
        const auth = await requireApiRoles(ADMIN_API_ROLES);
        if (!auth.ok) {
            return auth.response;
        }

        // Test básico de conexión
        const result = await pool.query(`
            SELECT 
                NOW() as server_time, 
                current_database() as database_name,
                current_user as db_user,
                (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users
        `);
        
        const elapsed = Date.now() - startTime;
        
        return NextResponse.json({
            success: true,
            data: {
                server_time: result.rows[0]?.server_time,
                active_users: Number(result.rows[0]?.active_users || 0),
            },
            diagnostics: {
                elapsed_ms: elapsed,
            },
        }, { headers: API_NO_STORE_HEADERS });
    } catch (error: any) {
        const elapsed = Date.now() - startTime;
        logger.error({ error, elapsed }, '[DBTestRoute] Diagnostic failed');

        return NextResponse.json({
            success: false,
            error: 'No fue posible ejecutar el diagnóstico de base de datos',
            elapsed_ms: elapsed,
        }, { status: 500, headers: API_NO_STORE_HEADERS });
    }
}
