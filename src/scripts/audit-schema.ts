
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

let query: any;

// Define requirements based on prompt
const REQUIREMENTS = {
    users: ['base_salary', 'afp', 'health_system', 'pin_hash', 'assigned_location_id'],
    inventory_batches: ['sale_price', 'cost_net', 'warehouse_id'],
    sales: ['location_id', 'terminal_id', 'dte_status'],
    customers: ['status']
};

async function main() {
    try {
        // Dynamic import for DB connection
        const dbModule = await import('../lib/db');
        query = dbModule.query;

        console.log('🔍 Auditoría de Esquema Iniciada...\n');

        // 1. Check Columns
        for (const [table, columns] of Object.entries(REQUIREMENTS)) {
            // Check if table exists first (optional, but good for clarity if query returns empty)
            const res = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1
             `, [table]);

            const existingCols = new Set(res.rows.map((r: any) => r.column_name));
            const missing = columns.filter(col => !existingCols.has(col));

            if (missing.length === 0) {
                console.log(`Estructura ${table}: ✅ OK`);
            } else {
                console.log(`Estructura ${table}: ❌ Faltan columnas: ${missing.join(', ')}`);
            }
        }

        console.log('\n📉 Signos Vitales (Conteo de Datos):');

        try {
            const usersCount = await query('SELECT COUNT(*) as c FROM users');
            console.log(`- Total Usuarios: ${usersCount.rows[0].c}`);
        } catch (e) { console.log('- Total Usuarios: Error al contar'); }

        try {
            const productsCount = await query('SELECT COUNT(*) as c FROM inventory_batches WHERE quantity_real > 0');
            console.log(`- Total Lotes con Stock: ${productsCount.rows[0].c}`);
        } catch (e) { console.log('- Total Lotes con Stock: Error al contar'); }

        try {
            const salesCount = await query('SELECT COUNT(*) as c FROM sales');
            console.log(`- Total Ventas: ${salesCount.rows[0].c}`);
        } catch (e) { console.log('- Total Ventas: Error al contar'); }

        process.exit(0);

    } catch (e) {
        console.error('Error fatal en auditoría:', e);
        process.exit(1);
    }
}

main();
