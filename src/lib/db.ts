import { Pool } from 'pg';

// Detectar entorno
const isProduction = process.env.NODE_ENV === 'production';

// Configuración robusta
const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

// Singleton Pattern corregido para TypeScript
let pool: Pool;

if (!global.postgresPool) {
    global.postgresPool = new Pool(connectionConfig);
}
pool = global.postgresPool;

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
