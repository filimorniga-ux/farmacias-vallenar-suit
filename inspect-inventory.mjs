// Script to inspect inventory_batches table structure
// Run with: npm run inspect-inventory

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
    console.error('❌ ERROR: No database URL found in environment variables');
    console.error('   Checked: DATABASE_URL, POSTGRES_URL');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspectInventoryBatches() {
    try {
        console.log('🔍 Inspecting inventory_batches table...\n');

        // 1. Get table columns and their types
        console.log('📋 TABLE STRUCTURE:');
        console.log('─'.repeat(80));
        const schemaQuery = `
            SELECT 
                column_name, 
                data_type,
                character_maximum_length,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = 'inventory_batches'
            ORDER BY ordinal_position;
        `;

        const schemaResult = await pool.query(schemaQuery);

        if (schemaResult.rows.length === 0) {
            console.log('⚠️  Table "inventory_batches" not found or has no columns');
            await pool.end();
            return;
        }

        console.table(schemaResult.rows);

        // 2. Get row count
        const countResult = await pool.query('SELECT COUNT(*) as total FROM inventory_batches');
        console.log(`\n📊 Total rows: ${countResult.rows[0].total}`);

        // 3. Get a sample row
        console.log('\n📄 SAMPLE ROW (first record):');
        console.log('─'.repeat(80));
        const sampleResult = await pool.query('SELECT * FROM inventory_batches LIMIT 1');

        if (sampleResult.rows.length > 0) {
            const sample = sampleResult.rows[0];

            // Pretty print the sample
            Object.keys(sample).forEach(key => {
                const value = sample[key];
                const displayValue = value === null ? 'NULL' :
                    typeof value === 'object' ? JSON.stringify(value) :
                        value;
                console.log(`  ${key.padEnd(25)} : ${displayValue}`);
            });
        } else {
            console.log('⚠️  No data in table');
        }

        // 4. Generate SQL mapping suggestion
        console.log('\n💡 SUGGESTED SQL MAPPING FOR UNION:');
        console.log('─'.repeat(80));
        console.log('Based on the columns found, here\'s what we can map:\n');

        const columns = schemaResult.rows.map(r => r.column_name);
        const mapping = {
            'id': 'ib.id',
            'sku': columns.includes('sku') ? 'ib.sku' : 'NULL',
            'name': columns.includes('name') ? 'ib.name' : 'NULL',
            'dci': columns.includes('dci') ? 'ib.dci' : (columns.includes('active_ingredient') ? 'ib.active_ingredient' : 'NULL'),
            'laboratory': columns.includes('laboratory') ? 'ib.laboratory' : (columns.includes('lab') ? 'ib.lab' : 'NULL'),
            'price': columns.includes('price') ? 'ib.price' : (columns.includes('sale_price') ? 'ib.sale_price' : '0'),
            'cost_price': columns.includes('cost_price') ? 'ib.cost_price' : (columns.includes('unit_cost') ? 'ib.unit_cost' : '0'),
            'stock_actual': columns.includes('stock_actual') ? 'ib.stock_actual' : (columns.includes('quantity') ? 'ib.quantity' : (columns.includes('quantity_real') ? 'ib.quantity_real' : '0')),
            'stock_min': columns.includes('stock_min') ? 'ib.stock_min' : (columns.includes('min_stock') ? 'ib.min_stock' : '5'),
            'location_id': columns.includes('location_id') ? 'ib.location_id' : 'NULL',
            'condition': columns.includes('condition') ? 'ib.condition' : (columns.includes('condicion_venta') ? 'ib.condicion_venta' : "'VD'"),
            'allows_commission': columns.includes('allows_commission') ? 'ib.allows_commission' : (columns.includes('comisionable') ? 'ib.comisionable' : 'false'),
            'expiry_date': columns.includes('expiry_date') ? 'ib.expiry_date' : (columns.includes('expiration_date') ? 'ib.expiration_date' : 'NULL')
        };

        console.log('Column Mapping:');
        Object.entries(mapping).forEach(([key, value]) => {
            console.log(`  ${key.padEnd(20)} → ${value}`);
        });

        console.log('\n✅ Inspection complete!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\nFull error:', error);
    } finally {
        await pool.end();
    }
}

// Run the inspection
inspectInventoryBatches();
