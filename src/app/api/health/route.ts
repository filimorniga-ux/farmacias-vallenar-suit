import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
    try {
        // Medir latencia de DB
        const start = Date.now();
        await pool.query('SELECT 1');
        const dbLatency = Date.now() - start;

        return NextResponse.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            uptime: process.uptime(),
            database: {
                connected: true,
                latencyMs: dbLatency,
                poolTotal: pool.totalCount,
                poolIdle: pool.idleCount,
                poolWaiting: pool.waitingCount
            },
            version: process.env.npm_package_version || '1.0.0'
        }, {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });
    } catch (error: any) {
        console.error('❌ Health Check Failed:', error);
        return NextResponse.json(
            {
                status: 'unhealthy',
                error: 'Database connection failed',
                details: error.message,
                timestamp: new Date().toISOString()
            },
            { status: 503 }
        );
    }
}
