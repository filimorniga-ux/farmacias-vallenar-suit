import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const directUrl = process.env.DATABASE_URL
    ?.replace(':6543', ':5432')
    ?.replace('?pgbouncer=true&connection_limit=1', '')
    ?.replace('?pgbouncer=true', '');

const pool = new Pool({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false }
});

async function applyFix() {
    const sql = readFileSync('.agent/tmp/supabase_security_fix.sql', 'utf8');
    // Split statements and remove empty
    const commands = sql.split(';').map(s => s.trim()).filter(Boolean);

    const c = await pool.connect();
    let successCount = 0;
    let errorCount = 0;
    try {
        for (const cmd of commands) {
            if (cmd.toUpperCase() === 'BEGIN' || cmd.toUpperCase() === 'COMMIT') continue;

            try {
                await c.query(cmd);
                successCount++;
            } catch (err: any) {
                errorCount++;
                console.error(`Error ejecutando: ${cmd.substring(0, 80)}...`);
                console.error(`  -> ${err.message}`);
            }
        }
        console.log(`Aplicación Lineal Finalizada. Exitos: ${successCount}, Errores: ${errorCount}`);
    } finally {
        c.release();
        await pool.end();
    }
}

applyFix().catch(console.error);
