'use server';

/**
 * ============================================================================
 * SUPPLY-V2: Órdenes de Compra y Recepción Seguras
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES:
 * - SERIALIZABLE para recepciones
 * - FOR UPDATE NOWAIT en inventory_batches
 * - PIN MANAGER para recepciones > $500,000 CLP
 * - Auditoría de cada movimiento de stock
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const CreatePOSchema = z.object({
    supplierId: UUIDSchema,
    targetWarehouseId: UUIDSchema,
    items: z.array(z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        cost: z.number().nonnegative(),
    })).min(1, 'Debe incluir al menos un item'),
    notes: z.string().max(500).optional(),
    isAuto: z.boolean().optional(),
    reason: z.string().max(200).optional(),
});

const ReceivePOSchema = z.object({
    purchaseOrderId: UUIDSchema,
    receivedItems: z.array(z.object({
        sku: z.string().min(1),
        quantity: z.number().int().positive(),
        lotNumber: z.string().optional(),
        expiryDate: z.number().optional(),
    })).optional(),
    managerPin: z.string().min(4).optional(),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const PIN_THRESHOLD_CLP = 500000; // Requiere PIN para > $500,000

// ============================================================================
// HELPERS
// ============================================================================

async function validateManagerPin(
    client: any,
    pin: string
): Promise<{ valid: boolean; manager?: { id: string; name: string } }> {
    try {
        const { checkRateLimit, recordFailedAttempt, resetAttempts } = await import('@/lib/rate-limiter');

        const usersRes = await client.query(`
            SELECT id, name, access_pin_hash, access_pin
            FROM users WHERE role = ANY($1::text[]) AND is_active = true
        `, [MANAGER_ROLES]);

        for (const user of usersRes.rows) {
            const rateCheck = checkRateLimit(user.id);
            if (!rateCheck.allowed) continue;

            if (user.access_pin_hash) {
                const valid = await bcrypt.compare(pin, user.access_pin_hash);
                if (valid) {
                    resetAttempts(user.id);
                    return { valid: true, manager: { id: user.id, name: user.name } };
                }
                recordFailedAttempt(user.id);
            } else if (user.access_pin === pin) {
                resetAttempts(user.id);
                return { valid: true, manager: { id: user.id, name: user.name } };
            }
        }
        return { valid: false };
    } catch {
        return { valid: false };
    }
}

// ============================================================================
// CREATE PURCHASE ORDER
// ============================================================================

/**
 * 📦 Crear Orden de Compra Segura
 */
export async function createPurchaseOrderSecure(
    data: z.infer<typeof CreatePOSchema>,
    userId: string
): Promise<{ success: boolean; orderId?: string; error?: string }> {
    if (!UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'ID de usuario inválido' };
    }

    const validated = CreatePOSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { supplierId, targetWarehouseId, items, notes, isAuto, reason } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Verificar warehouse
        const whRes = await client.query('SELECT location_id FROM warehouses WHERE id = $1', [targetWarehouseId]);
        if (whRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Bodega no encontrada' };
        }
        const locationId = whRes.rows[0].location_id;

        // Calcular total
        const totalEstimated = items.reduce((sum, item) => sum + item.quantity * item.cost, 0);

        // Crear PO
        const poId = randomUUID();
        await client.query(`
            INSERT INTO purchase_orders (
                id, supplier_id, target_warehouse_id, destination_location_id,
                created_at, status, is_auto_generated, generation_reason, notes, total_estimated
            ) VALUES ($1, $2, $3, $4, NOW(), 'DRAFT', $5, $6, $7, $8)
        `, [poId, supplierId, targetWarehouseId, locationId, !!isAuto, reason, notes, totalEstimated]);

        // Insertar items
        for (const item of items) {
            await client.query(`
                INSERT INTO purchase_order_items (
                    id, purchase_order_id, sku, name, quantity_ordered, cost_price
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [randomUUID(), poId, item.sku, item.name, item.quantity, item.cost]);
        }

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'PO_CREATED', 'PURCHASE_ORDER', $2, $3::jsonb, NOW())
        `, [userId, poId, JSON.stringify({
            supplier_id: supplierId,
            warehouse_id: targetWarehouseId,
            items_count: items.length,
            total_estimated: totalEstimated,
        })]);

        await client.query('COMMIT');

        logger.info({ poId, userId, total: totalEstimated }, '📦 [Supply] PO created');
        revalidatePath('/logistica');
        return { success: true, orderId: poId };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Supply] Create PO error');
        return { success: false, error: 'Error creando orden de compra' };
    } finally {
        client.release();
    }
}

// ============================================================================
// RECEIVE PURCHASE ORDER
// ============================================================================

/**
 * 📥 Recibir Orden de Compra (SERIALIZABLE)
 * - PIN requerido para recepciones > $500,000
 */
export async function receivePurchaseOrderSecure(
    data: z.infer<typeof ReceivePOSchema>,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'ID de usuario inválido' };
    }

    const validated = ReceivePOSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { purchaseOrderId, receivedItems, managerPin } = validated.data;
    const client = await pool.connect();

    try {
        // SERIALIZABLE para evitar race conditions
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Obtener PO con bloqueo
        const poRes = await client.query(`
            SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE NOWAIT
        `, [purchaseOrderId]);

        if (poRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Orden no encontrada' };
        }

        const po = poRes.rows[0];

        if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return { success: false, error: `La orden ya está ${po.status}` };
        }

        // Verificar si requiere PIN
        const totalEstimated = Number(po.total_estimated) || 0;
        if (totalEstimated > PIN_THRESHOLD_CLP) {
            if (!managerPin) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    error: `Recepciones > $${PIN_THRESHOLD_CLP.toLocaleString()} requieren PIN de manager`,
                };
            }

            const authResult = await validateManagerPin(client, managerPin);
            if (!authResult.valid) {
                await client.query('ROLLBACK');
                return { success: false, error: 'PIN de manager inválido' };
            }
        }

        // Obtener items de la orden
        const itemsRes = await client.query(`
            SELECT * FROM purchase_order_items WHERE purchase_order_id = $1
        `, [purchaseOrderId]);

        const warehouseId = po.target_warehouse_id;
        const locationId = po.destination_location_id;

        // Items a recibir
        const itemsToReceive = receivedItems && receivedItems.length > 0
            ? receivedItems
            : itemsRes.rows.map((i: any) => ({
                sku: i.sku,
                quantity: i.quantity_ordered,
                lotNumber: `PO-${po.id.slice(0, 8)}`,
                expiryDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
            }));

        for (const item of itemsToReceive) {
            // Buscar producto
            const prodRes = await client.query(`
                SELECT id, name, sale_price, cost_price FROM products WHERE sku = $1
            `, [item.sku]);

            if (prodRes.rowCount === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: `SKU ${item.sku} no encontrado` };
            }

            const product = prodRes.rows[0];
            const lot = item.lotNumber || `PO-${po.id.slice(0, 8)}`;
            const expiry = item.expiryDate || Date.now() + 31536000000;

            // Buscar batch existente con NOWAIT
            const batchRes = await client.query(`
                SELECT id, quantity_real FROM inventory_batches
                WHERE warehouse_id = $1 AND product_id = $2 AND lot_number = $3
                FOR UPDATE NOWAIT
            `, [warehouseId, product.id, lot]);

            let batchId: string;
            let stockBefore = 0;
            const stockAfter = item.quantity;

            if ((batchRes.rowCount || 0) > 0) {
                batchId = batchRes.rows[0].id;
                stockBefore = Number(batchRes.rows[0].quantity_real);
                await client.query(`
                    UPDATE inventory_batches SET quantity_real = quantity_real + $1
                    WHERE id = $2
                `, [item.quantity, batchId]);
            } else {
                batchId = randomUUID();
                await client.query(`
                    INSERT INTO inventory_batches (
                        id, product_id, warehouse_id, lot_number, expiry_date, quantity_real,
                        sku, name, unit_cost, sale_price, location_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `, [
                    batchId, product.id, warehouseId, lot, new Date(expiry), item.quantity,
                    item.sku, product.name, product.cost_price || 0, product.sale_price || 0, locationId
                ]);
            }

            // Registrar movimiento de stock
            await client.query(`
                INSERT INTO stock_movements (
                    id, sku, product_name, location_id, movement_type, quantity,
                    stock_before, stock_after, timestamp, user_id, notes, batch_id,
                    reference_type, reference_id
                ) VALUES ($1, $2, $3, $4, 'RECEIPT', $5, $6, $7, NOW(), $8, $9, $10, 'PURCHASE_ORDER', $11)
            `, [
                randomUUID(), item.sku, product.name, locationId, item.quantity,
                stockBefore, stockBefore + item.quantity, userId,
                `Recepción PO #${po.id.slice(0, 8)}`, batchId, purchaseOrderId
            ]);

            // Actualizar cantidad recibida
            await client.query(`
                UPDATE purchase_order_items SET quantity_received = COALESCE(quantity_received, 0) + $1
                WHERE purchase_order_id = $2 AND sku = $3
            `, [item.quantity, purchaseOrderId, item.sku]);
        }

        // Actualizar estado de la PO
        await client.query(`
            UPDATE purchase_orders SET status = 'RECEIVED', received_at = NOW(), received_by = $2
            WHERE id = $1
        `, [purchaseOrderId, userId]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'PO_RECEIVED', 'PURCHASE_ORDER', $2, $3::jsonb, NOW())
        `, [userId, purchaseOrderId, JSON.stringify({
            items_received: itemsToReceive.length,
            total_value: totalEstimated,
            required_pin: totalEstimated > PIN_THRESHOLD_CLP,
        })]);

        await client.query('COMMIT');

        logger.info({ purchaseOrderId, userId }, '📥 [Supply] PO received');
        revalidatePath('/logistica');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Supply] Receive PO error');
        return { success: false, error: 'Error recibiendo orden' };
    } finally {
        client.release();
    }
}

// ============================================================================
// CANCEL PURCHASE ORDER
// ============================================================================

/**
 * ❌ Cancelar Orden de Compra
 */
export async function cancelPurchaseOrderSecure(
    orderId: string,
    userId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    if (!UUIDSchema.safeParse(orderId).success || !UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    if (!reason || reason.length < 10) {
        return { success: false, error: 'La razón debe tener al menos 10 caracteres' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const poRes = await client.query(`
            UPDATE purchase_orders SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = $2
            WHERE id = $1 AND status NOT IN ('RECEIVED', 'CANCELLED')
            RETURNING id
        `, [orderId, reason]);

        if (poRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Orden no encontrada o no puede ser cancelada' };
        }

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'PO_CANCELLED', 'PURCHASE_ORDER', $2, $3::jsonb, NOW())
        `, [userId, orderId, JSON.stringify({ reason })]);

        await client.query('COMMIT');

        logger.info({ orderId, userId, reason }, '❌ [Supply] PO cancelled');
        revalidatePath('/logistica');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Supply] Cancel PO error');
        return { success: false, error: 'Error cancelando orden' };
    } finally {
        client.release();
    }
}

// ============================================================================
// DELETE PURCHASE ORDER
// ============================================================================

/**
 * 🗑️ Eliminar Orden de Compra (Solo Borradores)
 */
export async function deletePurchaseOrderSecure(
    data: { orderId: string; userId: string }
): Promise<{ success: boolean; error?: string }> {
    const { orderId, userId } = data;

    if (!UUIDSchema.safeParse(orderId).success || !UUIDSchema.safeParse(userId).success) {
        return { success: false, error: 'IDs inválidos' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Verificar estado
        const poRes = await client.query('SELECT status FROM purchase_orders WHERE id = $1', [orderId]);
        if (poRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Orden no encontrada' };
        }

        const status = poRes.rows[0].status;
        if (status !== 'DRAFT') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Solo se pueden eliminar borradores. Use "Cancelar" para órdenes enviadas.' };
        }

        // Eliminar items primero
        await client.query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [orderId]);

        // Eliminar orden
        await client.query('DELETE FROM purchase_orders WHERE id = $1', [orderId]);

        // Auditar
        await client.query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, 'PO_DELETED', 'PURCHASE_ORDER', $2, $3::jsonb, NOW())
        `, [userId, orderId, JSON.stringify({ status })]);

        await client.query('COMMIT');

        logger.info({ orderId, userId }, '🗑️ [Supply] PO deleted');
        revalidatePath('/logistica');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error({ error }, '[Supply] Delete PO error');
        return { success: false, error: 'Error eliminando orden' };
    } finally {
        client.release();
    }
}

// ============================================================================
// HISTORY
// ============================================================================

/**
 * 📋 Historial de Órdenes con Paginación
 */
export async function getSupplyOrdersHistory(
    filters?: {
        status?: string;
        supplierId?: string;
        page?: number;
        pageSize?: number;
    }
): Promise<{ success: boolean; data?: any[]; total?: number; error?: string }> {
    const page = filters?.page || 1;
    const pageSize = Math.min(filters?.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    try {
        let sql = `
            SELECT po.*, s.business_name as supplier_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (filters?.status) {
            sql += ` AND po.status = $${paramIndex++}`;
            params.push(filters.status);
        }

        if (filters?.supplierId) {
            sql += ` AND po.supplier_id = $${paramIndex++}`;
            params.push(filters.supplierId);
        }

        // Count
        const countSql = sql.replace('SELECT po.*, s.business_name as supplier_name', 'SELECT COUNT(*) as total');
        const countRes = await query(countSql, params);
        const total = parseInt(countRes.rows[0]?.total || '0');

        // Data
        sql += ` ORDER BY po.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(pageSize, offset);

        const res = await query(sql, params);

        return { success: true, data: res.rows, total };

    } catch (error: any) {
        logger.error({ error }, '[Supply] Get history error');
        return { success: false, error: 'Error obteniendo historial' };
    }
}
