const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkQueueCodes() {
    try {
        const codes = ['TICKET_CALLED', 'TICKET_COMPLETED'];
        for (const code of codes) {
            const res = await pool.query(`SELECT 1 FROM audit_action_catalog WHERE code = $1`, [code]);
            if (res.rowCount === 0) {
                console.log(`MISSING: ${code}`);
                // Insert if missing
                await pool.query(`
                    INSERT INTO audit_action_catalog (
                        code, category, severity, description, requires_justification, retention_days
                    ) VALUES (
                        $1, 'OPERATIONAL', 'LOW', $2, false, 30
                    )
                `, [code, code === 'TICKET_CALLED' ? 'Llamada de ticket' : 'Atención completada']);
                console.log(`INSERTED: ${code}`);
            } else {
                console.log(`EXISTS: ${code}`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkQueueCodes();
