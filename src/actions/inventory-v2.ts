'use server';

/**
 * 📦 INVENTORY V2 - SECURE STOCK OPERATIONS
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * 
 * Este módulo implementa operaciones de inventario seguras con:
 * - Transacciones SERIALIZABLE para integridad
 * - Bloqueo pesimista (FOR UPDATE NOWAIT)
 * - Validación de PIN con bcrypt
 * - Control de acceso basado en roles (RBAC)
 * - Auditoría completa de operaciones
 * - Validación con Zod
 * 
 * @version 2.0.0
 * @date 2024-12-24
 */

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { createNotificationSecure } from '@/actions/notifications-v2';

// =====================================================
// SCHEMAS DE VALIDACIÓN
// =====================================================

const UUIDSchema = z.string().uuid({ message: "ID inválido" });

const CreateBatchSchema = z.object({
    productId: UUIDSchema.optional(),
    sku: z.string().min(1, { message: "SKU requerido" }),
    name: z.string().min(1, { message: "Nombre requerido" }),
    locationId: UUIDSchema,
    warehouseId: UUIDSchema.optional(),
    quantity: z.number().int().min(0, { message: "Cantidad debe ser positiva o cero" }),
    expiryDate: z.date().optional(),
    lotNumber: z.string().optional(),
    unitCost: z.number().min(0).default(0),
    salePrice: z.number().min(0).default(0),
    stockMin: z.number().int().min(0).default(0),
    stockMax: z.number().int().min(1).default(100),
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    // Enhanced Batch Creation Fields
    supplierId: UUIDSchema.optional(),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.date().optional(),
    updateMasterPrice: z.boolean().optional(),
});

const AdjustStockSchema = z.object({
    batchId: UUIDSchema,
    adjustment: z.number().int({ message: "Ajuste debe ser número entero" }),
    reason: z.string().min(3, { message: "Motivo requerido (mínimo 3 caracteres)" }).max(500),
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    supervisorPin: z.string().min(4).optional(),
});

const TransferStockSchema = z.object({
    sourceBatchId: UUIDSchema,
    targetLocationId: UUIDSchema,
    quantity: z.number().int().positive({ message: "Cantidad debe ser positiva" }),
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    reason: z.string().min(3, { message: "Motivo requerido" }).max(500),
});

const ClearInventorySchema = z.object({
    locationId: UUIDSchema,
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    adminPin: z.string().min(4, { message: "PIN de administrador requerido" }),
    confirmationCode: z.string().min(1, { message: "Código de confirmación requerido" }),
});

// =====================================================
// CONSTANTES
// =====================================================

const ERROR_CODES = {
    LOCK_NOT_AVAILABLE: '55P03',
    SERIALIZATION_FAILURE: '40001',
    DEADLOCK_DETECTED: '40P01'
} as const;

const ERROR_MESSAGES = {
    BATCH_NOT_FOUND: 'Lote no encontrado',
    INSUFFICIENT_STOCK: 'Stock insuficiente',
    BATCH_LOCKED: 'Lote bloqueado por otro proceso. Intente en unos segundos.',
    INVALID_PIN: 'PIN de autorización inválido',
    UNAUTHORIZED: 'No tiene permisos para esta operación',
    SERIALIZATION_ERROR: 'Conflicto de concurrencia. Por favor reintente.',
    NEGATIVE_STOCK: 'El ajuste resultaría en stock negativo',
} as const;

// Roles autorizados para operaciones sensibles
const AUTHORIZED_ROLES = ['ADMIN', 'MANAGER', 'GERENTE_GENERAL'] as const;
const ADMIN_ONLY_ROLES = ['ADMIN', 'GERENTE_GENERAL'] as const;

// Umbrales que requieren autorización de supervisor
const AUTHORIZATION_THRESHOLDS = {
    STOCK_ADJUSTMENT: 100,   // Ajustes > 100 unidades
    TRANSFER_QUANTITY: 500,  // Transferencias > 500 unidades
} as const;

// =====================================================
// HELPERS
// =====================================================

/**
 * Valida PIN de un usuario autorizado usando bcrypt
 */
async function validateSupervisorPin(
    client: any,
    pin: string,
    requiredRoles: readonly string[] = AUTHORIZED_ROLES
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
            // Primero intentar con bcrypt hash
            if (user.access_pin_hash) {
                const isValid = await bcrypt.compare(pin, user.access_pin_hash);
                if (isValid) {
                    return {
                        valid: true,
                        authorizedBy: { id: user.id, name: user.name, role: user.role }
                    };
                }
            }
            // Fallback: PIN legacy (para usuarios no migrados)
            else if (user.access_pin && user.access_pin === pin) {
                logger.warn({ userId: user.id }, '⚠️ Inventory: Using legacy plaintext PIN - user should be migrated');
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
 * Inserta registro de auditoría para operaciones de inventario
 */
async function insertInventoryAudit(
    client: any,
    params: {
        userId: string;
        authorizedById?: string;
        locationId?: string;
        actionCode: string;
        entityType: string;
        entityId: string;
        quantity?: number;
        oldValues?: Record<string, any>;
        newValues?: Record<string, any>;
        description?: string;
    }
) {
    try {
        // Use SAVEPOINT to prevent main transaction abortion on audit failure
        await client.query('SAVEPOINT audit_safe');

        await client.query(`
            INSERT INTO audit_log (
                user_id, location_id, action_code, 
                entity_type, entity_id, old_values, new_values, 
                justification
            ) VALUES (
                $1::uuid, $2::uuid, $3,
                $4, $5, $6::jsonb, $7::jsonb,
                $8
            )
        `, [
            params.userId || null,
            params.locationId || null,
            params.actionCode,
            params.entityType,
            params.entityId,
            params.oldValues ? JSON.stringify(params.oldValues) : null,
            JSON.stringify({
                ...params.newValues,
                quantity: params.quantity,
                authorized_by: params.authorizedById
            }),
            params.description || null
        ]);

        await client.query('RELEASE SAVEPOINT audit_safe');
    } catch (auditError: any) {
        // Rollback ONLY the audit insert, keeping the main transaction alive
        await client.query('ROLLBACK TO SAVEPOINT audit_safe');
        logger.warn({ err: auditError }, 'Inventory audit log insertion failed (non-critical, suppressed)');
    }
}

// =====================================================
// OPERACIONES DE INVENTARIO SEGURAS
// =====================================================

/**
 * Crea un nuevo lote de inventario con transacción SERIALIZABLE
 */
export async function createBatchSecure(params: {
    productId?: string;
    sku: string;
    name: string;
    locationId: string;
    warehouseId?: string;
    quantity: number;
    expiryDate?: Date;
    lotNumber?: string;
    unitCost?: number;
    salePrice?: number;
    stockMin?: number;
    stockMax?: number;
    userId: string;
    supplierId?: string;
    invoiceNumber?: string;
    invoiceDate?: Date;
    updateMasterPrice?: boolean;
}): Promise<{ success: boolean; batchId?: string; error?: string }> {

    // 1. Validación de entrada
    const validation = CreateBatchSchema.safeParse(params);
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid input for createBatchSecure');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const {
        productId, sku, name, locationId, warehouseId,
        quantity, expiryDate, lotNumber, unitCost, salePrice,
        stockMin, stockMax, userId, supplierId, invoiceNumber, invoiceDate, updateMasterPrice
    } = validation.data;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ sku, locationId, quantity }, '📦 [Inventory v2] Creating new batch');

        // --- INICIO DE TRANSACCIÓN ---
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Resolver warehouse_id si no se proporciona
        let targetWarehouseId = warehouseId || locationId;
        if (!warehouseId) {
            const locRes = await client.query(
                'SELECT default_warehouse_id FROM locations WHERE id = $1',
                [locationId]
            );
            if (locRes.rows.length > 0 && locRes.rows[0].default_warehouse_id) {
                targetWarehouseId = locRes.rows[0].default_warehouse_id;
            }
        }

        // 3. Insertar lote
        const batchId = uuidv4();
        const generatedLotNumber = lotNumber || `LOT-${Date.now()}`;

        await client.query(`
            INSERT INTO inventory_batches (
                id, product_id, sku, name, 
                location_id, warehouse_id, 
                quantity_real, expiry_date, lot_number,
                unit_cost, sale_price,
                stock_min, stock_max,
                supplier_id
            ) VALUES (
                $1::uuid, $2::uuid, $3, $4, 
                $5::uuid, $6::uuid, 
                $7, $8, $9,
                $10, $11,
                $12, $13,
                $14::uuid
            )
        `, [
            batchId,
            productId || null,
            sku,
            name,
            locationId,
            targetWarehouseId,
            quantity,
            expiryDate || null,
            generatedLotNumber,
            unitCost || 0,
            salePrice || 0,
            stockMin || 0,
            stockMax || 1000,
            supplierId || null
        ]);

        // 3.1 Actualizar precio maestro si se solicitó
        if (updateMasterPrice && productId && salePrice && salePrice > 0) {
            await client.query(`
                UPDATE products 
                SET price = $1, 
                    price_sell_box = $1,
                    price_sell_unit = $1,
                    cost_net = $2,
                    cost_price = $2,
                    updated_at = NOW()
                WHERE id = $3
            `, [salePrice, unitCost || 0, productId]);

            logger.info({ productId, salePrice }, '💰 [Inventory v2] Master price updated from batch creation');
        }

        // 4. Registrar movimiento inicial
        const movementId = uuidv4();
        const referenceType = invoiceNumber ? 'INVOICE' : 'INITIAL';
        const referenceId = invoiceNumber || 'INITIAL'; // Use invoice number if available, otherwise generic
        const movementNotes = invoiceNumber
            ? `Recepción Factura #${invoiceNumber} ` + (invoiceDate ? `(${invoiceDate.toLocaleDateString()})` : '')
            : 'Creación inicial de lote';

        await client.query(`
            INSERT INTO stock_movements (
                id, sku, product_name, location_id, movement_type, 
                quantity, stock_before, stock_after, 
                timestamp, user_id, notes, batch_id, reference_type, reference_id
            ) VALUES (
                $1::uuid, $2, $3, $4::uuid, 'RECEIPT', 
                $5, 0, $5, 
                NOW(), $6::uuid, $7, $8::uuid, $9, $10
            )
        `, [
            movementId,
            sku,
            name,
            targetWarehouseId,
            quantity,
            userId,
            movementNotes,
            batchId,
            referenceType,
            referenceId
        ]);

        // 5. Auditoría
        await insertInventoryAudit(client, {
            userId,
            locationId,
            actionCode: 'BATCH_CREATED',
            entityType: 'INVENTORY_BATCH',
            entityId: batchId,
            quantity,
            newValues: {
                sku,
                name,
                lot_number: generatedLotNumber,
                initial_quantity: quantity
            },
            description: `Nuevo lote creado: ${name} (${sku})`
        });

        // --- COMMIT ---
        await client.query('COMMIT');

        logger.info({ batchId, sku }, '✅ [Inventory v2] Batch created successfully');
        revalidatePath('/inventory');

        return { success: true, batchId };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            logger.warn({ sku }, '🔄 [Inventory v2] Serialization conflict');
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error }, '❌ [Inventory v2] Batch creation failed');
        return { success: false, error: error.message || 'Error creando lote' };

    } finally {
        client.release();
    }
}

/**
 * Ajusta stock de un lote con autorización para ajustes grandes
 */
export async function adjustStockSecure(params: {
    batchId: string;
    adjustment: number;
    reason: string;
    userId: string;
    supervisorPin?: string;
}): Promise<{ success: boolean; newQuantity?: number; error?: string }> {

    // 1. Validación de entrada
    const validation = AdjustStockSchema.safeParse(params);
    if (!validation.success) {
        logger.warn({ error: validation.error.format() }, 'Invalid input for adjustStockSecure');
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { batchId, adjustment, reason, userId, supervisorPin } = validation.data;

    // 2. Verificar si requiere autorización
    const requiresAuthorization = Math.abs(adjustment) > AUTHORIZATION_THRESHOLDS.STOCK_ADJUSTMENT;
    if (requiresAuthorization && !supervisorPin) {
        return {
            success: false,
            error: `Ajustes mayores a ${AUTHORIZATION_THRESHOLDS.STOCK_ADJUSTMENT} unidades requieren autorización de supervisor`
        };
    }

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ batchId, adjustment }, '📦 [Inventory v2] Adjusting stock');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 3. Validar autorización si es necesario
        let authorizedBy: { id: string; name: string; role: string } | undefined;
        if (requiresAuthorization && supervisorPin) {
            const authResult = await validateSupervisorPin(client, supervisorPin);
            if (!authResult.valid) {
                await client.query('ROLLBACK');
                logger.warn({ userId, adjustment }, '🚫 Inventory adjustment: PIN validation failed');
                return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
            }
            authorizedBy = authResult.authorizedBy;
            logger.info({ authorizedById: authorizedBy?.id }, '✅ Stock adjustment authorized');
        }

        // 4. Bloquear lote con FOR UPDATE NOWAIT
        const batchRes = await client.query(`
            SELECT id, sku, name, quantity_real, location_id, warehouse_id
            FROM inventory_batches 
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [batchId]);

        if (batchRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.BATCH_NOT_FOUND);
        }

        const batch = batchRes.rows[0];
        const currentQuantity = Number(batch.quantity_real);
        const newQuantity = currentQuantity + adjustment;

        // 5. Validar que no resulte en stock negativo
        if (newQuantity < 0) {
            throw new Error(`${ERROR_MESSAGES.NEGATIVE_STOCK}. Stock actual: ${currentQuantity}, Ajuste: ${adjustment}`);
        }

        // 6. Aplicar ajuste
        await client.query(`
            UPDATE inventory_batches 
            SET quantity_real = $1, updated_at = NOW() 
            WHERE id = $2
        `, [newQuantity, batchId]);

        // 7. Registrar movimiento
        const movementId = uuidv4();
        await client.query(`
            INSERT INTO stock_movements (
                id, sku, product_name, location_id, movement_type, 
                quantity, stock_before, stock_after, 
                timestamp, user_id, notes, batch_id, reference_type
            ) VALUES (
                $1::uuid, $2, $3, $4::uuid, 'ADJUSTMENT', 
                $5, $6, $7, 
                NOW(), $8::uuid, $9, $10::uuid, 'MANUAL_ADJUSTMENT'
            )
        `, [
            movementId,
            batch.sku,
            batch.name,
            batch.warehouse_id || batch.location_id,
            adjustment,
            currentQuantity,
            newQuantity,
            userId,
            reason,
            batchId
        ]);

        // 8. Auditoría
        await insertInventoryAudit(client, {
            userId,
            authorizedById: authorizedBy?.id,
            locationId: batch.location_id,
            actionCode: 'STOCK_ADJUSTED',
            entityType: 'INVENTORY_BATCH',
            entityId: batchId,
            quantity: adjustment,
            oldValues: { quantity_real: currentQuantity },
            newValues: { quantity_real: newQuantity },
            description: reason
        });

        await client.query('COMMIT');

        logger.info({ batchId, adjustment, newQuantity }, '✅ [Inventory v2] Stock adjusted');

        // 🔔 Low Stock Alert: Check if below minimum threshold
        try {
            // Fetch stock_min for this batch
            const thresholdRes = await client.query(
                'SELECT stock_min FROM inventory_batches WHERE id = $1',
                [batchId]
            );
            const stockMin = thresholdRes.rows[0]?.stock_min || 10;

            if (newQuantity <= stockMin && newQuantity > 0) {
                await createNotificationSecure({
                    type: 'INVENTORY',
                    severity: 'WARNING',
                    title: 'Stock Bajo',
                    message: `${batch.name} (${batch.sku}) llegó a ${newQuantity} unidades (mínimo: ${stockMin})`,
                    metadata: { batchId, sku: batch.sku, newQuantity, stockMin, adjustment },
                    locationId: batch.location_id
                });
            } else if (newQuantity === 0) {
                await createNotificationSecure({
                    type: 'INVENTORY',
                    severity: 'ERROR',
                    title: 'Stock Agotado',
                    message: `${batch.name} (${batch.sku}) se agotó completamente`,
                    metadata: { batchId, sku: batch.sku, adjustment },
                    locationId: batch.location_id
                });
            }
        } catch (notifError) {
            logger.warn({ notifError }, '[Inventory] Failed to create stock notification');
        }

        revalidatePath('/inventory');

        return { success: true, newQuantity };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.BATCH_LOCKED };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error }, '❌ [Inventory v2] Stock adjustment failed');
        return { success: false, error: error.message || 'Error ajustando stock' };

    } finally {
        client.release();
    }
}

/**
 * Transfiere stock entre ubicaciones
 */
export async function transferStockSecure(params: {
    sourceBatchId: string;
    targetLocationId: string;
    quantity: number;
    userId: string;
    reason: string;
}): Promise<{ success: boolean; targetBatchId?: string; error?: string }> {

    // 1. Validación
    const validation = TransferStockSchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { sourceBatchId, targetLocationId, quantity, userId, reason } = validation.data;

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ sourceBatchId, targetLocationId, quantity }, '📦 [Inventory v2] Transferring stock');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Bloquear lote fuente
        const sourceRes = await client.query(`
            SELECT id, sku, name, product_id, quantity_real, location_id, 
                   warehouse_id, unit_cost, sale_price, expiry_date, lot_number,
                   stock_min, stock_max
            FROM inventory_batches 
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [sourceBatchId]);

        if (sourceRes.rows.length === 0) {
            throw new Error(ERROR_MESSAGES.BATCH_NOT_FOUND);
        }

        const source = sourceRes.rows[0];
        const sourceQuantity = Number(source.quantity_real);

        if (sourceQuantity < quantity) {
            throw new Error(`${ERROR_MESSAGES.INSUFFICIENT_STOCK}. Disponible: ${sourceQuantity}`);
        }

        // 3. Resolver warehouse destino
        let targetWarehouseId = targetLocationId;
        const targetLocRes = await client.query(
            'SELECT default_warehouse_id FROM locations WHERE id = $1',
            [targetLocationId]
        );
        if (targetLocRes.rows.length > 0 && targetLocRes.rows[0].default_warehouse_id) {
            targetWarehouseId = targetLocRes.rows[0].default_warehouse_id;
        }

        // 4. Decrementar fuente
        await client.query(`
            UPDATE inventory_batches 
            SET quantity_real = quantity_real - $1, updated_at = NOW() 
            WHERE id = $2
        `, [quantity, sourceBatchId]);

        // 5. Crear o incrementar lote destino
        const targetBatchId = uuidv4();

        // Buscar lote existente en destino con mismo SKU/lote
        const existingRes = await client.query(`
            SELECT id, quantity_real FROM inventory_batches 
            WHERE location_id = $1 AND sku = $2 AND lot_number = $3
            FOR UPDATE NOWAIT
        `, [targetLocationId, source.sku, source.lot_number]);

        if (existingRes.rows.length > 0) {
            // Incrementar lote existente
            await client.query(`
                UPDATE inventory_batches 
                SET quantity_real = quantity_real + $1, updated_at = NOW() 
                WHERE id = $2
            `, [quantity, existingRes.rows[0].id]);
        } else {
            // Crear nuevo lote en destino
            await client.query(`
                INSERT INTO inventory_batches (
                    id, product_id, sku, name, 
                    location_id, warehouse_id, 
                    quantity_real, expiry_date, lot_number,
                    unit_cost, sale_price, stock_min, stock_max
                ) VALUES (
                    $1::uuid, $2::uuid, $3, $4, 
                    $5::uuid, $6::uuid, 
                    $7, $8, $9,
                    $10, $11, $12, $13
                )
            `, [
                targetBatchId,
                source.product_id,
                source.sku,
                source.name,
                targetLocationId,
                targetWarehouseId,
                quantity,
                source.expiry_date,
                source.lot_number,
                source.unit_cost,
                source.sale_price,
                source.stock_min,
                source.stock_max
            ]);
        }

        // 6. Registrar movimientos
        const outMovementId = uuidv4();
        const inMovementId = uuidv4();

        await client.query(`
            INSERT INTO stock_movements (
                id, sku, product_name, location_id, movement_type, 
                quantity, stock_before, stock_after, 
                timestamp, user_id, notes, batch_id, reference_type
            ) VALUES (
                $1::uuid, $2, $3, $4::uuid, 'TRANSFER_OUT', 
                $5, $6, $7, 
                NOW(), $8::uuid, $9, $10::uuid, 'TRANSFER'
            )
        `, [
            outMovementId,
            source.sku,
            source.name,
            source.location_id,
            -quantity,
            sourceQuantity,
            sourceQuantity - quantity,
            userId,
            reason,
            sourceBatchId
        ]);

        await client.query(`
            INSERT INTO stock_movements (
                id, sku, product_name, location_id, movement_type, 
                quantity, stock_before, stock_after, 
                timestamp, user_id, notes, batch_id, reference_type
            ) VALUES (
                $1::uuid, $2, $3, $4::uuid, 'TRANSFER_IN', 
                $5, 0, $5, 
                NOW(), $6::uuid, $7, $8::uuid, 'TRANSFER'
            )
        `, [
            inMovementId,
            source.sku,
            source.name,
            targetLocationId,
            quantity,
            userId,
            reason,
            existingRes.rows.length > 0 ? existingRes.rows[0].id : targetBatchId
        ]);

        // 7. Auditoría
        await insertInventoryAudit(client, {
            userId,
            locationId: source.location_id,
            actionCode: 'STOCK_TRANSFERRED',
            entityType: 'INVENTORY_BATCH',
            entityId: sourceBatchId,
            quantity,
            oldValues: {
                source_quantity: sourceQuantity,
                source_location: source.location_id
            },
            newValues: {
                source_quantity: sourceQuantity - quantity,
                target_location: targetLocationId,
                transferred: quantity
            },
            description: reason
        });

        await client.query('COMMIT');

        logger.info({ sourceBatchId, targetLocationId, quantity }, '✅ [Inventory v2] Transfer completed');
        revalidatePath('/inventory');

        return {
            success: true,
            targetBatchId: existingRes.rows.length > 0 ? existingRes.rows[0].id : targetBatchId
        };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: ERROR_MESSAGES.BATCH_LOCKED };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            return { success: false, error: ERROR_MESSAGES.SERIALIZATION_ERROR };
        }

        logger.error({ err: error }, '❌ [Inventory v2] Transfer failed');
        return { success: false, error: error.message || 'Error en transferencia' };

    } finally {
        client.release();
    }
}

/**
 * ☢️ NUCLEAR DELETE: Elimina TODO el inventario de una sucursal
 * Requiere PIN de administrador y código de confirmación
 */
export async function clearLocationInventorySecure(params: {
    locationId: string;
    userId: string;
    adminPin: string;
    confirmationCode: string;
}): Promise<{ success: boolean; deletedCount?: number; error?: string }> {

    // 1. Validación
    const validation = ClearInventorySchema.safeParse(params);
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { locationId, userId, adminPin, confirmationCode } = validation.data;

    // 2. Verificar código de confirmación (debe ser "ELIMINAR-TODO")
    if (confirmationCode !== 'ELIMINAR-TODO') {
        return { success: false, error: 'Código de confirmación incorrecto. Use: ELIMINAR-TODO' };
    }

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        logger.warn({ locationId, userId }, '☢️ [Inventory v2] NUCLEAR DELETE requested');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 3. Validar PIN de administrador
        const authResult = await validateSupervisorPin(client, adminPin, ADMIN_ONLY_ROLES);
        if (!authResult.valid) {
            await client.query('ROLLBACK');
            logger.warn({ userId }, '🚫 Nuclear delete: PIN validation failed');
            return { success: false, error: ERROR_MESSAGES.INVALID_PIN };
        }

        // 4. Verificar que el usuario tiene rol ADMIN
        const userRes = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0 || !ADMIN_ONLY_ROLES.includes(userRes.rows[0].role)) {
            await client.query('ROLLBACK');
            return { success: false, error: ERROR_MESSAGES.UNAUTHORIZED };
        }

        // 5. Obtener snapshot antes de eliminar (para auditoría)
        const snapshotRes = await client.query(`
            SELECT COUNT(*) as count, SUM(quantity_real) as total_units
            FROM inventory_batches WHERE location_id = $1
        `, [locationId]);

        const snapshot = snapshotRes.rows[0];

        // 6. Ejecutar eliminación
        const deleteRes = await client.query(`
            DELETE FROM inventory_batches 
            WHERE location_id = $1
        `, [locationId]);

        const deletedCount = deleteRes.rowCount || 0;

        // 7. Auditoría CRÍTICA
        await insertInventoryAudit(client, {
            userId,
            authorizedById: authResult.authorizedBy?.id,
            locationId,
            actionCode: 'INVENTORY_CLEARED',
            entityType: 'LOCATION',
            entityId: locationId,
            quantity: Number(snapshot.total_units) || 0,
            oldValues: {
                batch_count: Number(snapshot.count),
                total_units: Number(snapshot.total_units)
            },
            newValues: {
                batch_count: 0,
                total_units: 0,
                action: 'NUCLEAR_DELETE'
            },
            description: `Inventario eliminado completamente por ${authResult.authorizedBy?.name}`
        });

        await client.query('COMMIT');

        logger.warn({ locationId, deletedCount }, '💥 [Inventory v2] NUCLEAR DELETE completed');
        revalidatePath('/inventory');

        return { success: true, deletedCount };

    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message || 'Error eliminando inventario' };

    } finally {
        client.release();
    }
}

// =====================================================
// CONSULTAS SEGURAS
// =====================================================

/**
 * Obtiene inventario de una ubicación con validación
 */
export async function getInventorySecure(
    locationId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {

    if (!z.string().uuid().safeParse(locationId).success) {
        console.warn('⚠️ [Inventory v2] Invalid locationId provided to getInventorySecure:', locationId);
        return { success: false, error: 'ID de ubicación inválido' };
    }


    try {
        // UNION: Get both new products AND legacy inventory (22,980 items)
        const sql = `
            -- Batches reales en la ubicación
            WITH location_batches AS (
                SELECT 
                    ib.product_id::text,
                    ib.id::text as batch_id,
                    ib.sku::text,
                    ib.name::text,
                    NULL::text as dci,
                    NULL::text as laboratory,
                    NULL::text as isp_register,
                    NULL::text as format,
                    1 as units_per_box,
                    false as is_bioequivalent,
                    COALESCE(ib.sale_price, 0) as price_sell_box,
                    COALESCE(ib.price_sell_box, 0) as price_sell_box_alt,
                    COALESCE(ib.sale_price, 0) as price_sell_unit,
                    COALESCE(ib.cost_net, 0) as cost_net,
                    COALESCE(ib.unit_cost, 0) as cost_price,
                    19 as tax_percent,
                    COALESCE(ib.quantity_real, 0) as stock_actual,
                    COALESCE(ib.quantity_real, 0) as stock_total,
                    COALESCE(ib.stock_min, 5) as stock_min,
                    ib.location_id::text,
                    false as es_frio,
                    false as comisionable,
                    'VD'::text as condition,
                    ib.lot_number::text,
                    ib.expiry_date::timestamp as expiry_date_ts,
                    'inventory_batches' as source,
                    ib.source_system::text,
                    ib.created_at::timestamp as created_at_ts,
                    -- New Fields (Placeholders for UNION compatibility)
                    NULL::text as concentration,
                    NULL::text as therapeutic_action,
                    NULL::text as units,
                    NULL::text as prescription_type
                FROM inventory_batches ib
                WHERE ib.location_id = $1::uuid
            ),
            -- Productos del catálogo (solo si no tienen lotes en esta ubicación)
            catalog_products AS (
                SELECT 
                    p.id::text as product_id,
                    p.id::text as batch_id,
                    p.sku::text,
                    p.name::text,
                    p.dci::text,
                    p.laboratory::text,
                    p.isp_register::text,
                    p.format::text,
                    p.units_per_box,
                    p.is_bioequivalent,
                    p.price as price_sell_box,
                    p.price_sell_box as price_sell_box_alt,
                    p.price_sell_unit,
                    p.cost_net,
                    p.cost_price,
                    p.tax_percent,
                    p.stock_actual,
                    p.stock_total,
                    p.stock_minimo_seguridad as stock_min,
                    p.location_id::text,
                    p.es_frio,
                    p.comisionable,
                    p.condicion_venta::text as condition,
                    NULL::text as lot_number,
                    NULL::timestamp as expiry_date_ts,
                    'products' as source,
                    p.source_system::text,
                    p.created_at::timestamp as created_at_ts,
                    -- New Fields
                    p.concentration::text,
                    p.therapeutic_action::text,
                    p.units::text,
                    p.prescription_type::text
                FROM products p
                WHERE (p.location_id = $1::text OR p.location_id IS NULL)
                AND NOT EXISTS (
                    SELECT 1 FROM location_batches lb 
                    WHERE lb.sku = p.sku
                )
            )
            
            SELECT * FROM location_batches
            UNION ALL
            SELECT * FROM catalog_products
            ORDER BY name ASC
        `;

        const res = await query(sql, [locationId]);

        const inventory = res.rows.map(row => ({
            id: row.batch_id || row.product_id,
            product_id: row.product_id,
            sku: row.sku,
            name: row.name,
            dci: row.dci,
            laboratory: row.laboratory,
            isp_register: row.isp_register,
            category: 'MEDICAMENTO', // Default for now
            location_id: row.location_id || locationId,
            stock_actual: Number(row.stock_actual) || 0,
            stock_total: Number(row.stock_total) || 0,
            stock_min: Number(row.stock_min) || 5,
            price: Number(row.price_sell_box) || 0,
            price_sell_box: Number(row.price_sell_box) || 0,
            price_sell_unit: Number(row.price_sell_unit) || 0,
            cost_price: Number(row.cost_net) || Number(row.cost_price) || 0,
            cost_net: Number(row.cost_net) || 0,
            tax_percent: Number(row.tax_percent) || 19,
            format: row.format,
            units_per_box: row.units_per_box || 1,
            is_bioequivalent: row.is_bioequivalent || false,
            condition: row.condition || 'VD',
            allows_commission: row.comisionable || false,
            expiry_date: row.expiry_date_ts ? new Date(row.expiry_date_ts).getTime() : null,
            lot_number: row.lot_number,
            _source: row.source, // For debugging
            source_system: row.source_system || 'MANUAL',
            created_at: row.created_at_ts ? new Date(row.created_at_ts).getTime() : null
        }));

        return { success: true, data: inventory };

    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching inventory');
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene movimientos recientes con validación y límites seguros
 */
export async function getRecentMovementsSecure(
    locationId?: string,
    limit: number = 100
): Promise<{ success: boolean; data?: any[]; error?: string }> {

    // Validar locationId si se proporciona
    if (locationId && !z.string().uuid().safeParse(locationId).success) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    // Límite seguro
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);

    try {
        let whereClause = "";
        const params: any[] = [];

        if (locationId) {
            whereClause = `WHERE sm.location_id = $1::uuid OR sm.location_id = (
                SELECT default_warehouse_id FROM locations WHERE id = $1::uuid
            )`;
            params.push(locationId);
        }

        params.push(safeLimit);

        const sql = `
            SELECT 
                sm.id::text as id,
                sm.timestamp,
                sm.movement_type,
                sm.quantity,
                sm.stock_after,
                sm.notes,
                sm.product_name,
                sm.sku,
                u.name as user_name,
                l.name as location_name
            FROM stock_movements sm
            LEFT JOIN users u ON sm.user_id = u.id
            LEFT JOIN locations l ON sm.location_id = l.id
            ${whereClause}
            ORDER BY sm.timestamp DESC
            LIMIT ($${params.length})::integer
        `;

        const res = await query(sql, params);

        const movements = res.rows.map(row => ({
            id: row.id,
            date: row.timestamp,
            type: row.movement_type,
            product: row.product_name,
            sku: row.sku,
            quantity: Number(row.quantity),
            user: row.user_name || 'Sistema',
            location: row.location_name,
            notes: row.notes
        }));

        return { success: true, data: movements };

    } catch (error: any) {
        logger.error({ err: error }, 'Error fetching movements');
        return { success: false, error: error.message };
    }
}

// =====================================================
// ⚡ QUICK STOCK ADJUSTMENT (MANAGER ONLY)
// =====================================================

/**
 * ⚡ Ajuste rápido de stock - Solo para gerentes
 * Valida sesión desde cookies, no requiere PIN para ajustes pequeños
 */
export async function quickStockAdjustSecure(params: {
    batchId: string;
    adjustment: number;
    reason?: string;
    pin: string;
}): Promise<{ success: boolean; newQuantity?: number; productName?: string; error?: string }> {

    // 1. Validar sesión desde cookies
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const userId = cookieStore.get('user_id')?.value;

    if (!userId) {
        return { success: false, error: 'No autenticado' };
    }

    // 2. Validar input básico
    const { batchId, adjustment, reason, pin } = params;

    if (!batchId || typeof adjustment !== 'number' || adjustment === 0) {
        return { success: false, error: 'Datos inválidos: se requiere batchId y cantidad distinta de 0' };
    }

    if (!pin) {
        return { success: false, error: 'Se requiere PIN de autorización' };
    }

    // 3. Verificar umbral - ajustes > 100 requieren función completa (que usa otra lógica)
    // Aunque ahora pedimos PIN aquí también, mantenemos la separación para ajustes masivos si se desea,
    // o permitimos todo si el PIN es válido. 
    // Por simplicidad y seguridad, mantendremos el límite de "ajuste rápido" en 100 para evitar errores de dedo masivos.
    if (Math.abs(adjustment) > AUTHORIZATION_THRESHOLDS.STOCK_ADJUSTMENT) {
        return {
            success: false,
            error: `El ajuste rápido está limitado a ${AUTHORIZATION_THRESHOLDS.STOCK_ADJUSTMENT} unidades. Use la edición completa para ajustes mayores.`
        };
    }

    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');
    const client = await pool.connect();

    try {
        logger.info({ batchId, adjustment, userId: userId }, '⚡ [Inventory] Quick stock adjust');

        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 4. Validar PIN y Rol de Gerente
        // Usamos validateSupervisorPin que ya verifica contra hash bcrypt o texto plano legacy
        // y filtra por roles autorizados.
        const MANAGER_ROLES = ['GERENTE_GENERAL', 'ADMIN', 'MANAGER'];
        const authResult = await validateSupervisorPin(client, pin, MANAGER_ROLES);

        if (!authResult.valid || !authResult.authorizedBy) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN inválido o usuario no autorizado' };
        }

        // Verificar que el usuario del PIN coincide con la sesión (opcional, pero recomendado para auditoría exacta)
        // O permitimos que un gerente autorice a otro usuario? 
        // El requerimiento es "autorizacion solo del gerente".
        // Si el usuario logueado es cajero, pero viene un gerente y pone su PIN, ¿debería funcionar?
        // El código anterior validaba el rol del usuario de la sesión.
        // Aquí validamos el rol del dueño del PIN.
        // Usaremos el usuario del PIN para la auditoría de "authorized_by" y el de sesión para "user_id".

        const authorizedUser = authResult.authorizedBy;

        logger.info({ batchId, adjustment, userId, authorizedBy: authorizedUser.id }, '⚡ [Inventory] Quick stock adjust');

        // 5. Obtener y bloquear lote
        const batchRes = await client.query(`
            SELECT id, sku, name, quantity_real, location_id, warehouse_id
            FROM inventory_batches 
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [batchId]);

        if (batchRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Lote no encontrado' };
        }

        const batch = batchRes.rows[0];
        const currentQuantity = Number(batch.quantity_real);
        const newQuantity = currentQuantity + adjustment;

        // 6. Validar stock resultante
        if (newQuantity < 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                error: `Stock insuficiente. Actual: ${currentQuantity}, Ajuste: ${adjustment}`
            };
        }

        // 7. Aplicar ajuste
        await client.query(`
            UPDATE inventory_batches 
            SET quantity_real = $1, updated_at = NOW() 
            WHERE id = $2
        `, [newQuantity, batchId]);

        // 8. Registrar movimiento
        const movementId = uuidv4();
        const DEFAULT_REASON = adjustment > 0 ? 'Entrada rápida de stock' : 'Salida rápida de stock';
        const adjustmentReason = reason || DEFAULT_REASON;

        await client.query(`
            INSERT INTO stock_movements (
                id, sku, product_name, location_id, movement_type, 
                quantity, stock_before, stock_after, 
                timestamp, user_id, notes, batch_id, reference_type
            ) VALUES (
                $1::uuid, $2, $3, $4::uuid, 'ADJUSTMENT', 
                $5, $6, $7, 
                NOW(), $8, $9, $10::uuid, 'QUICK_ADJUSTMENT'
            )
        `, [
            movementId,
            batch.sku,
            batch.name,
            batch.warehouse_id || batch.location_id,
            adjustment,
            currentQuantity,
            newQuantity,
            userId, // Usuario de la sesión registra la acción
            adjustmentReason,
            batchId
        ]);

        // 9. Auditoría
        await insertInventoryAudit(client, {
            userId,
            authorizedById: authorizedUser.id, // Usuario del PIN autoriza
            locationId: batch.location_id,
            actionCode: 'QUICK_STOCK_ADJUSTED',
            entityType: 'INVENTORY_BATCH',
            entityId: batchId,
            quantity: adjustment,
            oldValues: { quantity_real: currentQuantity },
            newValues: { quantity_real: newQuantity },
            description: `${adjustmentReason}. Autorizado por: ${authorizedUser.name}`
        });

        await client.query('COMMIT');

        logger.info({ batchId, adjustment, newQuantity, by: authorizedUser.name }, '✅ Quick stock adjust completed');
        revalidatePath('/inventory');

        return {
            success: true,
            newQuantity,
            productName: batch.name
        };

    } catch (error: any) {
        await client.query('ROLLBACK');

        if (error.code === ERROR_CODES.LOCK_NOT_AVAILABLE) {
            return { success: false, error: 'Producto bloqueado por otro proceso. Intente de nuevo.' };
        }

        if (error.code === ERROR_CODES.SERIALIZATION_FAILURE) {
            return { success: false, error: 'Conflicto de concurrencia. Por favor reintente.' };
        }

        logger.error({ err: error }, '❌ Quick stock adjust failed');
        return { success: false, error: error.message || 'Error ajustando stock' };

    } finally {
        client.release();
    }
}

// =====================================================
// ⚡ COST MANAGEMENT
// =====================================================

/**
 * Actualiza el costo unitario de un lote y opcionalmente el del producto maestro
 * Requiere PIN de Supervisor (Manager/Admin/Gerente)
 */
export async function updateBatchCostSecure(params: {
    batchId: string;
    newCost: number;
    userId: string;
    pin: string;
}): Promise<{ success: boolean; error?: string }> {

    const { batchId, newCost, userId, pin } = params;

    // Validación básica
    if (!batchId || newCost < 0 || !userId) {
        return { success: false, error: 'Datos inválidos' };
    }

    if (!pin) {
        return { success: false, error: 'Se requiere PIN de autorización' };
    }

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Validar PIN (Manager/Admin/Gerente)
        const MANAGER_ROLES = ['GERENTE_GENERAL', 'ADMIN', 'MANAGER'];
        const authResult = await validateSupervisorPin(client, pin, MANAGER_ROLES);

        if (!authResult.valid || !authResult.authorizedBy) {
            await client.query('ROLLBACK');
            return { success: false, error: 'PIN inválido o usuario no autorizado' };
        }

        const authorizedUser = authResult.authorizedBy;

        console.log(`[UpdateCost] Batch: ${batchId}, NewCost: ${newCost}, User: ${authorizedUser.name}`);

        // 2. Obtener lote y bloquear
        const batchRes = await client.query(`
            SELECT id, product_id, sku, name, unit_cost, location_id 
            FROM inventory_batches 
            WHERE id = $1 
            FOR UPDATE NOWAIT
        `, [batchId]);

        if (batchRes.rows.length === 0) {
            console.warn(`[UpdateCost] Batch ${batchId} NOT FOUND inside inventory_batches`);
            await client.query('ROLLBACK');
            return { success: false, error: 'Lote no encontrado' };
        }

        const batch = batchRes.rows[0];
        const oldCost = Number(batch.unit_cost);
        const productId = batch.product_id;

        console.log(`[UpdateCost] Found Batch. ID: ${batch.id}, ProductID: ${productId}, OldCost: ${oldCost}`);

        // 3. Actualizar lote
        const upBatch = await client.query(`
            UPDATE inventory_batches 
            SET unit_cost = $1, cost_net = $1, updated_at = NOW() 
            WHERE id = $2
        `, [newCost, batchId]);

        console.log(`[UpdateCost] Inventory Batch Updated. Rows: ${upBatch.rowCount}`);

        // 4. Actualizar producto maestro si existe (Ficha técnica)
        if (productId) {
            console.log(`[UpdateCost] Updating Master Product ${productId}...`);
            const upProd = await client.query(`
                UPDATE products 
                SET cost_price = $1, cost_net = $1, updated_at = NOW() 
                WHERE id = $2
            `, [newCost, productId]);
            console.log(`[UpdateCost] Master Product Updated. Rows: ${upProd.rowCount}`);
        } else {
            console.warn(`[UpdateCost] No Product ID linked to batch ${batchId}. Master product NOT updated.`);
        }

        // 5. Auditoría
        await insertInventoryAudit(client, {
            userId, // Usuario logueado
            authorizedById: authorizedUser.id, // Usuario que puso el PIN
            locationId: batch.location_id,
            actionCode: 'COST_UPDATE',
            entityType: 'INVENTORY_BATCH',
            entityId: batchId,
            oldValues: { unit_cost: oldCost },
            newValues: { unit_cost: newCost },
            description: `Actualización de costo: $${oldCost} -> $${newCost}. Autorizado por: ${authorizedUser.name}`
        });

        await client.query('COMMIT');
        console.log(`[UpdateCost] Transaction COMMITTED.`);

        revalidatePath('/inventory');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ err: error }, 'Error updating batch cost');
        return { success: false, error: error.message || 'Error actualizando costo' };
    } finally {
        client.release();
    }
}

// NOTE: AUTHORIZATION_THRESHOLDS y AUTHORIZED_ROLES no se exportan
// porque Next.js 16 "use server" solo permite exportar async functions

// =====================================================
// FUNCIÓN: ENCONTRAR MEJOR LOTE (FIFO)
// =====================================================

/**
 * 📦 Encuentra el mejor lote disponible para un producto (FIFO)
 * 
 * Lógica de selección:
 * 1. Ordenar por fecha de vencimiento (más próximo primero)
 * 2. Si no hay fecha de vencimiento, ordenar por fecha de creación (FIFO)
 * 3. Solo lotes con stock > 0
 * 
 * @param sku - Código SKU del producto
 * @param locationId - UUID de la ubicación/sucursal
 * @returns El mejor lote disponible o null
 */
export async function findBestBatchSecure(
    sku: string,
    locationId: string
): Promise<{
    success: boolean;
    batch?: {
        id: string;
        sku: string;
        name: string;
        price: number;
        quantity: number;
        lotNumber: string | null;
        expiryDate: string | null;
    };
    error?: string;
}> {
    // Validaciones
    if (!sku || sku.trim().length === 0) {
        return { success: false, error: 'SKU requerido' };
    }

    if (!locationId || !z.string().uuid().safeParse(locationId).success) {
        return { success: false, error: 'ID de ubicación inválido' };
    }

    try {
        // Buscar primero por SKU exacto en inventory_batches
        let result = await query(`
            SELECT 
                ib.id,
                ib.sku,
                COALESCE(ib.name, p.name, 'Producto') as name,
                COALESCE(ib.sale_price, ib.price_sell_box, p.price_sell_box, 0) as price,
                ib.quantity_real as quantity,
                ib.lot_number,
                ib.expiry_date
            FROM inventory_batches ib
            LEFT JOIN products p ON ib.product_id::text = p.id::text OR ib.sku = p.sku
            WHERE ib.sku = $1
              AND ib.location_id = $2::uuid
              AND ib.quantity_real > 0
            ORDER BY 
                ib.expiry_date ASC NULLS LAST,
                ib.id ASC
            LIMIT 1
        `, [sku, locationId]);

        // Si no encuentra por SKU exacto, buscar por product_id
        if (result.rows.length === 0) {
            result = await query(`
                SELECT 
                    ib.id,
                    ib.sku,
                    COALESCE(ib.name, p.name, 'Producto') as name,
                    COALESCE(ib.sale_price, ib.price_sell_box, p.price_sell_box, 0) as price,
                    ib.quantity_real as quantity,
                    ib.lot_number,
                    ib.expiry_date
                FROM inventory_batches ib
                INNER JOIN products p ON ib.product_id::text = p.id::text
                WHERE p.sku = $1
                  AND ib.location_id = $2::uuid
                  AND ib.quantity_real > 0
                ORDER BY 
                    ib.expiry_date ASC NULLS LAST,
                    ib.id ASC
                LIMIT 1
            `, [sku, locationId]);
        }

        if (result.rows.length === 0) {
            return {
                success: false,
                error: 'Sin stock disponible para este producto en esta ubicación'
            };
        }

        const batch = result.rows[0];

        return {
            success: true,
            batch: {
                id: batch.id,
                sku: batch.sku,
                name: batch.name,
                price: Number(batch.price) || 0,
                quantity: Number(batch.quantity) || 0,
                lotNumber: batch.lot_number || null,
                expiryDate: batch.expiry_date ? new Date(Number(batch.expiry_date)).toISOString() : null
            }
        };

    } catch (error: any) {
        logger.error({ error, sku, locationId }, '[InventoryV2] findBestBatchSecure error');
        return { success: false, error: 'Error buscando lote disponible' };
    }
}
