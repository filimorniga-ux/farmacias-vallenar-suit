
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function testConnection() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        console.error('❌ Error: DATABASE_URL no encontrada en .env');
        process.exit(1);
    }

    console.log('🔗 Intentando conectar a:', dbUrl.split('@')[1]); // Log partial URL for safety

    // Configuración SSL forzada para Timescale Cloud
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: {
            rejectUnauthorized: false
        },
        connectionTimeoutMillis: 10000 // 10 segundos
    });

    try {
        console.time('⏱️ Tiempo de conexión');
        const client = await pool.connect();
        console.log('✅ ¡CONEXIÓN EXITOSA!');

        const res = await client.query('SELECT current_database(), now()');
        console.log('📊 Datos del servidor:', res.rows[0]);

        client.release();
        process.exit(0);
    } catch (err: any) {
        console.error('❌ ERROR DE CONEXIÓN:', err.message);
        if (err.message.includes('timeout')) {
            console.error('🚨 El servidor no responde (Timeout). Es probable que el servicio siga en despliegue o bloqueado.');
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

testConnection();
