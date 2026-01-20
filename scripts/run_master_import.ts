
import { MasterDataService } from '../src/lib/MasterDataService';
import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const { Pool } = pg;

async function main() {
    const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL not set");
    }

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
