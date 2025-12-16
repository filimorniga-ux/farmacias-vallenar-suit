import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function forceBind() {
    const email = 'gerente1@demo.cl'; // Usando el usuario real: Gerente General 1
    const targetLocationId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6'; // ID de Farmacia Santiago Real

    console.log(`🔗 Amarrando a ${email} a la sucursal ${targetLocationId}...`);

    try {
        await pool.query(`
        UPDATE users 
        SET assigned_location_id = $1
        WHERE email = $2
      `, [targetLocationId, email]);

        console.log('✅ Usuario amarrado. Ahora DEBE ver lo que hay en esa sucursal.');
    } catch (e) {
        console.error('❌ Error binding user:', e);
    } finally {
        await pool.end();
    }
}
forceBind();
