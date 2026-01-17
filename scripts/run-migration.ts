
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();
dotenv.config({ path: '.env.local' });

async function runMigration() {
    const migrationPath = path.join(process.cwd(), 'scripts/migrations/023_add_created_at_batches.sql');
    console.log(`Reading migration file from: ${migrationPath}`);

    // Create direct client to avoid 'server-only' issues
    const client = new Client({
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
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
