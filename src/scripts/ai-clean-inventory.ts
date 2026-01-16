
import { Client } from 'pg';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

// Configuración
const BATCH_SIZE = 20; // Enviamos 20 productos de un golpe a la IA (Ahorra 95% de API Calls)
const SIMULATE = false; // false = guardar cambios reales en DB

if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL en .env");
if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY en .env");

const client = new Client({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Función que limpia una LISTA entera de una sola vez
async function cleanBatchWithAI(products: { id: string, name: string, lab: string }[]) {
    try {
        // Preparamos el texto para la IA con marcas de "No tocar"
        const listText = products.map(p => `- ID: ${p.id} | PRODUCTO: ${p.name} | LAB: ${p.lab || 'N/A'}`).join('\n');

        const prompt = `
        Actúa como experto farmacéutico. Recibirás una lista de productos. Tu misión es estandarizar sus nombres para un catálogo estético de venta al público.
        
        Reglas CRÍTICAS (Síguelas estrictamente):
        1. MARCAS: ¡NO ELIMINES LA MARCA! Si el nombre trae "MINTLAB", "OPKO", "CHILE", "L.CHILE", "KNOP", "SAVAL", "BAGO", etc., CONSÉRVALA visible.
           - Ejemplo: "Paracetamol 500 mg Mintlab" (No borres Mintlab).
        2. CANTIDAD/ENVASE: ¡NO BORRES LA CANTIDAD! Si dice "1000 COM", "30 COMP", "60 CAPS", "FRASCO", DEBE aparecer en el nombre final.
           - Ejemplo: "Paracetamol 500 mg x 1000 Comprimidos" (No borres el "1000").
        3. Genérico: Solo si es un genérico puro sin laboratorio identificable en el nombre, agrega "[Genérico]" al final.
        4. Formato: Usar Mayúsculas y Minúsculas (Title Case).
        5. DEVUELVE SOLO UN JSON VÁLIDO con este formato:
        {
          "products": [
            { "id": "...", "clean_name": "..." }
          ]
        }

        LISTA DE ENTRADA:
        ${listText}
        `;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o-mini",
            response_format: { type: "json_object" }, // Forzamos JSON
            temperature: 0.1,
        });

        const content = completion.choices[0].message.content;
        if (!content) return [];

        const parsed = JSON.parse(content);
        // A veces devuelve { "products": [...] } o directo el array
        return Array.isArray(parsed) ? parsed : (parsed.products || parsed.data || []);

    } catch (error) {
        console.error(`❌ Error Lote IA:`, error);
        return []; // Retorna vacío si falla el lote completo
    }
}

async function main() {
    try {
        await client.connect();

        // 1. Contamos cuántos faltan
        const total = await client.query('SELECT COUNT(*) FROM inventory_imports WHERE processed_title IS NULL AND raw_title IS NOT NULL');
        console.log(`🔌 Conectado a DB. Faltan ${total.rows[0].count} productos por limpiar.`);
        console.log("🚀 Iniciando limpieza POR LOTES (Smart Batching)...");

        let processedCount = 0;
        let hasMore = true;

        while (hasMore) {
            // 2. Buscar productos sucios (Usando raw_misc para el laboratorio)
            const res = await client.query(`
                SELECT id, raw_title as name, raw_misc->>'laboratorio' as lab 
                FROM inventory_imports 
                WHERE processed_title IS NULL 
                AND raw_title IS NOT NULL
                ORDER BY id ASC
                LIMIT $1
            `, [BATCH_SIZE]);

            if (res.rows.length === 0) {
                hasMore = false;
                console.log("✨ ¡Inventario totalmente limpio!");
                break;
            }

            // 3. Procesar el LOTE COMPLETO
            // console.log(`🤖 Enviando lote de ${res.rows.length} al cerebro...`);
            const cleanedList = await cleanBatchWithAI(res.rows);

            if (cleanedList.length === 0) {
                console.log("⚠️ Fallo en el lote (posible Rate Limit). Esperando 10s...");
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }

            // 4. Guardar resultados
            if (!SIMULATE) {
                let successCount = 0;
                for (const item of cleanedList) {
                    if (!item.id || !item.clean_name) continue;

                    // Buscamos el original solo para log
                    const original = res.rows.find(r => r.id == item.id)?.name || '???';

                    try {
                        await client.query(`
                            UPDATE inventory_imports 
                            SET processed_title = $1 
                            WHERE id = $2
                        `, [item.clean_name, item.id]);
                        successCount++;
                    } catch (updateError) {
                        console.error(`⚠️ Error al actualizar ID ${item.id}:`, updateError);
                    }

                    // console.log(`   ✅ "${original.substring(0,35)}..." \n      ➡️ "${item.clean_name}"`);
                }
                process.stdout.write(`✅ Lote guardado (${successCount}/${res.rows.length}). `);
            }

            processedCount += res.rows.length;
            // console.log(`📦 Progreso Total: ${processedCount}`);

            // Pausa pequeña para respirar
            await new Promise(resolve => setTimeout(resolve, 500));
        }

    } catch (error) {
        console.error("🔥 Error fatal:", error);
    } finally {
        await client.end();
    }
}

main();
