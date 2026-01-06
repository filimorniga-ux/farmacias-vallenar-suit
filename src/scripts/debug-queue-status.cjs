
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
});

async function main() {
    try {
        console.log('🔍 Debugging Queue Status (Standalone)...');

        // 1. Get a valid Branch ID
        const branchRes = await pool.query(`SELECT id, name FROM locations LIMIT 1`);
        if (branchRes.rowCount === 0) {
            console.error('❌ No locations found in DB.');
            return;
        }

        const branch = branchRes.rows[0];
        console.log(`📍 Using Branch: ${branch.name} (${branch.id})`);

        // 2. Simulate logic of getQueueStatusSecure
        console.log('📡 Simulating getQueueStatusSecure...');

        const result = await pool.query(`
            SELECT qt.*, t.name as terminal_name 
            FROM queue_tickets qt
            LEFT JOIN terminals t ON qt.terminal_id = t.id
            WHERE qt.branch_id = $1 AND qt.status IN ('WAITING', 'CALLED')
            ORDER BY qt.created_at ASC
        `, [branch.id]);

        const waiting = result.rows.filter((t) => t.status === 'WAITING');
        const called = result.rows.filter((t) => t.status === 'CALLED');

        console.log('✅ Status Data:');
        console.log(`WAITING: ${waiting.length}`);

        if (called.length > 0) {
            console.log(`CALLED TICKETS (${called.length}):`);
            called.forEach((t) => {
                console.log(` - [${t.code}] Status: ${t.status}, CalledAt: ${t.called_at}, Terminal: ${t.terminal_name}`);
            });
        } else {
            console.log('⚠️  NO CALLED TICKETS FOUND (This is why screen is blank?)');
        }

        // 3. Check for RECENT history (COMPLETED today)
        console.log('\n🔎 Checking "Forgotten" History (COMPLETED today)...');
        const historyRes = await pool.query(`
            SELECT code, status, called_at, completed_at, terminal_id 
            FROM queue_tickets 
            WHERE branch_id = $1 AND status = 'COMPLETED' 
            AND DATE(created_at) = CURRENT_DATE
            ORDER BY completed_at DESC 
            LIMIT 5
        `, [branch.id]);

        if (historyRes.rows.length > 0) {
            console.table(historyRes.rows);
            console.log('💡 NOTE: These tickets are COMPLETED, so they are filtered out by getQueueStatusSecure.');
        } else {
            console.log('No completed tickets today either.');
        }

    } catch (error) {
        console.error('💥 Crash:', error);
    } finally {
        await pool.end();
    }
}

main();
