
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    try {
        await client.connect();
        await client.query(`
            ALTER TABLE inventory_imports ADD COLUMN IF NOT EXISTS processed_title TEXT;
            CREATE INDEX IF NOT EXISTS idx_inventory_processed_title ON inventory_imports(processed_title);
        `);
        console.log("✅ Columna processed_title agregada exitosamente.");
    } catch (e) {
        console.error("Error migracion:", e);
    } finally {
        await client.end();
    }
}
migrate();
