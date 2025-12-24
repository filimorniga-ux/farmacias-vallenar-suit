
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        const res = await pool.query(`
            SELECT rut, name, role, access_pin 
            FROM users 
            WHERE status = 'ACTIVE' 
            AND role IN ('MANAGER', 'CASHIER')
            LIMIT 1
        `);

        if (res.rows.length > 0) {
            console.log(JSON.stringify(res.rows[0]));
        } else {
            console.error('No active users found');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
