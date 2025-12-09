import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🕵️‍♂️ Starting Data Visibility Diagnosis...');
    const client = await pool.connect();

    try {
        // 1. Locations
        console.log('\n📍 LOCATIONS (Real IDs):');
        const locRes = await client.query('SELECT id, name, type FROM locations');
        console.table(locRes.rows);

        // 2. Warehouses
        console.log('\n🏭 WAREHOUSES (Linked Locations):');
        const whRes = await client.query('SELECT id, name, location_id FROM warehouses');
        console.table(whRes.rows);

        // 3. User Details
        console.log('\n👤 USER (Admin Centro - 19094701-9):');
        const userRes = await client.query(`
            SELECT id, name, rut, role, assigned_location_id 
            FROM users 
            WHERE rut = '19094701-9'
        `);
        console.table(userRes.rows);

        // 4. Sales Distribution
        console.log('\n💰 SALES DISTRIBUTION (Where are they?):');
        const salesRes = await client.query(`
            SELECT count(*) as count, location_id 
            FROM sales 
            GROUP BY location_id
        `);
        console.table(salesRes.rows);

        // 5. Inventory Distribution
        console.log('\n📦 INVENTORY DISTRIBUTION (Where is stock?):');
        const invRes = await client.query(`
            SELECT count(*) as count, warehouse_id 
            FROM inventory_batches 
            GROUP BY warehouse_id
        `);
        console.table(invRes.rows);

        // Analysis Helper
        if (userRes.rows.length > 0) {
            const userLoc = userRes.rows[0].assigned_location_id;
            console.log('\n--- ANALYSIS ---');
            console.log(`User Assigned Location: ${userLoc}`);

            // Check if sales exist for this location
            const salesInLoc = salesRes.rows.find(r => r.location_id === userLoc);
            if (salesInLoc) {
                console.log(`✅ FOUND ${salesInLoc.count} sales matching User Location.`);
            } else {
                console.log(`❌ NO SALES found for User Location ${userLoc}. Mismatch!`);
            }

            // Check if warehouse exists for this location
            const whForLoc = whRes.rows.find(w => w.location_id === userLoc);
            if (whForLoc) {
                console.log(`ℹ️  Warehouse for User Location is: ${whForLoc.id} (${whForLoc.name})`);
                const invInWh = invRes.rows.find(i => i.warehouse_id === whForLoc.id);
                if (invInWh) {
                    console.log(`✅ FOUND ${invInWh.count} batches in this Warehouse.`);
                } else {
                    console.log(`❌ NO STOCK found in Warehouse ${whForLoc.id}. Empty!`);
                }
            } else {
                console.log(`❌ NO WAREHOUSE found linked to User Location ${userLoc}.`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
