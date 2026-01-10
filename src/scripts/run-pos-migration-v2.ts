import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function runMigration() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        const sqlPath = path.join(process.cwd(), 'migrations/create_sales_tables_v2.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Ejecutando SQL v2...');
        await client.query(sql);
        console.log('Migración v2 exitosa.');
    } catch (e) {
        console.error('Error en migración v2:', e);
    } finally {
        await client.end();
    }
}

runMigration();
