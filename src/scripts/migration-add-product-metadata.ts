import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    try {
        await client.connect();
        console.log("🛠️  Agregando columnas a tabla Products...");

        await client.query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id),
            ADD COLUMN IF NOT EXISTS laboratory_id INTEGER REFERENCES laboratories(id);
        `);

        console.log("✅ Migración completada.");
    } catch (e) {
        console.error("Error migrating:", e);
    } finally {
        await client.end();
    }
}

migrate();
