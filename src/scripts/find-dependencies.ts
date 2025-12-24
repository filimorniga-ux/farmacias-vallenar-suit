
import { pool } from '../lib/db-cli';

async function findDependencies() {
    const client = await pool.connect();
    try {
        const query = `
            SELECT DISTINCT dependent_ns.nspname as dependent_schema
            , dependent_view.relname as dependent_view 
            , source_table.relname as source_table
            , pg_attribute.attname as column_name
            FROM pg_depend 
            JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
            JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
            JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid 
            JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid 
                AND pg_depend.refobjsubid = pg_attribute.attnum 
            JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid 
            JOIN pg_namespace source_ns ON source_table.relnamespace = source_ns.oid 
            WHERE source_table.relname = 'cash_register_sessions'
            AND pg_attribute.attname = 'id';
        `;

        const res = await client.query(query);
        console.log('Dependencies found:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

findDependencies();
