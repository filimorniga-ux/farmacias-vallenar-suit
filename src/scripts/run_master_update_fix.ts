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
    console.log('🚀 Insertando código PRODUCT_MASTER_UPDATE...');

    const migrationPath = path.join(process.cwd(), 'src/domain/db/fix_master_update_code.sql');

    if (!fs.existsSync(migrationPath)) {
        console.error('❌ Archivo SQL no encontrado:', migrationPath);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    const client = await pool.connect();

    try {
        console.log('📡 Ejecutando SQL...');
        await client.query(sql);
        console.log('✅ Código insertado exitosamente.');

    } catch (error) {
        console.error('❌ Error insertando código:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
