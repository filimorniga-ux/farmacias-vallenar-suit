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
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import {
    getActorOrFail,
    normalizeRole,
    PinRbacError,
    ROLE_GROUPS,
    requireRole,
    validatePinForRoles,
} from '@/lib/pin-rbac';

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
    locationId: UUIDSchema.optional(),
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
    terminalId: UUIDSchema.optional(),
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

const CASHIER_AUTH_ROLES = ['CASHIER', ...ROLE_GROUPS.MANAGER] as const;
const QUOTE_OPERATOR_ROLES = ['CASHIER', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'] as const;
const QUOTE_GLOBAL_ROLES = ROLE_GROUPS.ADMIN;
const QUOTE_LOCATION_WIDE_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'] as const;

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

type QuoteActor = Awaited<ReturnType<typeof getActorOrFail>>;
type CanonicalQuoteItem = {
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
    total: number;
};

function hasGlobalQuoteScope(role: string) {
    return QUOTE_GLOBAL_ROLES.includes(normalizeRole(role) as typeof QUOTE_GLOBAL_ROLES[number]);
}

function canViewLocationQuotes(role: string) {
    return QUOTE_LOCATION_WIDE_ROLES.includes(
        normalizeRole(role) as typeof QUOTE_LOCATION_WIDE_ROLES[number],
    );
}

async function requireQuoteActor(allowedRoles: readonly string[] = QUOTE_OPERATOR_ROLES) {
    try {
        const actor = requireRole(await getActorOrFail(), allowedRoles);
        return { success: true as const, actor };
    } catch (error) {
        if (error instanceof PinRbacError) {
            return {
                success: false as const,
                error: error.code === 'AUTH_UNAUTHORIZED' ? 'No autenticado' : 'Acceso denegado',
            };
        }

        throw error;
    }
}

function resolveEffectiveQuoteLocation(
    actor: QuoteActor,
    requestedLocationId?: string | null,
) {
    if (hasGlobalQuoteScope(actor.role)) {
        return { success: true as const, locationId: requestedLocationId || actor.locationId || undefined };
    }

    if (!actor.locationId) {
        return { success: false as const, error: 'No tienes una ubicación asignada' };
    }

    if (requestedLocationId && requestedLocationId !== actor.locationId) {
        return { success: false as const, error: 'Acceso denegado a otra ubicación' };
    }

    return { success: true as const, locationId: actor.locationId };
}

async function resolveEffectiveQuoteTerminal(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }> },
    actor: QuoteActor,
    locationId: string,
    options?: { requestedTerminalId?: string | null; required?: boolean },
) {
    const result = await client.query(`
        SELECT crs.terminal_id::text AS terminal_id
        FROM cash_register_sessions crs
        JOIN terminals t ON t.id = crs.terminal_id
        WHERE crs.user_id::text = $1::text
          AND crs.closed_at IS NULL
          AND t.location_id::text = $2::text
        ORDER BY crs.opened_at DESC NULLS LAST, crs.id DESC
        LIMIT 1
    `, [actor.userId, locationId]);

    const activeTerminalId = String(result.rows[0]?.terminal_id || '') || undefined;

    if (options?.requestedTerminalId && activeTerminalId && options.requestedTerminalId !== activeTerminalId) {
        return { success: false as const, error: 'La terminal indicada no coincide con tu sesión activa' };
    }

    if (!activeTerminalId) {
        if (options?.required) {
            return { success: false as const, error: 'No tienes una caja activa para esta sucursal' };
        }

        return { success: true as const, terminalId: undefined };
    }

    return { success: true as const, terminalId: activeTerminalId };
}

async function loadCanonicalQuoteItems(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }> },
    locationId: string | undefined,
    items: z.infer<typeof QuoteItemSchema>[],
): Promise<{ success: true; items: CanonicalQuoteItem[] } | { success: false; error: string }> {
    const normalizedItems: CanonicalQuoteItem[] = [];

    for (const item of items) {
        const productRes = await client.query(`
            SELECT
                p.id::text AS id,
                p.sku,
                p.name,
                COALESCE(
                    NULLIF(MAX(ib.sale_price), 0),
                    NULLIF(MAX(ib.price_sell_box), 0),
                    NULLIF(MAX(p.sale_price), 0),
                    NULLIF(MAX(p.price_sell_box), 0),
                    NULLIF(MAX(p.price), 0),
                    0
                ) AS canonical_price
            FROM products p
            LEFT JOIN inventory_batches ib
              ON ib.product_id = p.id
             AND ($2::text IS NULL OR ib.location_id::text = $2::text)
            WHERE p.id = $1::uuid
            GROUP BY p.id, p.sku, p.name
            LIMIT 1
        `, [item.productId, locationId || null]);

        const product = productRes.rows[0];
        if (!product) {
            return { success: false, error: `Producto inválido en cotización: ${item.productId}` };
        }

        const unitPrice = Number(product.canonical_price || 0);
        if (unitPrice <= 0) {
            return { success: false, error: `Producto sin precio válido: ${product.name || item.name}` };
        }

        const subtotal = unitPrice * item.quantity;

        normalizedItems.push({
            productId: String(product.id),
            sku: String(product.sku || item.sku),
            name: String(product.name || item.name),
            quantity: item.quantity,
            unitPrice,
            discount: 0,
            subtotal,
            total: subtotal,
        });
    }

    return { success: true, items: normalizedItems };
}

async function getQuoteForActor(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }> },
    actor: QuoteActor,
    quoteId: string,
    options?: { lock?: boolean },
) {
    const quoteRes = await client.query(`
        SELECT q.*
        FROM quotes q
        WHERE q.id = $1::uuid
        ${options?.lock ? 'FOR UPDATE NOWAIT' : ''}
    `, [quoteId]);

    if (quoteRes.rows.length === 0) {
        return { success: false as const, error: 'Cotización no encontrada' };
    }

    const quote = quoteRes.rows[0];
    const quoteLocationId = String(quote.location_id || '') || undefined;

    if (!hasGlobalQuoteScope(actor.role)) {
        if (!actor.locationId) {
            return { success: false as const, error: 'No tienes una ubicación asignada' };
        }

        if (!quoteLocationId || quoteLocationId !== actor.locationId) {
            return { success: false as const, error: 'Acceso denegado a cotización fuera de tu sucursal' };
        }
    }

    if (!canViewLocationQuotes(actor.role) && String(quote.user_id || '') !== actor.userId) {
        return { success: false as const, error: 'No puedes acceder a una cotización ajena' };
    }

    return { success: true as const, quote, locationId: quoteLocationId };
}

async function listQuotesForActor(
    actor: QuoteActor,
    filters: z.infer<typeof QuoteHistorySchema>,
) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status) {
        conditions.push(`q.status = $${idx++}`);
        params.push(filters.status);
    }

    if (filters.searchCode && filters.searchCode.trim().length > 0) {
        conditions.push(`q.code ILIKE $${idx++}`);
        params.push(`%${filters.searchCode.trim()}%`);
    }

    if (filters.customerId) {
        conditions.push(`q.customer_id = $${idx++}::text`);
        params.push(filters.customerId);
    }

    if (filters.startDate) {
        conditions.push(`q.created_at >= $${idx++}`);
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        const eod = new Date(filters.endDate);
        eod.setHours(23, 59, 59, 999);
        conditions.push(`q.created_at <= $${idx++}`);
        params.push(eod);
    }

    if (!hasGlobalQuoteScope(actor.role)) {
        if (!actor.locationId) {
            throw new Error('No tienes una ubicación asignada');
        }

        conditions.push(`q.location_id::text = $${idx++}::text`);
        params.push(actor.locationId);

        if (!canViewLocationQuotes(actor.role)) {
            conditions.push(`q.user_id = $${idx++}::text`);
            params.push(actor.userId);
        }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
        `SELECT COUNT(*) FROM quotes q ${whereClause}`,
        params,
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const rowsRes = await pool.query(`
        SELECT
            q.id, q.code, q.total, q.created_at, q.valid_until, q.status,
            q.customer_name, q.customer_phone, q.customer_email,
            q.user_id, q.location_id,
            u.name as creator_name,
            (SELECT COUNT(*) FROM quote_items WHERE quote_id = q.id) as items_count
        FROM quotes q
        LEFT JOIN users u ON q.user_id = u.id::text
        ${whereClause}
        ORDER BY q.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, pageSize, offset]);

    return {
        quotes: rowsRes.rows,
        total,
        page,
        pageSize,
    };
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
        const result = await validatePinForRoles(client, pin, requiredRoles, {
            allowLegacyPlaintext: true,
            useRateLimiter: true,
        });

        if (!result.valid) {
            return { valid: false, error: result.error || 'PIN no válido para el nivel de autorización requerido' };
        }

        return {
            valid: true,
            authorizer: {
                id: result.authorizedBy.id,
                name: result.authorizedBy.name,
                role: result.authorizedBy.role,
            },
        };
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
        return { roles: CASHIER_AUTH_ROLES, label: 'CAJERO' };
    } else if (percent <= DISCOUNT_THRESHOLDS.MANAGER_AUTH) {
        return { roles: ROLE_GROUPS.MANAGER, label: 'MANAGER' };
    } else {
        return { roles: ROLE_GROUPS.ADMIN, label: 'GERENTE_GENERAL' };
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

    const auth = await requireQuoteActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const {
        customerId, customerName, customerPhone, customerEmail,
        items, notes, validDays, locationId, terminalId,
    } = validated.data;

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Default Read Committed
        debugLog(`[Quotes] Starting transaction for user ${auth.actor.userId}`);

        const scopedLocation = resolveEffectiveQuoteLocation(auth.actor, locationId);
        if (!scopedLocation.success || !scopedLocation.locationId) {
            await client.query('ROLLBACK');
            return { success: false, error: scopedLocation.success ? 'No se pudo resolver sucursal' : scopedLocation.error };
        }

        const effectiveLocationId = scopedLocation.locationId;

        const effectiveTerminal = await resolveEffectiveQuoteTerminal(client, auth.actor, effectiveLocationId, {
            requestedTerminalId: terminalId,
            required: false,
        });
        if (!effectiveTerminal.success) {
            await client.query('ROLLBACK');
            return { success: false, error: effectiveTerminal.error };
        }

        if (customerId) {
            const customerRes = await client.query(
                'SELECT id FROM customers WHERE id = $1::uuid AND status != \'DELETED\' LIMIT 1',
                [customerId],
            );

            if (customerRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Cliente no encontrado' };
            }
        }

        const canonicalItemsResult = await loadCanonicalQuoteItems(client, effectiveLocationId, items);
        if (!canonicalItemsResult.success) {
            await client.query('ROLLBACK');
            return { success: false, error: canonicalItemsResult.error };
        }

        const canonicalItems = canonicalItemsResult.items;
        const subtotal = canonicalItems.reduce((sum, item) => sum + item.subtotal, 0);
        const totalDiscount = 0;
        const total = subtotal;

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
            auth.actor.userId,
            effectiveLocationId,
            effectiveTerminal.terminalId || null
        ]);

        // Insert items
        debugLog(`[Quotes] Inserting ${canonicalItems.length} items...`);
        for (const item of canonicalItems) {
            const itemId = randomUUID();

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
                item.subtotal,
                item.total
            ]);
        }

        // Audit
        debugLog('📝 [Quotes] Auditing...');
        await insertQuoteAudit(client, {
            userId: auth.actor.userId,
            quoteId,
            actionCode: 'QUOTE_CREATED',
            newValues: {
                code: quoteCode,
                customer_name: customerName,
                items_count: canonicalItems.length,
                total,
                valid_until: expiresAt.toISOString(),
                location_id: effectiveLocationId,
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

    const auth = await requireQuoteActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const { quoteId, items, notes, validDays } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const quoteScope = await getQuoteForActor(client, auth.actor, quoteId, { lock: true });
        if (!quoteScope.success) {
            await client.query('ROLLBACK');
            return { success: false, error: quoteScope.error };
        }

        const quote = quoteScope.quote;

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
            const canonicalItemsResult = await loadCanonicalQuoteItems(client, quoteScope.locationId, items);
            if (!canonicalItemsResult.success) {
                await client.query('ROLLBACK');
                return { success: false, error: canonicalItemsResult.error };
            }

            const canonicalItems = canonicalItemsResult.items;

            // Delete existing items
            await client.query('DELETE FROM quote_items WHERE quote_id = $1', [quoteId]);

            // Recalculate
            let subtotal = 0;
            let totalDiscount = 0;

            for (const item of canonicalItems) {
                subtotal += item.subtotal;

                const itemId = randomUUID();
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
                    item.subtotal,
                    item.total
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
            userId: auth.actor.userId,
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

    const auth = await requireQuoteActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
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

        const quoteScope = await getQuoteForActor(client, auth.actor, quoteId, { lock: true });
        if (!quoteScope.success) {
            await client.query('ROLLBACK');
            return { success: false, error: quoteScope.error };
        }

        const quote = quoteScope.quote;

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
            userId: auth.actor.userId,
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

    const auth = await requireQuoteActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const { quoteId, paymentMethod, cashReceived, cardAmount, transferAmount, terminalId } = validated.data;

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const quoteScope = await getQuoteForActor(client, auth.actor, quoteId, { lock: true });
        if (!quoteScope.success) {
            await client.query('ROLLBACK');
            return { success: false, error: quoteScope.error };
        }

        const quote = quoteScope.quote;

        if (quote.status !== 'PENDING') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Cotización ya fue procesada o expiró' };
        }

        if (!quoteScope.locationId) {
            await client.query('ROLLBACK');
            return { success: false, error: 'La cotización no tiene una sucursal válida' };
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

        const effectiveTerminal = await resolveEffectiveQuoteTerminal(client, auth.actor, quoteScope.locationId, {
            requestedTerminalId: terminalId,
            required: true,
        });
        if (!effectiveTerminal.success || !effectiveTerminal.terminalId) {
            await client.query('ROLLBACK');
            return { success: false, error: effectiveTerminal.success ? 'No se pudo resolver la terminal' : effectiveTerminal.error };
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
                WHERE sku = $1
                  AND location_id::text = $2::text
                  AND quantity_real >= $3
                FOR UPDATE NOWAIT
                LIMIT 1
            `, [item.sku, quoteScope.locationId, item.quantity]);

            if (stockRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: `Stock insuficiente para: ${item.product_name || item.name}` };
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
            effectiveTerminal.terminalId,
            auth.actor.userId,
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
                item.product_name || item.name,
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
            userId: auth.actor.userId,
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

    const auth = await requireQuoteActor();
    if (!auth.success) {
        return { success: false, error: auth.error };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const quoteScope = await getQuoteForActor(client, auth.actor, quoteId, { lock: true });
        if (!quoteScope.success) {
            await client.query('ROLLBACK');
            return { success: false, error: quoteScope.error };
        }

        const quote = quoteScope.quote;

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
            userId: auth.actor.userId,
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

    try {
        const auth = await requireQuoteActor();
        if (!auth.success) {
            return { success: false, error: auth.error };
        }

        const result = await listQuotesForActor(auth.actor, validated.data);

        return {
            success: true,
            data: {
                quotes: result.quotes,
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
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
        const auth = await requireQuoteActor();
        if (!auth.success) {
            return { success: false, error: auth.error };
        }

        const client = await pool.connect();
        try {
            const quoteScope = await getQuoteForActor(client, auth.actor, quoteId);
            if (!quoteScope.success) {
                return { success: false, error: quoteScope.error };
            }

            const quote = quoteScope.quote;

            const itemsRes = await client.query(`
                SELECT * FROM quote_items WHERE quote_id = $1::uuid
            `, [quoteId]);

            const creatorNameRes = await client.query(
                'SELECT name FROM users WHERE id::text = $1::text LIMIT 1',
                [quote.user_id],
            );

            return {
                success: true,
                data: {
                    id: quote.id,
                    status: quote.status,
                    customer_name: quote.customer_name || 'Sin nombre',
                    customer_phone: quote.customer_phone || '',
                    items: itemsRes.rows.map(item => ({
                        id: item.id,
                        productId: item.product_id,
                        sku: item.sku,
                        name: item.product_name || item.name,
                        quantity: Number(item.quantity),
                        unitPrice: Number(item.unit_price),
                        discount: Number(item.discount_percent || 0),
                        subtotal: Number(item.subtotal),
                    })),
                    subtotal: Number(quote.subtotal),
                    discount: Number(quote.discount || 0),
                    total: Number(quote.total),
                    valid_until: quote.valid_until,
                    created_at: quote.created_at,
                    created_by_name: creatorNameRes.rows[0]?.name || 'Sistema',
                }
            }
        } finally {
            client.release();
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
    const auth = await requireQuoteActor();
    if (!auth.success) return { success: false, error: auth.error };

    try {
        const validated = QuoteHistorySchema.safeParse(filters || {});
        if (!validated.success) {
            return { success: false, error: validated.error.issues[0]?.message };
        }

        const result = await listQuotesForActor(auth.actor, validated.data);
        return { success: true, data: result.quotes, total: result.total };
    } catch (error: any) {
        logger.error({ error }, '[Quotes] Get history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}

/**
 * 🖨️ Get Full Quote Details (for Printing)
 */
export async function getQuoteDetailsSecure(quoteId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!quoteId || !uuidRegex.test(quoteId)) {
        return { success: false, error: 'ID de cotización inválido' };
    }

    try {
        const auth = await requireQuoteActor();
        if (!auth.success) {
            return { success: false, error: auth.error };
        }

        const client = await pool.connect();
        try {
            const quoteScope = await getQuoteForActor(client, auth.actor, quoteId);
            if (!quoteScope.success) {
                return { success: false, error: quoteScope.error };
            }

            const headerRes = await client.query(`
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

            const itemsRes = await client.query(`
                SELECT * FROM quote_items WHERE quote_id = $1::uuid
            `, [quoteId]);

            return {
                success: true,
                data: {
                    ...quote,
                    items: itemsRes.rows
                }
            }
        } finally {
            client.release();
        }

    } catch (error: any) {
        logger.error({ error }, '[Quotes] Get details error');
        return { success: false, error: 'Error obteniendo detalles: ' + (error.message || 'Unknown') };
    }
}
