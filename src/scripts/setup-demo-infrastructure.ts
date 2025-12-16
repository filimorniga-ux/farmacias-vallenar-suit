
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) dotenv.config({ path: '.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function query(text: string, params?: any[]) {
    return pool.query(text, params);
}

const PASSWORD = '1234';

async function setupDemo() {
    console.log("=== SETUP DEMO INFRASTRUCTURE ===");

    try {
        // --- 0. Schema Patches ---
        console.log("Applying Schema Patches...");
        await query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INT DEFAULT 0");
        await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE");

        // Ensure access_pin can hold bcrypt hash
        try {
            await query("ALTER TABLE users ALTER COLUMN access_pin TYPE TEXT");
        } catch (e) { /* ignore if already text or conversion issue */ }

        // --- 1. Customer Cleaning (Merge Duplicates) ---
        console.log("\n🧹 1. Cleaning Customers (Merging Duplicates)...");

        // Strategy: Group by RUT (primary) or Name (secondary if RUT missing)
        // Only fetching IDs to process in JS for flexibility
        const allCustomers = await query("SELECT id, name, rut, loyalty_points FROM customers ORDER BY created_at DESC");

        const processedIds = new Set<string>();
        let mergedCount = 0;

        for (const cust of allCustomers.rows) {
            if (processedIds.has(cust.id)) continue;

            // Find match
            const matchKey = cust.rut ? { key: 'rut', val: cust.rut } : { key: 'name', val: cust.name };
            if (!matchKey.val) continue; // Skip empty records

            const duplicates = allCustomers.rows.filter(c =>
                c.id !== cust.id &&
                !processedIds.has(c.id) &&
                (cust.rut ? c.rut === cust.rut : c.name === cust.name)
            );

            if (duplicates.length > 0) {
                console.log(`   Merging ${duplicates.length} duplicates for ${cust.name} (${matchKey.val})...`);

                // Master is 'cust' (most recent because of sort, or arbitrary)
                // Actually, let's keep the one with most history? Simpler to just keep 'cust' and move everything to it.

                let totalPointsToAdd = 0;
                for (const dup of duplicates) {
                    totalPointsToAdd += (dup.loyalty_points || 0);

                    // Move Sales
                    await query("UPDATE sales SET customer_id = $1 WHERE customer_id = $2", [cust.id, dup.id]);

                    // Delete Duplicate
                    await query("DELETE FROM customers WHERE id = $1", [dup.id]);

                    processedIds.add(dup.id);
                }

                if (totalPointsToAdd > 0) {
                    await query("UPDATE customers SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2", [totalPointsToAdd, cust.id]);
                }
                mergedCount += duplicates.length;
            }
            processedIds.add(cust.id);
        }
        console.log(`   Merged ${mergedCount} duplicate customers.`);


        // --- 2. Locations Setup ---
        console.log("\nBuilding Locations...");
        const targetLocations = [
            { name: "Farmacia Santiago Centro", address: "Alameda 123, Santiago", slug: "santiago" },
            { name: "Farmacia Colchagua Prat", address: "Arturo Prat 456, Colchagua", slug: "colchagua" }
        ];

        const locationIds: Record<string, string> = {};

        for (const loc of targetLocations) {
            // Upsert Location
            let res = await query("SELECT id FROM locations WHERE name = $1", [loc.name]);
            let locId;
            if (res.rows.length === 0) {
                locId = uuidv4();
                await query(
                    "INSERT INTO locations (id, name, address, type, created_at, is_active) VALUES ($1, $2, $3, 'STORE', NOW(), true)",
                    [locId, loc.name, loc.address]
                );
                console.log(`   Created Location: ${loc.name}`);
            } else {
                locId = res.rows[0].id;
                // Update Address just in case
                await query("UPDATE locations SET address = $1 WHERE id = $2", [loc.address, locId]);
                console.log(`   Found Location: ${loc.name}`);
            }
            locationIds[loc.slug] = locId;
        }

        // --- 3. Terminals Setup ---
        console.log("\nBuilding Terminals (Resetting for target locations)...");

        for (const [slug, locId] of Object.entries(locationIds)) {
            // Delete existing terminals for this location to ensure clean 1-4 state
            // User authorized "Destructive".

            // Delete sessions for terminals in this location
            // Fix: Cast IDs to text to avoid "operator does not exist: text = uuid" mismatch
            await query(
                "DELETE FROM cash_register_sessions WHERE terminal_id::text IN (SELECT id::text FROM terminals WHERE location_id::text = $1)",
                [locId]
            );
            // Delete terminals
            await query("DELETE FROM terminals WHERE location_id::text = $1", [locId]);

            // Create 4 Terminals
            const suffix = slug === 'santiago' ? 'Stgo' : 'Colch';
            for (let i = 1; i <= 4; i++) {
                const termId = uuidv4();
                await query(
                    "INSERT INTO terminals (id, location_id, name, status, created_at, is_active) VALUES ($1, $2, $3, 'CLOSED', NOW(), true)",
                    [termId, locId, `Caja ${i} ${suffix}`]
                );
            }
            console.log(`   Created 4 Terminals for ${slug}`);
        }

        // --- 4. Users Setup ---
        console.log("\nCreating Users...");
        const hash = await bcrypt.hash(PASSWORD, 10);

        const users = [
            // Super Admins
            { email: 'gerente1@demo.cl', name: 'Gerente General 1', role: 'ADMIN', loc: null },
            { email: 'gerente2@demo.cl', name: 'Gerente General 2', role: 'ADMIN', loc: null },

            // Branch Managers
            { email: 'admin.santiago@demo.cl', name: 'Admin Santiago', role: 'MANAGER', loc: locationIds['santiago'] },
            { email: 'admin.colchagua@demo.cl', name: 'Admin Colchagua', role: 'MANAGER', loc: locationIds['colchagua'] },

            // Cashiers Santiago
            { email: 'cajero.stgo.am1@demo.cl', name: 'Cajero Stgo AM 1', role: 'CASHIER', loc: locationIds['santiago'] },
            { email: 'cajero.stgo.am2@demo.cl', name: 'Cajero Stgo AM 2', role: 'CASHIER', loc: locationIds['santiago'] },
            { email: 'cajero.stgo.pm1@demo.cl', name: 'Cajero Stgo PM 1', role: 'CASHIER', loc: locationIds['santiago'] },
            { email: 'cajero.stgo.pm2@demo.cl', name: 'Cajero Stgo PM 2', role: 'CASHIER', loc: locationIds['santiago'] },

            // Cashiers Colchagua
            { email: 'cajero.col.am1@demo.cl', name: 'Cajero Col AM 1', role: 'CASHIER', loc: locationIds['colchagua'] },
            { email: 'cajero.col.am2@demo.cl', name: 'Cajero Col AM 2', role: 'CASHIER', loc: locationIds['colchagua'] },
            { email: 'cajero.col.pm1@demo.cl', name: 'Cajero Col PM 1', role: 'CASHIER', loc: locationIds['colchagua'] },
            { email: 'cajero.col.pm2@demo.cl', name: 'Cajero Col PM 2', role: 'CASHIER', loc: locationIds['colchagua'] },
        ];

        // Ensure email/username column exists (users table structure varies, usually 'email' or 'id' is used for login?
        // Codebase uses 'rut' often. User request says "gerente1@demo.cl".
        // Assuming 'email' column exists OR 'name' is used?
        // Let's check table columns first.
        const cols = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
        const hasEmail = cols.rows.some(r => r.column_name === 'email');
        if (!hasEmail) {
            await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE");
        }

        for (const u of users) {
            // Generate fake RUT if not provided (simple sequential or random approach)
            const fakeRut = `50${Math.floor(Math.random() * 1000000)}-K`;

            // Upsert User by email
            const existing = await query("SELECT id FROM users WHERE email = $1", [u.email]);
            let userId = existing.rows[0]?.id || uuidv4();

            if (existing.rows.length === 0) {
                await query(`
                    INSERT INTO users (id, name, email, role, status, assigned_location_id, access_pin, rut, created_at)
                    VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, NOW())
                `, [userId, u.name, u.email, u.role, u.loc, hash, fakeRut]);
                console.log(`   Created user: ${u.email}`);
            } else {
                await query(`
                    UPDATE users SET name=$2, role=$3, assigned_location_id=$4, access_pin=$5, status='ACTIVE'
                    WHERE id=$1
                `, [userId, u.name, u.role, u.loc, hash]);
                // Note: Not updating RUT if exists
                console.log(`   Updated user: ${u.email}`);
            }
        }

        console.log("\n✅ INFRASTRUCTURE SETUP COMPLETE.");

    } catch (e) {
        console.error("Setup Failed:", e);
    } finally {
        await pool.end();
    }
}

setupDemo();
