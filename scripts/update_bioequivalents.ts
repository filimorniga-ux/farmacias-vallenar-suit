
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

// Load environment variables
dotenv.config();

const UPDATE_BIOEQUIVALENTS_ALLOW_NON_LOCAL_ENV = 'UPDATE_BIOEQUIVALENTS_ALLOW_NON_LOCAL';
const UPDATE_BIOEQUIVALENTS_CONFIRM_ENV = 'UPDATE_BIOEQUIVALENTS_CONFIRM';
const UPDATE_BIOEQUIVALENTS_CONFIRMATION = 'MARK_BIOEQUIVALENTS_FROM_ISP';
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
}

if (process.env[UPDATE_BIOEQUIVALENTS_CONFIRM_ENV] !== UPDATE_BIOEQUIVALENTS_CONFIRMATION) {
    console.error(
        `❌ Refusing to update bioequivalent product flags without explicit confirmation. ` +
        `Set ${UPDATE_BIOEQUIVALENTS_CONFIRM_ENV}=${UPDATE_BIOEQUIVALENTS_CONFIRMATION} to continue.`
    );
    process.exit(1);
}

assertScriptDbWriteTargetAllowed({
    scriptName: 'update_bioequivalents',
    connectionString: dbUrl,
    allowNonLocalEnv: UPDATE_BIOEQUIVALENTS_ALLOW_NON_LOCAL_ENV,
});

console.log('🎯 DB target:', redactConnectionString(dbUrl));

const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
    console.log('🚀 Iniciando actualización de Bioequivalentes...');

    const csvPath = path.join(process.cwd(), 'data/isp_oficial.csv');

    if (!fs.existsSync(csvPath)) {
        console.error('❌ Archivo isp_oficial.csv no encontrado en data/');
        process.exit(1);
    }

    const fileContent = fs.readFileSync(csvPath, 'latin1'); // Use latin1 for possible encoding issues ()
    const lines = fileContent.split('\n');

    console.log(`📄 Total líneas archivo: ${lines.length}`);

    // Headers are on line 4 (index 3), data starts on line 5 (index 4)
    const dataLines = lines.slice(4);

    const bioequivalentRegisters: string[] = [];

    for (const line of dataLines) {
        if (!line.trim()) continue;

        const cols = line.split(';');
        if (cols.length < 6) continue;

        const registro = cols[3]?.trim();
        const estado = cols[5]?.trim();

        // Check columns
        if (registro && estado && estado.includes('EQUIVALENTE')) {
            bioequivalentRegisters.push(registro);
        }
    }

    console.log(`✅ Detectados ${bioequivalentRegisters.length} productos bioequivalentes en CSV.`);

    if (bioequivalentRegisters.length === 0) {
        console.log('⚠️ No se encontraron registros para actualizar.');
        process.exit(0);
    }

    // Update in batches
    const batchSize = 500;
    let updatedCount = 0;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Optional: Reset all first? unique risk. 
        // User asked: "Si hay coincidencia...". Implicitly we are just marking the ones found.
        // But for "Correction" ideally we'd clear first. 
        // Let's stick to ADDITIVE as usually safer unless specified "Sync". 
        // User said "The script ignored...". 

        // However, I'll print current count first.
        const resBefore = await client.query('SELECT COUNT(*) FROM products WHERE is_bioequivalent = true');
        console.log(`📊 Bioequivalentes actuales en DB: ${resBefore.rows[0].count}`);

        for (let i = 0; i < bioequivalentRegisters.length; i += batchSize) {
            const batch = bioequivalentRegisters.slice(i, i + batchSize);

            // Generate list of placeholders ($1, $2, ...)
            const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',');

            const query = `
                UPDATE products 
                SET is_bioequivalent = true 
                WHERE isp_register IN (${placeholders})
            `;

            const res = await client.query(query, batch);
            updatedCount += res.rowCount || 0;

            process.stdout.write(`\r🔄 Procesando... ${Math.min(i + batchSize, bioequivalentRegisters.length)}/${bioequivalentRegisters.length}`);
        }

        await client.query('COMMIT');
        console.log(`\n\n🎉 Actualización completada.`);
        console.log(`✨ Registros marcados en esta ejecución: ${updatedCount}`);

        const resAfter = await client.query('SELECT COUNT(*) FROM products WHERE is_bioequivalent = true');
        console.log(`📊 Total Bioequivalentes en DB ahora: ${resAfter.rows[0].count}`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('\n❌ Error durante la actualización:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
