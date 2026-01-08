
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runDiagnostic() {
    console.log('🚀 Starting Standalone SQL Diagnostic...');
    console.log('DB:', process.env.DATABASE_URL ? 'URL Found' : 'URL Missing');

    try {
        // 1. Check specific quote
        const targetCode = 'COT-2026-000005';
        console.log(`\n🔎 Searching for specific quote: ${targetCode}`);
        const specificRes = await pool.query('SELECT * FROM quotes WHERE code = $1', [targetCode]);

        if (specificRes.rows.length > 0) {
            console.log('✅ FOUND! Quote persists in DB.');
            console.log(specificRes.rows[0]);
        } else {
            console.log('❌ NOT FOUND. Quote was NOT saved to DB.');
        }

        // 2. Check recent quotes
        console.log('\n📊 Checking last 10 quotes in DB:');
        const recentQuotes = await pool.query(`
            SELECT 
                q.id, 
                q.code, 
                q.created_at, 
                q.user_id, 
                q.total, 
                q.status,
                u.name as creator_name
            FROM quotes q
            LEFT JOIN users u ON q.user_id = u.id
            ORDER BY q.created_at DESC 
            LIMIT 10
        `);

        if (recentQuotes.rows.length === 0) {
            console.log('⚠️ No quotes found in DB.');
        } else {
            console.table(recentQuotes.rows.map(r => ({
                id: r.id,
                code: r.code,
                date: r.created_at,
                user_id: r.user_id,
                creator: r.creator_name,
                total: r.total,
                status: r.status
            })));

            // 2. Diagnostics for the latest quote
            const latest = recentQuotes.rows[0];
            console.log(`\n🔍 Detailed check of LATEST quote (${latest.code}):`);
            console.log(`   - ID: ${latest.id}`);
            console.log(`   - User ID: ${latest.user_id}`);
            console.log(`   - Creator (joined): ${latest.creator_name || 'NULL (Join Failed)'}`);
            if (!latest.creator_name) {
                console.log('   ⚠️ Creator Name is NULL. This means user_id might not match any user in DB.');
                // Check if user exists
                const userCheck = await pool.query('SELECT id, name FROM users WHERE id = $1', [latest.user_id]);
                if (userCheck.rows.length === 0) {
                    console.log('   ❌ User ID DOES NOT EXIST in users table!');
                } else {
                    console.log(`   ✅ User ID exists: ${userCheck.rows[0].name}`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
    } finally {
        await pool.end();
    }
}

runDiagnostic();
