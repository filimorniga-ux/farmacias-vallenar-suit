
// Pure Node script to check DB status
const { Pool } = require('pg');

// Parse DB URL from .env if needed, or assume default
// Since we are in the project root, let's try to grab from .env if exists or process.env
// For simplicity, we'll try to use the one from env if loaded, or hardcode/grep it
// But actually, npm run dev implies .env is loaded in context? No, run_command is bare.
// We will rely on the user having env vars set or we need to read .env
// Let's assume DATABASE_URL is available or we read it from .env.local

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}
const envLocal = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
}

console.log('Using DB URL:', process.env.DATABASE_URL ? 'FOUND' : 'MISSING');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkQueue() {
    const branchId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6'; // From user screenshot
    console.log('Checking queue for branch:', branchId);

    try {
        const res = await pool.query(`
            SELECT id, code, status, branch_id, called_at 
            FROM queue_tickets 
            WHERE branch_id = $1 AND status IN ('WAITING', 'CALLED')
            ORDER BY created_at ASC
        `, [branchId]);


        console.log('Total tickets:', res.rowCount);
        res.rows.forEach(r => {
            console.log(`[${r.status}] ${r.code} (${r.id.substring(0, 6)}...) Called: ${r.called_at}`);
        });

        const terminals = await pool.query(`SELECT id, name, module_number FROM terminals WHERE location_id = $1`, [branchId]);
        console.log('Terminals:', terminals.rows.map(t => `${t.name} (${t.id})`).join(', '));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        pool.end();
    }
}

checkQueue();
