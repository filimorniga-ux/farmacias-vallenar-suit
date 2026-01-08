const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function insertCode() {
    try {
        console.log('Inserting QUOTE_CREATED...');

        // Check if exists first to avoid dupes (though code is likely PK)
        const check = await pool.query(`SELECT 1 FROM audit_action_catalog WHERE code = 'QUOTE_CREATED'`);
        if (check.rowCount > 0) {
            console.log('QUOTE_CREATED already exists.');
        } else {
            await pool.query(`
                INSERT INTO audit_action_catalog (
                    code, category, severity, description, requires_justification, retention_days
                ) VALUES (
                    'QUOTE_CREATED', 'FINANCIAL', 'LOW', 'Creación de cotización', false, 365
                )
            `);
            console.log('QUOTE_CREATED inserted successfully.');
        }

    } catch (e) {
        console.error('Error inserting code:', e);
    } finally {
        pool.end();
    }
}

insertCode();
