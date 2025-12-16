
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function finalCleanup() {
    console.log('🧹 INICIANDO LIMPIEZA FINAL Y DESBLOQUEO DE GERENCIA...');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lógica Smart Consolidation: Santiago/Centro
        // Buscar todas las locations que coincidan
        const locsRes = await client.query(`
        SELECT id, name, 
        (SELECT COUNT(*) FROM users WHERE assigned_location_id = locations.id) as user_count,
        (SELECT COUNT(*) FROM sales WHERE location_id = locations.id) as sale_count
        FROM locations 
        WHERE name ILIKE '%Santiago%' OR name ILIKE '%Centro%'
        ORDER BY sale_count DESC, user_count DESC, created_at DESC
    `);

        if (locsRes.rows.length > 0) {
            const winner = locsRes.rows[0];
            const losers = locsRes.rows.slice(1);

            console.log(`🏆 Sucursal Ganadora: ${winner.name} (${winner.id}) [Ventas: ${winner.sale_count}, Usuarios: ${winner.user_count}]`);

            if (losers.length > 0) {
                console.log(`🗑️ Eliminando duplicados (${losers.length})...`);
                for (const loser of losers) {
                    // Migrar TODO al winner
                    await client.query('UPDATE users SET assigned_location_id = $1 WHERE assigned_location_id = $2', [winner.id, loser.id]);
                    await client.query('UPDATE terminals SET location_id = $1 WHERE location_id = $2', [winner.id, loser.id]);
                    await client.query('UPDATE sales SET location_id = $1 WHERE location_id = $2', [winner.id, loser.id]); // Si existe sales.location_id

                    // Inventory, etc? Assuming main tables cover most.

                    // Delete loser
                    await client.query('DELETE FROM locations WHERE id = $1', [loser.id]);
                    console.log(`   - Eliminada/Fusionada: ${loser.name}`);
                }
            }
        } else {
            console.log("ℹ️ No se encontraron sucursales de Santiago/Centro para fusionar.");
        }

        // 2. Unlock Gerente General (God Mode)
        // role = 'ADMIN', assigned_location_id = NULL
        const superAdmins = ['gerente1@demo.cl', 'gerente2@demo.cl'];
        for (const email of superAdmins) {
            // Check exist
            const userCheck = await client.query("SELECT id FROM users WHERE email = $1", [email]);
            if ((userCheck.rowCount ?? 0) > 0) {
                await client.query(`
                UPDATE users 
                SET role = 'ADMIN', 
                    assigned_location_id = NULL,
                    access_pin = '1213'
                WHERE email = $1
            `, [email]);
                console.log(`🔓 Gerente Desbloqueado (Global): ${email}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ LIMPIEZA COMPLETADA.');

        // Output Active Location for User
        if (locsRes.rows.length > 0) {
            console.log(`📍 Sucursal Activa (Santiago): ${locsRes.rows[0].name}`);
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error en limpieza:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

finalCleanup();
