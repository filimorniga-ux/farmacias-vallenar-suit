require('dotenv').config();
const { Pool } = require('pg');

async function fixAuditAction() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL missing');
        return;
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

    try {
        console.log('🔧 Fixing Audit Action Catalog...');
        await pool.query(`
            INSERT INTO audit_action_catalog (code, category, description, severity)
            VALUES ('USER_CREATED', 'SECURITY', 'Creación de nuevo usuario', 'MEDIUM')
            ON CONFLICT (code) DO NOTHING;
        `);
        console.log('✅ Action USER_CREATED inserted/verified.');
    } catch (e) {
        console.error('❌ Failed to fix catalog:', e);
    } finally {
        await pool.end();
    }
}

fixAuditAction();
