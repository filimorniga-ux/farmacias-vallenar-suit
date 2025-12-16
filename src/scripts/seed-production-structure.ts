import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuración robusta (Copied from lib/db.ts but without server-only)
const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
};

const pool = new Pool(connectionConfig);

async function query(text: string, params?: any[]) {
    try {
        return await pool.query(text, params);
    } catch (error) {
        console.error('❌ Error Base de Datos:', error);
        throw error;
    }
}

async function seedProductionStructure() {
    console.log('🌱 Starting Production Seeding...');

    try {
        // --- 0. Reset Schema (Big Bang) ---
        console.log('💥 Resetting Schema for Terminals/Sessions...');
        await query('DROP TABLE IF EXISTS cash_register_sessions CASCADE');
        await query('DROP TABLE IF EXISTS terminals CASCADE');
        // NOT Dropping users/locations entirely might be safer if there are others, but user asked for "Limpieza".
        // However, schema mismatch implies we should probably recreate if we want consistency.
        // Let's drop users with role CASHIER but table schema might be wrong?
        // If users table id is varchar, we have a problem referencing it.
        // Let's just switch our new tables to use uuid/text depending on what users table is?
        // COMPROMISE: We will check users table column type or just use TEXT for IDs in our new tables to be safe/compatible with both.
        // UUIDs can be stored as TEXT.
        // Let's update `terminals` and `cash_register_sessions` to use TEXT for IDs. It's universally compatible.

        await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        // --- 0b. Create/Patch Tables ---
        // Locations
        await query(`
            CREATE TABLE IF NOT EXISTS locations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT,
                type TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        // Patch locations
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS type TEXT`);
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS address TEXT`);
        await query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'`);

        // Users (If missing)
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                rut TEXT,
                role TEXT,
                access_pin TEXT,
                status TEXT,
                assigned_location_id TEXT, 
                job_title TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        // Patch users
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_location_id TEXT`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_pin TEXT`);

        // Broaden types (Patching existing restricted columns)
        await query(`ALTER TABLE users ALTER COLUMN access_pin TYPE TEXT`);
        await query(`ALTER TABLE users ALTER COLUMN rut TYPE TEXT`);

        // Terminals
        await query(`
            CREATE TABLE IF NOT EXISTS terminals (
                id TEXT PRIMARY KEY,
                location_id TEXT,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'CLOSED',
                current_cashier_id TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // Sessions
        await query(`
            CREATE TABLE IF NOT EXISTS cash_register_sessions (
                id TEXT PRIMARY KEY,
                terminal_id TEXT,
                user_id TEXT,
                opened_at TIMESTAMP DEFAULT NOW(),
                closed_at TIMESTAMP,
                opening_amount DECIMAL(12, 2) DEFAULT 0,
                closing_amount DECIMAL(12, 2),
                status TEXT DEFAULT 'OPEN',
                blind_counts INT DEFAULT 0
            );
        `);

        // --- 1. Cleanup Data ---
        console.log('🧹 Cleaning up old data...');
        await query('DELETE FROM cash_register_sessions');
        await query('DELETE FROM terminals');
        await query("DELETE FROM users WHERE role = 'CASHIER'");

        // --- 2. Create Locations ---
        // Ensure standard locations exist
        const locations = [
            { name: 'Farmacia Centro', address: 'Calle Centro 123', type: 'STORE' },
            { name: 'Farmacia Prat', address: 'Calle Prat 456', type: 'STORE' }
        ];

        const locationIds: Record<string, string> = {};

        for (const loc of locations) {
            // Check if exists
            const existing = await query('SELECT id FROM locations WHERE name = $1', [loc.name]);
            let locId;

            if (existing && existing.rows.length > 0) {
                locId = existing.rows[0].id;
                console.log(`📍 Found existing location: ${loc.name}`);
            } else {
                locId = uuidv4();
                await query(
                    'INSERT INTO locations (id, name, address, type, rut, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
                    [locId, loc.name, loc.address, loc.type, '77123456-K']
                );
                console.log(`📍 Created location: ${loc.name}`);
            }
            locationIds[loc.name] = locId;
        }

        // --- 3. Create Terminals ---
        const terminalsPerLoc = ['Caja 1', 'Caja 2'];

        for (const [locName, locId] of Object.entries(locationIds)) {
            for (const termName of terminalsPerLoc) {
                const termId = uuidv4();
                await query(
                    "INSERT INTO terminals (id, location_id, name, status, created_at) VALUES ($1, $2, $3, 'CLOSED', NOW())",
                    [termId, locId, termName]
                );
                console.log(`💻 Created ${termName} in ${locName}`);
            }
        }

        // --- 4. Create Cashiers ---
        const pinHash = await bcrypt.hash('1234', 10);

        const cashiers = [
            // Centro
            { name: 'Juan (Mañana Centro)', location: 'Farmacia Centro' },
            { name: 'Maria (Mañana Centro)', location: 'Farmacia Centro' },
            { name: 'Pedro (Tarde Centro)', location: 'Farmacia Centro' },
            { name: 'Luisa (Tarde Centro)', location: 'Farmacia Centro' },
            // Prat
            { name: 'Ana (Mañana Prat)', location: 'Farmacia Prat' },
            { name: 'Carlos (Mañana Prat)', location: 'Farmacia Prat' },
            { name: 'Sofia (Tarde Prat)', location: 'Farmacia Prat' },
            { name: 'Diego (Tarde Prat)', location: 'Farmacia Prat' },
        ];

        for (const cashier of cashiers) {
            const userId = uuidv4();
            const locId = locationIds[cashier.location];

            await query(`
                INSERT INTO users (
                    id, name, rut, role, access_pin, status, 
                    assigned_location_id, job_title, created_at
                ) VALUES (
                    $1, $2, $3, 'CASHIER', $4, 'ACTIVE', 
                    $5, 'CAJERO_VENDEDOR', NOW()
                )
            `, [
                userId,
                cashier.name,
                `1${Math.floor(Math.random() * 1000000)}-K`, // Fake RUT (8-9 chars)
                pinHash,
                locId
            ]);
            console.log(`👤 Created cashier: ${cashier.name}`);
        }

        console.log('✨ Seed completed successfully! Infrastructure is ready.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error during seeding:', error);
        process.exit(1);
    }
}

seedProductionStructure();
