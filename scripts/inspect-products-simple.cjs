
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pharmadb' // HACK: Asumo local por defecto o env var
});

async function main() {
    try {
        const client = await pool.connect();
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'products'
        `);
        console.log(res.rows);
        client.release();
    } catch (e) {
        console.log('Error:', e.message); // Log error message
    } finally {
        await pool.end();
    }
}
main();
