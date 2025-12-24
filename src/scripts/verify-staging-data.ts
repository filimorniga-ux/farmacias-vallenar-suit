
import { pool } from '../lib/db-cli';

async function verifyStagingData() {
    console.log('🕵️‍♂️ Starting Forensic Verification...\n');
    const client = await pool.connect();

    try {
        // 1. Audit Log Verification
        console.log('--- 1. Audit Log Verification (Last 5 events) ---');
        // Note: Using 'metadata' instead of 'details' based on 005 schema
        const auditRes = await client.query(`
            SELECT created_at, action_code, user_name, metadata, new_values 
            FROM audit_log 
            ORDER BY created_at DESC 
            LIMIT 5;
        `);
        console.table(auditRes.rows);

        // 2. Terminal State Verification
        console.log('\n--- 2. Terminals State ---');
        const termRes = await client.query(`
            SELECT id, name, status, current_cashier_id, is_active 
            FROM terminals;
        `);
        console.table(termRes.rows);

        // 3. Reconciliation Verification
        console.log('\n--- 3. Cash Reconciliations (Last 1) ---');
        const recRes = await client.query(`
            SELECT id, session_id, difference, difference_type, status, created_at 
            FROM cash_reconciliations 
            ORDER BY created_at DESC 
            LIMIT 1;
        `);
        if (recRes.rows.length === 0) {
            console.log('⚠️ No reconciliation found (Shift might still be OPEN)');
        } else {
            console.table(recRes.rows);
        }

    } catch (err) {
        console.error('❌ Verification Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

verifyStagingData();
