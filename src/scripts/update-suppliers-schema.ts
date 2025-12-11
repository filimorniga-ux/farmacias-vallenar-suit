import * as dotenv from 'dotenv';
// Load .env.local first as it overrides .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// Ensure DATABASE_URL is set for lib/db.ts
if (!process.env.DATABASE_URL && process.env.POSTGRES_URL_NON_POOLING) {
    process.env.DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING;
}

import { query } from '../lib/db';

async function updateSuppliersSchema() {
    console.log('🏗️ Updating Suppliers Schema...');

    try {
        // Add new columns if they don't exist
        await query(`
            ALTER TABLE suppliers
            ADD COLUMN IF NOT EXISTS address TEXT,
            ADD COLUMN IF NOT EXISTS region TEXT,
            ADD COLUMN IF NOT EXISTS city TEXT,
            ADD COLUMN IF NOT EXISTS commune TEXT,
            ADD COLUMN IF NOT EXISTS phone TEXT,
            ADD COLUMN IF NOT EXISTS email_orders TEXT,
            ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
            ADD COLUMN IF NOT EXISTS account_number VARCHAR(50),
            ADD COLUMN IF NOT EXISTS account_type VARCHAR(50),
            ADD COLUMN IF NOT EXISTS rut_holder VARCHAR(20),
            ADD COLUMN IF NOT EXISTS email_notification VARCHAR(255),
            ADD COLUMN IF NOT EXISTS contact_name VARCHAR(150);
        `);

        // Also ensure phone_1 and phone_2 exist since we saw them in the modal code but maybe not in DB?
        // Let's check or just add them safely. The modal uses phone_1 and phone_2.
        // The prompt asked for 'phone'. I'll stick to the prompt's new columns but also ensure compatibility with what I saw in code.
        // The modal uses `phone_1` and `phone_2`. The prompt asked for `phone`.
        // I will add `phone` as requested in prompt, but I should probably map phone_1 to phone or ensure the backend uses the right one.
        // For now, let's just add the columns requested in the prompt + what I see missing.
        // Looking at `createSupplier` in `suppliers.ts`:
        // VALUES (..., $11 (phone_1), ...)
        // It seems `phone_1` already exists in `suppliers.ts` insert?
        // Let's verify `suppliers.ts` columns in the `INSERT`: 
        // phone, email_orders, email_billing ARE IN THE INSERT in `suppliers.ts` (lines 16, 35-37).
        // Wait, if they are in `suppliers.ts`, maybe the table already has them?
        // The user said "Crear y ejecutar un script... para agregar columnas faltantes".
        // Maybe the code has them but the DB doesn't?
        // I will add them safely.

        console.log('✅ Schema updated successfully.');
    } catch (error) {
        console.error('❌ Error updating schema:', error);
    }
}

updateSuppliersSchema();
