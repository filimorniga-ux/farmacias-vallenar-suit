
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function optimize() {
    console.log('🚀 Starting Database Optimization...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Login Optimization
        console.log('⚡ Optimizing Login Tables...');
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_rut ON users(rut)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_location ON users(assigned_location_id)`);
        // await client.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_id ON login_attempts(identifier)`); // Table might not exist yet

        // 2. Dashboard/Organization Optimization
        console.log('⚡ Optimizing Terminals & Sessions...');
        await client.query(`CREATE INDEX IF NOT EXISTS idx_terminals_location ON terminals(location_id)`);
        // Conditional index for active sessions (key for telemetry)
        await client.query(`CREATE INDEX IF NOT EXISTS idx_sessions_active ON cash_register_sessions(terminal_id) WHERE closed_at IS NULL`);

        // 3. Sales/Reporting Optimization
        console.log('⚡ Optimizing Sales...');
        await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_created_loc ON sales(location_id, timestamp DESC)`);

        await client.query('COMMIT');
        console.log('✅ Optimization Complete! Indices applied successfully.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Optimization Failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

optimize();
