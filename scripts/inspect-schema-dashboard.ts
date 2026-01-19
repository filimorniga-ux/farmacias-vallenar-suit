
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pharmadb',
});

async function inspect() {
    console.log('--- INSPECTING SCHEMA TYPES ---');

    // Check specific columns suspect of type mismatch
    const checks = [
        { table: 'terminals', col: 'id' },
        { table: 'terminals', col: 'location_id' },
        { table: 'sales', col: 'terminal_id' },
        { table: 'sales', col: 'location_id' },
        { table: 'cash_register_sessions', col: 'terminal_id' },
        { table: 'cash_register_sessions', col: 'user_id' },
        { table: 'attendance_logs', col: 'user_id' },
        { table: 'attendance_logs', col: 'location_id' },
        { table: 'users', col: 'id' },
        { table: 'cash_movements', col: 'terminal_id' }
    ];

    for (const c of checks) {
        const res = await pool.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = '${c.table}' AND column_name = '${c.col}'
        `);
        const type = res.rows[0]?.data_type || 'MISSING';
        console.log(`${c.table}.${c.col} = ${type}`);
    }

    await pool.end();
}

inspect().catch(console.error);
