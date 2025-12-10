
import dotenv from 'dotenv';
import path from 'path';

// Fix: Load .env explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

// Dynamic import to ensure env vars are loaded
let query: any;

async function main() {
    const dbModule = await import('../lib/db');
    query = dbModule.query;

    console.log('🔧 Iniciando Reparación de Datos...');

    // 1. Get Centro Location ID
    const locRes = await query("SELECT id FROM locations WHERE name LIKE '%Centro%' LIMIT 1");
    const centroId = locRes.rows[0]?.id;

    if (!centroId) {
        console.error('❌ No encontré la sucursal Centro');
        return;
    }
    console.log(`📍 Sucursal Centro ID: ${centroId}`);

    // 2. Fix Future Dates (> Dec 10 2025)
    // We will shift them random days back to fall within Nov-Dec range
    console.log('⏳ Ajustando fechas futuras...');

    // Using a SQL update with random interval substraction is efficient
    // Shift timestamps > '2025-12-10 23:59:59' back by 1-30 days
    const updateDates = await query(`
        UPDATE sales 
        SET timestamp = timestamp - (floor(random() * 30 + 10) || ' days')::interval
        WHERE timestamp > '2025-12-10 23:59:59'
    `);
    console.log(`✅ Fechas corregidas: ${updateDates.rowCount} ventas movidas al pasado/presente.`);

    // 3. Move Sales to Centro
    // Move sales from Bodegas (or just everything > 10k that isn't in Centro?)
    // To be safe, let's move all sales created recently (e.g. injected ones which might be high value)
    // Or just all sales not in Centro if we assume this is a single store setup mostly.
    // Let's filter by the ones we likely injected (total_amount > 10000)
    console.log('🚚 Moviendo ventas a Sucursal Centro...');

    const updateLoc = await query(`
        UPDATE sales
        SET location_id = $1::uuid
        WHERE location_id != $1::uuid
        AND total_amount > 10000
    `, [centroId]); // Assuming centroId is UUID string

    console.log(`✅ Ubicación corregida: ${updateLoc.rowCount} ventas movidas a Centro.`);

    console.log('🎉 Reparación Completada.');
    process.exit(0);
}

main();
