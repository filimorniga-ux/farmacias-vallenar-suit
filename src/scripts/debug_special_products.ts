
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || '';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function verifyData() {
    try {
        console.log('--- Checking Products starting with Numbers/Special Chars ---');

        // Query products where name starts with non-letter
        const res = await pool.query(`
            SELECT name, category 
            FROM products 
            WHERE name !~ '^[a-zA-Z]' 
            LIMIT 20
        `);

        console.table(res.rows);

        console.log('\n--- Checking "OTROS" Category Examples ---');
        const resOtros = await pool.query(`
            SELECT name, category 
            FROM products 
            WHERE category = 'OTROS'
            LIMIT 10
        `);
        console.table(resOtros.rows);

        console.log('\n--- Checking "SIN ASIGNACION" Category Examples ---');
        const resNone = await pool.query(`
            SELECT name, category 
            FROM products 
            WHERE category = 'SIN ASIGNACION'
            LIMIT 10
        `);
        console.table(resNone.rows);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

verifyData();
