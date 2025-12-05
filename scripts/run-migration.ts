import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno ANTES de importar db
dotenv.config({ path: '.env.migration' });

async function runMigration() {
    try {
        // Importar dinámicamente para asegurar que las env vars ya estén cargadas
        const { query, pool } = await import('../src/lib/db');

        // 1. Ejecutar Schema Inicial (Base)
        const schemaPath = path.join(process.cwd(), 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        console.log('🚀 Ejecutando Schema Inicial...');
        await query(schemaSql);
        console.log('✅ Schema Inicial cargado.');

        // 2. Ejecutar Migración Multi-Tienda
        const migrationPath = path.join(process.cwd(), 'src/db/migrations/001_multi_store_setup.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');

        console.log('🚀 Ejecutando migración Multi-Tienda...');
        await query(migrationSql);
        console.log('✅ Migración completada exitosamente.');

        await pool.end();
    } catch (error) {
        console.error('❌ Error en la migración:', error);
        process.exit(1);
    }
}

runMigration();
