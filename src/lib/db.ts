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
const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Tiger Cloud requires SSL
    max: 30,
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 30000,
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

    // Test inicial de conexión en producción
    pool.connect()
        .then(client => {
            console.log('✅ [DB] Production connection successful');
            client.release();
        })
        .catch(err => {
            console.error('❌ [DB] Production connection FAILED:', err.message);
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
                console.error('🔥 Unexpected error on idle client', err);
            });

            global.postgresPool.connect().then(client => {
                console.log('✅ Database connected successfully to:', connectionConfig.connectionString?.split('@')[1]);
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

// Función Query Exportada
export async function query(text: string, params?: any[]) {
    const start = Date.now();
    try {
        // AQUI ESTABA EL ERROR: Usamos 'pool!' para asegurar que no es null
        const res = await pool.query(text, params);
        const duration = Date.now() - start;

        if (!isProduction) {
            console.log('Ejecutando query', { text, duration, rows: res.rowCount });
        }
        return res;
    } catch (error) {
        console.error('❌ Error Base de Datos:', error);
        throw error;
    }
}

// Función Helper para obtener un cliente de la pool (para transacciones)
export async function getClient() {
    const client = await pool.connect();
    return client;
}
