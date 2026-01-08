
import { pool } from '../lib/db';

async function runDiagnostic() {
    console.log('🚀 Starting Query Diagnostic (Direct DB Check)...');

    try {
        // 1. Check recent quotes
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
            console.log(`   - Creator Name (via LEFT JOIN): ${latest.creator_name}`);

            // Check if 'created_by' column exists (it shouldn't, but let's be sure)
            try {
                await pool.query('SELECT created_by FROM quotes LIMIT 1');
                console.log('   - ⚠️ "created_by" column EXISTs (Should not)');
            } catch (e) {
                console.log('   - ✅ "created_by" column does NOT exist (Correct)');
            }
        }

    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
    } finally {
        process.exit();
    }
}

runDiagnostic();
