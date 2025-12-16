
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) dotenv.config({ path: '.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function resetAdminSantiago() {
    console.log("=== EMERGENCY PASS RESET: SANTIAGO ===");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Identify Location
        const locRes = await client.query("SELECT id, name FROM locations WHERE name ILIKE '%Santiago%' OR name ILIKE '%Centro%' LIMIT 1");

        if ((locRes.rowCount ?? 0) === 0) {
            throw new Error("❌ No se encontró la sucursal Santiago/Centro.");
        }

        const locId = locRes.rows[0].id;
        const locName = locRes.rows[0].name;
        console.log(`✅ Sucursal encontrada: ${locName} (${locId})`);

        // 2. Identify User (Manager/Admin in that location)
        let userForReset = null;

        // Try to find existing Manager/Admin assigned to this location
        const userRes = await client.query(`
            SELECT * FROM users 
            WHERE assigned_location_id = $1 
            AND (role = 'MANAGER' OR role = 'ADMIN')
            ORDER BY created_at DESC 
            LIMIT 1
        `, [locId]);

        if ((userRes.rowCount ?? 0) > 0) {
            userForReset = userRes.rows[0];
            console.log(`   Usuario existente encontrado: ${userForReset.email || userForReset.name}`);
        } else {
            console.log("   ⚠️ No se encontró admin asignado. Creando uno de emergencia...");
            const newId = uuidv4();
            const email = 'admin.centro@demo.cl';
            const rut = '99.999.999-K'; // Fake RUT

            // Create user
            const createRes = await client.query(`
                INSERT INTO users (id, rut, name, email, role, job_title, status, assigned_location_id, created_at, updated_at)
                VALUES ($1, $2, 'Admin Santiago Emergencia', $3, 'MANAGER', 'GERENTE SUCURSAL', 'ACTIVE', $4, NOW(), NOW())
                ON CONFLICT (email) DO UPDATE SET assigned_location_id = $4, status = 'ACTIVE'
                RETURNING *
            `, [newId, rut, email, locId]);

            userForReset = createRes.rows[0];
            console.log(`   Usuario creado/recuperado: ${userForReset.email}`);
        }

        // 3. Hard Reset Pass
        const PIN = "1213";
        const hash = await bcrypt.hash(PIN, 10);

        await client.query(`
            UPDATE users 
            SET access_pin = $1, 
                status = 'ACTIVE',
                updated_at = NOW()
            WHERE id = $2
        `, [hash, userForReset.id]);

        await client.query('COMMIT');

        console.log("------------------------------------------------");
        console.log(`✅ Sucursal encontrada: ${locName}`);
        console.log(`👤 Usuario Admin: ${userForReset.email || 'Sin Email'} (${userForReset.name})`);
        console.log(`🔑 Clave asignada: ${PIN}`);
        console.log("------------------------------------------------");

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error en Reset:", e);
    } finally {
        client.release();
        await pool.end();
    }
}

resetAdminSantiago();
