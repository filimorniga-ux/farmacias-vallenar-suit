
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

// Load env vars
dotenv.config();
dotenv.config({ path: '.env.local' });

const RUN_MIGRATION_023_ALLOW_NON_LOCAL_ENV = 'RUN_MIGRATION_023_ALLOW_NON_LOCAL';
const RUN_MIGRATION_023_CONFIRM_ENV = 'RUN_MIGRATION_023_CONFIRM';
const RUN_MIGRATION_023_CONFIRMATION = 'APPLY_BATCH_CREATED_AT_MIGRATION';

async function runMigration() {
    const migrationPath = path.join(process.cwd(), 'scripts/migrations/023_add_created_at_batches.sql');
    console.log(`Reading migration file from: ${migrationPath}`);
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('❌ DATABASE_URL or POSTGRES_URL is required');
        process.exit(1);
    }

    if (process.env[RUN_MIGRATION_023_CONFIRM_ENV] !== RUN_MIGRATION_023_CONFIRMATION) {
        console.error(
            `❌ Refusing to run legacy migration without explicit confirmation. ` +
            `Set ${RUN_MIGRATION_023_CONFIRM_ENV}=${RUN_MIGRATION_023_CONFIRMATION} to continue.`
        );
        process.exit(1);
    }

    assertScriptDbWriteTargetAllowed({
        scriptName: 'run-migration-023',
        connectionString,
        allowNonLocalEnv: RUN_MIGRATION_023_ALLOW_NON_LOCAL_ENV,
    });

    console.log('🎯 DB target:', redactConnectionString(connectionString));

    // Create direct client to avoid 'server-only' issues
    const client = new Client({
        connectionString
    });

    try {
        await client.connect();
        console.log('Connected to DB.');

        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('Executing migration...');

        await client.query(sql);

        console.log('✅ Migration executed successfully.');
        await client.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error executing migration:', error);
        await client.end();
        process.exit(1);
    }
}

runMigration();
