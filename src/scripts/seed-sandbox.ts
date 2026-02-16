
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function seedSandbox() {
    const dbUrl = process.env.DATABASE_URL;

    // Seguridad extrema: Solo permitir si es localhost (Docker)
    if (!dbUrl?.includes('localhost') && !dbUrl?.includes('127.0.0.1')) {
        console.error('❌ SEGURIDAD: Este script SOLO puede correr en Docker (localhost).');
        console.error('DATABASE_URL actual:', dbUrl);
        process.exit(1);
    }

    console.log('🏗️  Poblando entorno Sandbox en Docker...');

    const pool = new Pool({ connectionString: dbUrl });

    try {
        const client = await pool.connect();

        // 1. Limpiar datos de prueba anteriores (opcional pero recomendado)
        console.log('🧹 Limpiando tablas para nuevo set de pruebas...');
        await client.query('TRUNCATE sales, sale_items, stock_movements, inventory_batches CASCADE;');

        // 2. Insertar Sucursal de Prueba
        console.log('📍 Creando sucursal de prueba...');
        const locRes = await client.query(`
            INSERT INTO locations (id, name, address, is_active, type)
            VALUES (gen_random_uuid(), 'Sucursal Sandbox 01', 'Calle Falsa 123', true, 'RETAIL')
            RETURNING id;
        `);
        const locationId = locRes.rows[0].id;

        // 3. Insertar Usuario de Prueba (PIN 1213)
        console.log('👤 Creando administrador de prueba (PIN: 1213)...');
        await client.query(`
            INSERT INTO users (full_name, pin_hash, role, assigned_location_id, is_active)
            VALUES ('Admin Sandbox', '1213', 'ADMIN', $1, true)
            ON CONFLICT DO NOTHING;
        `, [locationId]);;

        // 4. Insertar Terminal de Prueba
        console.log('💻 Registrando terminal de prueba...');
        await client.query(`
            INSERT INTO terminals (name, location_id, is_active, status)
            VALUES ('CAJA-SANDBOX-1', $1, true, 'ACTIVE')
        `, [locationId]);

        // 5. Simular Inventario Base
        console.log('📦 Inyectando productos de prueba...');
        await client.query(`
            INSERT INTO products (name, sku, category, price, is_active)
            VALUES 
            ('Paracetamol Sandbox', 'SAND-001', 'FARMA', 2500, true),
            ('Ibuprofeno Sandbox', 'SAND-002', 'FARMA', 3500, true)
            ON CONFLICT DO NOTHING;
        `);

        console.log('✅ Sandbox poblado con éxito.');
        client.release();
    } catch (err) {
        console.error('❌ Error inyectando semillas:', err);
    } finally {
        await pool.end();
    }
}

seedSandbox();
