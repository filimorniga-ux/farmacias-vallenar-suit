'use server';

import { query } from '@/lib/db';
import { randomUUID, randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';

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

export interface Quote {
    id: string;
    code: string;
    total_amount: number;
    status: 'PENDING' | 'CONVERTED' | 'EXPIRED';
    created_at: Date;
    expires_at: Date;
    items: QuoteItem[];
    customer?: { id: string; name: string };
    user?: { id: string; name: string };
}

export interface QuoteItem {
    product_name: string;
    quantity: number;
    unit_price: number;
    total: number;
    product_id?: string;
}

/**
 * Creates a new Quote from a Cart
 */
export async function createQuote(
    cartItems: any[],
    context: { locationId: string; terminalId: string; userId: string; customerId?: string }
) {
    try {
        const id = randomUUID();
        const code = generateQuoteCode();

        // Calculate total
        const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // 1. Insert Header
        await query(`
            INSERT INTO quotes (id, code, location_id, terminal_id, user_id, customer_id, total_amount, status, created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW(), NOW() + INTERVAL '7 days')
        `, [id, code, context.locationId, context.terminalId, context.userId, context.customerId || null, totalAmount]);

        // 2. Insert Items
        for (const item of cartItems) {
            await query(`
                INSERT INTO quote_items (id, quote_id, product_id, product_name, quantity, unit_price, total)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                randomUUID(),
                id,
                item.id || null, // Assuming item.id is product/batch id
                item.name,
                item.quantity,
                item.price,
                item.price * item.quantity
            ]);
        }

        revalidatePath('/');
        return { success: true, quote: { id, code, total_amount: totalAmount } };

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
        const headerRes = await query(`
            SELECT q.*, c.name as customer_name, u.name as user_name
            FROM quotes q
            LEFT JOIN customers c ON q.customer_id = c.id
            LEFT JOIN users u ON q.user_id = u.id
            WHERE q.code = $1
        `, [code]);

        if (headerRes.rows.length === 0) {
            return { success: false, error: 'Cotización no encontrada' };
        }

        const quoteRow = headerRes.rows[0];

        // Validate Status
        if (quoteRow.status !== 'PENDING') {
            return { success: false, error: `La cotización está ${quoteRow.status === 'CONVERTED' ? 'VENDIDA' : 'EXPIRADA'}` };
        }

        // Validate Expiration
        if (new Date(quoteRow.expires_at) < new Date()) {
            return { success: false, error: 'La cotización ha expirado' };
        }

        // 2. Get Items
        const itemsRes = await query(`
            SELECT * FROM quote_items WHERE quote_id = $1
        `, [quoteRow.id]);

        const items: QuoteItem[] = itemsRes.rows.map(row => ({
            product_name: row.product_name,
            quantity: row.quantity,
            unit_price: parseFloat(row.unit_price),
            total: parseFloat(row.total),
            product_id: row.product_id
        }));

        const quote: Quote = {
            id: quoteRow.id,
            code: quoteRow.code,
            total_amount: parseFloat(quoteRow.total_amount),
            status: quoteRow.status,
            created_at: quoteRow.created_at,
            expires_at: quoteRow.expires_at,
            items: items,
            customer: quoteRow.customer_id ? { id: quoteRow.customer_id, name: quoteRow.customer_name } : undefined,
            user: { id: quoteRow.user_id, name: quoteRow.user_name }
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
export async function convertQuote(quoteId: string) {
    try {
        await query("UPDATE quotes SET status = 'CONVERTED' WHERE id = $1", [quoteId]);
        revalidatePath('/');
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}
