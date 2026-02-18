import 'server-only';
import { Pool, type PoolClient } from 'pg';
export type { PoolClient };

// Detectar entorno
const isProduction = process.env.NODE_ENV === 'production';

// Debug: Log environment
if (isProduction) {
    console.log('🔌 [DB] Production Mode - DATABASE_URL:', process.env.DATABASE_URL ? 'CONFIGURED' : '❌ MISSING');
} else {
    console.log('🔌 [DB] Development Mode - DATABASE_URL:', process.env.DATABASE_URL ? 'CONFIGURED' : '❌ MISSING');
}

// Validar que DATABASE_URL existe
if (!process.env.DATABASE_URL) {
    console.error('❌ CRITICAL: DATABASE_URL environment variable is not set!');
}

// Configuración robusta
const dbUrl = process.env.DATABASE_URL || '';
const isCloudDB = dbUrl.includes('tsdb.cloud.timescale.com') || dbUrl.includes('m1xugm0lj9');
const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

// SSL Config: Force rejectUnauthorized: false for cloud/remote
const sslConfig = (!isLocalhost || isCloudDB) ? { rejectUnauthorized: false } : undefined;

if (!isProduction) {
    console.log(`🔌 [DB] Environment Trace:`, {
        isCloudDB,
        isLocalhost,
        hasSSL: !!sslConfig,
        sslMode: sslConfig ? 'REJECT_UNAUTHORIZED_FALSE' : 'NONE'
    });
}

const connectionConfig = {
    connectionString: dbUrl,
    ssl: sslConfig,
    max: 20, // Increased to 20 to handle concurrent sync operations
    connectionTimeoutMillis: 15000, // 15s timeout for handshake
    idleTimeoutMillis: 30000,
    keepAlive: true,
};

// Singleton Pattern corrected for Next.js Fast Refresh
export let pool: Pool;

// Configurar Timezone Global
const setLocalTimezone = (client: PoolClient) => {
    client.query("SET TIME ZONE 'America/Santiago'")
        .catch((err: Error) => console.error('❌ Error setting timezone to Chile:', err.message));
};

if (isProduction) {
    console.log('🔌 [DB] Creating Production Pool...');
    pool = new Pool(connectionConfig);
    pool.on('connect', setLocalTimezone);
    pool.on('error', (err) => console.error('🔥 [DB] Unexpected pool error in production:', err.message));
} else {
    // Force recreation if config changes during dev (Hot Reload safety)
    const currentPool = global.postgresPool as any;
    const needsRecreation = !currentPool || currentPool._lastUrl !== dbUrl;

    if (needsRecreation) {
        if (currentPool) {
            console.log('🔌 [DB] Configuration changed, closing old pool...');
            currentPool.end().catch(() => { });
        }

        console.log('🔌 [DB] Initializing PostgreSQL Pool (Dev)...');
        try {
            const newPool = new Pool(connectionConfig) as any;
            newPool._lastUrl = dbUrl; // Store URL for comparison

            newPool.on('connect', setLocalTimezone);
            newPool.on('error', (err: any) => console.error('🔥 [DB] Unexpected error on idle client:', err.message));

            newPool.connect()
                .then((client: PoolClient) => {
                    console.log('✅ [DB] Connected successfully to:', dbUrl.split('@')[1] || 'DB');
                    client.release();
                })
                .catch((err: Error) => {
                    console.error('❌ [DB] FATAL: Could not connect:', err.message);
                });

            global.postgresPool = newPool;
        } catch (err) {
            console.error('❌ [DB] Failed to create pool:', err);
        }
    }
    pool = global.postgresPool as Pool;
}

// Hack de tipo global
declare global {
    var postgresPool: Pool | undefined;
}

// Función Query Exportada con Reintentos
export async function query(text: string, params?: (string | number | boolean | Date | null | undefined)[]) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;
    const start = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await pool.query(text, params);
            const duration = Date.now() - start;

            if (!isProduction && duration > 1000) {
                console.log('⚠️ Query Lenta:', { duration, rows: res.rowCount, text: text.substring(0, 100) + '...' });
            }
            return res;
        } catch (error: any) {
            const duration = Date.now() - start;
            const isLastAttempt = attempt === MAX_RETRIES;
            const isTransientError = [
                'ECONNREFUSED',
                'ECONNRESET',
                'ETIMEDOUT',
                '57P01', // admin_shutdown
                '57P02', // crash_shutdown
                '57P03', // cannot_connect_now
                '08001', // sql_client_unable_to_establish_sql_connection
                '08003', // connection_does_not_exist
                '08006', // connection_failure
            ].includes(error.code) || error.message?.includes('aborted');

            if (isLastAttempt || !isTransientError) {
                console.error(`❌ [DB] Error Fatal (Intento ${attempt}/${MAX_RETRIES}):`, {
                    message: error.message,
                    code: error.code,
                    pool: {
                        total: pool.totalCount,
                        idle: pool.idleCount,
                        waiting: pool.waitingCount
                    }
                });
                throw error;
            }

            console.warn(`⚠️ [DB] Reintentando query por error transitorio "${error.code || 'aborted'}" (Intento ${attempt}/${MAX_RETRIES}) en ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt)); // Exponential backoff light
        }
    }
    throw new Error('Explosión en query tras reintentos');
}

// Función Helper para obtener un cliente de la pool (para transacciones)
export async function getClient() {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const client = await pool.connect();
            return client as PoolClient;
        } catch (error: any) {
            const isLastAttempt = attempt === MAX_RETRIES;
            const isTransient = error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || error.message?.includes('aborted');

            if (isLastAttempt || !isTransient) {
                console.error(`❌ [DB] Error obteniendo cliente (Intento ${attempt}/${MAX_RETRIES}):`, error.message);
                throw error;
            }

            console.warn(`⚠️ [DB] Reintentando conexión (Intento ${attempt}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
    }
    throw new Error('No se pudo obtener cliente de DB tras reintentos');
}
