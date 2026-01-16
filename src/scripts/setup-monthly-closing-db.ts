
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

console.log('🔌 Connecting to DB for Monthly Closing Setup...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🏗️  Creating Monthly Closings Table...');

        await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS monthly_closings (
                id UUID PRIMARY KEY,
                month INT NOT NULL,
                year INT NOT NULL,
                
                -- Income (Real/Declared)
                real_cash_income NUMERIC(12, 2) DEFAULT 0,
                real_bank_income NUMERIC(12, 2) DEFAULT 0,
                total_sales_income NUMERIC(12, 2) GENERATED ALWAYS AS (real_cash_income + real_bank_income) STORED,

                -- Expenses (Manual)
                fixed_expenses NUMERIC(12, 2) DEFAULT 0,
                variable_expenses NUMERIC(12, 2) DEFAULT 0,
                payroll_cost NUMERIC(12, 2) DEFAULT 0,
                social_security_cost NUMERIC(12, 2) DEFAULT 0,
                tax_cost NUMERIC(12, 2) DEFAULT 0,

                -- Result
                net_result NUMERIC(12, 2) GENERATED ALWAYS AS (
                    (real_cash_income + real_bank_income) - 
                    (fixed_expenses + variable_expenses + payroll_cost + social_security_cost + tax_cost)
                ) STORED,

                status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CLOSED')),
                notes TEXT,
                
                closed_by UUID, -- User ID
                closed_at TIMESTAMP,
                reopen_reason TEXT,
                reopened_by UUID,
                reopened_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),

                UNIQUE(month, year)
            );
        `);

        console.log('🏗️  Creating Monthly Closing Entries Table...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS monthly_closing_entries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
                year INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
                direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
                category TEXT NOT NULL CHECK (
                    category IN (
                        'CASH',
                        'TRANSFER_IN',
                        'CARD_INSTALLMENT',
                        'DAILY_EXPENSE',
                        'TRANSFER_OUT',
                        'PAYROLL',
                        'FIXED_EXPENSE',
                        'TAX',
                        'OWNER_WITHDRAWAL'
                    )
                ),
                description TEXT,
                reference_date DATE NOT NULL,
                amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
                created_by UUID,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
            );
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_mce_month_year ON monthly_closing_entries (year, month);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_mce_category ON monthly_closing_entries (category);`);

        console.log('✅ Monthly Closings Table Created.');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
