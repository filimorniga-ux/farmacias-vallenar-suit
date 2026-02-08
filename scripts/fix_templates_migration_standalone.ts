import { Pool } from 'pg';

const connectionString = "postgres://tsdbadmin:sx0c226s5wbwh8ry@o1fxkrx8c7.m1xugm0lj9.tsdb.cloud.timescale.com:35413/tsdb?sslmode=no-verify";

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Force SSL for cloud DB
});

async function migrate() {
    console.log('Aplicando migración de plantillas (Standalone)...');
    try {
        const client = await pool.connect();
        console.log('✅ Conectado a la BD.');

        await client.query(`
      ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 0;
    `);
        console.log('- Columna break_minutes agregada (o ya existía).');

        await client.query(`
      ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS is_rest_day BOOLEAN DEFAULT FALSE;
    `);
        console.log('- Columna is_rest_day agregada (o ya existía).');

        client.release();
        console.log('Migración completada exitosamente.');
    } catch (error) {
        console.error('Error durante la migración:', error);
    } finally {
        await pool.end();
    }
}

migrate();
