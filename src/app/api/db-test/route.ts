import { pool } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const startTime = Date.now();
    
    try {
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
            data: result.rows[0],
            connection: {
                elapsed_ms: elapsed,
                pool_total: pool.totalCount,
                pool_idle: pool.idleCount,
                pool_waiting: pool.waitingCount
            },
            env: {
                DATABASE_URL: process.env.DATABASE_URL ? 'CONFIGURED' : 'MISSING',
                NODE_ENV: process.env.NODE_ENV
            }
        });
    } catch (error: any) {
        const elapsed = Date.now() - startTime;
        
        return NextResponse.json({ 
            success: false, 
            error: error.message,
            code: error.code,
            elapsed_ms: elapsed,
            env: {
                DATABASE_URL: process.env.DATABASE_URL ? 'CONFIGURED' : 'MISSING',
                NODE_ENV: process.env.NODE_ENV
            }
        }, { status: 500 });
    }
}
