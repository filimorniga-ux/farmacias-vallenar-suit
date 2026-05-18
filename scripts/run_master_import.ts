
import { MasterDataService } from '../src/lib/MasterDataService';
import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const { Pool } = pg;
const RUN_MASTER_IMPORT_ALLOW_NON_LOCAL_ENV = 'RUN_MASTER_IMPORT_ALLOW_NON_LOCAL';
const RUN_MASTER_IMPORT_CONFIRM_ENV = 'RUN_MASTER_IMPORT_CONFIRM';
const RUN_MASTER_IMPORT_CONFIRMATION = 'RUN_MASTER_DATA_IMPORT';

async function main() {
    const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL not set");
    }

    if (process.env[RUN_MASTER_IMPORT_CONFIRM_ENV] !== RUN_MASTER_IMPORT_CONFIRMATION) {
        throw new Error(
            `Refusing to run master data import without explicit confirmation. ` +
            `Set ${RUN_MASTER_IMPORT_CONFIRM_ENV}=${RUN_MASTER_IMPORT_CONFIRMATION} to continue.`
        );
    }

    assertScriptDbWriteTargetAllowed({
        scriptName: 'run_master_import',
        connectionString,
        allowNonLocalEnv: RUN_MASTER_IMPORT_ALLOW_NON_LOCAL_ENV,
    });

    console.log('🎯 DB target:', redactConnectionString(connectionString));

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    const service = new MasterDataService(pool);
    try {
        await service.runFullImport();
        console.log('✅ Master Data Fusion job completed successfully.');
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during import job:', err);
        await pool.end();
        process.exit(1);
    }
}

main();
