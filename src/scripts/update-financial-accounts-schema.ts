
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🏗️ Updating Financial Accounts Schema...');

        // 1. Add is_active column if it doesn't exist
        console.log('   - Checking is_active column...');
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_accounts' AND column_name='is_active') THEN 
                    ALTER TABLE financial_accounts ADD COLUMN is_active BOOLEAN DEFAULT TRUE; 
                    RAISE NOTICE 'Added is_active column';
                END IF; 
            END $$;
        `);

        // 2. Update Type Constraint
        console.log('   - Updating Type Constraint...');
        // First drop the old check constraint (name might vary, so we try standard names or force drop)
        // We'll try to find the constraint name first or just generic DROP

        // This query finds the constraint name for the 'type' column check
        const constraintRes = await client.query(`
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'financial_accounts'::regclass
            AND contype = 'c'
            AND pg_get_constraintdef(oid) LIKE '%type%';
        `);

        if (constraintRes.rows.length > 0) {
            for (const row of constraintRes.rows) {
                console.log(`     Dropping constraint: ${row.conname}`);
                await client.query(`ALTER TABLE financial_accounts DROP CONSTRAINT "${row.conname}"`);
            }
        }

        // Now add the new constraint
        await client.query(`
            ALTER TABLE financial_accounts 
            ADD CONSTRAINT financial_accounts_type_check 
            CHECK (type IN ('SAFE', 'BANK', 'PETTY_CASH', 'EQUITY'));
        `);

        console.log('✅ Schema Updated Successfully.');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
