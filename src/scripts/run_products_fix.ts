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
    console.log('🚀 Iniciando corrección de esquema de productos...');

    const migrationPath = path.join(process.cwd(), 'src/domain/db/fix_products_schema.sql');

    if (!fs.existsSync(migrationPath)) {
        console.error('❌ Archivo de migración no encontrado:', migrationPath);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    const client = await pool.connect();

    try {
        console.log('📡 Conectado a BD. Ejecutando SQL...');

        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');

        console.log('✅ Corrección completada exitosamente.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error en migración:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
