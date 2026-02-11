
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Leer .env manualmente para obtener DATABASE_URL
let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    try {
        const envPath = path.resolve(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            const envFile = fs.readFileSync(envPath, 'utf8');
            const match = envFile.match(/DATABASE_URL=(.+)/);
            if (match) {
                databaseUrl = match[1].trim();
                // Remove quotes if present
                if ((databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) ||
                    (databaseUrl.startsWith("'") && databaseUrl.endsWith("'"))) {
                    databaseUrl = databaseUrl.slice(1, -1);
                }
            }
        } else {
            console.warn('⚠️ .env file not found at', envPath);
        }
    } catch (e) {
        console.error('Could not read .env file', e);
    }
}

if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in env or .env file');
    process.exit(1);
}

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
});

async function checkColumns() {
    const client = await pool.connect();
    try {
        console.log('--- PRODUCTS Columns ---');
        const prodRes = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'products' 
            AND column_name IN ('cost_net', 'tax_percent', 'price', 'price_sell_box', 'price_sell_unit', 'margin_percentage');
        `);
        console.table(prodRes.rows);

        console.log('\n--- INVENTORY_BATCHES Columns ---');
        const batchRes = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'inventory_batches' 
            AND column_name IN ('cost_net', 'tax_percent', 'price', 'price_sell_box', 'price_sell_unit', 'margin_percentage');
        `);
        console.table(batchRes.rows);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

checkColumns();
