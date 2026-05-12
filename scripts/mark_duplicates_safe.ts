
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

const { Pool } = pg;
const MARK_DUPLICATES_ALLOW_NON_LOCAL_ENV = 'MARK_DUPLICATES_ALLOW_NON_LOCAL';
const MARK_DUPLICATES_CONFIRM_ENV = 'MARK_DUPLICATES_CONFIRM';
const MARK_DUPLICATES_CONFIRMATION = 'RENAME_DUPLICATE_PRODUCTS';
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
}

if (process.env[MARK_DUPLICATES_CONFIRM_ENV] !== MARK_DUPLICATES_CONFIRMATION) {
    console.error(
        `❌ Refusing to rename duplicate products without explicit confirmation. ` +
        `Set ${MARK_DUPLICATES_CONFIRM_ENV}=${MARK_DUPLICATES_CONFIRMATION} to continue.`
    );
    process.exit(1);
}

assertScriptDbWriteTargetAllowed({
    scriptName: 'mark_duplicates_safe',
    connectionString: dbUrl,
    allowNonLocalEnv: MARK_DUPLICATES_ALLOW_NON_LOCAL_ENV,
});

console.log('🎯 DB target:', redactConnectionString(dbUrl));

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('🔌 Conectado a DB');
        console.log('🔍 Analizando duplicados exactos por NOMBRE...');

        // 1. Find duplicate names
        const findDisplsql = `
            SELECT name, count(*), array_agg(id) as ids
            FROM products
            WHERE is_active = true
            GROUP BY name
            HAVING count(*) > 1
        `;

        const res = await client.query(findDisplsql);
        console.log(`⚠️ Se encontraron ${res.rowCount} grupos de nombres duplicados.`);

        if (res.rowCount === 0) return;

        const changes = [];

        for (const row of res.rows) {
            const name = row.name;
            const ids = row.ids;

            // Get details to decide which one to keep
            // We prioritize: 
            // 1. Stock > 0
            // 2. Created earlier (Original) ? Or Created later? 
            //    Usually the one with sales history is better, but checking sales is expensive here.
            //    Let's prioritize Stock > 0. If multiple have stock, keep the one created FIRST (oldest ID/date).

            // Fetch full product details for these IDs
            const detailsQuery = `
                SELECT 
                    p.id, p.sku, p.created_at,
                    COALESCE((SELECT SUM(quantity_real) FROM inventory_batches WHERE product_id = p.id), 0) as total_stock
                FROM products p
                WHERE p.id = ANY($1::uuid[])
            `;

            const detailsRes = await client.query(detailsQuery, [ids]);
            const products = detailsRes.rows;

            // Sort logic:
            // - Primary: Descending Stock (Keep high stock)
            // - Secondary: Ascending CreatedAt (Keep oldest/original)
            products.sort((a, b) => {
                const stockDiff = Number(b.total_stock) - Number(a.total_stock);
                if (stockDiff !== 0) return stockDiff;

                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });

            const winner = products[0];
            const losers = products.slice(1);

            console.log(`\n🏆 Grupo: "${name}"`);
            console.log(`   ✅ MANTENER: ${winner.sku} (Stock: ${winner.total_stock}, ID: ${winner.id})`);

            for (const loser of losers) {
                const newName = `(DUP) ${name}`; // Prefix makes it obvious
                console.log(`   ✏️ MARCAR:   ${loser.sku} (Stock: ${loser.total_stock}) -> "${newName}"`);

                changes.push({
                    id: loser.id,
                    oldName: name,
                    newName: newName
                });
            }
        }

        // 3. Confirm execution
        console.log(`\n📝 Se van a renombrar ${changes.length} productos.`);
        console.log('Guardando log de cambios en "duplicates_rename_log.json"...');

        fs.writeFileSync(
            path.resolve(process.cwd(), 'duplicates_rename_log.json'),
            JSON.stringify(changes, null, 2)
        );

        // 4. Execute Updates
        console.log('🚀 Aplicando cambios en base de datos...');
        for (const change of changes) {
            await client.query(
                `UPDATE products SET name = $1, updated_at = NOW() WHERE id = $2`,
                [change.newName, change.id]
            );
        }

        console.log('✅ Finalizado correctamente.');

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
