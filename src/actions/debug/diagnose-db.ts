'use server';

import { pool } from '@/lib/db';
import fs from 'fs';
import path from 'path';

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
        diagnosis.connectionStatus = 'SUCCESS';
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

        client.release();

        // 5. File System Check (ISP CSV) - CRITICAL FOR BIOEQUIVALENTS
        try {
            const candidates = [
                path.join(process.cwd(), 'public', 'data', 'isp_oficial.csv'),
                path.join(process.cwd(), 'data', 'isp_oficial.csv'),
                path.join(process.cwd(), 'isp_oficial.csv')
            ];

            const foundPath = candidates.find(c => fs.existsSync(c));

            (diagnosis as any).fileSystem = {
                cwd: process.cwd(),
                csvFound: foundPath || 'NOT FOUND',
                // List first 10 files in logical directories to debug Vercel structure
                rootDir: fs.readdirSync(process.cwd()).slice(0, 5),
                publicDir: fs.existsSync(path.join(process.cwd(), 'public')) ? fs.readdirSync(path.join(process.cwd(), 'public')).slice(0, 5) : 'MISSING',
            };
        } catch (fsErr: any) {
            (diagnosis as any).fsError = fsErr.message;
        }

    } catch (err: any) {
        console.error('❌ [DIAGNOSTIC] FAILURE:', err);
        diagnosis.connectionStatus = 'FAILED';
        diagnosis.error = err.message || JSON.stringify(err);
    }

    return diagnosis;
}
