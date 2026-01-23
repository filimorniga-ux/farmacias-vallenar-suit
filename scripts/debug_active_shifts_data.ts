
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
        console.log('--- AUDITORÍA DE SESIONES ACTIVAS ---');

        // Usamos casts ::text para evitar errores de tipo si alguno es UUID y el otro VARCHAR
        const res = await client.query(`
      SELECT 
        s.id, 
        s.terminal_id, 
        t.name as terminal_name,
        u.name as cashier_name,
        s.opening_amount, 
        s.opened_at,
        s.status
      FROM cash_register_sessions s
      JOIN terminals t ON s.terminal_id::text = t.id::text
      JOIN users u ON s.user_id::text = u.id::text
      WHERE s.closed_at IS NULL
      ORDER BY s.opened_at DESC
    `);

        console.log(`Encontradas ${res.rows.length} sesiones activas.`);

        for (const session of res.rows) {
            console.log(`\nSesión ${session.id.slice(0, 8)}... en Terminal: ${session.terminal_name}`);
            console.log(`  Cajero: ${session.cashier_name}`);
            console.log(`  Inicio: ${session.opened_at}`);
            console.log(`  Fondo Inicial (DB): ${session.opening_amount}`);

            const movRes = await client.query(`
        SELECT amount 
        FROM cash_movements 
        WHERE session_id::text = $1::text AND type = 'OPENING'
      `, [session.id]);

            if (movRes.rows.length > 0) {
                console.log(`  Movimiento Apertura (DB): ${movRes.rows[0].amount}`);
                const diff = Number(movRes.rows[0].amount) - Number(session.opening_amount);
                if (Math.abs(diff) > 0.01) {
                    console.error('  ⚠️ MISMATCH: El monto en sesión difiere del movimiento de apertura!');
                    console.error(`     Sesión: ${session.opening_amount} vs Movimiento: ${movRes.rows[0].amount}`);
                } else {
                    console.log('  ✅ Coincide con Movimiento OK');
                }
            } else {
                console.error('  ⚠️ ALERTA: No se encontró movimiento de tipo OPENING para esta sesión.');
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
