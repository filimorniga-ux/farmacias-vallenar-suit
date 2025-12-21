import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL no está definida en .env o .env.local');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function query(text: string, params?: any[]) {
    return pool.query(text, params);
}

async function resetDatabase() {
    console.log('🚨 INICIANDO RESETEO DE EMERGENCIA DE TERMINALES Y TURNOS (SCRIPT STANDALONE)...');

    try {
        // 0. Asegurar esquema
        console.log('0. Parcheando esquema (notes column)...');
        await query('ALTER TABLE cash_register_sessions ADD COLUMN IF NOT EXISTS notes TEXT;');

        // 1. Cerrar cualquier turno colgado
        console.log('1. Cerrando turnos colgados...');
        const resShifts = await query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), 
                status = 'CLOSED_SYSTEM', 
                notes = 'Hard Reset por Desincronización - ' || NOW()
            WHERE closed_at IS NULL
        `);
        console.log(`✅ Turnos cerrados: ${resShifts.rowCount}`);

        // 2. Resetear estado físico de terminales
        console.log('2. Reseteando terminales...');
        const resTerminals = await query(`
            UPDATE terminals 
            SET is_active = true, 
                status = 'CLOSED', 
                current_cashier_id = NULL
            WHERE status != 'DELETED'
        `);
        console.log(`✅ Terminales reseteadas: ${resTerminals.rowCount}`);

        console.log('🏁 RESETEO COMPLETADO EXITOSAMENTE.');
        process.exit(0);
    } catch (error) {
        console.error('❌ FATAL ERROR DURANTE RESETEO:', error);
        process.exit(1);
    }
}

resetDatabase();
