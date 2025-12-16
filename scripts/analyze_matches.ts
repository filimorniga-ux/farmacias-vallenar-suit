
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

function normalize(str: string) {
    return str
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[^a-z0-9]/g, "") // remove non-alphanumeric
        .trim();
}

async function main() {
    console.log('🔍 Analizando cruce por NOMBRE (Fallback)...');

    // 1. Load CSV names
    const csvPath = path.join(process.cwd(), 'data/isp_oficial.csv');
    const fileContent = fs.readFileSync(csvPath, 'latin1');
    const lines = fileContent.split('\n').slice(4);

    const csvProducts: Map<string, string> = new Map(); // Normalized Name -> ISP Register
    let bioCount = 0;

    for (const line of lines) {
        const cols = line.split(';');
        if (cols.length < 6) continue;

        const name = cols[2]?.trim();
        const registro = cols[3]?.trim();
        const estado = cols[5]?.trim();

        if (name && registro && estado && estado.includes('EQUIVALENTE')) {
            csvProducts.set(normalize(name), registro);
            bioCount++;
        }
    }
    console.log(`📋 CSV: ${bioCount} Bioequivalentes cargados.`);

    // 2. Load DB names
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT id, name FROM products');
        const dbProducts = res.rows;
        console.log(`🗄️  DB: ${dbProducts.length} productos.`);

        // 3. Match
        let matchCount = 0;
        const matches: any[] = [];

        for (const p of dbProducts) {
            const normDbName = normalize(p.name);
            // Try exact normalized match
            // Also try "starts with" or "contains" might be risky for auto-update, but acceptable for analysis.
            // Let's stick to normalized exact match first.

            if (csvProducts.has(normDbName)) {
                matchCount++;
                matches.push({ db: p.name, csv: csvProducts.get(normDbName) });
            }
        }

        console.log(`\n🤝 Coincidencias exactas (Normalizadas): ${matchCount}`);
        if (matchCount > 0) {
            console.log('Ejemplos:', matches.slice(0, 5));
        }

    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
