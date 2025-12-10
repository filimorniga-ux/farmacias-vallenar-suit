
import dotenv from 'dotenv';
import path from 'path';
import { randomUUID } from 'crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function seedQuotes() {
    const { query } = await import('../lib/db');
    try {
        console.log('🌱 Seeding Quotes...');

        // 1. Get Locations
        const locRes = await query("SELECT id, name FROM locations");
        const centro = locRes.rows.find(l => l.name.toUpperCase().includes('CENTRO'));
        const prat = locRes.rows.find(l => l.name.toUpperCase().includes('PRAT'));

        if (!centro || !prat) {
            console.error('Missing locations');
            process.exit(1);
        }

        // 2. Get Users & Terminals (Pick first available)
        const userRes = await query("SELECT id FROM users LIMIT 1");
        const userId = userRes.rows[0]?.id;

        const termRes = await query("SELECT id, location_id FROM terminals");
        const termCentro = termRes.rows.find(t => t.location_id === centro.id)?.id;
        const termPrat = termRes.rows.find(t => t.location_id === prat.id)?.id;

        // 3. Get Products
        const prodRes = await query("SELECT id, name, price_sell_box as price FROM inventory_batches LIMIT 5");
        const products = prodRes.rows;

        if (!userId || !termCentro || !termPrat || products.length === 0) {
            console.error('Missing basic data (users, terminals, or products)');
            process.exit(1);
        }

        const quotes = [
            // CENTRO - PENDING
            {
                code: 'QT-CENTRO-1',
                loc: centro.id,
                term: termCentro,
                status: 'PENDING',
                items: [products[0], products[1]]
            },
            // CENTRO - CONVERTED
            {
                code: 'QT-CENTRO-SOLD',
                loc: centro.id,
                term: termCentro,
                status: 'CONVERTED',
                items: [products[2]]
            },
            // PRAT - PENDING
            {
                code: 'QT-PRAT-1',
                loc: prat.id,
                term: termPrat,
                status: 'PENDING',
                items: [products[0], products[2]]
            }
        ];

        for (const q of quotes) {
            const id = randomUUID();
            const total = q.items.reduce((sum, i) => sum + parseFloat(i.price), 0); // Quantity 1

            // Upsert Header
            await query(`
                INSERT INTO quotes (id, code, location_id, terminal_id, user_id, total_amount, status, created_at, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '7 days')
                ON CONFLICT (code) DO NOTHING
            `, [id, q.code, q.loc, q.term, userId, total, q.status]);

            // Insert Items (only if new insertion, but ON CONFLICT logic makes getting ID hard. 
            // Simplified: Delete items for this code and re-insert if we really want to update, 
            // or just skip if header exists. 
            // Let's Skip if header existed (rowcount 0).
            // Actually, we need to know if we inserted.
            // Let's just Try Insert, if fails (duplicate code), skip items.

            // Check if inserted
            const check = await query("SELECT id FROM quotes WHERE code = $1", [q.code]);
            const quoteId = check.rows[0].id;

            // Clear items first (setup idempotency)
            await query("DELETE FROM quote_items WHERE quote_id = $1", [quoteId]);

            for (const item of q.items) {
                await query(`
                    INSERT INTO quote_items (id, quote_id, product_id, product_name, quantity, unit_price, total)
                    VALUES ($1, $2, $3, $4, 1, $5, $5)
                `, [randomUUID(), quoteId, item.id, item.name, item.price]);
            }
            console.log(`✅ Seeded Quote: ${q.code}`);
        }

    } catch (e) {
        console.error('❌ Error:', e);
    }
    process.exit(0);
}
seedQuotes();
