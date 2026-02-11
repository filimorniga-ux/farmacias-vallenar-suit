import 'server-only';
import { Pool } from 'pg';

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
const isCloudDB = process.env.DATABASE_URL?.includes('tsdb.cloud.timescale.com');

const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: (isProduction || isCloudDB) ? { rejectUnauthorized: false } : undefined,
    max: 10, // Reduced from 20 to 10 to avoid connection limits in cloud tiers
    connectionTimeoutMillis: 30000, // Reduced to 30s to fail faster and retry
    idleTimeoutMillis: 10000, // Reduced to 10s to release clients faster
    keepAlive: true,
};

// Singleton Pattern corrected for Next.js Fast Refresh
export let pool: Pool;

// Configurar Timezone Global
const setLocalTimezone = (client: any) => {
    client.query("SET TIME ZONE 'America/Santiago'")
        .catch((err: any) => console.error('❌ Error setting timezone to Chile:', err.message));
};

if (isProduction) {
    console.log('🔌 [DB] Creating Production Pool...');
    pool = new Pool(connectionConfig);

    // Configurar Timezone al conectar
    pool.on('connect', setLocalTimezone);

    // Error handler para producción
    pool.on('error', (err) => {
        console.error('🔥 [DB] Unexpected pool error in production:', err.message);
    });
} else {
    if (!global.postgresPool) {
        console.log('🔌 Initializing PostgreSQL Pool (Dev)...');
        try {
            global.postgresPool = new Pool(connectionConfig);

            // Configurar Timezone al conectar
            global.postgresPool.on('connect', setLocalTimezone);

            // Test connection immediately
            global.postgresPool.on('error', (err) => {
                console.error('🔥 Unexpected error on idle client', err.message);
            });

            global.postgresPool.connect().then(client => {
                console.log('✅ Database connected successfully');
                client.release();
            }).catch(err => {
                console.error('❌ FATAL: Could not connect to database:', err.message);
            });

        } catch (err) {
            console.error('❌ Failed to create pool:', err);
        }
    }
    pool = global.postgresPool as Pool;
}

// Hack de tipo global
declare global {
    var postgresPool: Pool | undefined;
}

// Función Query Exportada con Reintentos
export async function query(text: string, params?: any[]) {
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
            return client;
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
