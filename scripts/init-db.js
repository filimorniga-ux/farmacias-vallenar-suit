import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
            rejectUnauthorized: false
        },
    });

    try {
        console.log('🔄 Conectando a la base de datos...\n');

        // Limpiar tablas existentes
        console.log('🗑️  Limpiando tablas anteriores...');
        await pool.query('DROP TABLE IF EXISTS ventas CASCADE');
        await pool.query('DROP TABLE IF EXISTS lotes CASCADE');
        await pool.query('DROP TABLE IF EXISTS productos CASCADE');
        console.log('✅ Tablas eliminadas\n');

        // Crear tabla productos
        console.log('📦 Creando tabla productos...');
        await pool.query(`
      CREATE TABLE productos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        dci VARCHAR(255),
        categoria VARCHAR(50) NOT NULL,
        condicion_venta VARCHAR(50) DEFAULT 'LIBRE',
        requiere_frio BOOLEAN DEFAULT FALSE,
        comisionable BOOLEAN DEFAULT FALSE,
        precio_venta INTEGER NOT NULL,
        costo_compra INTEGER NOT NULL,
        imagen_url TEXT,
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
        console.log('✅ Tabla productos creada\n');

        // Crear tabla lotes
        console.log('📦 Creando tabla lotes...');
        await pool.query(`
      CREATE TABLE lotes (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
        numero_lote VARCHAR(50) NOT NULL,
        fecha_vencimiento DATE NOT NULL,
        cantidad_disponible INTEGER NOT NULL DEFAULT 0,
        ubicacion_fisica VARCHAR(100),
        estado VARCHAR(20) DEFAULT 'DISPONIBLE',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(producto_id, numero_lote)
      )
    `);
        console.log('✅ Tabla lotes creada\n');

        // Crear tabla ventas
        console.log('📦 Creando tabla ventas...');
        await pool.query(`
      CREATE TABLE ventas (
        id SERIAL PRIMARY KEY,
        fecha TIMESTAMP DEFAULT NOW(),
        total INTEGER NOT NULL,
        metodo_pago VARCHAR(20) NOT NULL,
        tipo_boleta VARCHAR(20) DEFAULT 'BOLETA',
        items JSONB NOT NULL,
        cliente_rut VARCHAR(12),
        tipo_receta VARCHAR(30)
      )
    `);
        console.log('✅ Tabla ventas creada\n');

        // Insertar datos semilla - PRODUCTOS
        console.log('🌱 Insertando productos...');
        const productos = [
            ['Losartán 50mg Comprimidos x30', 'Losartán', 'medicamento', 'LIBRE', false, false, 8990, 4500],
            ['Insulina NPH 100UI/ml 10ml', 'Insulina Humana', 'medicamento', 'RECETA_SIMPLE', true, false, 18990, 12000],
            ['Ibuprofeno 400mg Comprimidos x20', 'Ibuprofeno', 'medicamento', 'DIRECTA', false, false, 3490, 1200],
            ['Zopiclona 7.5mg Comprimidos x30', 'Zopiclona', 'medicamento', 'RECETA_RETENIDA', false, false, 12990, 7500],
            ['Maam Crema Antiarrugas 50ml', null, 'belleza', 'LIBRE', false, true, 24990, 10000],
        ];

        for (const [nombre, dci, categoria, condicion_venta, requiere_frio, comisionable, precio_venta, costo_compra] of productos) {
            await pool.query(
                'INSERT INTO productos (nombre, dci, categoria, condicion_venta, requiere_frio, comisionable, precio_venta, costo_compra) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [nombre, dci, categoria, condicion_venta, requiere_frio, comisionable, precio_venta, costo_compra]
            );
        }
        console.log('✅ 5 productos insertados\n');

        // Insertar datos semilla - LOTES
        console.log('🌱 Insertando lotes...');
        const lotes = [
            [1, 'LOS-2025-A', '2026-12-31', 150, 'A1-Cajón 2', 'DISPONIBLE'],
            [2, 'INS-2025-B', '2025-06-30', 45, 'Refrigerador-Bandeja 1', 'DISPONIBLE'],
            [3, 'IBU-2025-C', '2027-03-15', 320, 'B2-Cajón 1', 'DISPONIBLE'],
            [4, 'ZOP-2025-D', '2026-09-20', 40, 'C1-Caja Fuerte', 'DISPONIBLE'],
            [5, 'MAAM-2025-E', '2026-11-30', 80, 'D3-Vitrina', 'DISPONIBLE'],
        ];

        for (const [producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica, estado] of lotes) {
            await pool.query(
                'INSERT INTO lotes (producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica, estado) VALUES ($1, $2, $3, $4, $5, $6)',
                [producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica, estado]
            );
        }
        console.log('✅ 5 lotes insertados\n');

        // Verificar datos cargados
        const { rows: [{ count: prodCount }] } = await pool.query('SELECT COUNT(*) FROM productos');
        const { rows: [{ count: loteCount }] } = await pool.query('SELECT COUNT(*) FROM lotes');

        console.log('═══════════════════════════════════════');
        console.log('✅ BASE DE DATOS INICIALIZADA CON ÉXITO');
        console.log('═══════════════════════════════════════');
        console.log(`📊 Productos cargados: ${prodCount}`);
        console.log(`📊 Lotes cargados: ${loteCount}`);
        console.log('═══════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Error al inicializar la base de datos:');
        console.error(error.message);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

initDatabase();
