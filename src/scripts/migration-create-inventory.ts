
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrateInventory() {
    try {
        await client.connect();
        console.log("🏪 Creando tabla 'inventory' para manejo multi-sucursal...");

        await client.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                product_id TEXT NOT NULL REFERENCES products(id),
                location_id UUID NOT NULL REFERENCES locations(id),
                stock INTEGER DEFAULT 0,
                min_stock INTEGER DEFAULT 5,
                max_stock INTEGER DEFAULT 100,
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(product_id, location_id)
            );
        `);

        console.log("✅ Tabla inventory creada.");
    } catch (e) {
        console.error("Error creating inventory table:", e);
    } finally {
        await client.end();
    }
}

migrateInventory();
