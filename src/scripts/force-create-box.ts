import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function forceCreate() {
    const locationId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6'; // Farmacia Vallenar Santiago

    console.log(`🔨 Forcing creation of 'Caja Maestra Santiago' in location: ${locationId}`);

    try {
        // Note: Using is_active instead of isDeleted as per actual DB schema
        const res = await pool.query(`
        INSERT INTO terminals (id, location_id, name, status, is_active, created_at)
        VALUES ($1, $2, 'Caja Maestra Santiago', 'CLOSED', true, NOW())
        RETURNING id
      `, [uuidv4(), locationId]);

        console.log('✅ Caja Maestra creada a la fuerza en la ubicación correcta.');
        console.log('🆔 Terminal ID:', res.rows[0].id);
    } catch (e) {
        console.error('❌ ERROR forcing creation:', e);
    } finally {
        await pool.end();
    }
}
forceCreate();
