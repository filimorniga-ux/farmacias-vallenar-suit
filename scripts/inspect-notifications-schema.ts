
import { query } from '../src/lib/db';

async function inspectSchema() {
    try {
        console.log('Inspecting notifications table schema...');
        const res = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications';
    `, []);
        console.table(res.rows);
    } catch (error) {
        console.error('Error inspecting schema:', error);
    } finally {
        process.exit(0);
    }
}

inspectSchema();
