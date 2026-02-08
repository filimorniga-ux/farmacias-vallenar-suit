
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('🔌 Conectado a DB');

        // Buscar productos con nombres duplicados o muy similares (mismos primeros 15 caracteres)
        const sql = `
            SELECT 
                substring(name from 1 for 20) as short_name,
                count(*) as qty,
                array_agg(id) as ids,
                array_agg(is_active) as active_status,
                array_agg(sku) as skus
            FROM products
            WHERE is_active = true
            GROUP BY short_name
            HAVING count(*) > 1
            ORDER BY qty DESC
            LIMIT 10;
        `;

        console.log('🔍 Buscando posibles duplicados...');
        const res = await client.query(sql);

        if (res.rows.length === 0) {
            console.log('✅ No se encontraron duplicados obvios por nombre.');
        } else {
            console.log('⚠️ Posibles duplicados encontrados:');
            res.rows.forEach(row => {
                console.log(`\n📦 Grupo: "${row.short_name}..." (${row.qty})`);
                row.ids.forEach((id: string, i: number) => {
                    console.log(`   - ID: ${id} | SKU: ${row.skus[i]} | Activo: ${row.active_status[i]}`);
                });
            });
        }

    } catch (err) {
        console.error('❌ Error SQL:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
