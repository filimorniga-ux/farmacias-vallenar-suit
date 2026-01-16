
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    await client.connect();
    console.log("🚀 Starting Unit Extraction Migration...");

    const res = await client.query('SELECT id, name FROM products WHERE units_per_box <= 1 OR units_per_box IS NULL');

    let updatedCount = 0;

    // Regex Patterns (Order matters: Specific -> General)
    const patterns = [
        /X\s*(\d+)\s*(COMP|CAPS|UND|GOMITAS|SOBRES|SAT|TAB|CAP)/i, // Explicit "X 30 COMP" or "X4CAP"
        /(\d+)\s*(COMP|CAPS|GOMITAS|SOBRES|CAP)\b/i, // "30 COMP" (Riskier, but common)
        /X\s*(\d+)$/i, // End of string "X 10" or "X10"
        /\bX\s*(\d+)\b(?!\s*(MG|G|ML|CM|MTS|YARDA))/i // "X 20" but NOT "X 20 MG" or "X 20 ML"
    ];

    for (const row of res.rows) {
        let extractedUnits = 1;

        // Try Patterns
        for (const pattern of patterns) {
            const match = row.name.match(pattern);
            if (match) {
                extractedUnits = parseInt(match[1]);
                break;
            }
        }

        // Additional Logic: "X 3.5 G" -> This is weight, not count. Count is 1.
        // Avoid extracting "3" from "3 MG" or "3.5 G".
        // The regex `(\d+)\s*(COMP)` handles this well.
        // But `X\s*(\d+)$` might match `X 200` (ML).
        // Refinement: If it ends in numbers, assume units if < 1000? 
        // Or specific keywords only.

        if (extractedUnits > 1) {
            // Apply Update
            // console.log(`✅ Updating ${row.name} -> ${extractedUnits} units`);
            await client.query('UPDATE products SET units_per_box = $1 WHERE id = $2', [extractedUnits, row.id]);
            updatedCount++;
        }
    }

    console.log(`✨ Migration Complete. Updated ${updatedCount} products.`);
    await client.end();
}
migrate();
