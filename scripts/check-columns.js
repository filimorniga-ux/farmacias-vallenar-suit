
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

console.log('PG URL Loaded:', !!process.env.POSTGRES_URL);

// Intentar conexión simple sin SSL explícito si falla
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    // ssl: false // Desactivar si es local
});

async function checkSchema() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products';
    `);
        console.log('Columnas encontradas:', res.rows.map(r => r.column_name));

        const hasIsActive = res.rows.some(r => r.column_name === 'is_active');
        console.log('¿Existe is_active?', hasIsActive);

    } catch (err) {
        console.error('Error conectando:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkSchema();
