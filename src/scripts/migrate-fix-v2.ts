import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🚀 Starting Fix & Migration V2...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. HR Data Schema Updates
        console.log('👥 Updating HR Schema...');

        // Add columns if they don't exist
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS afp VARCHAR(50) DEFAULT 'MODELO'`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS isapre VARCHAR(50) DEFAULT 'FONASA'`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_hours INTEGER DEFAULT 45`);

        // Populate with realistic data
        console.log('📝 Populating HR Data...');
        const users = await client.query('SELECT id, role FROM users');

        for (const user of users.rows) {
            let afp = 'MODELO';
            let isapre = 'FONASA';
            const hours = 45;
            let salary = 500000;

            // Randomize slightly based on role
            if (user.role === 'ADMIN') {
                afp = ['CUPRUM', 'HABITAT'][Math.floor(Math.random() * 2)];
                isapre = ['COLMENA', 'BANMEDICA'][Math.floor(Math.random() * 2)];
                salary = 1200000 + Math.floor(Math.random() * 300000);
            } else if (user.role === 'QF') {
                afp = 'HABITAT';
                isapre = 'CONSALUD';
                salary = 1800000;
            } else {
                // VENDEDOR / CAJERO
                afp = ['MODELO', 'PLANVITAL'][Math.floor(Math.random() * 2)];
                isapre = 'FONASA';
                salary = 650000 + Math.floor(Math.random() * 100000);
            }

            await client.query(`
                UPDATE users 
                SET afp = $1, isapre = $2, weekly_hours = $3, base_salary = $4
                WHERE id = $5
            `, [afp, isapre, hours, salary, user.id]);
        }

        // 2. Fix Sales Timestamp (if needed)
        // Check column type
        const resType = await client.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'sales' AND column_name = 'timestamp'
        `);

        const dataType = resType.rows[0]?.data_type;
        console.log(`🕒 Current 'sales.timestamp' type: ${dataType}`);

        if (dataType !== 'timestamp without time zone' && dataType !== 'timestamp with time zone') {
            console.log('⚠️ Converting timestamp column to proper TIMESTAMP type...');
            // Assuming it might be BIGINT or text holding epoch
            // If it crashes, user data might be messy.
            await client.query(`
                ALTER TABLE sales 
                ALTER COLUMN timestamp TYPE TIMESTAMP WITHOUT TIME ZONE 
                USING to_timestamp(timestamp::double precision / 1000)
            `);
            console.log('✅ Converted sales.timestamp to TIMESTAMP');
        } else {
            console.log('✅ sales.timestamp is already a TIMESTAMP. No action needed.');
        }

        await client.query('COMMIT');
        console.log('🎉 Migration V2 Completed Successfully!');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Migration Failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
