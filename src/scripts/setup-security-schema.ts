import { config } from 'dotenv';
import path from 'path';

// Load env vars
config({ path: path.resolve(process.cwd(), '.env.local') });

// import { query } from '../lib/db'; // Removed to avoid hoisting

async function migrateSecurityDocs() {
    console.log('🛡️ Creating Security Tables...');

    // Dynamic import to ensure env is loaded first
    const { query } = await import('../lib/db');

    try {
        // 0. Enable UUID if not exists (Best Practice Check)
        await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

        // 1. Audit Logs
        console.log('Checking audit_logs...');
        await query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID, -- Nullable because some actions might be system or unauthenticated attempts
                action VARCHAR(100) NOT NULL,
                details JSONB DEFAULT '{}',
                ip_address VARCHAR(50),
                timestamp TIMESTAMP DEFAULT NOW()
            );
        `);
        // Index for faster queries
        await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);`);

        // 2. Login Attempts (Rate Limiting Check)
        console.log('Checking login_attempts...');
        await query(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                identifier VARCHAR(255) NOT NULL, -- IP or UserID/Username
                attempt_count INTEGER DEFAULT 1,
                last_attempt TIMESTAMP DEFAULT NOW(),
                blocked_until TIMESTAMP
            );
        `);
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier);`);

        console.log('✅ Security Tables Created Successfully');

    } catch (error) {
        console.error('❌ Migration Failed:', error);
        process.exit(1);
    }
}

migrateSecurityDocs();
