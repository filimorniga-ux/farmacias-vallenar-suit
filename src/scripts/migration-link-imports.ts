
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrateLink() {
    try {
        await client.connect();
        console.log("🔗 Agregando columna product_id a inventory_imports...");

        await client.query(`
            ALTER TABLE inventory_imports 
            ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES products(id);
        `);

        console.log("✅ Columna agregada.");
    } catch (e) {
        console.error("Error migrating link:", e);
    } finally {
        await client.end();
    }
}

migrateLink();
