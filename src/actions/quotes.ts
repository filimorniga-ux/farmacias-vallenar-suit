'use server';

import { query } from '@/lib/db';
import { randomUUID, randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { Quote, CartItem } from '@/domain/types';

// Helper for Short Code (e.g. QT-AB12)
function generateQuoteCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed confusable chars
    let result = '';
    const bytes = randomBytes(4);
    for (let i = 0; i < 4; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return `QT-${result}`;
}

/**
 * Creates a new Quote from a Cart
 */
export async function createQuote(
    cartItems: CartItem[],
    context: { locationId: string; terminalId: string; userId: string; customerId?: string }
): Promise<{ success: boolean; quote?: Quote; error?: string }> {
    try {
        const id = randomUUID();
        const code = generateQuoteCode();

        // Calculate total
        const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // 1. Insert Header
        await query(`
            INSERT INTO quotes (id, code, location_id, terminal_id, user_id, customer_id, total_amount, status, created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', NOW(), NOW() + INTERVAL '7 days')
        `, [id, code, context.locationId, context.terminalId, context.userId, context.customerId || null, totalAmount]);

        // 2. Insert Items
        for (const item of cartItems) {
            await query(`
                INSERT INTO quote_items (id, quote_id, product_id, product_name, quantity, unit_price, total)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                randomUUID(),
                id,
                item.id || null,
                item.name,
                item.quantity,
                item.price,
                item.price * item.quantity
            ]);
        }

        const fullQuote: Quote = {
            id, // We use ID for internal but code for display ideally? Interface validation says id is string.
            // But wait, Quote interface in types.ts says id: string. Usually this is UUID or "QT-..."?
            // "id: string; // COT-123456" comment suggests the ID IS the code or formatted ID.
            // But in DB we have UUID as id and separate code.
            // Use 'code' as the ID for the frontend if that's what it expects (COT-...), or pass code in a new field if interface allowed.
            // Interface has NO 'code' field. It has 'id'. 
            // So I should put the readable code in 'id'? 
            // NO, `id` should be unique. 
            // Let's check `useStore` usages. It expects `id` to be "COT-..." sometimes.
            // I'll return the readable CODE as the ID for frontend convenience if that matches current 'COT-' pattern behavior.
            // But verify: DB id is UUID.
            // Let's use the generated friendly code as the ID for the `Quote` object to avoid confusion in UI.
            created_at: Date.now(),
            expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000),
            customer_id: context.customerId,
            total_amount: totalAmount,
            status: 'ACTIVE',
            items: cartItems
        };
        // Note: Formatting 'id' to be the code because domain/types Quote interface doesn't have 'code', only 'id'.
        // Users see 'id'.
        fullQuote.id = code;

        revalidatePath('/');
        return { success: true, quote: fullQuote };

    } catch (error) {
        console.error('Error creating quote:', error);
        return { success: false, error: 'Database Error' };
    }
}

/**
 * Retrieves a Quote by Code
 */
export async function retrieveQuote(codeInput: string): Promise<{ success: boolean; quote?: Quote; error?: string }> {
    try {
        const code = codeInput.trim().toUpperCase();

        // 1. Get Header
        // Note: status 'PENDING' in DB should map to 'ACTIVE' in frontend type.
        const headerRes = await query(`
            SELECT q.*, c.name as customer_name
            FROM quotes q
            LEFT JOIN customers c ON q.customer_id = c.id
            WHERE q.code = $1
        `, [code]);

        if (headerRes.rows.length === 0) {
            return { success: false, error: 'Cotización no encontrada' };
        }

        const quoteRow = headerRes.rows[0];

        // Validate Status
        if (quoteRow.status !== 'PENDING' && quoteRow.status !== 'ACTIVE') {
            // Basic state mapping. 'CONVERTED' is same.
            if (quoteRow.status === 'CONVERTED') return { success: false, error: 'La cotización ya fue vendida' };
            // if (quoteRow.status === 'EXPIRED') ...
        }

        // Validate Expiration
        if (new Date(quoteRow.expires_at) < new Date()) {
            return { success: false, error: 'La cotización ha expirado' };
        }

        // 2. Get Items
        const itemsRes = await query(`
            SELECT * FROM quote_items WHERE quote_id = $1
        `, [quoteRow.id]);

        const items: CartItem[] = itemsRes.rows.map(row => ({
            id: row.product_id || 'UNKNOWN',
            sku: 'UNKNOWN', // DB doesn't store SKU in quote_items currently
            name: row.product_name,
            price: parseFloat(row.unit_price),
            quantity: row.quantity,
            allows_commission: false,
            active_ingredients: [],
            cost_price: 0
        }));

        const quote: Quote = {
            id: quoteRow.code, // Use code as ID for frontend
            created_at: new Date(quoteRow.created_at).getTime(),
            expires_at: new Date(quoteRow.expires_at).getTime(),
            customer_id: quoteRow.customer_id,
            total_amount: parseFloat(quoteRow.total_amount),
            status: quoteRow.status === 'CONVERTED' ? 'CONVERTED' : 'ACTIVE',
            items: items
        };

        return { success: true, quote };

    } catch (error) {
        console.error('Error retrieving quote:', error);
        return { success: false, error: 'Database Error' };
    }
}

/**
 * Marks a Quote as Converted (Sold)
 */
export async function convertQuote(quoteCodeOrId: string) {
    try {
        // Since we use Code as ID in frontend, we try to match by code.
        await query("UPDATE quotes SET status = 'CONVERTED' WHERE code = $1 OR id = $1", [quoteCodeOrId]);
        revalidatePath('/');
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}
