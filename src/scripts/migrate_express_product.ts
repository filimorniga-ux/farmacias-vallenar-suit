
import { pool } from '../lib/db';

async function migrate() {
    console.log('Starting migration: Add Express Product columns...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if column exists
        const check = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='products' AND column_name='registration_source';
        `);

        if (check.rowCount === 0) {
            console.log('Adding specific columns...');
            await client.query(`
                ALTER TABLE products 
                ADD COLUMN registration_source VARCHAR(50) DEFAULT 'MANUAL',
                ADD COLUMN is_express_entry BOOLEAN DEFAULT FALSE;
            `);
            console.log('Columns added successfully.');
        } else {
            console.log('Columns already exist. Skipping.');
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
