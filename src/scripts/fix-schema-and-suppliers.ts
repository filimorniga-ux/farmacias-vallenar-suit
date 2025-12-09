import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

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
    console.log('🔧 Fixing Schema & Suppliers...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Create Suppliers Table
        console.log('Creating suppliers table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id UUID PRIMARY KEY,
                rut VARCHAR(20) NOT NULL,
                business_name VARCHAR(255) NOT NULL,
                fantasy_name VARCHAR(255),
                address VARCHAR(255),
                city VARCHAR(100),
                phone_1 VARCHAR(50),
                email_orders VARCHAR(100),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. Seed Mock Suppliers
        const check = await client.query('SELECT count(*) FROM suppliers');
        if (parseInt(check.rows[0].count) === 0) {
            console.log('Seeding mock suppliers...');
            const suppliers = [
                { name: 'Laboratorio Chile', rut: '76.123.456-1', email: 'pedidos@labchile.cl' },
                { name: 'Saval', rut: '96.654.321-K', email: 'ventas@saval.cl' },
                { name: 'Bago', rut: '88.888.888-8', email: 'contacto@bago.cl' }
            ];

            for (const s of suppliers) {
                await client.query(`
                    INSERT INTO suppliers (id, rut, business_name, fantasy_name, address, city, phone_1, email_orders)
                    VALUES ($1, $2, $3, $3, 'Av. Industrial 123', 'Santiago', '+56223334444', $4)
                `, [uuidv4(), s.rut, s.name, s.email]);
            }
        }

        // 3. Fix Sales/Items UUID issues if any (Just verifying Product ID type)
        console.log('Verifying Products ID type...');
        const pRes = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'products' AND column_name = 'id'
        `);
        console.log('Products ID Type:', pRes.rows[0]);

        await client.query('COMMIT');
        console.log('✅ Fix Applied Successfully!');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
