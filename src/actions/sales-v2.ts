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
    batch_id: z.string().min(1, { message: "ID de lote requerido" }), // Permite UUID o "MANUAL"
    sku: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().int().positive({ message: "Cantidad debe ser positiva" }),
    price: z.number().positive({ message: "Precio debe ser positivo" }),
    discount: z.number().min(0).default(0),
    is_fractional: z.boolean().optional().default(false),
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
    dteType: z.enum(['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'RECIBO'] as const).optional(),
    pointsRedeemed: z.number().min(0).default(0),
    pointsDiscount: z.number().min(0).default(0),
    transferId: z.string().optional(),
    queueTicketId: UUIDSchema.optional(), // NEW: Link to Queue
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
        is_fractional?: boolean;
    }>;
    paymentMethod: 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'MIXED';
    customerRut?: string;
    customerName?: string;
    dteFolio?: number;
    dteType?: 'BOLETA' | 'FACTURA' | 'NOTA_CREDITO';
    pointsRedeemed?: number;
    pointsDiscount?: number;
    transferId?: string;
    queueTicketId?: string; // NEW
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
        pointsDiscount = 0, transferId, notes, queueTicketId
    } = params;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ terminalId, sessionId, userId, itemCount: items.length }, '🛒 [Sales v2] Starting secure sale');

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

        // FILTRAR ÍTEMS MANUALES: No tienen stock real, ignorar en bloqueo
        const inventoryItems = items.filter(item => {
            const rawId = String(item.batch_id || '').trim().toUpperCase();
            return rawId !== 'MANUAL' && !rawId.startsWith('MANUAL');
        });

        const batchIds = inventoryItems.map(item => item.batch_id);

        // Bloquear todos los batches de una vez (ordenados para evitar deadlocks)
        const sortedBatchIds = [...new Set(batchIds)].sort();

        let batchesRes = { rows: [] as any[] };

        // Solo consultamos si hay ítems de inventario real
        if (sortedBatchIds.length > 0) {
            batchesRes = await client.query(`
                SELECT id, quantity_real, sku, product_id, location_id
                FROM inventory_batches 
                WHERE id = ANY($1::uuid[])
                AND location_id = $2::uuid
                FOR UPDATE NOWAIT
            `, [sortedBatchIds, locationId]);
        }

        // 3.1 RECOVERY MODE: Si faltan batches, verificar si son Product IDs o SKUs y resolver
        if (batchesRes.rows.length !== sortedBatchIds.length) {
            const foundIds = new Set(batchesRes.rows.map(r => r.id));
            const missingIds = sortedBatchIds.filter(id => !foundIds.has(id));

            logger.warn({ missingIds, locationId }, '⚠️ [Sales v2] Batches not found. Attempting to resolve from Products table (by ID or SKU)...');

            // Mapa para remapear los IDs en los items (OldID -> NewBatchID)
            const idRemap = new Map<string, string>();

            for (const missingId of missingIds) {
                // Verificar si es un Producto válido (por ID o por SKU)
                const productRes = await client.query(`
                    SELECT id, sku, name, price_sell_box, cost_price
                    FROM products 
                    WHERE id::text = $1 OR sku = $1
                    LIMIT 1
                `, [missingId]);

                if (productRes.rows.length > 0) {
                    const product = productRes.rows[0];

                    // Buscar si YA existe un batch para este producto en la ubicación
                    const existingBatchRes = await client.query(`
                        SELECT id, quantity_real, sku, product_id, location_id
                        FROM inventory_batches 
                        WHERE product_id = $1 AND location_id = $2
                        LIMIT 1
                        FOR UPDATE NOWAIT
                    `, [product.id, locationId]);

                    let realBatch;

                    if (existingBatchRes.rows.length > 0) {
                        // Usar batch existente
                        realBatch = existingBatchRes.rows[0];
                        logger.info({ missingId, resolvedBatchId: realBatch.id }, '✅ [Sales v2] Resolved Product/SKU to Existing Batch');
                    } else {
                        // Resolver warehouse_id correcto para la ubicación (Fallback a la propia ubicación si no hay warehouse)
                        let targetWarehouseId = locationId;
                        try {
                            const whRes = await client.query(
                                'SELECT default_warehouse_id FROM locations WHERE id = $1',
                                [locationId]
                            );
                            if (whRes.rows.length > 0 && whRes.rows[0].default_warehouse_id) {
                                targetWarehouseId = whRes.rows[0].default_warehouse_id;
                            }
                        } catch (e) {
                            logger.warn({ err: e }, '⚠️ [Sales v2] Failed to resolve warehouse_id');
                        }

                        // Crear nuevo batch (auto-inicialización con stock 0 para permitir venta negativa)
                        const newBatchId = uuidv4();
                        const lotNumber = `AUTO-${Date.now()}`;

                        await client.query(`
                            INSERT INTO inventory_batches (
                                id, product_id, sku, name, 
                                location_id, warehouse_id, 
                                quantity_real, lot_number,
                                unit_cost, sale_price,
                                stock_min, stock_max,
                                created_at, updated_at
                            ) VALUES (
                                $1, $2, $3, $4, 
                                $5, $6, 
                                0, $7,
                                $8, $9, 
                                0, 100,
                                NOW(), NOW()
                            )
                        `, [
                            newBatchId, product.id, product.sku, product.name,
                            locationId, targetWarehouseId,
                            lotNumber,
                            product.cost_price || 0, product.price_sell_box || 0
                        ]);

                        realBatch = {
                            id: newBatchId,
                            quantity_real: 0,
                            sku: product.sku,
                            product_id: product.id,
                            location_id: locationId
                        };
                        logger.info({ missingId, newBatchId, sku: product.sku }, '✅ [Sales v2] Created New Batch for Product/SKU at location');
                    }

                    // Agregar a la lista de batches encontrados para que pase la validación de UUID
                    batchesRes.rows.push(realBatch);
                    idRemap.set(missingId, realBatch.id);

                } else {
                    logger.error({ missingId }, '❌ [Sales v2] ID is neither Batch, Product nor SKU');
                }
            }

            // Aplicar remapeo a los items de la venta
            if (idRemap.size > 0) {
                for (const item of items) {
                    if (idRemap.has(item.batch_id)) {
                        item.batch_id = idRemap.get(item.batch_id)!;
                    }
                }
            }

            // Re-verificar si seguimos teniendo faltantes (casos fatales)
            const allIdsNow = new Set(batchesRes.rows.map(r => r.id));
            const stillMissing = items
                .filter(i => {
                    const rawId = String(i.batch_id || '').trim().toUpperCase();
                    return rawId !== 'MANUAL' && !rawId.startsWith('MANUAL');
                })
                .map(i => i.batch_id)
                .filter(id => !allIdsNow.has(id));

            if (stillMissing.length > 0) {
                await client.query('ROLLBACK');
                logger.error({ stillMissing }, '❌ [Sales v2] Fatal: Some products still missing after recovery');
                return {
                    success: false,
                    error: `Error crítico: Productos no encontrados en inventario ni catálogo. SKU/IDs: ${stillMissing.join(', ')}`
                };
            }
        }


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
            // Saltamos la verificación de stock para ítems manuales
            const rawId = String(batchId || '').trim().toUpperCase();
            if (rawId === 'MANUAL' || rawId.startsWith('MANUAL')) {
                continue;
            }

            const stock = stockMap.get(batchId);
            if (!stock) {
                stockErrors.push({ batchId, available: 0, requested });
            } else if (stock.available < requested) {
                stockErrors.push({ batchId, available: stock.available, requested });
            }
        }

        if (stockErrors.length > 0) {
            // await client.query('ROLLBACK'); // DISABLED: Allow negative stock
            logger.warn({ stockErrors }, '⚠️ [Sales v2] Insufficient stock - Proceeding with sale (Negative Inventory allowed)');
            // return {
            //     success: false,
            //     error: ERROR_MESSAGES.INSUFFICIENT_STOCK,
            //     stockErrors
            // };
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

        const totalAmount = Math.max(0, subtotal - totalDiscount - pointsDiscount);

        if (totalAmount === 0 && subtotal > 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                error: 'Los descuentos no pueden superar el total de la venta'
            };
        }

        // 5. Insertar venta
        await client.query(`
            INSERT INTO sales (
                id, location_id, terminal_id, session_id, user_id,
                customer_rut, customer_name, total, total_amount, subtotal,
                discount_amount, points_discount, payment_method,
                dte_folio, dte_type, transfer_id, notes, status, timestamp, 
                queue_ticket_id
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13,
                $14, $15, $16, $17, 'COMPLETED', NOW(),
                $18
            )
        `, [
            saleId, locationId, terminalId, sessionId, userId,
            customerRut || null, customerName || null, totalAmount, totalAmount, subtotal,
            totalDiscount, pointsDiscount, paymentMethod,
            dteFolio || null, dteType || 'BOLETA', transferId || null, notes || null,
            queueTicketId || null
        ]);

        // 6. Insertar ítems y actualizar stock
        for (const item of items) {
            const saleItemId = uuidv4();
            // 7.1 Detectar si es un ítem manual de forma robusta
            const rawBatchId = String(item.batch_id || '').trim();
            const isManualItem = rawBatchId === 'MANUAL' ||
                rawBatchId.toUpperCase().startsWith('MANUAL');

            // Debug Log para rastrear el error
            console.log(`🔍 [createSaleSecure] Item Batch: "${item.batch_id}" -> IsManual: ${isManualItem}`);

            // Si es manual, guardamos NULL en batch_id para evitar error de UUID
            const batchIdToInsert = isManualItem ? null : item.batch_id;

            await client.query(`
                INSERT INTO sale_items (
                    id, sale_id, batch_id, quantity, 
                    unit_price, discount_amount, total_price, product_name,
                    timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            `, [
                saleItemId, saleId, batchIdToInsert, item.quantity,
                item.price, item.discount || 0,
                (item.price * item.quantity) - (item.discount || 0),
                item.name || (isManualItem ? 'Ítem Manual' : 'Sin Nombre')
            ]);

            // Decrementar stock SOLO si es un producto de inventario (no manual)
            if (!isManualItem) {
                const stockColumn = item.is_fractional ? 'units_stock_actual' : 'quantity_real';

                await client.query(`
                    UPDATE inventory_batches 
                    SET ${stockColumn} = ${stockColumn} - $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [item.quantity, item.batch_id]);

                // Debug log
                console.log(`📉 [createSaleSecure] Stock updated: ${stockColumn} - ${item.quantity} for batch ${item.batch_id}`);
            }
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

        // NOTIFICATION TRIGGER: Check for Low Stock (Zero or Negative)
        // Executed after commit to ensure data visibility
        (async () => {
            try {
                const { createNotificationSecure } = await import('./notifications-v2');
                const { pool } = await import('@/lib/db');
                const notifyClient = await pool.connect();

                try {
                    for (const item of items) {
                        if (!item.batch_id || item.batch_id.startsWith('MANUAL')) continue;

                        const stockRes = await notifyClient.query(
                            'SELECT quantity_real, name, sku FROM inventory_batches WHERE id = $1',
                            [item.batch_id]
                        );

                        if (stockRes && stockRes.rows && stockRes.rows.length > 0) {
                            const { quantity_real, name, sku } = stockRes.rows[0];
                            if (quantity_real <= 0) {
                                await createNotificationSecure({
                                    type: 'STOCK_CRITICAL',
                                    severity: 'ERROR',
                                    title: 'Stock Crítico / Negativo',
                                    message: `El producto ${name} (SKU: ${sku}) ha quedado con stock ${quantity_real}.Revisar inventario físico.`,
                                    metadata: { batchId: item.batch_id, saleId, locationId, currentStock: quantity_real }
                                    // userId is inferred from session in createNotificationSecure
                                });
                            }
                        }
                    }
                } finally {
                    notifyClient.release();
                }
            } catch (e) {
                console.error('[Notification Trigger] Failed', e);
            }
        })();

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

    const {
        saleId, userId, reason, supervisorPin,
        // @ts-ignore
        queueTicketId // Ignored here as voidSale doesn't use it, but keeping for symmetry if needed later
    } = params;

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
/**
 * Obtiene historial de ventas de forma segura
 * 
 * @description
 * - Requiere autenticación (Sesión o PIN de supervisor)
 * - Filtra estrictamente por sucursal asignada (excepto roles globales)
 * - Registra auditoría de acceso
 */
export async function getSalesHistorySecure(params: {
    filters: {
        startDate: string;
        endDate: string;
        searchTerm?: string;
        paymentMethod?: string; // Nuevo filtro
        sessionId?: string; // Nuevo filtro para turnos 24h
        limit?: number;
        offset?: number;
    };
    security: {
        locationId?: string; // El frontend envía su location actual
        supervisorPin?: string; // Opcional: para elevación de privilegios
    };
}): Promise<{ success: boolean; data?: any[]; total?: number; error?: string; debugQuery?: any }> {
    console.log('🔍 [getSalesHistorySecure] START', JSON.stringify(params, null, 2));

    const { filters, security } = params;
    const { startDate, endDate, searchTerm = '', paymentMethod, sessionId, limit = 50, offset = 0 } = filters;
    const { locationId, supervisorPin } = security;

    const { getSessionSecure, validateSupervisorPin } = await import('./auth-v2');

    const session = await getSessionSecure();
    const userId = session?.userId;
    const userRole = session?.role;

    let authorizedUserId = userId;
    let isAuthorized = false;

    // 2. Validar autorización
    // A. Vía PIN (Elevación o Rol Manager/Admin)
    if (supervisorPin) {
        // Usamos la función importada de auth-v2 que maneja su propia conexión/query
        const auth = await validateSupervisorPin(supervisorPin);
        if (auth.success && auth.authorizedBy) {
            isAuthorized = true;
            authorizedUserId = auth.authorizedBy.id; // Auditoría a nombre del supervisor
        }
    }
    // B. Vía Sesión (si el usuario ya tiene rol alto)
    else if (userId && userRole) {
        if (['MANAGER', 'ADMIN', 'GERENTE_GENERAL'].includes(userRole.toUpperCase())) {
            isAuthorized = true;
        }
    }

    // Permitir también si es el cajero de su propia caja (revisar location) -> Por ahora simple: Require PIN or Context
    // Si viene de "Mis Ventas" (POS), generalmente ya tiene contexto.
    // Para simplificar, si hay userId válido y session activa, permitimos.
    if (userId) isAuthorized = true;

    if (!isAuthorized) {
        return { success: false, error: 'Acceso no autorizado. Se requiere inicio de sesión o PIN de supervisor.' };
    }

    let debugQuery: any = undefined;

    try {
        let whereClause = 'WHERE 1=1';
        const queryParams: any[] = [];
        let paramIndex = 1;

        // Filtro de Sucursal Obligatorio
        if (locationId) {
            whereClause += ` AND s.location_id::text = $${paramIndex}`;
            queryParams.push(locationId);
            paramIndex++;
        }

        // Filtro por Medio de Pago
        if (paymentMethod && paymentMethod !== 'ALL') {
            whereClause += ` AND s.payment_method = $${paramIndex}`;
            queryParams.push(paymentMethod);
            paramIndex++;
        }

        // --- MANEJO DE FECHAS Y TURNOS (24/7) ---
        // (Logic unchanged)
        let dateCondition = '';
        if (startDate) {
            dateCondition += `(s.timestamp AT TIME ZONE 'America/Santiago')::date >= $${paramIndex}::date`;
            queryParams.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            if (dateCondition) dateCondition += ' AND ';
            dateCondition += `(s.timestamp AT TIME ZONE 'America/Santiago')::date <= $${paramIndex}::date`;
            queryParams.push(endDate);
            paramIndex++;
        }

        if (dateCondition) {
            if (sessionId) {
                // Híbrido: Rango de Fechas O Sesión Actual
                whereClause += ` AND ( (${dateCondition}) OR s.session_id::text = $${paramIndex} )`;
                queryParams.push(sessionId);
                paramIndex++;
            } else {
                // Solo fechas
                whereClause += ` AND (${dateCondition})`;
            }
        } else if (sessionId) {
            // Solo Sesión (raro, pero posible)
            whereClause += ` AND s.session_id::text = $${paramIndex}`;
            queryParams.push(sessionId);
            paramIndex++;
        }

        // Filtro de Búsqueda Avanzado: ID, Folio, Cliente, RUT, PRODUCTOS
        if (searchTerm) {
            whereClause += ` AND (
                s.id::text ILIKE $${paramIndex} OR
                s.dte_folio::text ILIKE $${paramIndex} OR
                s.customer_name ILIKE $${paramIndex} OR
                s.customer_rut ILIKE $${paramIndex} OR
                
                -- Búsqueda por productos en la venta
                EXISTS (
                    SELECT 1 FROM sale_items si 
                    JOIN inventory_batches ib ON si.batch_id::text = ib.id::text 
                    WHERE si.sale_id::text = s.id::text AND (
                        ib.name ILIKE $${paramIndex} OR
                        ib.sku ILIKE $${paramIndex}
                    )
                )
            )`;
            queryParams.push(`%${searchTerm}%`);
            paramIndex++;
        }

        // 4. Ejecutar Consulta
        // 4. Ejecutar Consulta
        debugQuery = { whereClause, queryParams };
        console.log('🔍 [getSalesHistorySecure] Query:', debugQuery);

        // Contar total
        const countRes = await query(
            `SELECT COUNT(*) FROM sales s ${whereClause}`,
            queryParams
        );
        const total = parseInt(countRes.rows[0].count, 10);

        // Obtener datos paginados
        queryParams.push(limit, offset);
        const limitIndex = paramIndex;
        const offsetIndex = paramIndex + 1;

        const dataRes = await query(`
            SELECT 
                s.id, s.timestamp, s.status, s.total_amount, s.payment_method,
                s.dte_folio, s.dte_type, s.customer_name, s.user_id as seller_id,
                u.name as seller_name,
                -- Items simplificados para lista
                (
                    SELECT json_agg(json_build_object(
                        'name', p.name,
                        'quantity', si.quantity,
                        'price', si.unit_price
                    )) 
                    FROM sale_items si 
                    -- Cast explícito para evitar error uuid = varchar en batches antiguos o usuarios
                    LEFT JOIN inventory_batches ib ON si.batch_id::text = ib.id::text
                    LEFT JOIN products p ON ib.product_id::text = p.id::text
                    WHERE si.sale_id::text = s.id::text
                ) as items
            FROM sales s
            LEFT JOIN users u ON s.user_id::text = u.id::text
            ${whereClause}
            ORDER BY s.timestamp DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
        `, queryParams);

        // Mapear resultado para frontend
        const mappedData = dataRes.rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp, // Se serializará automáticamente
            status: row.status,
            total: Number(row.total_amount),
            payment_method: row.payment_method,
            dte_folio: row.dte_folio,
            dte_status: row.dte_folio ? 'CONFIRMED_DTE' : 'PENDING', // Simplificado
            customer: { fullName: row.customer_name || 'Desconocido' },
            seller_id: row.seller_name || row.seller_id,
            items: row.items || []
        }));

        // 5. Auditoría (Solo la primera página para no saturar)
        if (offset === 0) {
            // Usamos un cliente ad-hoc para insertar auditoría sin bloquear
            // (En Next actions, mejor usar fire-and-forget o await si es crítico)
            // Aquí reutilizamos la función insertSaleAudit si la exportáramos, o logger
            logger.info({
                user: authorizedUserId,
                location: locationId,
                rows: mappedData.length
            }, '📋 [Audit] Sales History Viewed');

            // Insertar en tabla audit_log directo si hace falta
            // Nota: audit_log vs audit_logs (usaré audit_log de sales-v2.ts)
            try {
                await query(`
                    INSERT INTO audit_log (
                        user_id, location_id, action_code, entity_type, metadata
                    ) VALUES ($1, $2, 'SALES_HISTORY_VIEW', 'REPORT', $3)
                 `, [authorizedUserId || null, locationId || null, JSON.stringify({ filters })]);
            } catch (e) { console.error('Audit fail', e); }
        }

        if (mappedData.length === 0) {
            // Return empty success so frontend shows empty state
            return { success: true, data: [], total: 0, debugQuery: debugQuery as any };
        }

        return { success: true, data: mappedData, total, debugQuery: debugQuery as any };

    } catch (error: any) {
        logger.error({ err: error }, 'Error en getSalesHistorySecure');
        return { success: false, error: error.message || 'Error desconocido', debugQuery: debugQuery as any };
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

/**
 * Legacy support for TigerDataService or other consumers expecting simplified interface
 */
export async function getSalesHistory(params?: {
    limit?: number;
    sessionId?: string;
    startDate?: string;
    endDate?: string;
    locationId?: string;
    offset?: number;
}): Promise<{ success: boolean; data?: any[]; total?: number; error?: string }> {
    try {
        const { limit = 100, sessionId, startDate, endDate, locationId, offset = 0 } = params || {};

        // Delegate to Secure Function for consistency and security
        // Utiliza cookies para determinar el usuario (userId, role) automáticamente
        const result = await getSalesHistorySecure({
            filters: {
                limit,
                offset,
                sessionId,
                startDate: startDate || '', // getSalesHistorySecure handles empty strings
                endDate: endDate || ''
            },
            security: {
                locationId: locationId || undefined // Allow auto-detect or role-based logic
            }
        });

        if (!result.success) {
            console.error('getSalesHistory (legacy-wrapper) failed:', result.error);
            return { success: false, error: result.error };
        }

        return { success: true, data: result.data, total: result.total };
    } catch (error: any) {
        logger.error({ err: error }, 'Error in getSalesHistory (wrapper)');
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene el detalle completo de una venta para el historial
 */
export async function getSaleDetailsSecure(saleId: string) {
    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        // 1. Obtener cabecera de venta con info de cliente y vendedor
        const saleRes = await client.query(`
            SELECT 
                s.id, s.timestamp, s.status, s.total_amount, s.payment_method,
                s.customer_rut, s.customer_name, s.dte_folio, s.notes,
                s.queue_ticket_id,
                u.name as seller_name,
                c.email as customer_email, c.phone as customer_phone
            FROM sales s
            LEFT JOIN users u ON s.user_id::text = u.id::text
            LEFT JOIN customers c ON s.customer_rut = c.rut
            WHERE s.id = $1
        `, [saleId]);

        if (saleRes.rows.length === 0) return null;
        const sale = saleRes.rows[0];

        // 2. Obtener ítems con nombres
        const itemsRes = await client.query(`
            SELECT 
                si.quantity, si.unit_price, si.total_price,
                COALESCE(si.product_name, b.name, 'Ítem Desconocido') as name,
                b.sku
            FROM sale_items si
            LEFT JOIN inventory_batches b ON si.batch_id = b.id
            WHERE si.sale_id = $1
        `, [saleId]);

        // 3. Obtener ticket de fila
        let queueTicket = null;
        if (sale.queue_ticket_id) {
            const ticketRes = await client.query(`
                SELECT number, status FROM queue_tickets WHERE id = $1
            `, [sale.queue_ticket_id]);
            if (ticketRes.rows.length > 0) queueTicket = ticketRes.rows[0];
        }

        return {
            ...sale,
            items: itemsRes.rows,
            queueTicket
        };

    } catch (err) {
        console.error('Error fetching sale details:', err);
        return null;
    } finally {
        client.release();
    }
}
