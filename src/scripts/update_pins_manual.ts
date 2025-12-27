
import { pool } from '../lib/db';

async function updatePins() {
    const client = await pool.connect();
    try {
        console.log('🔄 Iniciando actualización de PINs...');

        // Actualizar PINs a 1213 y limpiar hash para los roles especificados
        const result = await client.query(`
      UPDATE users 
      SET access_pin = '1213', 
          access_pin_hash = NULL 
      WHERE role IN ('CASHIER', 'QF', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL')
    `);

        console.log(`✅ Se actualizaron ${result.rowCount} usuarios con PIN 1213.`);

        // Verificación
        const verify = await client.query(`
        SELECT name, role, access_pin 
        FROM users 
        WHERE role IN ('CASHIER', 'QF', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL')
        LIMIT 5
    `);

        console.log('\nMuestra de usuarios actualizados:');
        console.table(verify.rows);

    } catch (error) {
        console.error('❌ Error actualizando PINs:', error);
    } finally {
        client.release();
        process.exit(0);
    }
}

updatePins();
