import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const RUN_LEGACY_INIT_SQL_ALLOW_NON_LOCAL_ENV = 'RUN_LEGACY_INIT_SQL_ALLOW_NON_LOCAL';
const RUN_LEGACY_INIT_SQL_CONFIRM_ENV = 'RUN_LEGACY_INIT_SQL_CONFIRM';
const RUN_LEGACY_INIT_SQL_CONFIRMATION = 'RUN_LEGACY_INIT_SQL';

async function runMigrations() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        console.error('❌ Error: DATABASE_URL is not defined in .env.local');
        process.exit(1);
    }

    if (process.env[RUN_LEGACY_INIT_SQL_CONFIRM_ENV] !== RUN_LEGACY_INIT_SQL_CONFIRMATION) {
        console.error(
            `❌ Refusing to run legacy init SQL without explicit confirmation. ` +
            `Set ${RUN_LEGACY_INIT_SQL_CONFIRM_ENV}=${RUN_LEGACY_INIT_SQL_CONFIRMATION} to continue.`
        );
        process.exit(1);
    }

    assertScriptDbWriteTargetAllowed({
        scriptName: 'run_legacy_init_sql',
        connectionString: databaseUrl,
        allowNonLocalEnv: RUN_LEGACY_INIT_SQL_ALLOW_NON_LOCAL_ENV,
    });

    console.log('🎯 DB target:', redactConnectionString(databaseUrl));

    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: true, // Try simple boolean first, or object
    });
    // Hack for self-signed certs if the above doesn't work directly in some environments
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        console.log('🔌 Connecting to database...');
        const client = await pool.connect();

        try {
            console.log('📄 Reading init_db.sql...');
            const sqlPath = path.join(process.cwd(), 'scripts', 'init_db.sql');
            const sqlContent = fs.readFileSync(sqlPath, 'utf8');

            // Split into blocks
            const parts = sqlContent.split('-- BLOCK 2: SEED');

            const block1 = parts[0];
            const block2 = parts[1] ? '-- BLOCK 2: SEED' + parts[1] : '';

            console.log('🚀 Executing Block 1: Schema Creation...');
            await client.query(block1);
            console.log('✅ Block 1 completed.');

            if (block2) {
                console.log('🌱 Executing Block 2: Seeding & Cleanup...');
                await client.query(block2);
                console.log('✅ Block 2 completed.');
            }

            console.log('✨ All migrations finished successfully!');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
