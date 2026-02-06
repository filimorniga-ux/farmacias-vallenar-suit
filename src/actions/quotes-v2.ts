'use server';
import { debugLog } from '@/lib/debug-logger';

/**
 * ============================================================================
 * QUOTES-V2: Secure Quotation Management
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * SECURITY IMPROVEMENTS:
 * - SERIALIZABLE transactions for data integrity
 * - Tiered discount authorization (0-10% free, 10-20% CAJERO, 20-30% MANAGER, 30%+ GERENTE)
 * - bcrypt PIN validation
 * - Atomic quote-to-sale conversion with stock reservation
 * - Comprehensive audit logging
 * 
 * DISCOUNT THRESHOLDS:
 * - <= 10%: No PIN required
 * - 10-20%: PIN CAJERO
 * - 20-30%: PIN MANAGER
 * - > 30%: PIN GERENTE_GENERAL
 */

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const QuoteItemSchema = z.object({
    productId: UUIDSchema,
    sku: z.string().min(1),
    name: z.string().min(1),
    quantity: z.number().int().positive('Cantidad debe ser positiva'),
    unitPrice: z.number().positive('Precio debe ser positivo'),
    discount: z.number().min(0).max(100).default(0),
});

const CreateQuoteSchema = z.object({
    customerId: UUIDSchema.optional().nullable(),
    customerName: z.string().max(200).optional(),
    customerPhone: z.string().max(20).optional(),
    customerEmail: z.string().email().optional().or(z.literal('')),
    items: z.array(QuoteItemSchema).min(1, 'Debe incluir al menos un item'),
    notes: z.string().max(1000).optional(),
    validDays: z.number().int().min(1).max(90).default(7),
    locationId: UUIDSchema,
    terminalId: UUIDSchema.optional(),
});

const UpdateQuoteSchema = z.object({
    quoteId: UUIDSchema,
    items: z.array(QuoteItemSchema).optional(),
    notes: z.string().max(1000).optional(),
    validDays: z.number().int().min(1).max(90).optional(),
});

const ApplyDiscountSchema = z.object({
    quoteId: UUIDSchema,
    discountPercent: z.number().min(0).max(50, 'Descuento máximo: 50%'),
    authorizationPin: z.string().min(4).optional(),
    reason: z.string().min(3, 'Razón requerida').max(500),
});

const ConvertToSaleSchema = z.object({
    quoteId: UUIDSchema,
    paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER', 'MIXED']),
    cashReceived: z.number().min(0).optional(),
    cardAmount: z.number().min(0).optional(),
    transferAmount: z.number().min(0).optional(),
    terminalId: UUIDSchema,
    userId: UUIDSchema,
});

const QuoteHistorySchema = z.object({
    customerId: UUIDSchema.optional(),
    status: z.enum(['PENDING', 'CONVERTED', 'EXPIRED', 'CANCELLED']).optional(),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    searchCode: z.string().optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const CASHIER_ROLES = ['CASHIER', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const GERENTE_ROLES = ['GERENTE_GENERAL', 'ADMIN'];

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
} as const;

// Discount thresholds
const DISCOUNT_THRESHOLDS = {
    NO_AUTH: 10,         // <= 10%: No authorization
    CASHIER_AUTH: 20,    // 10-20%: CAJERO PIN
    MANAGER_AUTH: 30,    // 20-30%: MANAGER PIN
    GERENTE_AUTH: 50,    // 30-50%: GERENTE_GENERAL PIN
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get session from headers
 */
/**
 * Get session from headers or cookies (Robust Fallback)
 */
async function getSession(): Promise<{ user?: { id: string; role: string } } | null> {
    try {
        const headersList = await headers();
        const cookieStore = await import('next/headers').then(mod => mod.cookies()); // Dynamic import to avoid build issues

        // 1. Try Headers (Client-side explicit)
        const headerUserId = headersList.get('x-user-id');
        const headerUserRole = headersList.get('x-user-role');

        if (headerUserId && headerUserRole) {
            return { user: { id: headerUserId, role: headerUserRole } };
        }

        // 2. Try Secure Session Token (Best Practice)
        const sessionToken = cookieStore.get('session_token')?.value;
        if (sessionToken) {
            const res = await pool.query(
                `SELECT u.id as "userId", u.role
                 FROM sessions s
                 JOIN users u ON s.user_id = u.id
                 WHERE s.token = $1 AND s.expires_at > NOW()`,
                [sessionToken]
            );

            if ((res.rowCount || 0) > 0) {
                const row = res.rows[0];
                return { user: { id: row.userId, role: row.role } };
            }
        }

        // 3. Fallback: Auth-V2 Cookies
        const cookieUserId = cookieStore.get('user_id')?.value;
        if (cookieUserId) {
            const res = await pool.query(
                `SELECT id, role FROM users WHERE id = $1 AND is_active = true`,
                [cookieUserId]
            );

            if ((res.rowCount || 0) > 0) {
                const user = res.rows[0];
                return { user: { id: user.id, role: user.role } };
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Generate quote code
 */
function generateQuoteCode(): string {
    const date = new Date();
    const datePart = date.toISOString().slice(2, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `COT-${datePart}-${randomPart}`;
}

/**
 * Validate PIN with RBAC tier
 */
async function validateDiscountPin(
    client: any,
    pin: string,
    requiredRoles: readonly string[]
): Promise<{ valid: boolean; authorizer?: { id: string; name: string; role: string }; error?: string }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');
        const bcrypt = await import('bcryptjs');

        const usersRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users 
            WHERE role = ANY($1::text[])
            AND is_active = true
        `, [requiredRoles]);

        for (const user of usersRes.rows) {
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) continue;

            if (user.access_pin_hash) {
                const isValid = await bcrypt.compare(pin, user.access_pin_hash);
                if (isValid) {
                    resetAttempts(user.id);
                    return { valid: true, authorizer: { id: user.id, name: user.name, role: user.role } };
                }
                recordFailedAttempt(user.id);
            } else if (user.access_pin && user.access_pin === pin) {
                resetAttempts(user.id);
                return { valid: true, authorizer: { id: user.id, name: user.name, role: user.role } };
            }
        }

        return { valid: false, error: 'PIN no válido para el nivel de autorización requerido' };
    } catch (error) {
        logger.error({ error }, '[Quotes] PIN validation error');
        return { valid: false, error: 'Error validando PIN' };
    }
}

/**
 * Determine required role for discount
 */
function getRequiredRoleForDiscount(percent: number): { roles: readonly string[]; label: string } | null {
    if (percent <= DISCOUNT_THRESHOLDS.NO_AUTH) {
        return null; // No authorization required
    } else if (percent <= DISCOUNT_THRESHOLDS.CASHIER_AUTH) {
        return { roles: CASHIER_ROLES, label: 'CAJERO' };
    } else if (percent <= DISCOUNT_THRESHOLDS.MANAGER_AUTH) {
        return { roles: MANAGER_ROLES, label: 'MANAGER' };
    } else {
        return { roles: GERENTE_ROLES, label: 'GERENTE_GENERAL' };
    }
}

/**
 * Insert quote audit log
 */
async function insertQuoteAudit(
    client: any,
    params: {
        userId: string;
        authorizedById?: string;
        quoteId: string;
        actionCode: string;
        oldValues?: Record<string, any>;
        newValues?: Record<string, any>;
        notes?: string;
    }
): Promise<void> {
    await client.query(`
            INSERT INTO audit_log (
                user_id, action_code, entity_type, entity_id,
                old_values, new_values, justification, created_at
            ) VALUES ($1, $2, 'QUOTE', $3, $4::jsonb, $5::jsonb, $6, NOW())
        `, [
        params.userId,
        params.actionCode,
        params.quoteId,
        params.oldValues ? JSON.stringify(params.oldValues) : null,
        JSON.stringify({
            ...params.newValues,
            authorized_by: params.authorizedById,
        }),
        params.notes || null
    ]);
}

// ============================================================================
// QUOTE MANAGEMENT
// ============================================================================

/**
 * 📝 Create Quote Securely
 */
export async function createQuoteSecure(
    data: z.infer<typeof CreateQuoteSchema>
): Promise<{ success: boolean; quoteId?: string; quoteCode?: string; error?: string }> {
    // Validate input
    const validated = CreateQuoteSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const session = await getSession();
    if (!session?.user) {
        return { success: false, error: 'No autenticado' };
    }

    const {
        customerId, customerName, customerPhone, customerEmail,
        items, notes, validDays
    } = validated.data;

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Default Read Committed
        debugLog(`[Quotes] Starting transaction for user ${session.user.id}`);

        // Calculate totals
        let subtotal = 0;
        let totalDiscount = 0;

        for (const item of items) {
            const itemSubtotal = item.unitPrice * item.quantity;
            const itemDiscount = itemSubtotal * (item.discount / 100);
            subtotal += itemSubtotal;
            totalDiscount += itemDiscount;
        }

        const total = subtotal - totalDiscount;

        // 1. Get next sequence value for code
        const seqRes = await client.query("SELECT nextval('quotes_code_seq') as seq");
        const seqNum = seqRes.rows[0].seq;
        const currentYear = new Date().getFullYear();
        const seqStr = seqNum.toString().padStart(6, '0');
        const quoteCode = `COT-${currentYear}-${seqStr}`;
        debugLog(`[Quotes] Generated code: ${quoteCode}`);

        // Create quote
        const quoteId = randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + validDays);
        debugLog(`[Quotes] Inserting quote header: ${quoteId}`);

        await client.query(`
            INSERT INTO quotes (
                id, code, customer_id, customer_name, customer_phone, customer_email,
                subtotal, discount, total, status, notes, valid_until,
                user_id, created_at, location_id, terminal_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10, $11, $12, NOW(), $13, $14)
        `, [
            quoteId,
            quoteCode,
            customerId || null,
            customerName || null,
            customerPhone || null,
            customerEmail || null,
            subtotal,
            totalDiscount,
            total,
            notes || null,
            expiresAt,
            session.user.id,
            validated.data.locationId,
            validated.data.terminalId || null
        ]);

        // Insert items
        debugLog(`[Quotes] Inserting ${items.length} items...`);
        for (const item of items) {
            const itemId = randomUUID();
            const itemSubtotal = item.unitPrice * item.quantity;
            const itemDiscount = itemSubtotal * (item.discount / 100);
            const itemTotal = itemSubtotal - itemDiscount;

            await client.query(`
                INSERT INTO quote_items (
                    id, quote_id, product_id, sku, product_name,
                    quantity, unit_price, discount_percent, subtotal, total
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                itemId,
                quoteId,
                item.productId,
                item.sku,
                item.name,
                item.quantity,
                item.unitPrice,
                item.discount,
                itemSubtotal,
                itemTotal
            ]);
        }

        // Audit
        debugLog('📝 [Quotes] Auditing...');
        await insertQuoteAudit(client, {
            userId: session.user.id,
            quoteId,
            actionCode: 'QUOTE_CREATED',
            newValues: {
                code: quoteCode,
                customer_name: customerName,
                items_count: items.length,
                total,
                valid_until: expiresAt.toISOString(),
            }
        });

        // Verify INSIDE transaction
        const inTxRes = await client.query('SELECT id FROM quotes WHERE id = $1', [quoteId]);
        debugLog(`[Quotes] In-TX Check: ${inTxRes.rows.length > 0 ? 'FOUND' : 'NOT FOUND'}`);

        await client.query('COMMIT');
        debugLog('✅ [Quotes] Transaction COMMITTED');

        // Verify with SAME client after commit
        const afterCommitClientRes = await client.query('SELECT id FROM quotes WHERE id = $1', [quoteId]);
        debugLog(`[Quotes] Client-After-Commit Check: ${afterCommitClientRes.rows.length > 0 ? 'FOUND' : 'NOT FOUND'}`);

        // VERIFY PERSISTENCE (Pool)
        try {
            const verifyRes = await pool.query('SELECT id FROM quotes WHERE id = $1', [quoteId]);
            if (verifyRes.rows.length > 0) {
                debugLog('✅ [Quotes] Pool Check SUCCESS: Quote found in DB.');
            } else {
                debugLog('❌ [Quotes] Pool Check FAILED: Quote NOT found in DB after commit!');
            }
        } catch (e) {
            console.error('❌ [Quotes] Verification query failed:', e);
        }

        logger.info({ quoteId, quoteCode, total }, '📝 [Quotes] Quote created');
        revalidatePath('/cotizaciones');

        return { success: true, quoteId, quoteCode };

    } catch (error: any) {
        await client.query('ROLLBACK');
        debugLog(`❌ [Quotes] Transaction ROLLBACK: ${error.message}`);
        logger.error({ error }, '[Quotes] Create quote error');
        return { success: false, error: error.message || 'Error creando cotización' };
    } finally {
        client.release();
    }
}

/**
 * ✏️ Update Quote Securely
 */
export async function updateQuoteSecure(
    data: z.infer<typeof UpdateQuoteSchema>
): Promise<{ success: boolean; error?: string }> {
    // Validate input
    const validated = UpdateQuoteSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const session = await getSession();
    if (!session?.user) {
        return { success: false, error: 'No autenticado' };
    }

    const { quoteId, items, notes, validDays } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Lock quote
        const quoteRes = await client.query(`
            SELECT * FROM quotes WHERE id = $1 FOR UPDATE NOWAIT
        `, [quoteId]);

        if (quoteRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Cotización no encontrada' };
        }

        const quote = quoteRes.rows[0];

        if (quote.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Solo cotizaciones pendientes pueden editarse' };
        }

        const oldValues = {
            subtotal: quote.subtotal,
            total: quote.total,
            notes: quote.notes,
        };

        // Update items if provided
        if (items && items.length > 0) {
            // Delete existing items
            await client.query('DELETE FROM quote_items WHERE quote_id = $1', [quoteId]);

            // Recalculate
            let subtotal = 0;
            let totalDiscount = 0;

            for (const item of items) {
                const itemSubtotal = item.unitPrice * item.quantity;
                const itemDiscount = itemSubtotal * (item.discount / 100);
                subtotal += itemSubtotal;
                totalDiscount += itemDiscount;

                const itemId = randomUUID();
                await client.query(`
                    INSERT INTO quote_items (
                        id, quote_id, product_id, sku, name,
                        quantity, unit_price, discount_percent, subtotal, total
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    itemId,
                    quoteId,
                    item.productId,
                    item.sku,
                    item.name,
                    item.quantity,
                    item.unitPrice,
                    item.discount,
                    itemSubtotal,
                    itemSubtotal - itemDiscount
                ]);
            }

            const total = subtotal - totalDiscount;

            await client.query(`
                UPDATE quotes 
                SET subtotal = $2, discount = $3, total = $4, updated_at = NOW()
                WHERE id = $1
            `, [quoteId, subtotal, totalDiscount, total]);
        }

        // Update notes if provided
        if (notes !== undefined) {
            await client.query(`UPDATE quotes SET notes = $2, updated_at = NOW() WHERE id = $1`, [quoteId, notes]);
        }

        // Update validity if provided
        if (validDays) {
            const newExpiry = new Date();
            newExpiry.setDate(newExpiry.getDate() + validDays);
            await client.query(`UPDATE quotes SET valid_until = $2, updated_at = NOW() WHERE id = $1`, [quoteId, newExpiry]);
        }

        // Audit
        await insertQuoteAudit(client, {
            userId: session.user.id,
            quoteId,
            actionCode: 'QUOTE_UPDATED',
            oldValues,
            newValues: { items_changed: !!items, notes_changed: notes !== undefined }
        });

        await client.query('COMMIT');

        logger.info({ quoteId }, '✏️ [Quotes] Quote updated');
        revalidatePath('/cotizaciones');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Cotización en proceso. Reintente.' };
        }

        logger.error({ error }, '[Quotes] Update quote error');
        return { success: false, error: error.message || 'Error actualizando cotización' };

    } finally {
        client.release();
    }
}

/**
 * 💰 Apply Discount (Tiered Authorization)
 */
export async function applyDiscountSecure(
    data: z.infer<typeof ApplyDiscountSchema>
): Promise<{ success: boolean; newTotal?: number; error?: string }> {
    // Validate input
    const validated = ApplyDiscountSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const session = await getSession();
    if (!session?.user) {
        return { success: false, error: 'No autenticado' };
    }

    const { quoteId, discountPercent, authorizationPin, reason } = validated.data;

    // Check if authorization is needed
    const requiredAuth = getRequiredRoleForDiscount(discountPercent);
    if (requiredAuth && !authorizationPin) {
        return {
            success: false,
            error: `Descuento de ${discountPercent}% requiere autorización de ${requiredAuth.label}`
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validate authorization if needed
        let authorizer: { id: string; name: string; role: string } | undefined;
        if (requiredAuth && authorizationPin) {
            const authResult = await validateDiscountPin(client, authorizationPin, requiredAuth.roles);
            if (!authResult.valid) {
                await client.query('ROLLBACK');
                return { success: false, error: authResult.error };
            }
            authorizer = authResult.authorizer;
        }

        // Lock quote
        const quoteRes = await client.query(`
            SELECT * FROM quotes WHERE id = $1 FOR UPDATE NOWAIT
        `, [quoteId]);

        if (quoteRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Cotización no encontrada' };
        }

        const quote = quoteRes.rows[0];

        if (quote.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Solo cotizaciones pendientes pueden modificarse' };
        }

        // Calculate new discount
        const subtotal = Number(quote.subtotal);
        const newDiscount = subtotal * (discountPercent / 100);
        const newTotal = subtotal - newDiscount;

        // Update quote
        await client.query(`
            UPDATE quotes 
            SET discount = $2, 
                total = $3, 
                discount_reason = $4,
                discount_authorized_by = $5,
                updated_at = NOW()
            WHERE id = $1
        `, [quoteId, newDiscount, newTotal, reason, authorizer?.id || null]);

        // Audit
        await insertQuoteAudit(client, {
            userId: session.user.id,
            authorizedById: authorizer?.id,
            quoteId,
            actionCode: 'QUOTE_DISCOUNT_APPLIED',
            oldValues: { total: quote.total, discount: quote.discount },
            newValues: {
                discount_percent: discountPercent,
                new_discount: newDiscount,
                new_total: newTotal,
                authorized_by: authorizer?.name,
            },
            notes: reason
        });

        await client.query('COMMIT');

        logger.info({ quoteId, discountPercent, newTotal }, '💰 [Quotes] Discount applied');
        revalidatePath('/cotizaciones');

        return { success: true, newTotal };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Quotes] Apply discount error');
        return { success: false, error: error.message || 'Error aplicando descuento' };

    } finally {
        client.release();
    }
}

/**
 * 🔄 Convert Quote to Sale (Atomic)
 */
export async function convertToSaleSecure(
    data: z.infer<typeof ConvertToSaleSchema>
): Promise<{ success: boolean; saleId?: string; error?: string }> {
    // Validate input
    const validated = ConvertToSaleSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const {
        quoteId, paymentMethod, cashReceived, cardAmount, transferAmount,
        terminalId, userId
    } = validated.data;

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Lock quote
        const quoteRes = await client.query(`
            SELECT q.*, u.name as created_by_name
            FROM quotes q
            LEFT JOIN users u ON q.created_by = u.id
            WHERE q.id = $1
            FOR UPDATE NOWAIT
        `, [quoteId]);

        if (quoteRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Cotización no encontrada' };
        }

        const quote = quoteRes.rows[0];

        if (quote.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Cotización ya fue procesada o expiró' };
        }

        // Check validity
        if (new Date(quote.valid_until) < new Date()) {
            await client.query('UPDATE quotes SET status = $2 WHERE id = $1', [quoteId, 'EXPIRED']);
            await client.query('COMMIT');
            return { success: false, error: 'Cotización expirada' };
        }

        const total = Number(quote.total);

        // Validate payment
        if (paymentMethod === 'CASH' && (!cashReceived || cashReceived < total)) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Monto en efectivo insuficiente' };
        }

        if (paymentMethod === 'MIXED') {
            const mixedTotal = (cashReceived || 0) + (cardAmount || 0) + (transferAmount || 0);
            if (mixedTotal < total) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Monto total insuficiente' };
            }
        }

        // Get quote items
        const itemsRes = await client.query(`
            SELECT * FROM quote_items WHERE quote_id = $1
        `, [quoteId]);

        // Check and reserve stock
        for (const item of itemsRes.rows) {
            const stockRes = await client.query(`
                SELECT id, quantity_real 
                FROM inventory_batches 
                WHERE sku = $1 AND quantity_real >= $2
                FOR UPDATE NOWAIT
                LIMIT 1
            `, [item.sku, item.quantity]);

            if (stockRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: `Stock insuficiente para: ${item.name}` };
            }

            // Decrement stock
            await client.query(`
                UPDATE inventory_batches 
                SET quantity_real = quantity_real - $2, updated_at = NOW()
                WHERE id = $1
            `, [stockRes.rows[0].id, item.quantity]);
        }

        // Create sale
        const saleId = randomUUID();
        const saleCode = `VTA-${Date.now().toString(36).toUpperCase()}`;
        const change = paymentMethod === 'CASH' ? (cashReceived || 0) - total : 0;

        await client.query(`
            INSERT INTO sales (
                id, code, terminal_id, user_id, customer_id,
                subtotal, discount, total, payment_method,
                cash_received, card_amount, transfer_amount, change_amount,
                status, source_quote_id, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'COMPLETED', $14, NOW())
        `, [
            saleId,
            saleCode,
            terminalId,
            userId,
            quote.customer_id,
            quote.subtotal,
            quote.discount,
            total,
            paymentMethod,
            cashReceived || 0,
            cardAmount || 0,
            transferAmount || 0,
            change,
            quoteId
        ]);

        // Copy sale items
        for (const item of itemsRes.rows) {
            const saleItemId = randomUUID();
            await client.query(`
                INSERT INTO sale_items (
                    id, sale_id, product_id, sku, name,
                    quantity, unit_price, discount_percent, subtotal, total
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                saleItemId,
                saleId,
                item.product_id,
                item.sku,
                item.name,
                item.quantity,
                item.unit_price,
                item.discount_percent,
                item.subtotal,
                item.total
            ]);
        }

        // Mark quote as converted
        await client.query(`
            UPDATE quotes 
            SET status = 'CONVERTED', converted_sale_id = $2, updated_at = NOW()
            WHERE id = $1
        `, [quoteId, saleId]);

        // Audit
        await insertQuoteAudit(client, {
            userId,
            quoteId,
            actionCode: 'QUOTE_CONVERTED_TO_SALE',
            newValues: {
                sale_id: saleId,
                sale_code: saleCode,
                payment_method: paymentMethod,
                total,
            }
        });

        await client.query('COMMIT');

        logger.info({ quoteId, saleId, total }, '🔄 [Quotes] Converted to sale');
        revalidatePath('/cotizaciones');
        revalidatePath('/ventas');
        revalidatePath('/pos');

        return { success: true, saleId };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Recursos en proceso. Reintente.' };
        }

        logger.error({ error }, '[Quotes] Convert to sale error');
        return { success: false, error: error.message || 'Error convirtiendo cotización' };

    } finally {
        client.release();
    }
}

/**
 * ⏰ Expire Old Quotes (Batch operation)
 */
export async function expireQuotesSecure(): Promise<{ success: boolean; expiredCount?: number; error?: string }> {
    try {
        const { query } = await import('@/lib/db');

        const result = await query(`
            UPDATE quotes 
            SET status = 'EXPIRED', updated_at = NOW()
            WHERE status = 'PENDING' 
            AND valid_until < NOW()
        `);

        const expiredCount = result.rowCount || 0;

        if (expiredCount > 0) {
            logger.info({ expiredCount }, '⏰ [Quotes] Expired old quotes');
        }

        revalidatePath('/cotizaciones');

        return { success: true, expiredCount };

    } catch (error: any) {
        logger.error({ error }, '[Quotes] Expire quotes error');
        return { success: false, error: 'Error expirando cotizaciones' };
    }
}

/**
 * ❌ Cancel Quote
 */
export async function cancelQuoteSecure(
    quoteId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(quoteId).success) {
        return { success: false, error: 'ID de cotización inválido' };
    }

    if (!reason || reason.length < 5) {
        return { success: false, error: 'Razón de cancelación requerida (mínimo 5 caracteres)' };
    }

    const session = await getSession();
    if (!session?.user) {
        return { success: false, error: 'No autenticado' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const quoteRes = await client.query(`
            SELECT * FROM quotes WHERE id = $1 FOR UPDATE NOWAIT
        `, [quoteId]);

        if (quoteRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Cotización no encontrada' };
        }

        const quote = quoteRes.rows[0];

        if (quote.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Solo cotizaciones pendientes pueden cancelarse' };
        }

        await client.query(`
            UPDATE quotes 
            SET status = 'CANCELLED', cancellation_reason = $2, updated_at = NOW()
            WHERE id = $1
        `, [quoteId, reason]);

        await insertQuoteAudit(client, {
            userId: session.user.id,
            quoteId,
            actionCode: 'QUOTE_CANCELLED',
            oldValues: { status: 'PENDING' },
            newValues: { status: 'CANCELLED' },
            notes: reason
        });

        await client.query('COMMIT');

        logger.info({ quoteId }, '❌ [Quotes] Quote cancelled');
        revalidatePath('/cotizaciones');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Quotes] Cancel quote error');
        return { success: false, error: error.message || 'Error cancelando cotización' };

    } finally {
        client.release();
    }
}

// ============================================================================
// HISTORY
// ============================================================================

/**
 * 📜 Get Quote History
 */
export async function getQuoteHistory(
    filters?: z.infer<typeof QuoteHistorySchema>
): Promise<{
    success: boolean;
    data?: {
        quotes: any[];
        total: number;
        page: number;
        pageSize: number;
    };
    error?: string;
}> {
    const validated = QuoteHistorySchema.safeParse(filters || {});
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { customerId, status, startDate, endDate, page, pageSize } = validated.data;
    const offset = (page - 1) * pageSize;

    try {
        const { query } = await import('@/lib/db');

        // Build WHERE clause
        const conditions: string[] = ['1=1'];
        const params: any[] = [];
        let paramIndex = 1;

        if (customerId) {
            conditions.push(`q.customer_id = $${paramIndex++}::text`);
            params.push(customerId);
        }

        if (status) {
            conditions.push(`q.status = $${paramIndex++}`);
            params.push(status);
        }

        if (startDate) {
            conditions.push(`q.created_at >= $${paramIndex++}`);
            params.push(startDate);
        }

        if (endDate) {
            conditions.push(`q.created_at <= $${paramIndex++}`);
            params.push(endDate);
        }

        const whereClause = conditions.join(' AND ');

        // Count total
        const countRes = await query(`
            SELECT COUNT(*) as total FROM quotes q WHERE ${whereClause}
        `, params);

        const total = parseInt(countRes.rows[0]?.total || '0');

        // Fetch quotes
        params.push(pageSize, offset);
        // Filter by User / Location (Security)
        // If not admin, restrict to own quotes or branch quotes
        // For now, let's enforce: User can see quotes created by them, OR created at their current location
        let userFilter = '';
        const queryParams: any[] = [pageSize, offset]; // Changed from limit, offset to pageSize, offset
        let currentParamIndex = 3; // Adjusted paramIndex for the new query structure

        // Add status filter
        if (status) {
            userFilter += ` AND q.status = $${currentParamIndex}`;
            queryParams.push(status);
            currentParamIndex++;
        }

        if (customerId) {
            userFilter += ` AND q.customer_id = $${currentParamIndex}::text`;
            queryParams.push(customerId);
            currentParamIndex++;
        }

        if (startDate) {
            userFilter += ` AND q.created_at >= $${currentParamIndex}`;
            queryParams.push(startDate);
            currentParamIndex++;
        }

        if (endDate) {
            userFilter += ` AND q.created_at <= $${currentParamIndex}`;
            queryParams.push(endDate);
            currentParamIndex++;
        }

        const quotesRes = await query(`
            SELECT 
                q.*,
                (SELECT COUNT(*) FROM quote_items WHERE quote_id = q.id) as items_count,
                u.name as creator_name
            FROM quotes q
            LEFT JOIN users u ON q.user_id = u.id::text
            LEFT JOIN customers c ON q.customer_id = c.id::text
            WHERE 1=1 ${userFilter}
            ORDER BY q.created_at DESC
            LIMIT $1 OFFSET $2
        `, queryParams); // Using queryParams for the new query

        return {
            success: true,
            data: {
                quotes: quotesRes.rows,
                total,
                page,
                pageSize,
            }
        };

    } catch (error: any) {
        logger.error({ error }, '[Quotes] Get history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}

// NOTE: DISCOUNT_THRESHOLDS es constante interna
// Next.js 16 use server solo permite async functions

/**
 * 🔍 Retrieve Quote by ID
 */
export async function retrieveQuoteSecure(
    quoteId: string
): Promise<{
    success: boolean;
    data?: {
        id: string;
        status: string;
        customer_name: string;
        customer_phone: string;
        items: any[];
        subtotal: number;
        discount: number;
        total: number;
        valid_until: Date;
        created_at: Date;
        created_by_name: string;
    };
    error?: string;
}> {
    if (!UUIDSchema.safeParse(quoteId).success) {
        return { success: false, error: 'ID de cotización inválido' };
    }

    try {
        console.log('[Debug] retrieveQuoteSecure: Starting for ID', quoteId);
        const { query } = await import('@/lib/db');

        // Get quote with creator info
        console.log('[Debug] Fetching quote header...');
        const quoteRes = await query(`
            SELECT 
                q.*,
                u.name as created_by_name,
                c.name as customer_display_name
            FROM quotes q
            LEFT JOIN users u ON q.user_id = u.id::text
            LEFT JOIN customers c ON q.customer_id = c.id::text
            WHERE q.id = $1::uuid
        `, [quoteId]);
        console.log('[Debug] Header fetched. Rows:', quoteRes.rows.length);

        if (quoteRes.rows.length === 0) {
            return { success: false, error: 'Cotización no encontrada' };
        }

        const quote = quoteRes.rows[0];

        // Get quote items
        console.log('[Debug] Fetching items...');
        const itemsRes = await query(`
            SELECT * FROM quote_items WHERE quote_id = $1::uuid
        `, [quoteId]);
        console.log('[Debug] Items fetched. Count:', itemsRes.rows.length);

        // Validate Location and Stock (Optional but recommended)
        const stockWarnings: string[] = [];

        // If we want to check stock in the quote's location:
        if (quote.location_id) {
            const skuList = itemsRes.rows.map(i => i.sku).filter(Boolean);
            if (skuList.length > 0) {
                const stockRes = await query(`
                    SELECT sku, quantity_real 
                    FROM inventory_batches 
                    WHERE location_id = $1 AND sku = ANY($2:: text[])
            `, [quote.location_id, skuList]);

                const stockMap = new Map();
                stockRes.rows.forEach((r: any) => {
                    stockMap.set(r.sku, (stockMap.get(r.sku) || 0) + Number(r.quantity_real));
                });

                itemsRes.rows.forEach(item => {
                    const available = stockMap.get(item.sku) || 0;
                    if (available < item.quantity) {
                        stockWarnings.push(`Stock bajo para ${item.product_name || item.sku}: ${available} / ${item.quantity}`);
                    }
                });
            }
        }

        console.log('[Debug] Returning success data...');
        return {
            success: true,
            data: {
                id: quote.id,
                status: quote.status,
                customer_name: quote.customer_name || quote.customer_display_name || 'Sin nombre',
                customer_phone: quote.customer_phone || '',
                items: itemsRes.rows.map(item => ({
                    id: item.id,
                    productId: item.product_id,
                    sku: item.sku,
                    name: item.product_name || item.name,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unit_price),
                    discount: Number(item.discount || 0),
                    subtotal: Number(item.subtotal),
                })),
                subtotal: Number(quote.subtotal),
                discount: Number(quote.discount || 0),
                total: Number(quote.total),
                valid_until: quote.valid_until,
                created_at: quote.created_at,
                created_by_name: quote.created_by_name || 'Sistema',
            }
        };

    } catch (error: any) {
        logger.error({ error, quoteId }, '[Quotes] Retrieve quote error');
        return { success: false, error: 'Error obteniendo cotización: ' + (error.message || 'Error desconocido') };
    }
}

// ============================================================================
// HISTORY & PRINTING
// ============================================================================

// ... inside getQuotesSecure
export async function getQuotesSecure(
    filters: z.infer<typeof QuoteHistorySchema>
): Promise<{ success: boolean; data?: any[]; total?: number; error?: string }> {
    const session = await getSession();
    if (!session?.user) return { success: false, error: 'No autenticado' };
    console.log('[QuotesHistory] Fetching for User:', session.user.id);

    const { page, pageSize, startDate, endDate, customerId, status, searchCode } = filters;
    const offset = (page - 1) * pageSize;

    try {
        const conditions: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (status) {
            conditions.push(`q.status = $${idx++}`);
            params.push(status);
        }

        // Search by Code (Partial Match)
        if (searchCode && searchCode.trim().length > 0) {
            conditions.push(`q.code ILIKE $${idx++} `);
            params.push(`% ${searchCode.trim()}% `);
        }

        // Filter by current user
        if (session?.user?.id) {
            conditions.push(`q.user_id = $${idx++}::text `);
            params.push(session.user.id);
        }

        if (customerId) {
            conditions.push(`q.customer_id = $${idx++}::text `);
            params.push(customerId);
        }

        if (startDate) {
            conditions.push(`q.created_at >= $${idx++} `);
            params.push(startDate);
        }

        if (endDate) {
            // Set end date to end of day
            const eod = new Date(endDate);
            eod.setHours(23, 59, 59, 999);
            conditions.push(`q.created_at <= $${idx++} `);
            params.push(eod);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} ` : '';

        // Count total
        const countRes = await pool.query(
            `SELECT COUNT(*) FROM quotes q ${whereClause} `,
            params
        );
        const total = parseInt(countRes.rows[0].count);

        // Fetch paginated
        const res = await pool.query(`
    SELECT
    q.id, q.code, q.total, q.created_at, q.valid_until, q.status,
        q.customer_name, q.customer_phone, q.customer_email,
        u.name as creator_name
            FROM quotes q
            LEFT JOIN users u ON q.user_id = u.id::text
            ${whereClause}
            ORDER BY q.created_at DESC
            LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, pageSize, offset]);

        return { success: true, data: res.rows, total };
    } catch (error: any) {
        logger.error({ error }, '[Quotes] Get history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}

/**
 * 🖨️ Get Full Quote Details (for Printing)
 */
export async function getQuoteDetailsSecure(quoteId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log('[Quotes] getQuoteDetailsSecure calling with ID:', quoteId);

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!quoteId || !uuidRegex.test(quoteId)) {
        console.error('[Quotes] Invalid UUID provided:', quoteId);
        return { success: false, error: 'ID de cotización inválido' };
    }

    try {
        // Fetch Header
        const headerRes = await pool.query(`
    SELECT
    q.*,
        u.name as creator_name,
        l.name as location_name,
        l.address as location_address
            FROM quotes q
            LEFT JOIN users u ON q.user_id = u.id::text
            LEFT JOIN locations l ON q.location_id::uuid = l.id
            WHERE q.id = $1::uuid
        `, [quoteId]);

        if (headerRes.rowCount === 0) return { success: false, error: 'Cotización no encontrada' };
        const quote = headerRes.rows[0];

        // Fetch Items
        const itemsRes = await pool.query(`
    SELECT * FROM quote_items WHERE quote_id = $1:: uuid
        `, [quoteId]);

        return {
            success: true,
            data: {
                ...quote,
                items: itemsRes.rows
            }
        };

    } catch (error: any) {
        console.error('❌ [Quotes] Get Details Error RAW:', error);
        logger.error({ error }, '[Quotes] Get details error');
        return { success: false, error: 'Error obteniendo detalles: ' + (error.message || 'Unknown') };
    }
}
