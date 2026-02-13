
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function checkRetailLots() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL not found');
        return;
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        // Verificar esquema de la tabla
        const schemaRes = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'inventory_batches'
        `);
        console.log('\n📋 Table Schema:');
        console.table(schemaRes.rows);

        // Buscar lotes que contengan 'DETAL' en el ID o en el nombre
        const res = await client.query(`
            SELECT id, name, sku, quantity_real, location_id, created_at 
            FROM inventory_batches 
            WHERE id::text LIKE '%DETAL%' OR name LIKE '%DETAL%'
            ORDER BY created_at DESC
            LIMIT 20
        `);

        console.log('\n🔍 Found Retail Lots:');
        console.table(res.rows);

        // También verificar los últimos movimientos de stock de tipo FRACTIONATION
        const movRes = await client.query(`
            SELECT id, sku, product_name, movement_type, quantity, timestamp, notes
            FROM stock_movements
            WHERE reference_type = 'FRACTIONATION' OR notes LIKE '%Fraccionamiento%'
            ORDER BY timestamp DESC
            LIMIT 10
        `);

        console.log('\n📦 Recent Fractionation Movements:');
        console.table(movRes.rows);

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await client.end();
    }
}

checkRetailLots();
