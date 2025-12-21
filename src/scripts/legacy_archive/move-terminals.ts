import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log('--- Moving Terminals from Prat to Santiago ---');

        const pratId = '27b32261-540c-43fa-939b-f4467940c5e6';
        const santiagoId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6';

        // Move the recent ones (Caja 1, Caja 2)
        // I'll filter by name or just ID from my previous log
        const idsToMove = [
            '8e05c017-9680-463e-aad6-8529385a96f1', // Caja 1
            'b815b6ef-483b-4c3f-9054-752fcbda8fb3'  // Caja 2
        ];

        for (const id of idsToMove) {
            await pool.query('UPDATE terminals SET location_id = $1 WHERE id = $2', [santiagoId, id]);
            console.log(`Moved terminal ${id} to Santiago.`);
        }

        console.log('Done.');

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
