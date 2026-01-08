
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getDatabaseUrl() {
    const envFiles = ['.env.local', '.env'];
    for (const file of envFiles) {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const match = content.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
            if (match && match[1]) return match[1];
        }
    }
    return process.env.DATABASE_URL;
}

async function runMigration() {
    const connectionString = getDatabaseUrl();
    if (!connectionString) {
        console.error('❌ No DATABASE_URL found');
        process.exit(1);
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const sqlPath = path.join(process.cwd(), 'src/db/migrations/006_quotes_sequence.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('🔄 Running migration 006...');
        await client.query(sql);
        console.log('✅ Migration 006 completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await client.end();
    }
}

runMigration();
