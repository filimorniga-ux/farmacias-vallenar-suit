
import { pool } from '../lib/db-cli';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
    const migrations = [
        // '004_uuid_standardization.sql', // ✅ SUCCESS (Step 1890)
        // '005_audit_system.sql',
        // '006_reconciliation_module.sql',
        // '009_wms_logistics_v2.sql',
        '011_fix_audit_actions.sql'
    ];

    console.log('🚀 Starting migration execution...');

    const client = await pool.connect();
    client.on('notice', (msg) => console.log(`NOTICE: ${msg.message}`));

    try {
        for (const file of migrations) {
            const filePath = path.join(process.cwd(), 'src/db/migrations', file);
            console.log(`\n📄 Reading migration: ${file}`);

            if (!fs.existsSync(filePath)) {
                throw new Error(`Migration file not found: ${filePath}`);
            }

            const sql = fs.readFileSync(filePath, 'utf-8');
            console.log(`▶️ Executing ${file}...`);

            try {
                // Determine if we need to wrap in transaction manually or if file has it
                // These files have explicit BEGIN/COMMIT, so we execute as is.
                await client.query(sql);
                console.log(`✅ Success: ${file}`);
            } catch (err: any) {
                console.error(`❌ Failed: ${file}`);
                console.error(err.message);
                // If one fails, we stop to prevent partial state corruption if dependencies exist
                process.exit(1);
            }
        }

        console.log('\n🎉 All migrations executed successfully.');
    } catch (err) {
        console.error('Fatal error during migration:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
