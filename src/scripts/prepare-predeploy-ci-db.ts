#!/usr/bin/env tsx

import { Pool } from 'pg';
import { ensureMinimalRuntimeSchema } from './runtime-schema-contract';

const REQUIRED_MIGRATIONS = [
    ['001', 'Bootstrap base schema'],
    ['002', 'Terminal integrity baseline'],
    ['003', 'UUID standardization'],
    ['004', 'Audit system'],
    ['005', 'Security pin hash'],
    ['006', 'Reconciliation module'],
    ['007', 'Accounts payable baseline'],
] as const;

const DEV_TEST_ACCOUNT = {
    name: '[DEV] Gerente General 1',
    email: 'dev.gerente.general.1@local.invalid',
    jobTitle: 'DEV_TEST_ACCOUNT',
} as const;

function getConnectionString() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL no está configurada');
    }

    return databaseUrl;
}

function getSslConfig(databaseUrl: string) {
    return databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
        ? undefined
        : { rejectUnauthorized: false };
}

async function main() {
    const connectionString = getConnectionString();
    const pool = new Pool({
        connectionString,
        ssl: getSslConfig(connectionString),
        max: 1,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
    });

    const client = await pool.connect();

    try {
        console.log('🛠 Preparando DB efímera para pre-deploy-check en CI...');
        await client.query('BEGIN');
        await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
        await ensureMinimalRuntimeSchema(client);

        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(100) PRIMARY KEY,
                description TEXT NOT NULL,
                checksum TEXT,
                applied_at TIMESTAMP DEFAULT NOW()
            )
        `);

        for (const [version, description] of REQUIRED_MIGRATIONS) {
            await client.query(
                `
                INSERT INTO schema_migrations(version, description, checksum)
                VALUES ($1, $2, $3)
                ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description
                `,
                [version, description, `ci-${version}`],
            );
        }

        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email VARCHAR(255)
        `);
        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS access_pin_hash VARCHAR(255)
        `);
        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
        `);
        await client.query(`
            UPDATE users
            SET access_pin_hash = COALESCE(access_pin_hash, pin_hash)
            WHERE access_pin_hash IS NULL
        `);
        await client.query(
            `
            UPDATE users
            SET email = $1
            WHERE (name = $2 OR job_title = $3)
              AND email IS NULL
            `,
            [DEV_TEST_ACCOUNT.email, DEV_TEST_ACCOUNT.name, DEV_TEST_ACCOUNT.jobTitle],
        );
        await client.query(`
            UPDATE users
            SET is_active = COALESCE(is_active, status = 'ACTIVE', true)
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_action_catalog (
                code TEXT PRIMARY KEY,
                action_code TEXT UNIQUE,
                description TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'SYSTEM',
                severity TEXT NOT NULL DEFAULT 'LOW',
                requires_justification BOOLEAN NOT NULL DEFAULT false,
                retention_days INTEGER NOT NULL DEFAULT 365,
                is_active BOOLEAN NOT NULL DEFAULT true
            )
        `);
        await client.query(`
            INSERT INTO audit_action_catalog(code, action_code, description, category, severity, is_active)
            VALUES ('CI_HEALTHCHECK', 'CI_HEALTHCHECK', 'Registro base para pre-deploy-check en CI', 'SYSTEM', 'LOW', true)
            ON CONFLICT (code) DO NOTHING
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id TEXT,
                action_code TEXT,
                entity_type TEXT,
                entity_id TEXT,
                old_values JSONB,
                new_values JSONB,
                metadata JSONB DEFAULT '{}'::jsonb,
                session_id TEXT,
                location_id TEXT,
                checksum TEXT,
                previous_checksum TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(
            `
            UPDATE users
            SET is_active = false
            WHERE email = $1 OR name = $2 OR job_title = $3
            `,
            [DEV_TEST_ACCOUNT.email, DEV_TEST_ACCOUNT.name, DEV_TEST_ACCOUNT.jobTitle],
        );

        await client.query('COMMIT');
        console.log('✅ DB preparada para pre-deploy-check en CI.');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error('❌ Error preparando DB para pre-deploy-check:', error);
    process.exit(1);
});
