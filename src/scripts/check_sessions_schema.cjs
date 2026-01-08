
const { query } = require('../lib/db');

async function checkSchema() {
    try {
        const res = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cash_register_sessions';
    `);
        console.log('Columns in cash_register_sessions:');
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    }
}

checkSchema();
