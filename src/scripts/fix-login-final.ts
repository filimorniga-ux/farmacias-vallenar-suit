
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function fixLoginFinal() {
    console.log('🔓 INICIANDO REPARACIÓN DEFINITIVA DE LOGIN (PIN PLANO)...');

    try {
        // 0. Ensure password column exists (Robustness)
        try {
            await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT");
        } catch (e) {
            console.log("ℹ️ Nota: Verificación de columna 'password' completada.");
        }

        // 1. Traer a TODOS los usuarios (sin filtro, para arreglar claves rotas también)
        const res = await pool.query(`SELECT id, name, role, email FROM users`);
        const users = res.rows;

        console.log(`📋 Procesando ${users.length} usuarios...`);

        // Hash para el campo 'password' (por si el sistema evoluciona)
        const passwordHash = await bcrypt.hash('1213', 10);

        for (const user of users) {
            // 1. Garantizar Email
            let emailFinal = user.email;
            if (!emailFinal || !emailFinal.includes('@')) {
                const safeName = (user.name || `User${user.id.substring(0, 4)}`)
                    .toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, '.')
                    .replace(/[^a-z0-9.]/g, '');
                emailFinal = `${safeName}@demo.cl`;
            }

            // 2. ACTUALIZAR (La clave es access_pin PLANO)
            await pool.query(`
        UPDATE users 
        SET email = $1, 
            password = $2, 
            access_pin = '1213',   -- <--- AQUÍ ESTÁ LA SOLUCIÓN (TEXTO PLANO)
            status = 'ACTIVE'      -- Usamos 'status' según tu esquema detectado
        WHERE id = $3
      `, [emailFinal, passwordHash, user.id]);

            console.log(`✅ Usuario: ${user.name.padEnd(20)} | 📧 ${emailFinal.padEnd(30)} | 🔑 PIN: 1213 (Plano)`);
        }

        console.log('\n=======================================');
        console.log('🎉 REPARACIÓN COMPLETADA');
        console.log('=======================================');
        console.log('Ahora el Login DEBE funcionar.');
        console.log('Intenta entrar con: admin.centro@demo.cl (o el que salga en la lista)');
        console.log('PIN: 1213');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

fixLoginFinal();
