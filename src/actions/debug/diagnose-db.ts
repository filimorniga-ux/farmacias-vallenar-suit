'use server';

import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getValidatedSession } from '@/lib/server-session';
import { normalizeRole } from '@/lib/pin-rbac';
import fs from 'fs';
import path from 'path';

type Diagnosis = {
    envVarExists: boolean;
    nodeEnv: string | undefined;
    connectionStatus: 'PENDING' | 'SUCCESS' | 'FAILED';
    error: string | null;
    timestamp: string | null;
    sslConfig: string;
    dataCounts?: {
        products: unknown;
        batches: unknown;
    };
    dataError?: string;
    fileSystem?: {
        csvFound: boolean;
        publicDirPresent: boolean;
    };
    fsError?: string;
};

export async function diagnoseDbConnection() {
    const diagnosis: Diagnosis = {
        envVarExists: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV,
        connectionStatus: 'PENDING',
        error: null as string | null,
        timestamp: null as string | null,
        sslConfig: 'Unknown'
    };

    const session = await getValidatedSession();
    const role = normalizeRole(session?.role);

    if (!session || !['ADMIN', 'GERENTE_GENERAL'].includes(role)) {
        return {
            ...diagnosis,
            connectionStatus: 'FAILED' as const,
            error: 'Acceso denegado',
        };
    }

    try {
        // 1. Check Env Var format (basic sanity check)
        const url = process.env.DATABASE_URL || '';
        if (url.includes('@')) {
            diagnosis.sslConfig = url.includes('sslmode') ? 'Detected in URL' : 'Missing in URL';
        }

        // 2. Attempt Connection
        const client = await pool.connect();
        diagnosis.connectionStatus = 'SUCCESS';

        // 3. Run Query
        const res = await client.query('SELECT NOW() as now, version() as version');
        diagnosis.timestamp = res.rows[0].now;

        // 4. Check Data Counts
        try {
            const countProducts = await client.query('SELECT COUNT(*) as count FROM products');
            const countBatches = await client.query('SELECT COUNT(*) as count FROM inventory_batches');
            diagnosis.dataCounts = {
                products: countProducts.rows[0].count,
                batches: countBatches.rows[0].count
            };
        } catch (e: unknown) {
            diagnosis.dataError = 'No fue posible contar datos';
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

            diagnosis.fileSystem = {
                csvFound: Boolean(foundPath),
                publicDirPresent: fs.existsSync(path.join(process.cwd(), 'public')),
            };
        } catch (fsErr: unknown) {
            diagnosis.fsError = 'No fue posible verificar archivos locales';
        }

    } catch (err: unknown) {
        logger.error({ error: err }, '[DiagnoseDb] Diagnostic failed');
        diagnosis.connectionStatus = 'FAILED';
        diagnosis.error = 'No fue posible conectar a la base de datos';
    }

    return diagnosis;
}
