import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
const { Pool } = pg;
async function main() {
    console.log('🔌 Inspecting products constraints...');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        const query = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'products'
            ORDER BY ordinal_position;
        `;
        const res = await pool.query(query);
        console.table(res.rows);
    } catch (e) { console.error(e); } finally { await pool.end(); }
}
main();
