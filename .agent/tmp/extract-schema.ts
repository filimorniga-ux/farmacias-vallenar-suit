import { Pool } from 'pg';
import { writeFileSync } from 'fs';
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

async function main() {
    const c = await pool.connect();
    try {
        const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");

        // Filtro para ignorar vistas internas del motor (pg_*)
        const v = await c.query("SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name NOT LIKE 'pg_%'");

        let sql = "-- RLS Enforcer: Supabase Direct\\n\\n";
        sql += "BEGIN;\\n\\n";
        sql += "-- 1. Enable RLS en Tablas Públicas\\n";

        t.rows.forEach(r => {
            sql += "ALTER TABLE public.\"" + r.table_name + "\" ENABLE ROW LEVEL SECURITY;\\n";
        });

        sql += "\\n-- 2. Reforzar Views a INVOKER\\n";
        v.rows.forEach(r => {
            sql += "ALTER VIEW public.\"" + r.table_name + "\" SET (security_invoker = true);\\n";
        });

        sql += "\\nCOMMIT;\\n";
        writeFileSync(".agent/tmp/supabase_security_fix.sql", sql);
        console.log("Success: " + t.rows.length + " tables, " + v.rows.length + " views (filtered)");
    } finally {
        c.release();
        await pool.end();
    }
}
main().catch(console.error);
