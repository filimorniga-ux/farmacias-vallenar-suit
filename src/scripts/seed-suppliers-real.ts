import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

// --- CONFIG ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// --- DATA ---
const REAL_SUPPLIERS = [
    { name: "Abbott Laboratories de Chile Ltda.", address: "Av. Pedro de Valdivia 295, Providencia", phone: "+56 2 2350 5200", email: "", web: "abbott.cl" },
    { name: "AbbVie Productos Farmacéuticos Ltda.", address: "Av. Apoquindo 5550, Las Condes", phone: "+56 2 3213 3900", email: "", web: "abbvie.cl" },
    { name: "Adium Chile", address: "Av. Pedro de Valdivia 1215, Providencia", phone: "+56 2 2594 9200", email: "svc_cl-recepcion1@adium.cl", web: "adium.cl" },
    { name: "Axon Pharma SpA", address: "Rosario Norte 615, Las Condes", phone: "+56 2 2964 9430", email: "info.chile@axon-pharma.com", web: "axon-pharma.cl" },
    { name: "Laboratorio Bagó de Chile S.A.", address: "Av. Santa Clara 301, Huechuraba", phone: "+56 2 2368 2700", email: "contacto@bago.cl", web: "bagochile.cl" },
    { name: "Bayer S.A.", address: "Av. Andrés Bello 2457, Providencia", phone: "+56 2 2520 8423", email: "vendors.cl@bayer.com", web: "bayer.cl" },
    { name: "Boehringer Ingelheim Ltda.", address: "Isidora Goyenechea 3000, Las Condes", phone: "+56 2 2327 5000", email: "", web: "boehringer-ingelheim.com" },
    { name: "Bristol-Myers Squibb", address: "Av. Pdte. Riesco 5435, Las Condes", phone: "+56 2 2798 9200", email: "", web: "bms.com" },
    { name: "CSL Behring SpA", address: "Av. Presidente Kennedy 4700, Vitacura", phone: "+56 2 3278 9782", email: "administracion.chile@cslbehring.com", web: "cslbehring.cl" },
    { name: "Laboratorio Gador Ltda.", address: "Antonio Bellet 444, Providencia", phone: "+56 2 2887 1600", email: "infogadorchile@gador.cl", web: "gador.cl" },
    { name: "GlaxoSmithKline Chile", address: "Av. Andrés Bello 2457, Providencia", phone: "+56 2 2382 9000", email: "san.comunicaciones-chile@gsk.com", web: "gsk.cl" },
    { name: "Laboratorios Knop Ltda.", address: "General Calderón 43, Providencia", phone: "+56 2 2366 593", email: "", web: "knop.cl" },
    { name: "Laboratorio Chile S.A.", address: "Av. Marathon 1315, Ñuñoa", phone: "+56 2 2365 5000", email: "", web: "laboratoriochile.cl" },
    { name: "Laboratorio Maver Ltda.", address: "Calle Las Encinas 1777, Lampa", phone: "+56 2 2487 4100", email: "", web: "maver.cl" },
    { name: "MSD Chile", address: "Av. Mariano Sánchez Fontecilla 310, Las Condes", phone: "+56 2 2655 8820", email: "privacidadcl@msd.com", web: "msdchile.cl" },
    { name: "Novartis Chile S.A.", address: "Rosario Norte 615, Las Condes", phone: "+56 2 2350 0200", email: "novartis.chile@novartis.com", web: "novartis.cl" },
    { name: "Pfizer Chile S.A.", address: "Cerro El Plomo 5680, Las Condes", phone: "+56 2 2412 0000", email: "", web: "pfizer.cl" },
    { name: "Roche Chile Ltda.", address: "Av. Cerro El Plomo 5630, Las Condes", phone: "+56 2 2441 3200", email: "chile.servicioalcliente@roche.com", web: "roche.cl" },
    { name: "Sanofi Aventis de Chile", address: "Av. Pdte. Riesco 5435, Las Condes", phone: "+56 2 3340 8400", email: "contacto.chile@sanofi.com", web: "sanofi.cl" },
    { name: "Laboratorios Saval S.A.", address: "Av. Pdte. Eduardo Frei M. 4600, Renca", phone: "+56 2 2707 3000", email: "lab@savalcorp.com", web: "savalcorp.com" },
    { name: "Laboratorios Siegfried", address: "Isidora Goyenechea 3000, Las Condes", phone: "+56 2 2365 9615", email: "", web: "siegfriedchile.cl" },
    { name: "Lab. Silesia S.A.", address: "Av. Quilín 5273, Peñalolén", phone: "+56 2 2594 8200", email: "contacto@silesia.cl", web: "laboratoriosilesia.cl" },
    { name: "Laboratorio Mintlab S.A.", address: "Nueva Andrés Bello 1940, Independencia", phone: "+56 2 2562 4400", email: "contactomilab@milab.cl", web: "milab.cl" },
    { name: "Genomma Lab Chile", address: "Av. Andrés Bello 2233, Providencia", phone: "+56 2 2706 0460", email: "atencion@genommalab.com", web: "genommalab.com" }
];

// --- HELPER FUNCTIONS ---

// Generates a valid Chilean RUT using Modulo 11
function generateValidRut(): string {
    const number = Math.floor(Math.random() * (99000000 - 10000000 + 1)) + 10000000;

    let sum = 0;
    let multiplier = 2;
    const numStr = number.toString().split('').reverse();

    for (const digit of numStr) {
        sum += parseInt(digit) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const mod = sum % 11;
    const dvCalc = 11 - mod;
    let dv = '';

    if (dvCalc === 11) dv = '0';
    else if (dvCalc === 10) dv = 'K';
    else dv = dvCalc.toString();

    // Format: XX.XXX.XXX-Y
    const formatted = number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${formatted}-${dv}`;
}

// --- MAIN SCRIPT ---
async function main() {
    console.log('🚀 Starting Real Suppliers Injection...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Analyze Schema Columns
        console.log('🔍 Analyzing table columns...');
        const resCols = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'suppliers'
        `);
        const columns = resCols.rows.map(r => r.column_name);
        const hasWebsite = columns.includes('website');
        const hasNotes = columns.includes('notes');
        const hasPhone = columns.includes('phone'); // Prompt requested 'phone'
        const hasPhone1 = columns.includes('phone_1');
        const hasEmail = columns.includes('email');
        const hasEmailOrders = columns.includes('email_orders');
        const hasContactEmail = columns.includes('contact_email');

        console.log(`   Columns detected: website=${hasWebsite}, notes=${hasNotes}, phone=${hasPhone}, phone_1=${hasPhone1}`);

        // 2. Clean Existing Data
        console.log('🧹 Cleaning existing suppliers...');
        await client.query('DELETE FROM suppliers');

        // 3. Insert Data
        console.log(`📝 Inserting ${REAL_SUPPLIERS.length} suppliers...`);

        for (const sup of REAL_SUPPLIERS) {
            const id = uuidv4();
            const rut = generateValidRut();

            // Map Web
            let websiteVal = null;
            let notesVal = null;
            let fantasyNameVal = sup.name;

            if (hasWebsite && sup.web) {
                websiteVal = `https://www.${sup.web}`;
            } else if (!hasWebsite && sup.web) {
                // Fallback: Try notes or append to description if we had one (we don't), just log?
                // Prompt said: "Mapear web al campo fantasy_name o notas"
                if (hasNotes) {
                    notesVal = `Web: ${sup.web}`;
                } else {
                    // Fallback to appending to fantasy name if really needed, but let's keep clean just in case
                    // fantasyNameVal = `${sup.name} (${sup.web})`; 
                    // Actually, if no website column, we lose it unless we put it in notes.
                }
            }

            // Map Phone (Prioritize specific columns)
            // If DB has `phone`, use it. If `phone_1`, use it too.
            const phoneVal = sup.phone;

            // Map Email
            const emailVal = sup.email;

            // Prepare Query dynamically based on what we have
            const insertFields = ['id', 'rut', 'business_name', 'fantasy_name', 'address'];
            const insertValues: any[] = [id, rut, sup.name, fantasyNameVal, sup.address];
            let idx = 6;

            if (hasWebsite) { insertFields.push('website'); insertValues.push(websiteVal); }
            if (hasNotes) { insertFields.push('notes'); insertValues.push(notesVal); }

            // Phone Logic
            if (hasPhone) { insertFields.push('phone'); insertValues.push(phoneVal); }
            if (hasPhone1 && !hasPhone) { insertFields.push('phone_1'); insertValues.push(phoneVal); } // Fallback to phone_1 if phone missing
            else if (hasPhone1 && hasPhone) { insertFields.push('phone_1'); insertValues.push(phoneVal); } // Populate both? sure.

            // Email Logic
            // email (generic), email_orders, contact_email
            if (hasEmail) { insertFields.push('email'); insertValues.push(emailVal); }
            if (hasEmailOrders) { insertFields.push('email_orders'); insertValues.push(emailVal); }
            if (hasContactEmail) { insertFields.push('contact_email'); insertValues.push(emailVal); }

            // Construct Query
            const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
            const queryText = `INSERT INTO suppliers (${insertFields.join(', ')}) VALUES (${placeholders})`;

            await client.query(queryText, insertValues);
        }

        await client.query('COMMIT');
        console.log(`✅ Se han insertado ${REAL_SUPPLIERS.length} Proveedores Reales`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error injecting suppliers:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
