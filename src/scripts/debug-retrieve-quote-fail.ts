import { retrieveQuoteSecure } from '../actions/quotes-v2';
import { pool } from '../lib/db';

async function run() {
    try {
        console.log('🔍 Buscando ID de cotización...');
        const res = await pool.query('SELECT id FROM quotes ORDER BY created_at DESC LIMIT 1');

        if (res.rows.length === 0) {
            console.log('❌ No hay cotizaciones en la DB.');
            return;
        }

        const quoteId = res.rows[0].id;
        console.log(`✅ Cotización encontrada: ${quoteId}`);
        console.log('🔄 Ejecutando retrieveQuoteSecure...');

        const result = await retrieveQuoteSecure(quoteId);
        console.log('📊 Resultado:', JSON.stringify(result, null, 2));

    } catch (e) {
        console.error('❌ Error fatal:', e);
    } finally {
        await pool.end();
    }
}

run();
