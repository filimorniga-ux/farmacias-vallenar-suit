
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('--- MIGRACIÓN DE TIPOS DE MOVIMIENTO ---');
        console.log('Actualizando APERTURA -> OPENING...');

        const res = await client.query(`
      UPDATE cash_movements
      SET type = 'OPENING'
      WHERE type = 'APERTURA'
    `);

        console.log(`✅ Registros actualizados: ${res.rowCount}`);

        // Verificación
        const verify = await client.query(`
        SELECT COUNT(*) as count 
        FROM cash_movements 
        WHERE type = 'APERTURA'
    `);

        if (Number(verify.rows[0].count) === 0) {
            console.log('✅ Verificación exitosa: No quedan registros de tipo APERTURA.');
        } else {
            console.error(`⚠️ ALERTA: Aún quedan ${verify.rows[0].count} registros de tipo APERTURA.`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
