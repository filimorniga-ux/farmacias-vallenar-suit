import { Pool } from 'pg';

// Detectar entorno
const isProduction = process.env.NODE_ENV === 'production';

// Configuración robusta
const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 20000, // Increased to 20s
    idleTimeoutMillis: 30000,
    keepAlive: true,
};

// Singleton Pattern corregido para TypeScript
export let pool: Pool;

if (!global.postgresPool) {
    console.log('🔌 Initializing PostgreSQL Pool...');
    try {
        global.postgresPool = new Pool(connectionConfig);

        // Test connection immediately
        global.postgresPool.on('error', (err) => {
            console.error('🔥 Unexpected error on idle client', err);
        });

        global.postgresPool.connect().then(client => {
            console.log('✅ Database connected successfully to:', connectionConfig.connectionString?.split('@')[1]); // Log host only for security
            client.release();
        }).catch(err => {
            console.error('❌ FATAL: Could not connect to database:', err.message);
        });

    } catch (err) {
        console.error('❌ Failed to create pool:', err);
    }
}
pool = global.postgresPool as Pool;

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
