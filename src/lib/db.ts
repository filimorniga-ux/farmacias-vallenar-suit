import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { isTransientPgConnectionError } from './db-errors';
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
const isCloudDB = dbUrl.includes('tsdb.cloud.timescale.com') || dbUrl.includes('m1xugm0lj9') || dbUrl.includes('supabase.com');
const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

// Postura runtime actual:
// para conexiones remotas seguimos usando TLS sin verificación de certificado
// hasta que infraestructura provea CA bundle o sslmode verificado.
// No duplicar esta decisión en routes/scripts ad-hoc; todo runtime debe reutilizar esta capa.
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
    max: 10, // Serverless limit logic
    connectionTimeoutMillis: 8000, // Reducido a 8s (Supabase es más rápido por su pooling IPv4)
    idleTimeoutMillis: 30000,
    keepAlive: true,
};

console.log('🔌 [DB-DEBUG] Connecting to host:', dbUrl.split('@')[1]?.split('/')[0] || 'Unknown');

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
    const currentPool = (global as any).postgresPool;
    const needsRecreation = !currentPool || currentPool._lastUrl !== dbUrl;

    if (needsRecreation) {
        if (currentPool) {
            console.log('🔌 [DB] Configuration changed, closing old pool...');
            currentPool.end().catch(() => { });
        }

        console.log('🔌 [DB] Initializing PostgreSQL Pool (Dev)...');
        try {
            const newPool = new Pool(connectionConfig) as Pool & { _lastUrl: string };
            newPool._lastUrl = dbUrl; // Store URL for comparison

            newPool.on('connect', setLocalTimezone);
            newPool.on('error', (err: Error) => console.error('🔥 [DB] Unexpected error on idle client:', err.message));

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
export async function query(text: string, params?: (string | number | boolean | Date | string[] | null | undefined)[]) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;
    const start = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await pool.query(text, params);
            return res;
        } catch (error: unknown) {
            const duration = Date.now() - start;
            const pgError = error as { code?: string; message?: string };
            const isLastAttempt = attempt === MAX_RETRIES;
            const isTransientError = isTransientPgConnectionError(pgError);

            if (isLastAttempt || !isTransientError) {
                console.error(`❌ [DB] Error Fatal (Intento ${attempt}/${MAX_RETRIES}):`, {
                    message: pgError.message,
                    code: pgError.code,
                    duration,
                    pool: {
                        total: pool.totalCount,
                        idle: pool.idleCount,
                        waiting: pool.waitingCount
                    }
                });
                throw error;
            }

            console.warn(`⚠️ [DB] Reintentando query por error transitorio "${pgError.code || 'aborted'}" (Intento ${attempt}/${MAX_RETRIES}) en ${RETRY_DELAY}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt)); // Exponential backoff light
        }
    }
    throw new Error('Explosión en query tras reintentos');
}

// Función Helper para obtener un cliente de la pool (para transacciones)
export async function getClient() {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;
    const start = Date.now();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const client = await pool.connect();
            return client as PoolClient;
        } catch (error: unknown) {
            const pgError = error as { code?: string; message?: string };
            const isLastAttempt = attempt === MAX_RETRIES;
            const isTransient = isTransientPgConnectionError(pgError);

            if (isLastAttempt || !isTransient) {
                console.error(`❌ [DB] Error obteniendo cliente (Intento ${attempt}/${MAX_RETRIES}):`, {
                    message: pgError.message,
                    code: pgError.code,
                    duration: Date.now() - start,
                    pool: {
                        total: pool.totalCount,
                        idle: pool.idleCount,
                        waiting: pool.waitingCount,
                    },
                });
                throw error;
            }

            console.warn(`⚠️ [DB] Reintentando conexión por error transitorio "${pgError.code || pgError.message || 'unknown'}" (Intento ${attempt}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
    }
    throw new Error('No se pudo obtener cliente de DB tras reintentos');
}
