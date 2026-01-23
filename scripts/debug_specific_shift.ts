
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
        const searchTerm = '%c25b37%'; // ID de la imagen
        console.log(`--- BUSCANDO SESIÓN CON ID: ${searchTerm} ---`);

        const res = await client.query(`
      SELECT 
        s.id, 
        s.terminal_id, 
        t.name as terminal_name,
        u.name as cashier_name,
        s.opening_amount, 
        s.opened_at,
        s.closed_at,
        s.closing_amount,
        s.cash_difference,
        s.status
      FROM cash_register_sessions s
      JOIN terminals t ON s.terminal_id::text = t.id::text
      JOIN users u ON s.user_id::text = u.id::text
      WHERE s.id::text LIKE $1
    `, [searchTerm]);

        if (res.rows.length === 0) {
            console.log('No se encontró ninguna sesión con ese ID.');
            return;
        }

        const session = res.rows[0];
        console.log(`\nSesión Encontrada: ${session.id}`);
        console.log(`  Terminal: ${session.terminal_name}`);
        console.log(`  Cajero: ${session.cashier_name}`);
        console.log(`  Estado: ${session.status}`);
        console.log(`  Inicio: ${session.opened_at}`);
        console.log(`  Fin: ${session.closed_at}`);
        console.log(`  Fondo Inicial (DB): ${session.opening_amount}`);
        console.log(`  Cierre (DB): ${session.closing_amount}`);
        console.log(`  Diferencia: ${session.cash_difference}`);

        const movRes = await client.query(`
        SELECT amount 
        FROM cash_movements 
        WHERE session_id::text = $1::text AND type = 'OPENING'
    `, [session.id]);

        if (movRes.rows.length > 0) {
            console.log(`  Movimiento Apertura (DB): ${movRes.rows[0].amount}`);
        } else {
            console.error('  ⚠️ ALERTA: No se encontró movimiento de tipo OPENING para esta sesión.');
        }

        // Calcular esperado manual
        const salesRes = await client.query(`
        SELECT SUM(COALESCE(total, total_amount)) as total
        FROM sales
        WHERE session_id::text = $1::text AND payment_method = 'CASH'
    `, [session.id]);
        const cashSales = Number(salesRes.rows[0].total || 0);
        console.log(`  Ventas Efectivo (Calculado): ${cashSales}`);

        const incomeRes = await client.query(`
        SELECT SUM(amount) as total
        FROM cash_movements
        WHERE session_id::text = $1::text AND type IN ('EXTRA_INCOME')
    `, [session.id]);
        const income = Number(incomeRes.rows[0].total || 0);
        console.log(`  Ingresos Extras (Calculado): ${income}`);

        const expenseRes = await client.query(`
        SELECT SUM(amount) as total
        FROM cash_movements
        WHERE session_id::text = $1::text AND type IN ('EXPENSE', 'WITHDRAWAL')
    `, [session.id]);
        const expenses = Number(expenseRes.rows[0].total || 0);
        console.log(`  Gastos (Calculado): ${expenses}`);

        const expected = Number(session.opening_amount) + cashSales + income - expenses;
        console.log(`  ESPERADO TOTAL: ${expected}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
