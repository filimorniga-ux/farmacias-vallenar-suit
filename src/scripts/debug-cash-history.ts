
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function main() {
    console.log(`--- GLOBAL SALES & LOCATION DIAGNOSTIC ---`);

    try {
        const client = await pool.connect();
        await client.query("SET TIME ZONE 'America/Santiago'");

        // 1. List ALL Locations
        console.log('\n--- ALL AVAILABLE LOCATIONS ---');
        const locs = await client.query(`
            SELECT id, name, is_active, address, default_warehouse_id 
            FROM locations 
            ORDER BY name ASC
        `);
        console.table(locs.rows.map(l => ({
            id: l.id,
            name: l.name,
            active: l.is_active,
            wh_id: l.default_warehouse_id
        })));

        // 2. Check Recent Sales to see WHERE they are going
        console.log('\n--- RECENT SALES (LAST 15) ---');
        const sql = `
            SELECT 
                s.id, 
                s.timestamp AT TIME ZONE 'America/Santiago' as local_time,
                s.location_id,
                l.name as location_name,
                s.total,
                s.payment_method,
                u.name as user_name
            FROM sales s
            LEFT JOIN locations l ON s.location_id = l.id
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.timestamp DESC
            LIMIT 15
        `;

        const res = await client.query(sql);
        if (res.rows.length > 0) {
            console.table(res.rows.map(r => ({
                time: r.local_time.toISOString().replace('T', ' ').slice(0, 19),
                total: r.total,
                location: r.location_name || 'UNKNOWN',
                loc_id: r.location_id,
                method: r.payment_method,
                user: r.user_name
            })));
        } else {
            console.log('⛔️ NO SALES FOUND IN DB');
        }

        // 3. Count Sales per Location (Last 7 Days)
        console.log('\n--- SALES VOLUMES BY LOCATION (LAST 7 DAYS) ---');
        const volRes = await client.query(`
            SELECT 
                s.location_id, 
                l.name, 
                COUNT(*) as count, 
                SUM(s.total) as total 
            FROM sales s
            LEFT JOIN locations l ON s.location_id = l.id
            WHERE s.timestamp >= NOW() - INTERVAL '7 days'
            GROUP BY s.location_id, l.name
        `);
        console.table(volRes.rows);

        client.release();

    } catch (e) {
        console.error('QUERY FAILED:', e);
    } finally {
        await pool.end();
    }
}

main();
