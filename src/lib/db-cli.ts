import { Pool } from 'pg';
import 'dotenv/config'; // Ensure env vars are loaded in CLI

// Detectar entorno
const isProduction = process.env.NODE_ENV === 'production';

// Configuración robusta para CLI
const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5, // Lower connection limit for CLI tools is fine
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
};

// Singleton manual for script execution
let pool: Pool;

if (!global.postgresPoolCli) {
    global.postgresPoolCli = new Pool(connectionConfig);
    // Simple error handler prevents crash on idle clients
    global.postgresPoolCli.on('error', (err) => {
        console.error('🔥 Unexpected error on idle CLI client', err);
        process.exit(-1);
    });
}
pool = global.postgresPoolCli;

// Hack de tipo global
declare global {
    var postgresPoolCli: Pool | undefined;
}

export { pool };

export async function query(text: string, params?: any[]) {
    return pool.query(text, params);
}
