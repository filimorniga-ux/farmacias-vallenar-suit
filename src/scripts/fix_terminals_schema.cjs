
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getDatabaseUrl() {
    // Try .env.local first, then .env
    const envFiles = ['.env.local', '.env'];

    for (const file of envFiles) {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
            console.log(`📖 Reading config from ${file}...`);
            const content = fs.readFileSync(filePath, 'utf8');
            const match = content.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
            if (match && match[1]) {
                return match[1];
            }
        }
    }
    return process.env.DATABASE_URL;
}

async function fixTerminalsSchema() {
    const connectionString = getDatabaseUrl();

    if (!connectionString) {
        console.error('❌ Could not find DATABASE_URL in .env or .env.local');
        process.exit(1);
    }

    console.log('🔌 Connecting to DB...');
    const client = new Client({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected.');

        // Add module_number
        try {
            await client.query(`ALTER TABLE terminals ADD COLUMN IF NOT EXISTS module_number VARCHAR(20)`);
            console.log('✅ Added terminals.module_number');
        } catch (e) {
            console.error('⚠️ Error adding module_number:', e.message);
        }

        console.log('🎉 Schema update complete!');
    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        await client.end();
    }
}

fixTerminalsSchema();
