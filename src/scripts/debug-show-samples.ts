
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function showSamples() {
    await client.connect();

    // Select 10 random cleanly processed products
    const res = await client.query(`
        SELECT 
            raw_title, 
            processed_title,
            raw_misc,
            COALESCE(p.name, 'Sin Producto Linkeado') as canonical_name
        FROM inventory_imports ii
        LEFT JOIN products p ON ii.product_id = p.id
        WHERE processed_title IS NOT NULL
        ORDER BY RANDOM()
        LIMIT 10
    `);

    console.log("\n📦 --- MUESTRA DE CALIDAD (10 Productos) --- 📦\n");

    res.rows.forEach((row, i) => {
        const misc = row.raw_misc || {};
        const lab = misc.laboratorio || 'N/A';
        const cat = misc.categoria || 'N/A';

        console.log(`🔹 #${i + 1}`);
        console.log(`   📝 Original:  "${row.raw_title}"`);
        console.log(`   ✨ Limpio:    "${row.processed_title}"`);
        console.log(`   🏢 Lab:       ${lab}`);
        console.log(`   📂 Cat:       ${cat}`);
        console.log("   -------------------------------------------------");
    });

    await client.end();
}

showSamples();
