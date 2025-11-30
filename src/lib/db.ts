import { Pool } from 'pg';

// Detectar si estamos en Producción (Vercel) o Desarrollo
const isProduction = process.env.NODE_ENV === 'production';

// Configuración de conexión
const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction
        ? { rejectUnauthorized: true } // Producción: SSL Estricto (Tiger Data lo requiere)
        : { rejectUnauthorized: false }, // Local: SSL Permisivo (Para evitar errores de certificado propio)
    max: 10, // Límite de conexiones para no saturar (Serverless friendly)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Singleton para evitar múltiples pools en hot-reload
let pool: Pool;

if (!global.postgresPool) {
    global.postgresPool = new Pool(connectionConfig);
}
export { pool };
// Hack para TypeScript global scope
declare global {
    var postgresPool: Pool | undefined;
}

export async function query(text: string, params?: any[]) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // Log solo en desarrollo para no ensuciar producción
        if (!isProduction) {
            console.log('Ejecutando query', { text, duration, rows: res.rowCount });
        }
        return res;
    } catch (error) {
        console.error('❌ Error Base de Datos:', error);
        // Retornamos error para que el Frontend sepa que falló y active el modo Offline si es necesario
        throw error;
    }
}
