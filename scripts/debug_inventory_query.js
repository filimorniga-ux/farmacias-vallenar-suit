
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

        // 1. Obtener Location ID válida
        const resLoc = await client.query('SELECT id, name FROM locations LIMIT 1');
        if (resLoc.rows.length === 0) {
            console.error('❌ No se encontraron locations.');
            return;
        }
        const locationId = resLoc.rows[0].id;
        console.log(`📍 Location: ${locationId} (${resLoc.rows[0].name})`);

        // 2. Query EXACTA de inventory-v2.ts (sin filtros de categoría, caso TODOS)
        // Sustituyendo params por $1, $2, $3
        const sql = `
            WITH combined_inventory AS (
                -- 1. Batches in location
                SELECT 
                    ib.id::text as batch_id,
                    ib.product_id::text,
                    ib.sku,
                    COALESCE(ib.name, p.name) as name,
                    p.dci,
                    p.laboratory,
                    p.category,
                    p.condicion_venta as condition,
                    ib.quantity_real as stock_actual,
                    COALESCE(ib.stock_min, p.stock_minimo_seguridad, 5) as stock_min,
                    COALESCE(ib.sale_price, ib.price_sell_box, p.price) as price,
                    ib.expiry_date,

                    false as is_express_entry, 
                    ib.source_system,
                    ib.created_at
                FROM inventory_batches ib
                LEFT JOIN products p ON ib.product_id::text = p.id
                WHERE ib.location_id = $1::uuid
                AND (p.is_active = true OR p.id IS NULL)
                
                UNION ALL
                
                -- 2. Products not in batches (Zero Stock)
                SELECT 
                    p.id as batch_id, 
                    p.id as product_id,
                    p.sku,
                    p.name,
                    p.dci,
                    p.laboratory,
                    p.category,
                    p.condicion_venta as condition,
                    0 as stock_actual,
                    COALESCE(p.stock_minimo_seguridad, 5) as stock_min,
                    p.price,
                    NULL as expiry_date,

                    false as is_express_entry,
                    p.source_system,
                    p.created_at
                FROM products p
                WHERE (p.location_id = $1::text OR p.location_id IS NULL)
                AND p.is_active = true
                AND NOT EXISTS (
                    SELECT 1 FROM inventory_batches ib 
                    WHERE ib.sku = p.sku AND ib.location_id = $1::uuid
                )
            ),
            filtered_inventory AS (
                SELECT ib.*, COUNT(*) OVER() as total_count 
                FROM combined_inventory ib
                WHERE 1=1 
            )
            SELECT * FROM filtered_inventory
            ORDER BY name ASC
            LIMIT $2 OFFSET $3
        `;

        const limit = 50;
        const offset = 0;

        console.log('🚀 Ejecutando Query...');
        const res = await client.query(sql, [locationId, limit, offset]);

        console.log(`✅ Filas devueltas: ${res.rowCount}`);
        if (res.rowCount > 0) {
            console.log('📦 Primera fila:', res.rows[0]);
            console.log('📊 Total Count:', res.rows[0].total_count);
        } else {
            console.log('⚠️ Cero filas devueltas. Algo anda mal con la query.');
        }

    } catch (err) {
        console.error('❌ Error SQL:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
