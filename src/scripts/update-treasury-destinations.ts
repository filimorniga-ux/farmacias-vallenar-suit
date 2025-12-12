
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB for Treasury V4 Migration...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🏗️  Updating Treasury Schema Constraints...');

        // 1. Drop existing check constraint if it exists
        // We need to find the constraint name first, but usually it's auto-generated or we can try to drop by definition if supported.
        // Easiest way in raw SQL without knowing name is to alter column type (if unchanged) or just DROP CONSTRAINT if we know it.
        // Since we created it as inline CHECK (type IN ...), it often has a generated name like financial_accounts_type_check.
        // We will try to drop it.
        try {
            await client.query(`ALTER TABLE financial_accounts DROP CONSTRAINT IF EXISTS financial_accounts_type_check`);
            console.log('   - Dropped old constraint');
        } catch (e) {
            console.log('   ! Could not drop constraint (might not exist or different name). Ignoring...');
        }

        // 2. Add new Constraint
        await client.query(`
            ALTER TABLE financial_accounts 
            ADD CONSTRAINT financial_accounts_type_check 
            CHECK (type IN ('SAFE', 'BANK', 'PETTY_CASH', 'EQUITY'))
        `);
        console.log('   + Added new constraint (SAFE, BANK, PETTY_CASH, EQUITY)');

        // 3. Seed Accounts
        console.log('🌱 Seeding Financial Destinations...');

        // We attach these to the "Main" location usually, or make them global (no location_id implies global? Schema says location_id is likely required or ref)
        // Let's attach to the first "Store" found or a specific HQ if exists.
        // For simple single-tenant view, we'll attach to the location where the user is likely operating or just the first one found.
        const locRes = await client.query("SELECT id FROM locations LIMIT 1");
        if (locRes.rowCount === 0) throw new Error("No locations found");
        const locationId = locRes.rows[0].id; // Assign to first location for now

        const accountsToSeed = [
            { name: "Banco Estado - Cuenta Rut", type: "BANK" },
            { name: "Banco Santander - Cta Cte", type: "BANK" },
            { name: "Caja Chica - Gastos Menores", type: "PETTY_CASH" },
            { name: "Cuenta Socios/Dueños", type: "EQUITY" }
        ];

        for (const acc of accountsToSeed) {
            // Check existence by name (approximate) to avoid duplicates
            const check = await client.query("SELECT id FROM financial_accounts WHERE name = $1", [acc.name]);
            if (check.rowCount === 0) {
                await client.query(`
                    INSERT INTO financial_accounts (id, location_id, name, type, balance)
                    VALUES ($1, $2, $3, $4, 0)
                `, [uuidv4(), locationId, acc.name, acc.type]);
                console.log(`   + Created: ${acc.name}`);
            } else {
                console.log(`   . Exists: ${acc.name}`);
            }
        }

        console.log('✅ Treasury V4 Migration Complete.');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
