
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();

        console.log('🚀 Synchronizing Audit Action Catalog...');

        const actions = [
            { code: 'EXPORT', category: 'COMPLIANCE', description: 'Exportación de datos sensible', severity: 'MEDIUM' },
            { code: 'PO_HISTORY', category: 'OPERATIONAL', description: 'Consulta de historial de OC', severity: 'LOW' }
        ];

        for (const action of actions) {
            await client.query(`
                INSERT INTO audit_action_catalog (code, category, description, severity)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (code) DO NOTHING
            `, [action.code, action.category, action.description, action.severity]);
            console.log(`✅ Action code: ${action.code} registered/ignored`);
        }

        client.release();
    } catch (error) {
        console.error('❌ Error updating catalog:', error);
    } finally {
        await pool.end();
        process.exit();
    }
}

main();
