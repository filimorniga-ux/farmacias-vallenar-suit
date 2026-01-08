const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const REQUIRED_ACTIONS = [
    { code: 'PRODUCT_CREATED', category: 'OPERATIONAL', severity: 'MEDIUM', description: 'Product created' },
    { code: 'PRODUCT_UPDATED', category: 'OPERATIONAL', severity: 'LOW', description: 'Product updated' },
    { code: 'PRODUCT_DEACTIVATED', category: 'OPERATIONAL', severity: 'HIGH', description: 'Product deactivated' },
    { code: 'PRODUCT_PRICE_CHANGED', category: 'FINANCIAL', severity: 'HIGH', description: 'Product price changed' },
    { code: 'PRODUCT_SUPPLIER_LINKED', category: 'OPERATIONAL', severity: 'LOW', description: 'Product linked to supplier' }
];

async function fix() {
    const client = await pool.connect();
    try {
        for (const action of REQUIRED_ACTIONS) {
            try {
                await client.query(`
                INSERT INTO audit_action_catalog (code, category, severity, description)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (code) DO NOTHING
            `, [action.code, action.category, action.severity, action.description]);
                console.log(`Verified/Inserted: ${action.code}`);
            } catch (err) {
                console.error(`Failed to insert ${action.code}:`, err.message);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

fix();
