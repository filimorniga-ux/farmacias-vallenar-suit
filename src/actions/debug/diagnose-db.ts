'use server';

import { pool } from '@/lib/db';

export async function diagnoseDbConnection() {
    console.log('🕵️‍♂️ [DIAGNOSTIC] Starting DB Check...');

    const diagnosis = {
        envVarExists: !!process.env.DATABASE_URL,
        envVarLength: process.env.DATABASE_URL?.length || 0,
        nodeEnv: process.env.NODE_ENV,
        connectionStatus: 'PENDING',
        error: null as string | null,
        timestamp: null as string | null,
        sslConfig: 'Unknown'
    };

    try {
        // 1. Check Env Var format (basic sanity check)
        const url = process.env.DATABASE_URL || '';
        if (url.includes('@')) {
            const [creds, hostpart] = url.split('@');
            diagnosis.sslConfig = url.includes('sslmode') ? 'Detected in URL' : 'Missing in URL';
        }

        // 2. Attempt Connection
        const start = Date.now();
        console.log('🕵️‍♂️ [DIAGNOSTIC] Connecting to Pool...');
        const client = await pool.connect();
        console.log(`✅ [DIAGNOSTIC] Connected in ${Date.now() - start}ms`);

        // 3. Run Query
        const res = await client.query('SELECT NOW() as now, version() as version');
        diagnosis.timestamp = res.rows[0].now;

        // 4. Check Data Counts
        try {
            const countProducts = await client.query('SELECT COUNT(*) as count FROM products');
            const countBatches = await client.query('SELECT COUNT(*) as count FROM inventory_batches');
            (diagnosis as any).dataCounts = {
                products: countProducts.rows[0].count,
                batches: countBatches.rows[0].count
            };
        } catch (e: any) {
            (diagnosis as any).dataError = e.message;
        }

        diagnosis.connectionStatus = 'SUCCESS';

        client.release();
    } catch (err: any) {
        console.error('❌ [DIAGNOSTIC] FAILURE:', err);
        diagnosis.connectionStatus = 'FAILED';
        diagnosis.error = err.message || JSON.stringify(err);
    }

    return diagnosis;
}
