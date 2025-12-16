
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function setGlobalManager() {
    console.log('🌍 CONVIRTIENDO GERENTES EN GLOBALES...');

    try {
        // Los correos de tus Gerentes Generales
        // NOTE: You approved the plan with these placeholders. Update them if needed.
        const emails = ['gerente1@demo.cl', 'gerente2@demo.cl'];

        for (const email of emails) {
            // Dejamos el rol MANAGER (respetando tu lógica), pero assigned_location_id en NULL
            const res = await pool.query(`
        UPDATE users 
        SET assigned_location_id = NULL 
        WHERE email = $1
        RETURNING name, role, assigned_location_id
      `, [email]);

            if (res.rowCount && res.rowCount > 0) {
                console.log(`✅ ${res.rows[0].name} ahora es MANAGER GLOBAL (Location: NULL).`);
            } else {
                console.log(`⚠️ No encontré a ${email}.`);
            }
        }

        console.log('\n--- LISTO ---');
        console.log('Refresca la página y entra como Gerente.');
        console.log('Al no tener sucursal fija, el sistema debería mostrarte TODO.');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

setGlobalManager();
