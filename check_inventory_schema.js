// Script to check inventory_batches table schema
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
}

const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        console.log('📊 Checking inventory_batches schema...\n');

        // Get column information
        const result = await pool.query(`
            SELECT 
                column_name, 
                data_type, 
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = 'inventory_batches'
            ORDER BY ordinal_position;
        `);

        if (result.rows.length === 0) {
            console.log('⚠️  Table "inventory_batches" does not exist or has no columns');
        } else {
            console.log('✅ Found', result.rows.length, 'columns:\n');
            console.table(result.rows);
        }

        // Get sample row
        console.log('\n📋 Sample row (first record):');
        const sample = await pool.query('SELECT * FROM inventory_batches LIMIT 1');
        if (sample.rows.length > 0) {
            console.log(JSON.stringify(sample.rows[0], null, 2));
        } else {
            console.log('⚠️  No data in table');
        }

        // Get row count
        const count = await pool.query('SELECT COUNT(*) FROM inventory_batches');
        console.log('\n📈 Total rows:', count.rows[0].count);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkSchema();
