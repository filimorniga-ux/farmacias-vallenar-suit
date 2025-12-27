'use server';

/**
 * 🛒 SALES V2 - SECURE SALES OPERATIONS
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Este módulo implementa operaciones de venta seguras con:
 * - Transacciones SERIALIZABLE para integridad
 * - Bloqueo pesimista (FOR UPDATE NOWAIT) en inventario
 * - Validación de entrada con Zod
 * - Auditoría completa de operaciones
 * - Control de stock (prevención de negativos)
 * - RBAC para anulaciones y devoluciones
 * 
 * @version 2.0.0
 * @date 2024-12-24
 */

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// =====================================================
// SCHEMAS DE VALIDACIÓN
// =====================================================

const UUIDSchema = z.string().uuid({ message: "ID inválido" });

const SaleItemSchema = z.object({
    batch_id: UUIDSchema,
    sku: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().int().positive({ message: "Cantidad debe ser positiva" }),
    price: z.number().positive({ message: "Precio debe ser positivo" }),
    discount: z.number().min(0).default(0),
});

const CreateSaleSchema = z.object({
    locationId: UUIDSchema,
    terminalId: UUIDSchema,
    sessionId: UUIDSchema,
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    items: z.array(SaleItemSchema).min(1, { message: "La venta debe tener al menos un ítem" }),
    paymentMethod: z.enum(['CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'MIXED'] as const),
    customerRut: z.string().optional(),
    customerName: z.string().optional(),
    dteFolio: z.number().optional(),
    dteType: z.enum(['BOLETA', 'FACTURA', 'NOTA_CREDITO'] as const).optional(),
    pointsRedeemed: z.number().min(0).default(0),
    pointsDiscount: z.number().min(0).default(0),
    transferId: z.string().optional(),
    notes: z.string().max(500).optional(),
});

const VoidSaleSchema = z.object({
    saleId: UUIDSchema,
    userId: z.string().min(1),
    reason: z.string().min(10, { message: "Motivo debe tener al menos 10 caracteres" }),
    supervisorPin: z.string().min(4, { message: "PIN de supervisor requerido" }),
});

const RefundSaleSchema = z.object({
    saleId: UUIDSchema,
    userId: z.string().min(1),
    items: z.array(z.object({
        saleItemId: UUIDSchema,
        quantity: z.number().int().positive(),
    })).min(1),
    reason: z.string().min(10),
    supervisorPin: z.string().min(4),
});

// =====================================================
// CONSTANTES
// =====================================================

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
    DEADLOCK_DETECTED: '40P01',
    INSUFFICIENT_STOCK: 'STOCK_ERROR'
} as const;

const ERROR_MESSAGES = {
    INSUFFICIENT_STOCK: 'Stock insuficiente para completar la venta',
    SALE_NOT_FOUND: 'Venta no encontrada',
    ALREADY_VOIDED: 'Esta venta ya fue anulada',
    INVALID_PIN: 'PIN de autorización inválido',
    UNAUTHORIZED: 'No tiene permisos para esta operación',
    SERIALIZATION_ERROR: 'Conflicto de concurrencia. Por favor reintente.',
    BATCH_LOCKED: 'Producto bloqueado por otro proceso. Intente nuevamente.',
} as const;

// Roles autorizados para anulaciones y devoluciones
const VOID_AUTHORIZED_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'] as const;

// =====================================================
// HELPERS
// =====================================================

/**
 * Valida PIN de supervisor usando bcrypt
 */
async function validateSupervisorPin(
    client: any,
    pin: string,
    requiredRoles: readonly string[] = VOID_AUTHORIZED_ROLES
): Promise<{ valid: boolean; authorizedBy?: { id: string; name: string; role: string } }> {
    try {
        const bcrypt = await import('bcryptjs');

        const usersRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users 
            WHERE role = ANY($1::text[])
            AND is_active = true
        `, [requiredRoles]);

        for (const user of usersRes.rows) {
            if (user.access_pin_hash) {
                const isValid = await bcrypt.compare(pin, user.access_pin_hash);
                if (isValid) {
                    return {
                        valid: true,
                        authorizedBy: { id: user.id, name: user.name, role: user.role }
                    };
                }
            } else if (user.access_pin && user.access_pin === pin) {
                logger.warn({ userId: user.id }, '⚠️ Sales: Using legacy plaintext PIN');
                return {
                    valid: true,
                    authorizedBy: { id: user.id, name: user.name, role: user.role }
                };
            }
        }

        return { valid: false };
    } catch (error) {
        logger.error({ error }, 'Error validating supervisor PIN');
        return { valid: false };
    }
}

/**
 * Inserta registro de auditoría para operaciones de venta
 */
async function insertSaleAudit(
    client: any,
    params: {
        userId: string;
        authorizedById?: string;
        sessionId?: string;
        terminalId?: string;
        locationId?: string;
        actionCode: string;
        entityId: string;
        amount: number;
        oldValues?: Record<string, any>;
        newValues?: Record<string, any>;
        justification?: string;
    }
) {
    try {
        await client.query(`
            INSERT INTO audit_log (
                user_id, session_id, terminal_id, location_id, 
                action_code, entity_type, entity_id, 
                old_values, new_values, justification
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                $5, 'SALE', $6,
                $7::jsonb, $8::jsonb, $9
            )
        `, [
            params.userId || null,
            params.sessionId || null,
            params.terminalId || null,
            params.locationId || null,
            params.actionCode,
            params.entityId,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            JSON.stringify({
                ...params.newValues,
                amount: params.amount,
                authorized_by: params.authorizedById
            }),
            params.justification || null
        ]);
    } catch (auditError: any) {
        logger.warn({ err: auditError }, 'Sale audit log insertion failed (non-critical)');
    }
}

// =====================================================
// OPERACIONES DE VENTA SEGURAS
// =====================================================

/**
 * Crea una nueva venta con transacción SERIALIZABLE
 * 
 * @description
 * - Valida entrada con Zod
 * - Verifica y bloquea stock con FOR UPDATE NOWAIT
 * - Previene ventas con stock negativo
 * - Registra auditoría
 * - Actualiza puntos de fidelidad si aplica
 */
export async function createSaleSecure(params: {
    locationId: string;
    terminalId: string;
    sessionId: string;
    userId: string;
    items: Array<{
        batch_id: string;
        sku?: string;
        name?: string;
        quantity: number;
        price: number;
        discount?: number;
    }>;
    paymentMethod: 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'MIXED';
    customerRut?: string;
    customerName?: string;
    dteFolio?: number;
    dteType?: 'BOLETA' | 'FACTURA' | 'NOTA_CREDITO';
    pointsRedeemed?: number;
    pointsDiscount?: number;
    transferId?: string;
    notes?: string;
}): Promise<{
    success: boolean;
    saleId?: string;
    totalAmount?: number;
    error?: string;
    stockErrors?: Array<{ batchId: string; available: number; requested: number }>;
}> {

    // 1. Validación de entrada
    const validation = CreateSaleSchema.safeParse(params);
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid input for createSaleSecure');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const {
        locationId, terminalId, sessionId, userId, items, paymentMethod,
        customerRut, customerName, dteFolio, dteType, pointsRedeemed = 0,
        pointsDiscount = 0, transferId, notes
    } = params;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, itemCount: items.length }, '🛒 [Sales v2] Starting secure sale');

        // --- INICIO DE TRANSACCIÓN SERIALIZABLE ---
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Verificar sesión activa
        const sessionRes = await client.query(`
            SELECT id, user_id, terminal_id 
            FROM cash_register_sessions 
            WHERE id = $1 AND terminal_id = $2 AND closed_at IS NULL
        `, [sessionId, terminalId]);

        if (sessionRes.rows.length === 0) {
            throw new Error('No hay sesión de caja activa para este terminal');
        }

        // 3. Verificar y bloquear stock de todos los ítems
        const stockErrors: Array<{ batchId: string; available: number; requested: number }> = [];
        const batchIds = items.map(item => item.batch_id);

        // Bloquear todos los batches de una vez (ordenados para evitar deadlocks)
        const sortedBatchIds = [...new Set(batchIds)].sort();

        const batchesRes = await client.query(`
            SELECT id, quantity_real, sku, product_id
            FROM inventory_batches 
            WHERE id = ANY($1::uuid[])
            FOR UPDATE NOWAIT
        `, [sortedBatchIds]);

        // Crear mapa de stock disponible
        const stockMap = new Map<string, { available: number; sku: string }>();
        for (const batch of batchesRes.rows) {
            stockMap.set(batch.id, {
                available: Number(batch.quantity_real),
                sku: batch.sku
            });
        }

        // Calcular cantidad total por batch (para items duplicados)
        const requestedByBatch = new Map<string, number>();
        for (const item of items) {
            const current = requestedByBatch.get(item.batch_id) || 0;
            requestedByBatch.set(item.batch_id, current + item.quantity);
        }

        // Verificar disponibilidad
        for (const [batchId, requested] of requestedByBatch) {
            const stock = stockMap.get(batchId);
            if (!stock) {
                stockErrors.push({ batchId, available: 0, requested });
            } else if (stock.available < requested) {
                stockErrors.push({ batchId, available: stock.available, requested });
            }
        }

        if (stockErrors.length > 0) {
            await client.query('ROLLBACK');
            logger.warn({ stockErrors }, '⚠️ [Sales v2] Insufficient stock');
            return {
                success: false,
                error: ERROR_MESSAGES.INSUFFICIENT_STOCK,
                stockErrors
            };
        }

        // 4. Calcular totales
        const saleId = uuidv4();
        let subtotal = 0;
        let totalDiscount = 0;

        for (const item of items) {
            const itemTotal = item.price * item.quantity;
            const itemDiscount = item.discount || 0;
            subtotal += itemTotal;
            totalDiscount += itemDiscount;
        }

        const totalAmount = subtotal - totalDiscount - pointsDiscount;

        // 5. Insertar venta
        await client.query(`
            INSERT INTO sales (
                id, location_id, terminal_id, session_id, user_id,
                customer_rut, customer_name, total_amount, subtotal,
                discount_amount, points_discount, payment_method,
                dte_folio, dte_type, transfer_id, notes, status, timestamp
            ) VALUES (
                $1, $2, $3, $4, $5::uuid,
                $6, $7, $8, $9,
                $10, $11, $12,
                $13, $14, $15, $16, 'COMPLETED', NOW()
            )
        `, [
            saleId, locationId, terminalId, sessionId, userId,
            customerRut || null, customerName || null, totalAmount, subtotal,
            totalDiscount, pointsDiscount, paymentMethod,
            dteFolio || null, dteType || 'BOLETA', transferId || null, notes || null
        ]);

        // 6. Insertar ítems y actualizar stock
        for (const item of items) {
            const saleItemId = uuidv4();

            await client.query(`
                INSERT INTO sale_items (
                    id, sale_id, batch_id, quantity, 
                    unit_price, discount_amount, total_price
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                saleItemId, saleId, item.batch_id, item.quantity,
                item.price, item.discount || 0,
                (item.price * item.quantity) - (item.discount || 0)
            ]);

            // Decrementar stock
            await client.query(`
                UPDATE inventory_batches 
                SET quantity_real = quantity_real - $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [item.quantity, item.batch_id]);
        }

        // 7. Actualizar puntos de fidelidad si hay cliente
        if (customerRut && pointsRedeemed > 0) {
            await client.query(`
                UPDATE customers 
                SET loyalty_points = loyalty_points - $1,
                    updated_at = NOW()
                WHERE rut = $2
            `, [pointsRedeemed, customerRut]);
        }

        // 8. Generar puntos por la compra (1 punto por cada $1000)
        if (customerRut && totalAmount > 0) {
            const pointsEarned = Math.floor(totalAmount / 1000);
            if (pointsEarned > 0) {
                await client.query(`
                    UPDATE customers 
                    SET loyalty_points = loyalty_points + $1,
                        total_purchases = total_purchases + $2,
                        updated_at = NOW()
                    WHERE rut = $3
                `, [pointsEarned, totalAmount, customerRut]);
            }
        }

        // 9. Registrar auditoría
        await insertSaleAudit(client, {
            userId,
            sessionId,
            terminalId,
            locationId,
            actionCode: 'SALE_CREATE',
            entityId: saleId,
            amount: totalAmount,
            newValues: {
                payment_method: paymentMethod,
                item_count: items.length,
                customer_rut: customerRut,
                dte_folio: dteFolio,
                points_redeemed: pointsRedeemed
            }
        });

        // --- COMMIT ---
        await client.query('COMMIT');

        logger.info({ saleId, totalAmount }, '✅ [Sales v2] Sale completed successfully');
        revalidatePath('/caja');
        revalidatePath('/pos');

        return { success: true, saleId, totalAmount };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            logger.warn({}, '⏳ [Sales v2] Inventory locked by another process');
            return { success: false, error: ERROR_MESSAGES.BATCH_LOCKED };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            logger.warn({}, '🔄 [Sales v2] Serialization conflict');
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error }, '❌ [Sales v2] Sale creation failed');
        return { success: false, error: error.message || 'Error procesando venta' };

    } finally {
        client.release();
    }
}

/**
 * Anula una venta existente con autorización de supervisor
 * 
 * @description
 * - Requiere PIN de supervisor (bcrypt)
 * - Revierte stock de todos los ítems
 * - Registra justificación obligatoria
 * - Auditoría completa
 */
export async function voidSaleSecure(params: {
    saleId: string;
    userId: string;
    reason: string;
    supervisorPin: string;
}): Promise<{ success: boolean; error?: string }> {

    // 1. Validación
    const validation = VoidSaleSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { saleId, userId, reason, supervisorPin } = params;

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        logger.info({ saleId }, '🚫 [Sales v2] Starting sale void');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validar PIN de supervisor
        const authResult = await validateSupervisorPin(client, supervisorPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
        }

        logger.info({ authorizedBy: authResult.authorizedBy?.name }, '✅ Void authorized');

        // 3. Obtener y bloquear venta
        const saleRes = await client.query(`
            SELECT id, status, total_amount, location_id, terminal_id, session_id
            FROM sales 
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [saleId]);

        if (saleRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.SALE_NOT_FOUND);
        }

        const sale = saleRes.rows[0];
        if (sale.status === 'VOIDED') {
            throw new Error(ERROR_MESSAGES.ALREADY_VOIDED);
        }

        // 4. Obtener ítems de la venta
        const itemsRes = await client.query(`
            SELECT batch_id, quantity FROM sale_items WHERE sale_id = $1
        `, [saleId]);

        // 5. Revertir stock
        for (const item of itemsRes.rows) {
            if (item.batch_id) {
                await client.query(`
                    UPDATE inventory_batches 
                    SET quantity_real = quantity_real + $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [item.quantity, item.batch_id]);
            }
        }

        // 6. Marcar venta como anulada
        await client.query(`
            UPDATE sales 
            SET status = 'VOIDED',
                voided_at = NOW(),
                voided_by = $1::uuid,
                void_reason = $2,
                void_authorized_by = $3::uuid
            WHERE id = $4
        `, [userId, reason, authResult.authorizedBy?.id, saleId]);

        // 7. Auditoría
        await insertSaleAudit(client, {
            userId,
            authorizedById: authResult.authorizedBy?.id,
            sessionId: sale.session_id,
            terminalId: sale.terminal_id,
            locationId: sale.location_id,
            actionCode: 'SALE_VOID',
            entityId: saleId,
            amount: Number(sale.total_amount),
            oldValues: { status: sale.status },
            newValues: { status: 'VOIDED', void_reason: reason },
            justification: reason
        });

        await client.query('COMMIT');

        logger.info({ saleId }, '✅ [Sales v2] Sale voided successfully');
        revalidatePath('/caja');
        revalidatePath('/pos');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ err: error }, '❌ [Sales v2] Sale void failed');
        return { success: false, error: error.message || 'Error anulando venta' };

    } finally {
        client.release();
    }
}

/**
 * Procesa devolución parcial o total
 */
export async function refundSaleSecure(params: {
    saleId: string;
    userId: string;
    items: Array<{ saleItemId: string; quantity: number }>;
    reason: string;
    supervisorPin: string;
}): Promise<{ success: boolean; refundId?: string; refundAmount?: number; error?: string }> {

    // 1. Validación
    const validation = RefundSaleSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { saleId, userId, items, reason, supervisorPin } = params;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ saleId, itemCount: items.length }, '↩️ [Sales v2] Starting refund');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validar PIN
        const authResult = await validateSupervisorPin(client, supervisorPin);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
        }

        // 3. Obtener venta original
        const saleRes = await client.query(`
            SELECT id, status, location_id, terminal_id, session_id
            FROM sales WHERE id = $1 FOR UPDATE NOWAIT
        `, [saleId]);

        if (saleRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.SALE_NOT_FOUND);
        }

        const sale = saleRes.rows[0];
        if (sale.status === 'VOIDED') {
            throw new Error('No se puede devolver una venta anulada');
        }

        // 4. Procesar cada ítem de devolución
        const refundId = uuidv4();
        let totalRefund = 0;

        for (const refundItem of items) {
            // Obtener ítem original
            const itemRes = await client.query(`
                SELECT si.*, ib.id as batch_id
                FROM sale_items si
                LEFT JOIN inventory_batches ib ON si.batch_id = ib.id
                WHERE si.id = $1 AND si.sale_id = $2
                FOR UPDATE NOWAIT
            `, [refundItem.saleItemId, saleId]);

            if (itemRes.rows.length === 0) {
                throw new Error(`Ítem ${refundItem.saleItemId} no encontrado`);
            }

            const originalItem = itemRes.rows[0];
            const alreadyRefunded = Number(originalItem.refunded_quantity || 0);
            const maxRefundable = Number(originalItem.quantity) - alreadyRefunded;

            if (refundItem.quantity > maxRefundable) {
                throw new Error(`Cantidad de devolución excede lo disponible para ítem ${refundItem.saleItemId}`);
            }

            const refundAmount = (Number(originalItem.unit_price) * refundItem.quantity);
            totalRefund += refundAmount;

            // Actualizar ítem con cantidad devuelta
            await client.query(`
                UPDATE sale_items 
                SET refunded_quantity = COALESCE(refunded_quantity, 0) + $1
                WHERE id = $2
            `, [refundItem.quantity, refundItem.saleItemId]);

            // Revertir stock si hay batch
            if (originalItem.batch_id) {
                await client.query(`
                    UPDATE inventory_batches 
                    SET quantity_real = quantity_real + $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [refundItem.quantity, originalItem.batch_id]);
            }

            // Registrar ítem de devolución
            await client.query(`
                INSERT INTO refund_items (
                    id, refund_id, sale_item_id, quantity, amount
                ) VALUES ($1, $2, $3, $4, $5)
            `, [uuidv4(), refundId, refundItem.saleItemId, refundItem.quantity, refundAmount]);
        }

        // 5. Crear registro de devolución
        await client.query(`
            INSERT INTO refunds (
                id, sale_id, user_id, authorized_by, 
                total_amount, reason, status, created_at
            ) VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, 'COMPLETED', NOW())
        `, [refundId, saleId, userId, authResult.authorizedBy?.id, totalRefund, reason]);

        // 6. Actualizar estado de venta si es devolución total
        const remainingRes = await client.query(`
            SELECT SUM(quantity - COALESCE(refunded_quantity, 0)) as remaining
            FROM sale_items WHERE sale_id = $1
        `, [saleId]);

        const remaining = Number(remainingRes.rows[0]?.remaining || 0);
        if (remaining === 0) {
            await client.query(`
                UPDATE sales SET status = 'FULLY_REFUNDED' WHERE id = $1
            `, [saleId]);
        } else {
            await client.query(`
                UPDATE sales SET status = 'PARTIALLY_REFUNDED' WHERE id = $1
            `, [saleId]);
        }

        // 7. Auditoría
        await insertSaleAudit(client, {
            userId,
            authorizedById: authResult.authorizedBy?.id,
            sessionId: sale.session_id,
            terminalId: sale.terminal_id,
            locationId: sale.location_id,
            actionCode: 'SALE_REFUND',
            entityId: refundId,
            amount: totalRefund,
            newValues: {
                original_sale_id: saleId,
                items_count: items.length,
                refund_reason: reason
            },
            justification: reason
        });

        await client.query('COMMIT');

        logger.info({ refundId, totalRefund }, '✅ [Sales v2] Refund completed');
        revalidatePath('/caja');

        return { success: true, refundId, refundAmount: totalRefund };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ err: error }, '❌ [Sales v2] Refund failed');
        return { success: false, error: error.message || 'Error procesando devolución' };

    } finally {
        client.release();
    }
}

// =====================================================
// CONSULTAS SEGURAS
// =====================================================

/**
 * Obtiene historial de ventas con filtros
 */
export async function getSalesHistory(options: {
    locationId?: string;
    terminalId?: string;
    sessionId?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    limit?: number;
    offset?: number;
}): Promise<{ success: boolean; data?: any[]; total?: number; error?: string }> {

    const { limit = 50, offset = 0, locationId, terminalId, sessionId, startDate, endDate, status } = options;

    try {
        let whereClause = 'WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;

        if (locationId) {
            whereClause += ` AND s.location_id::text = $${paramIndex}`;
            params.push(locationId);
            paramIndex++;
        }

        if (terminalId) {
            whereClause += ` AND s.terminal_id::text = $${paramIndex}`;
            params.push(terminalId);
            paramIndex++;
        }

        if (sessionId) {
            whereClause += ` AND s.session_id::text = $${paramIndex}`;
            params.push(sessionId);
            paramIndex++;
        }

        if (startDate) {
            whereClause += ` AND s.timestamp >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereClause += ` AND s.timestamp <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (status) {
            whereClause += ` AND s.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        // Contar total
        const countRes = await query(
            `SELECT COUNT(*) FROM sales s ${whereClause}`,
            params
        );
        const total = parseInt(countRes.rows[0].count, 10);

        // Obtener datos
        params.push(limit, offset);
        const dataRes = await query(`
            SELECT 
                s.*,
                u.name as seller_name,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', si.id,
                            'batch_id', si.batch_id,
                            'quantity', si.quantity,
                            'unit_price', si.unit_price,
                            'total_price', si.total_price,
                            'refunded_quantity', si.refunded_quantity
                        )
                    ) FILTER (WHERE si.id IS NOT NULL), '[]'
                ) as items
            FROM sales s
            LEFT JOIN users u ON s.user_id::text = u.id
            LEFT JOIN sale_items si ON s.id = si.sale_id::text
            ${whereClause}
            GROUP BY s.id, u.name
            ORDER BY s.timestamp DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        return { success: true, data: dataRes.rows, total };

    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching sales history');
        return { success: false, error: 'Error obteniendo historial de ventas' };
    }
}

/**
 * Obtiene resumen de ventas por sesión
 */
export async function getSessionSalesSummary(sessionId: string): Promise<{
    success: boolean;
    data?: {
        totalSales: number;
        totalAmount: number;
        salesByMethod: Record<string, number>;
        voidedCount: number;
        refundedAmount: number;
    };
    error?: string;
}> {
    if (!z.string().uuid().safeParse(sessionId).success) {
        return { success: false, error: 'ID de sesión inválido' };
    }

    try {
        const summaryRes = await query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'COMPLETED') as total_sales,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'COMPLETED'), 0) as total_amount,
                COUNT(*) FILTER (WHERE status = 'VOIDED') as voided_count,
                COALESCE(SUM(total_amount) FILTER (WHERE status IN ('PARTIALLY_REFUNDED', 'FULLY_REFUNDED')), 0) as refunded_sales_amount
            FROM sales
            WHERE session_id = $1
        `, [sessionId]);

        const byMethodRes = await query(`
            SELECT payment_method, COALESCE(SUM(total_amount), 0) as total
            FROM sales
            WHERE session_id = $1 AND status = 'COMPLETED'
            GROUP BY payment_method
        `, [sessionId]);

        const salesByMethod: Record<string, number> = {};
        for (const row of byMethodRes.rows) {
            salesByMethod[row.payment_method] = Number(row.total);
        }

        const refundsRes = await query(`
            SELECT COALESCE(SUM(r.total_amount), 0) as refunded_amount
            FROM refunds r
            JOIN sales s ON r.sale_id = s.id
            WHERE s.session_id = $1 AND r.status = 'COMPLETED'
        `, [sessionId]);

        const summary = summaryRes.rows[0];

        return {
            success: true,
            data: {
                totalSales: parseInt(summary.total_sales, 10),
                totalAmount: Number(summary.total_amount),
                salesByMethod,
                voidedCount: parseInt(summary.voided_count, 10),
                refundedAmount: Number(refundsRes.rows[0]?.refunded_amount || 0)
            }
        };

    } catch (error: any) {
        logger.error({ err: error, sessionId }, 'Error fetching session sales summary');
        return { success: false, error: 'Error obteniendo resumen de ventas' };
    }
}
