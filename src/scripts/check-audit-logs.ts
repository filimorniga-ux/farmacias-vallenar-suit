
import { pool } from '../lib/db-cli';

async function checkAuditLogsSchema() {
    console.log('🔍 Checking audit_logs schema...');
    const client = await pool.connect();
    try {
        const query = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'audit_logs';
        `;
        const res = await client.query(query);
        if (res.rows.length === 0) {
            console.log('❌ Table audit_logs does not exist (or no columns found).');
        } else {
            console.table(res.rows);
        }
    } catch (err) {
        console.error('❌ Error checking schema:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkAuditLogsSchema();
