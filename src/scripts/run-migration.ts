import { pool } from '../lib/db';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
    const migrationPath = path.join(__dirname, '../../migrations/add_retail_lot_columns.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    const client = await pool.connect();
    try {
        console.log('🚀 Iniciando migración...');
        await client.query(sql);
        console.log('✅ Migración completada con éxito.');
    } catch (error) {
        console.error('❌ Error ejecutando migración:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
