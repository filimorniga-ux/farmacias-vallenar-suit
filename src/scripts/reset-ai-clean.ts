
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function reset() {
    try {
        await client.connect();
        console.log("🧹 Reseteando estado de limpieza de inventario (AI Clean)...");
        // Reset processed_title so we can re-run AI with better rules
        // But KEEP raw_misc and other imported data
        const res = await client.query(`
            UPDATE inventory_imports 
            SET processed_title = NULL
        `);
        console.log(`✅ ${res.rowCount} filas reseteadas. Listas para re-procesar.`);
    } catch (e) {
        console.error("Error reset:", e);
    } finally {
        await client.end();
    }
}

reset();
