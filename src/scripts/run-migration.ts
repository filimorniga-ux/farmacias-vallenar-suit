import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    console.log('🚀 Iniciando migración 003_fix_terminals_integrity.sql ...');

    const migrationPath = path.join(process.cwd(), 'src/db/migrations/003_fix_terminals_integrity.sql');

    if (!fs.existsSync(migrationPath)) {
        console.error('❌ Archivo de migración no encontrado:', migrationPath);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    const client = await pool.connect();

    try {
        console.log('📡 Conectado a BD. Ejecutando SQL...');

        // Ejecutar toda la migración como un bloque (ya tiene BEGIN/COMMIT)
        await client.query(sql);

        console.log('✅ Migración completada exitosamente.');

    } catch (error) {
        console.error('❌ Error en migración:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
