
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function promoteToGodMode() {
    console.log('👑 ASCENDIENDO A LA GERENCIA GENERAL (GOD MODE)...');

    try {
        const targetEmails = ['gerente1@demo.cl', 'gerente2@demo.cl'];

        for (const email of targetEmails) {
            // 1. Verificar si existe
            const check = await pool.query('SELECT id, name, role FROM users WHERE email = $1', [email]);

            if (check.rows.length === 0) {
                console.log(`⚠️ El usuario ${email} no existe. (Tal vez tiene otro nombre de email tras el fix anterior?)`);
                continue;
            }

            // 2. Aplicar el Ascenso
            // Forzamos el rol ADMIN y aseguramos el PIN.
            await pool.query(`
        UPDATE users 
        SET role = 'ADMIN', 
            access_pin = '1213'
        WHERE email = $1
      `, [email]);

            console.log(`✅ ${check.rows[0].name} ahora es SUPER ADMIN (Rol: ADMIN).`);
        }

        console.log('\n=======================================');
        console.log('🎉 PERMISOS ACTUALIZADOS');
        console.log('=======================================');
        console.log('El Gerente General ahora debería ver "Configuración" y todos los módulos.');
        console.log('Recuerda refrescar la página (F5) para ver los cambios.');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

promoteToGodMode();
