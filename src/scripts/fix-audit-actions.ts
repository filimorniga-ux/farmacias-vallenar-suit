
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
    console.log('🔧 Fixing Audit Action Codes...');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Missing codes to insert - Using proper ENUM values for severity
        const missingCodes = [
            {
                code: 'CASH_EXPENSE',
                description: 'Registro de gasto/salida de dinero de caja',
                category: 'FINANCIAL'
            },
            {
                code: 'CASH_EXTRA_INCOME',
                description: 'Registro de ingreso extra de dinero a caja',
                category: 'FINANCIAL'
            },
            {
                code: 'CASH_WITHDRAWAL',
                description: 'Retiro de utilidades o montos mayores',
                category: 'FINANCIAL'
            },
            {
                code: 'CASH_ADJUSTED',
                description: 'Ajuste manual de caja',
                category: 'FINANCIAL'
            },
            {
                code: 'CASH_OPENING',
                description: 'Apertura de caja',
                category: 'FINANCIAL'
            },
            {
                code: 'CASH_DRAWER_OPENED',
                description: 'Apertura de turno de caja',
                category: 'FINANCIAL'
            },
            {
                code: 'CASH_DRAWER_CLOSED',
                description: 'Cierre de turno de caja',
                category: 'FINANCIAL'
            }
        ];

        for (const action of missingCodes) {
            console.log(`Checking ${action.code}...`);
            // Columns: code, description, category, severity ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
            const res = await client.query(
                `INSERT INTO audit_action_catalog (code, description, category, severity)
                 VALUES ($1, $2, $3, 'LOW')
                 ON CONFLICT (code) DO NOTHING
                 RETURNING code`,
                [action.code, action.description, action.category]
            );

            if (res.rows.length > 0) {
                console.log(`✅ Inserted: ${action.code}`);
            } else {
                console.log(`ℹ️ Already exists: ${action.code}`);
            }
        }

        await client.query('COMMIT');
        console.log('🎉 Audit actions fixed successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error fixing audit actions:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
