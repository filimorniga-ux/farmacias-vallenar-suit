
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function processMetadata() {
    try {
        await client.connect();

        // 1. Create Tables for Metadata if they don't exist
        console.log("🏗️  Verificando tablas de metadatos...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS laboratories (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS therapeutic_actions (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            );
            
            -- Add columns to inventory_imports only if they don't exist
            ALTER TABLE inventory_imports 
            ADD COLUMN IF NOT EXISTS normalized_category_id INTEGER REFERENCES categories(id),
            ADD COLUMN IF NOT EXISTS normalized_lab_id INTEGER REFERENCES laboratories(id),
            ADD COLUMN IF NOT EXISTS normalized_action_id INTEGER REFERENCES therapeutic_actions(id);
        `);

        // 2. Extract Unique Values
        console.log("🔍 Extrayendo valores únicos de raw_misc...");

        // This query fetches the JSON field raw_misc
        const res = await client.query('SELECT id, raw_misc FROM inventory_imports WHERE raw_misc IS NOT NULL');

        const uniqueCats = new Set<string>();
        const uniqueLabs = new Set<string>();
        const uniqueActions = new Set<string>();

        // We clean/normalize in memory to avoid duplicates like "LAB CHILE" vs "L.CHILE"
        // Simple normalization rules map
        const LAB_MAP: Record<string, string> = {
            'L.CHILE': 'LABORATORIO CHILE',
            'CHILE': 'LABORATORIO CHILE',
            'LAB CHILE': 'LABORATORIO CHILE',
            'DE CHILE': 'LABORATORIO CHILE',
            'MINTLAB': 'MINTLAB',
            'MINTL.': 'MINTLAB',
            'OPKO': 'OPKO',
            'BAGO': 'BAGO',
            'KNOP': 'KNOP',
            'SAVAL': 'SAVAL',
            'PASTEUR': 'PASTEUR',
            'MEGALABS': 'MEGALABS',
            'ANDROMACO': 'ANDROMACO',
            // Add more as we discover them
        };

        for (const row of res.rows) {
            const misc = row.raw_misc;
            if (!misc) continue;

            if (misc.categoria) uniqueCats.add(misc.categoria.trim().toUpperCase());
            if (misc.laboratorio) {
                let lab = misc.laboratorio.trim().toUpperCase();
                // Apply simple normalization
                for (const [key, val] of Object.entries(LAB_MAP)) {
                    if (lab.includes(key)) {
                        lab = val;
                        break;
                    }
                }
                uniqueLabs.add(lab);
            }
            if (misc.accion_terapeutica) uniqueActions.add(misc.accion_terapeutica.trim().toUpperCase());
            if (misc.accion_terapeutica2) uniqueActions.add(misc.accion_terapeutica2.trim().toUpperCase());
        }

        console.log(`📊 Encontrados: ${uniqueCats.size} Categorías, ${uniqueLabs.size} Labs, ${uniqueActions.size} Acciones.`);

        // 3. Insert into DB (IGNORE ON CONFLICT)
        const insertBatch = async (table: string, values: Set<string>) => {
            for (const val of values) {
                if (!val || val.length < 2) continue; // Skip noise
                await client.query(`INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [val]);
            }
        };

        await insertBatch('categories', uniqueCats);
        await insertBatch('laboratories', uniqueLabs);
        await insertBatch('therapeutic_actions', uniqueActions);

        console.log("✅ Tablas maestras actualizadas.");

        // 4. Update References in inventory_imports
        // This is the heavy part: Linking back
        // For efficiency, we fetch the IDs map first
        const catMap = (await client.query('SELECT id, name FROM categories')).rows.reduce((acc, r) => ({ ...acc, [r.name]: r.id }), {});
        const labMap = (await client.query('SELECT id, name FROM laboratories')).rows.reduce((acc, r) => ({ ...acc, [r.name]: r.id }), {});
        const actMap = (await client.query('SELECT id, name FROM therapeutic_actions')).rows.reduce((acc, r) => ({ ...acc, [r.name]: r.id }), {});

        console.log("🔗 Vinculando productos...");
        let updated = 0;
        for (const row of res.rows) {
            const misc = row.raw_misc;
            let catId = null, labId = null, actId = null;

            if (misc.categoria) catId = catMap[misc.categoria.trim().toUpperCase()];

            if (misc.laboratorio) {
                let lab = misc.laboratorio.trim().toUpperCase();
                for (const [key, val] of Object.entries(LAB_MAP)) {
                    if (lab.includes(key)) {
                        lab = val;
                        break;
                    }
                }
                labId = labMap[lab];
            }

            if (misc.accion_terapeutica) actId = actMap[misc.accion_terapeutica.trim().toUpperCase()];

            if (catId || labId || actId) {
                await client.query(`
                    UPDATE inventory_imports 
                    SET 
                        normalized_category_id = $1,
                        normalized_lab_id = $2,
                        normalized_action_id = $3
                    WHERE id = $4
                `, [catId, labId, actId, row.id]);
                updated++;
            }
            if (updated % 1000 === 0) process.stdout.write('.');
        }

        console.log(`\n✅ ${updated} productos normalizados con metadatos.`);

    } catch (e) {
        console.error("Error processing metadata:", e);
    } finally {
        await client.end();
    }
}

processMetadata();
