
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyAssignments() {
    const { query } = await import('../lib/db');
    const locs = await query("SELECT id, name FROM locations");
    console.table(locs.rows);
    process.exit(0);
}
verifyAssignments();
