import { config } from 'dotenv';
import path from 'path';

// Load env vars
config({ path: path.resolve(process.cwd(), '.env.local') });

async function migrateQueueSchema() {
    console.log('🎟️ Creating Queue Management Schema...');

    // Dynamic import to ensure env is loaded first
    // Use pg directly to avoid server-only issues in scripts
    const { Pool } = await import('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });

    const query = (text: string, params?: any[]) => pool.query(text, params);

    try {
        // 0. Enable UUID if not exists
        await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

        // 1. Create Types if not exist
        // Note: Postgres ENUMs can be tricky to manage if they already exist, 
        // using CHECK constraints is sometimes safer/easier for simple logic, 
        // but user requested Enum. We will use VARCHAR with Check or native ENUM.
        // Let's use simple VARCHAR with Check for portability/simplicity in this script, or explicit ENUM.
        // Given the prompt asks for "Enum", I'll try to create the type if it doesn't exist.

        // However, robust scripts often just use Text with constraints to avoid "type already exists" errors easily. 
        // Let's use native ENUMs but handle "IF NOT EXISTS" logic carefully (Postgres doesn't support CREATE TYPE IF NOT EXISTS natively in old versions).

        try {
            await query("CREATE TYPE ticket_type AS ENUM ('GENERAL', 'PREFERENTIAL');");
        } catch (e) {
            // Ignore if exists
        }

        try {
            await query("CREATE TYPE ticket_status AS ENUM ('WAITING', 'CALLED', 'COMPLETED', 'NO_SHOW');");
        } catch (e) {
            // Ignore if exists
        }

        // 2. Queue Tickets Table
        console.log('Checking queue_tickets table...');
        await query(`
            CREATE TABLE IF NOT EXISTS queue_tickets (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                branch_id UUID NOT NULL, -- FK to locations handled logically or we can add CONSTRAINT
                rut VARCHAR(20) NOT NULL,
                type ticket_type NOT NULL DEFAULT 'GENERAL',
                code VARCHAR(10) NOT NULL, -- "G001", "P005"
                status ticket_status NOT NULL DEFAULT 'WAITING',
                created_at TIMESTAMP DEFAULT NOW(),
                called_at TIMESTAMP,
                completed_at TIMESTAMP
            );
        `);

        // Indices
        await query(`CREATE INDEX IF NOT EXISTS idx_queue_branch_status ON queue_tickets(branch_id, status);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_queue_created_at ON queue_tickets(created_at);`);

        console.log('✅ Queue Schema Created Successfully');

    } catch (error) {
        console.error('❌ Queue Migration Failed:', error);
        process.exit(1);
    }
}

migrateQueueSchema();
