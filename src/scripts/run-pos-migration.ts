import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function runMigration() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        const sqlPath = path.join(process.cwd(), 'migrations/create_sales_tables.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Ejecutando SQL...');
        await client.query(sql);
        console.log('Migración exitosa.');
    } catch (e) {
        console.error('Error en migración:', e);
    } finally {
        await client.end();
    }
}

runMigration();
