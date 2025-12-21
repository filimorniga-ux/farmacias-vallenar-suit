
import { Pool } from 'pg';
import * as dotenv from 'dotenv'; // Changed to * as dotenv consistent with project

dotenv.config();
dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function forceLink() {
    console.log('🔗 FORZANDO VINCULACIÓN DE CAJAS A TU SUCURSAL...');

    try {
        // 1. Obtener la ID de tu sucursal actual (donde vive Admin Centro)
        // NOTE: Schema check - commonly assigned_location_id in this project
        const userRes = await pool.query(`
      SELECT assigned_location_id, name, email FROM users 
      WHERE email = 'admin.centro@demo.cl'
    `);

        if (userRes.rows.length === 0) throw new Error('Usuario Admin no encontrado.');

        const admin = userRes.rows[0];
        const targetLocationId = admin.assigned_location_id; // Using correct column

        if (!targetLocationId) throw new Error('El usuario Admin no tiene sucursal asignada (assigned_location_id is null).');

        console.log(`📍 Sucursal Objetivo (del Admin): ${targetLocationId}`);

        // 2. Buscar cajas "huérfanas" o mal asignadas que parezcan de Santiago
        // Buscamos por nombre "Caja%Stgo%" o "Caja%Centro%"
        const terminalsRes = await pool.query(`
      SELECT id, name, location_id FROM terminals
      WHERE name ILIKE '%Stgo%' OR name ILIKE '%Santiago%' OR name ILIKE '%Centro%'
    `);

        console.log(`📦 Encontradas ${terminalsRes.rows.length} cajas candidatas.`);

        // 3. Actualizar TODAS esas cajas para que apunten a TU sucursal
        const updateRes = await pool.query(`
      UPDATE terminals
      SET location_id = $1, status = 'CLOSED'
      WHERE name ILIKE '%Stgo%' OR name ILIKE '%Santiago%' OR name ILIKE '%Centro%'
    `, [targetLocationId]);

        console.log(`✅ ¡Hecho! ${updateRes.rowCount} cajas movidas a tu sucursal.`);

        // 4. Verificación visual
        console.log('\n--- TUS NUEVAS CAJAS ---');
        const check = await pool.query('SELECT name, status FROM terminals WHERE location_id = $1 ORDER BY name ASC', [targetLocationId]);
        console.table(check.rows);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

forceLink();
