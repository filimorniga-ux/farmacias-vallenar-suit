import { query } from '../src/lib/db';

async function migrate() {
    console.log('Aplicando migración de plantillas...');
    try {
        await query(`
      ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 0;
    `);
        console.log('- Columna break_minutes agregada (o ya existía).');

        await query(`
      ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS is_rest_day BOOLEAN DEFAULT FALSE;
    `);
        console.log('- Columna is_rest_day agregada (o ya existía).');

        console.log('Migración completada exitosamente.');
    } catch (error) {
        console.error('Error durante la migración:', error);
    } finally {
        process.exit();
    }
}

migrate();
