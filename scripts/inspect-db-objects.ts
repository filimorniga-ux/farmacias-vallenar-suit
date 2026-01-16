import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { Pool } = pg;

async function main() {
    console.log('🔌 Inspecting DB objects...');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });

    try {
        // Inspect audit_log and ai_usage_log columns
        const colQuery = `
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_name = 'inventory_imports' 
            ORDER BY ordinal_position;
        `;
        const colRes = await pool.query(colQuery);
        console.log('\n--- Column Types ---');
        console.table(colRes.rows);

        // Inspect check_invoice_duplicate function definition
        const funcQuery = `
            SELECT pg_get_functiondef(oid) as def
            FROM pg_proc 
            WHERE proname = 'audit_log_calculate_checksum';
        `;
        const funcRes = await pool.query(funcQuery);
        console.log('\n--- Function Definitions ---');
        funcRes.rows.forEach(r => console.log(r.def));

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

main();
