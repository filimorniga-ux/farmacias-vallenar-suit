
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';
import { DEV_TEST_ACCOUNT } from './dev-account-support';

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

        // 3. Insertar Cuenta DEV controlada
        console.log(`👤 Asegurando cuenta DEV controlada (${DEV_TEST_ACCOUNT.email})...`);
        const hashedPin = await bcrypt.hash(DEV_TEST_ACCOUNT.pin, 10);
        await client.query(`
            INSERT INTO users (
                id,
                rut,
                name,
                email,
                role,
                access_pin_hash,
                access_pin,
                job_title,
                status,
                is_active,
                assigned_location_id,
                session_token,
                token_version,
                created_at,
                updated_at
            )
            SELECT
                gen_random_uuid(),
                '22.222.222-2',
                $2,
                $3,
                $4,
                $5,
                NULL,
                $6,
                'ACTIVE',
                true,
                $1,
                NULL,
                1,
                NOW(),
                NOW()
            )
            WHERE NOT EXISTS (
                SELECT 1 FROM users WHERE email = $3 OR job_title = $6 OR name = $2
            );
        `, [locationId, DEV_TEST_ACCOUNT.name, DEV_TEST_ACCOUNT.email, DEV_TEST_ACCOUNT.role, hashedPin, DEV_TEST_ACCOUNT.jobTitle]);

        await client.query(`
            UPDATE users
            SET role = $4,
                access_pin_hash = $5,
                access_pin = NULL,
                job_title = $6,
                status = 'ACTIVE',
                is_active = true,
                assigned_location_id = $1,
                session_token = NULL,
                token_version = COALESCE(token_version, 1) + 1,
                updated_at = NOW()
            WHERE email = $3 OR job_title = $6 OR name = $2
        `, [locationId, DEV_TEST_ACCOUNT.name, DEV_TEST_ACCOUNT.email, DEV_TEST_ACCOUNT.role, hashedPin, DEV_TEST_ACCOUNT.jobTitle]);

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

        console.log(`✅ Sandbox poblado con éxito. Cuenta DEV lista con ${DEV_TEST_ACCOUNT.ensureCommand}.`);
        client.release();
    } catch (err) {
        console.error('❌ Error inyectando semillas:', err);
    } finally {
        await pool.end();
    }
}

seedSandbox();
