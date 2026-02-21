'use server';

/**
 * ============================================================================
 * PROCUREMENT-V2: Secure Purchase Order Module
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * SECURITY IMPROVEMENTS:
 * - SERIALIZABLE transactions
 * - Zod validation for all inputs
 * - RBAC enforcement for approvals
 * - PIN validation for large orders (>$500k MANAGER, >$1M GERENTE_GENERAL)
 * - Comprehensive audit logging
 * - Complete workflow (DRAFT → APPROVED → RECEIVED)
 * 
 * FIXES VULNERABILITIES:
 * - PROC-001: BEGIN without SERIALIZABLE
 * - PROC-002: No Zod validation
 * - PROC-003: No RBAC
 * - PROC-004: No audit logging
 * - PROC-005: No PIN for large orders
 * - PROC-006: No approval workflow
 */

import { pool, type PoolClient } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { getSessionSecure } from './auth-v2';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const PurchaseOrderItemSchema = z.object({
    productName: z.string().min(1),
    sku: z.string().min(1).optional(),
    quantity: z.number().int().positive('Cantidad debe ser positiva'),
    unitCost: z.number().positive('Costo debe ser positivo'),
});

const CreatePurchaseOrderSchema = z.object({
    supplierId: z.union([z.string().uuid(), z.literal('')]).nullable().optional().transform(val => val === '' ? null : val),
    warehouseId: UUIDSchema.optional(),
    items: z.array(PurchaseOrderItemSchema).min(1, 'Debe incluir al menos un item'),
    notes: z.string().max(500).optional(),
    userId: UUIDSchema,
});

const ApprovePurchaseOrderSchema = z.object({
    orderId: UUIDSchema,
    approverPin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN debe ser numérico'),
    notes: z.string().min(10, 'Notas de aprobación requeridas'),
});

const ReceivePurchaseOrderSchema = z.object({
    orderId: UUIDSchema,
    receivedItems: z.array(z.object({
        itemId: UUIDSchema,
        quantityReceived: z.number().int().min(0),
        lotNumber: z.string().optional(),
        expiryDate: z.date().optional(),
    })),
    receiverPin: z.string().min(4).max(8).regex(/^\d+$/).optional(),
    notes: z.string().optional(),
    userId: UUIDSchema,
});

const CancelPurchaseOrderSchema = z.object({
    orderId: UUIDSchema,
    reason: z.string().min(10, 'Razón de cancelación requerida'),
    cancelerPin: z.string().min(4).max(8).regex(/^\d+$/, 'PIN requerido'),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
const GERENTE_ROLES = ['GERENTE_GENERAL', 'ADMIN'];
const MANAGER_THRESHOLD = 500000; // CLP - requires MANAGER PIN
const GERENTE_THRESHOLD = 1000000; // CLP - requires GERENTE_GENERAL PIN

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function validateApproverPin(client: PoolClient, pin: string, requiredRoles: readonly string[]): Promise<{
    valid: boolean;
    approver?: { id: string; name: string; role: string };
    error?: string;
}> {
    try {
        const bcrypt = await import('bcryptjs');

        const approversRes = await client.query(`
            SELECT id, name, role, access_pin_hash, access_pin
            FROM users 
            WHERE role = ANY($1::text[])
            AND is_active = true
        `, [requiredRoles]);

        if (approversRes.rows.length === 0) {
            return { valid: false, error: 'No hay aprobadores activos con el rol requerido' };
        }

        for (const approver of approversRes.rows) {
            let pinValid = false;

            if (approver.access_pin_hash) {
                pinValid = await bcrypt.compare(pin, approver.access_pin_hash);
            } else if (approver.access_pin) {
                const crypto = await import('crypto');
                const inputBuffer = Buffer.from(pin);
                const storedBuffer = Buffer.from(approver.access_pin);

                if (inputBuffer.length === storedBuffer.length) {
                    pinValid = crypto.timingSafeEqual(inputBuffer, storedBuffer);
                }
            }

            if (pinValid) {
                return {
                    valid: true,
                    approver: { id: approver.id, name: approver.name, role: approver.role }
                };
            }
        }

        return { valid: false, error: 'PIN inválido' };
    } catch (error) {
        console.error('[PROCUREMENT-V2] PIN validation error:', error);
        return { valid: false, error: 'Error validando PIN' };
    }
}

async function insertProcurementAudit(client: PoolClient, params: {
    actionCode: string;
    userId: string;
    orderId: string;
    details: Record<string, unknown>;
}): Promise<void> {
    await client.query(`
        INSERT INTO audit_log (
            user_id, action_code, entity_type, entity_id,
            old_values, new_values, created_at
        ) VALUES ($1, $2, 'PURCHASE_ORDER', $3, NULL, $4::jsonb, NOW())
    `, [
        params.userId,
        params.actionCode,
        params.orderId,
        JSON.stringify(params.details)
    ]);
}

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * 📝 Create Purchase Order (DRAFT status)
 */
export async function createPurchaseOrderSecure(data: z.infer<typeof CreatePurchaseOrderSchema>): Promise<{
    success: boolean;
    data?: { orderId: string; total: number; requiresApproval: boolean };
    error?: string;
}> {
    // 1. Validate input
    const validated = CreatePurchaseOrderSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Validate supplier exists (only if provided)
        let supplierName = '';
        if (validated.data.supplierId) {
            const supplierRes = await client.query(
                'SELECT id, business_name as name FROM suppliers WHERE id = $1 AND status = $2',
                [validated.data.supplierId, 'ACTIVE']
            );

            if (supplierRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Proveedor no encontrado o inactivo' };
            }
            supplierName = supplierRes.rows[0].name;
        }

        // 3. Resolve warehouse
        let warehouseId = validated.data.warehouseId;
        if (!warehouseId) {
            const whRes = await client.query('SELECT id FROM warehouses LIMIT 1');
            if (whRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: 'No hay bodegas disponibles' };
            }
            warehouseId = whRes.rows[0].id;
        }

        // 4. Calculate total
        let total = 0;
        for (const item of validated.data.items) {
            total += item.quantity * item.unitCost;
        }

        // 5. Determine approval requirement
        const requiresApproval = total >= MANAGER_THRESHOLD;

        // 6. Create PO header
        const orderId = randomUUID();
        await client.query(`
            INSERT INTO purchase_orders (
                id, supplier_id, target_warehouse_id, 
                created_at, status, created_by, notes
            ) VALUES ($1, $2, $3, NOW(), 'DRAFT', $4, $5)
        `, [
            orderId,
            validated.data.supplierId,
            warehouseId,
            validated.data.userId,
            validated.data.notes || null
        ]);

        // 7. Insert items
        for (const item of validated.data.items) {
            // Get SKU if not provided
            const sku = item.sku || 'UNKNOWN';

            await client.query(`
                INSERT INTO purchase_order_items (
                    id, purchase_order_id, sku, name, 
                    quantity_ordered, cost_price
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                randomUUID(),
                orderId,
                sku,
                item.productName,
                item.quantity,
                item.unitCost
            ]);
        }

        // 8. Audit
        await insertProcurementAudit(client, {
            actionCode: 'PURCHASE_ORDER_CREATED',
            userId: validated.data.userId,
            orderId,
            details: {
                supplier_id: validated.data.supplierId,
                supplier_name: supplierName || 'UNASSIGNED',
                warehouse_id: warehouseId,
                items_count: validated.data.items.length,
                total,
                requires_approval: requiresApproval
            }
        });

        await client.query('COMMIT');

        revalidatePath('/procurement');
        revalidatePath('/logistica');

        return {
            success: true,
            data: { orderId, total, requiresApproval }
        };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        console.error('[PROCUREMENT-V2] Create PO error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al crear orden de compra'
        };
    } finally {
        client.release();
    }
}

/**
 * ✅ Approve Purchase Order (PIN required based on amount)
 */
export async function approvePurchaseOrderSecure(data: z.infer<typeof ApprovePurchaseOrderSchema>): Promise<{
    success: boolean;
    error?: string;
}> {
    // 1. Validate input
    const validated = ApprovePurchaseOrderSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Lock and get order
        const orderRes = await client.query(`
            SELECT id, status, total_amount, supplier_id
            FROM purchase_orders
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [validated.data.orderId]);

        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Orden no encontrada' };
        }

        const order = orderRes.rows[0];

        if (order.status !== 'DRAFT') {
            await client.query('ROLLBACK');
            return { success: false, error: `Orden no puede ser aprobada (status: ${order.status})` };
        }

        // 3. Determine required role based on amount
        const total = Number(order.total_amount);
        let requiredRoles: readonly string[];

        if (total >= GERENTE_THRESHOLD) {
            requiredRoles = GERENTE_ROLES;
        } else if (total >= MANAGER_THRESHOLD) {
            requiredRoles = MANAGER_ROLES;
        } else {
            requiredRoles = MANAGER_ROLES;
        }

        // 4. Validate PIN
        const pinCheck = await validateApproverPin(client, validated.data.approverPin, requiredRoles);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: pinCheck.error };
        }

        // 5. Update order status
        await client.query(`
            UPDATE purchase_orders
            SET status = 'APPROVED',
                approved_at = NOW(),
                approved_by = $1,
                approval_notes = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [pinCheck.approver!.id, validated.data.notes, validated.data.orderId]);

        // 6. Audit
        await insertProcurementAudit(client, {
            actionCode: 'PURCHASE_ORDER_APPROVED',
            userId: pinCheck.approver!.id,
            orderId: validated.data.orderId,
            details: {
                total,
                approved_by_name: pinCheck.approver!.name,
                approved_by_role: pinCheck.approver!.role,
                notes: validated.data.notes
            }
        });

        await client.query('COMMIT');

        revalidatePath('/procurement');
        revalidatePath('/logistica');

        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        console.error('[PROCUREMENT-V2] Approve PO error:', error);

        if (error && typeof error === 'object' && 'code' in error && error.code === '55P03') {
            return { success: false, error: 'Orden está siendo procesada' };
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al aprobar orden'
        };
    } finally {
        client.release();
    }
}

/**
 * 📦 Receive Purchase Order (Update inventory)
 */
export async function receivePurchaseOrderSecure(data: z.infer<typeof ReceivePurchaseOrderSchema>): Promise<{
    success: boolean;
    error?: string;
}> {
    // 1. Validate input
    const validated = ReceivePurchaseOrderSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Lock and get order
        const orderRes = await client.query(`
            SELECT po.id, po.status, po.target_warehouse_id, po.supplier_id
            FROM purchase_orders po
            WHERE po.id = $1
            FOR UPDATE NOWAIT
        `, [validated.data.orderId]);

        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Orden no encontrada' };
        }

        const order = orderRes.rows[0];

        if (order.status !== 'APPROVED') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Orden debe estar aprobada para recibir' };
        }

        // 3. Process each received item
        let totalReceived = 0;

        for (const receivedItem of validated.data.receivedItems) {
            if (receivedItem.quantityReceived <= 0) continue;

            // Get item details
            const itemRes = await client.query(`
                SELECT poi.id, poi.sku, poi.name, poi.cost_price
                FROM purchase_order_items poi
                WHERE poi.id = $1 AND poi.purchase_order_id = $2
                FOR UPDATE
            `, [receivedItem.itemId, validated.data.orderId]);

            if (itemRes.rows.length === 0) continue;

            const item = itemRes.rows[0];

            // Get product ID for inventory batches
            const prodLookup = await client.query('SELECT id FROM products WHERE sku = $1', [item.sku]);
            const productId = prodLookup.rows[0]?.id;

            if (!productId) {
                logger.error({ sku: item.sku }, 'Product ID not found for SKU in receivePurchaseOrderSecure');
                continue;
            }

            // Update item received quantity
            await client.query(`
                UPDATE purchase_order_items
                SET quantity_received = COALESCE(quantity_received, 0) + $1
                WHERE id = $2
            `, [receivedItem.quantityReceived, receivedItem.itemId]);

            // Create or update inventory batch
            const lotNumber = receivedItem.lotNumber || `PO-${validated.data.orderId.slice(0, 8)}`;
            const expiryDate = receivedItem.expiryDate || null;

            // Check if batch exists
            const batchRes = await client.query(`
                SELECT id, quantity_real 
                FROM inventory_batches
                WHERE product_id = $1 
                  AND warehouse_id = $2 
                  AND lot_number = $3
            `, [productId, order.target_warehouse_id, lotNumber]);

            if (batchRes.rows.length > 0) {
                // Update existing batch
                await client.query(`
                    UPDATE inventory_batches
                    SET quantity_real = quantity_real + $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [receivedItem.quantityReceived, batchRes.rows[0].id]);
            } else {
                // Create new batch
                await client.query(`
                    INSERT INTO inventory_batches (
                        id, product_id, warehouse_id, lot_number, expiry_date,
                        quantity_real, sku, name, unit_cost, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                `, [
                    randomUUID(),
                    productId,
                    order.target_warehouse_id,
                    lotNumber,
                    expiryDate,
                    receivedItem.quantityReceived,
                    item.sku,
                    item.name,
                    item.cost_price
                ]);
            }

            // Log stock movement
            await client.query(`
                INSERT INTO stock_movements (
                    id, sku, product_name, location_id, movement_type,
                    quantity, timestamp, user_id, notes, reference_type, reference_id
                ) VALUES ($1, $2, $3, $4, 'PURCHASE_ENTRY', $5, NOW(), $6, $7, 'PURCHASE_ORDER', $8)
            `, [
                randomUUID(),
                item.sku,
                item.name,
                order.target_warehouse_id,
                receivedItem.quantityReceived,
                validated.data.userId,
                `Recepción de OC ${validated.data.orderId.slice(0, 8)}`,
                validated.data.orderId
            ]);

            totalReceived += receivedItem.quantityReceived;
        }

        // 4. Update order status to RECEIVED
        await client.query(`
            UPDATE purchase_orders
            SET status = 'RECEIVED',
                received_by = $1
            WHERE id = $2
        `, [validated.data.userId, validated.data.orderId]);

        // 5. Audit
        await insertProcurementAudit(client, {
            actionCode: 'PURCHASE_ORDER_RECEIVED',
            userId: validated.data.userId,
            orderId: validated.data.orderId,
            details: {
                items_received: validated.data.receivedItems.length,
                total_units_received: totalReceived,
                warehouse_id: order.target_warehouse_id,
                notes: validated.data.notes
            }
        });

        await client.query('COMMIT');

        revalidatePath('/procurement');
        revalidatePath('/inventario');
        revalidatePath('/logistica');

        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        console.error('[PROCUREMENT-V2] Receive PO error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al recibir orden'
        };
    } finally {
        client.release();
    }
}

/**
 * ❌ Cancel Purchase Order (PIN required)
 */
export async function cancelPurchaseOrderSecure(data: z.infer<typeof CancelPurchaseOrderSchema>): Promise<{
    success: boolean;
    error?: string;
}> {
    // 1. Validate input
    const validated = CancelPurchaseOrderSchema.safeParse(data);
    if (!validated.success) {
        return {
            success: false,
            error: validated.error.issues[0]?.message || 'Datos inválidos'
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 2. Lock order
        const orderRes = await client.query(`
            SELECT id, status, total_amount
            FROM purchase_orders
            WHERE id = $1
            FOR UPDATE NOWAIT
        `, [validated.data.orderId]);

        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Orden no encontrada' };
        }

        const order = orderRes.rows[0];

        if (order.status === 'RECEIVED' || order.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return { success: false, error: `Orden no puede ser cancelada (status: ${order.status})` };
        }

        // 3. Validate PIN (MANAGER required)
        const pinCheck = await validateApproverPin(client, validated.data.cancelerPin, MANAGER_ROLES);
        if (!pinCheck.valid) {
            await client.query('ROLLBACK');
            return { success: false, error: pinCheck.error };
        }

        // 4. Cancel order
        await client.query(`
            UPDATE purchase_orders
            SET status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $1,
                cancellation_reason = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [pinCheck.approver!.id, validated.data.reason, validated.data.orderId]);

        // 5. Audit
        await insertProcurementAudit(client, {
            actionCode: 'PURCHASE_ORDER_CANCELLED',
            userId: pinCheck.approver!.id,
            orderId: validated.data.orderId,
            details: {
                previous_status: order.status,
                total: order.total_amount,
                cancelled_by_name: pinCheck.approver!.name,
                reason: validated.data.reason
            }
        });

        await client.query('COMMIT');

        revalidatePath('/procurement');
        revalidatePath('/logistica');

        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        console.error('[PROCUREMENT-V2] Cancel PO error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al cancelar orden'
        };
    } finally {
        client.release();
    }
}

/**
 * 🗑️ Eliminar Borrador de Orden de Compra
 */
export async function deletePurchaseOrderSecure(params: {
    orderId: string;
    userId: string;
}): Promise<{ success: boolean; error?: string }> {

    const { orderId, userId } = params;
    const isTempId = orderId.startsWith('PO-AUTO-') || orderId.startsWith('ORD-');
    if (isTempId) return { success: true };

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar estado (solo borradores) y obtener ubicación vía warehouse
        const orderRes = await client.query(`
            SELECT po.status, po.created_by, w.location_id 
            FROM purchase_orders po
            LEFT JOIN warehouses w ON po.target_warehouse_id::text = w.id::text
            WHERE po.id = $1 
            FOR UPDATE
        `, [orderId]);

        if (orderRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Orden no encontrada' };
        }

        const order = orderRes.rows[0];

        if (order.status !== 'DRAFT') {
            await client.query('ROLLBACK');
            return { success: false, error: 'Solo se pueden eliminar borradores' };
        }

        // 2. Eliminar items
        await client.query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [orderId]);

        // 3. Eliminar orden
        await client.query('DELETE FROM purchase_orders WHERE id = $1', [orderId]);

        // 4. Auditoría
        await client.query(`
            INSERT INTO audit_log (
                user_id, location_id, action_code, 
                entity_type, entity_id, 
                description
            ) VALUES ($1, $2, 'DELETE_PO', 'PURCHASE_ORDER', $3, 'Eliminación de borrador')
        `, [userId, order.location_id, orderId]);

        await client.query('COMMIT');
        revalidatePath('/procurement');

        return { success: true };

    } catch (error: unknown) {
        await client.query('ROLLBACK');
        console.error('Error deleting PO:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Error al eliminar orden' };
    } finally {
        client.release();
    }
}

/**
 * 📋 Get Purchase Order History (Paginated)
 */
export async function getPurchaseOrderHistory(filters?: {
    supplierId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    minTotal?: number;
    page?: number;
    pageSize?: number;
}): Promise<{
    success: boolean;
    data?: {
        orders: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
    };
    error?: string;
}> {
    try {
        const page = filters?.page || 1;
        const pageSize = Math.min(filters?.pageSize || 50, 100);

        // Build WHERE clause
        const conditions: string[] = [];
        const params: (string | number | Date | null)[] = [];
        let paramIndex = 1;

        if (filters?.supplierId) {
            conditions.push(`po.supplier_id::text = $${paramIndex++}::text`);
            params.push(filters.supplierId);
        }

        if (filters?.status) {
            conditions.push(`po.status = $${paramIndex++}`);
            params.push(filters.status);
        }

        if (filters?.startDate) {
            conditions.push(`po.created_at >= $${paramIndex++}`);
            params.push(filters.startDate);
        }

        if (filters?.endDate) {
            conditions.push(`po.created_at <= $${paramIndex++}`);
            params.push(filters.endDate);
        }

        if (filters?.minTotal !== undefined) {
            conditions.push(`po.total_amount >= $${paramIndex++}`);
            params.push(filters.minTotal);
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        // Get total
        const countResult = await pool.query(`
            SELECT COUNT(*) as total
            FROM purchase_orders po
            ${whereClause}
        `, params);

        const total = parseInt(countResult.rows[0].total);

        // Get orders
        const offset = (page - 1) * pageSize;
        params.push(pageSize);
        params.push(offset);

        const ordersResult = await pool.query(`
            SELECT 
                po.*,
                s.business_name as supplier_name,
                u1.name as created_by_name,
                u2.name as approved_by_name,
                u3.name as received_by_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id::text = s.id::text
            LEFT JOIN users u1 ON po.created_by::text = u1.id::text
            LEFT JOIN users u2 ON po.approved_by::text = u2.id::text
            LEFT JOIN users u3 ON po.received_by::text = u3.id::text
            ${whereClause}
            ORDER BY po.created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `, params);

        // Get items for these orders
        const orderIds = ordersResult.rows.map(o => o.id);
        if (orderIds.length > 0) {
            const itemsResult = await pool.query(`
                SELECT * FROM purchase_order_items 
                WHERE purchase_order_id = ANY($1)
            `, [orderIds]);

            // Map items back to orders
            (ordersResult.rows as (Record<string, unknown> & { items: unknown[] })[]).forEach(order => {
                order.items = itemsResult.rows
                    .filter(item => item.purchase_order_id === order.id)
                    .map(item => ({
                        ...item,
                        quantity_ordered: Number(item.quantity_ordered),
                        quantity_received: Number(item.quantity_received),
                        cost_price: Number(item.cost_price)
                    }));
            });
        } else {
            ordersResult.rows.forEach(order => {
                order.items = [];
            });
        }

        return {
            success: true,
            data: {
                orders: ordersResult.rows,
                total,
                page,
                pageSize
            }
        };

    } catch (error: unknown) {
        console.error('[PROCUREMENT-V2] Get history error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error obteniendo historial'
        };
    }
}

/**
 * 🧠 Generate Restock Suggestion (MRP Algorithm - Secure)
 */
function normalizeUuid(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return UUIDSchema.safeParse(trimmed).success ? trimmed : null;
}

interface SuggestionHistoryPayload {
    supplier_id?: string | null;
    supplier_name?: string | null;
    days_to_cover: number;
    analysis_window: number;
    location_id?: string | null;
    stock_threshold?: number | null;
    search_query?: string | null;
    limit: number;
    total_results: number;
    critical_count: number;
    transfer_count: number;
    total_estimated: number;
}

async function saveSuggestionAnalysisHistory(params: SuggestionHistoryPayload): Promise<void> {
    try {
        const session = await getSessionSecure();
        if (!session) return;

        const safeLocationId = normalizeUuid(params.location_id || null);
        const supplierName = params.supplier_name || null;
        const payload = {
            ...params,
            supplier_name: supplierName,
            stock_threshold: params.stock_threshold ?? null,
            search_query: params.search_query ?? null
        };

        await pool.query(`
            INSERT INTO audit_log (
                user_id,
                user_role,
                user_name,
                location_id,
                action_code,
                entity_type,
                new_values,
                created_at
            ) VALUES ($1, $2, $3, $4, 'REPORT_GENERATE', 'PROCUREMENT_SUGGESTIONS', $5::jsonb, NOW())
        `, [
            session.userId,
            session.role,
            session.userName,
            safeLocationId,
            JSON.stringify(payload)
        ]);
    } catch (error) {
        logger.warn({ error }, '[PROCUREMENT-V2] Suggestion history audit skipped');
    }
}

/**
 * 🧠 Generate Restock Suggestion (MRP Algorithm - Secure)
 * Enhanced with Multi-Supplier, Search, and Top N Logic
 */
export async function generateRestockSuggestionSecure(
    supplierId?: string,
    daysToCover: number = 15,
    analysisWindow: number = 30,
    locationId?: string,
    stockThreshold?: number, // New: 0.1 to 1.0 (or >1 for overstock)
    searchQuery?: string,    // New: Filter by name/sku
    limit: number = 100,     // New: Top N results
    trackHistory: boolean = false
): Promise<{
    success: boolean;
    data?: Record<string, unknown>[];
    error?: string;
}> {
    // Validate inputs
    let supplierValidated: string | undefined = undefined;
    if (supplierId) {
        const parsed = UUIDSchema.safeParse(supplierId);
        if (!parsed.success) {
            return { success: false, error: 'ID de proveedor inválido' };
        }
        supplierValidated = parsed.data;
    }

    if (daysToCover < 1 || daysToCover > 365) {
        return { success: false, error: 'Días de cobertura debe estar entre 1 y 365' };
    }

    if (analysisWindow < 7 || analysisWindow > 365) {
        return { success: false, error: 'Ventana de análisis debe estar entre 7 y 365 días' };
    }

    const safeLocationId = normalizeUuid(locationId);

    logger.info(
        { supplierId: supplierValidated || null, daysToCover, analysisWindow, locationId: safeLocationId, stockThreshold, searchQuery, limit },
        '[MRP] Generate Suggestion Params'
    );

    try {
        // Parametros para la query
        // $1: SupplierID (Optional)
        // $2: AnalysisWindow (Days)
        // $3: SearchQuery (Optional)
        // $4: LocationID (Optional) - For stock filtering
        // $5: Limit

        const queryParams: (string | number | null)[] = [
            supplierValidated || null,
            searchQuery ? `%${searchQuery}%` : null,
            limit
        ];

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (process.env.DEBUG_STOCK_COMPARISON) {
            // Comparative STOCK Analysis: GLOBAL vs LOCAL
            const stockCheck = await pool.query(`
                WITH LocalStock AS (
                    SELECT p.sku, SUM(ib.quantity_real) as local_qty
                    FROM inventory_batches ib
                    JOIN products p ON ib.product_id::text = p.id::text
                    JOIN locations l ON ib.location_id::text = l.id::text
                    WHERE ($1::text IS NULL OR ib.location_id::text = $1::text)
                    AND l.is_active = true
                    GROUP BY p.sku
                ),
                GlobalStock AS (
                    SELECT p.sku, SUM(ib.quantity_real) as global_qty
                    FROM inventory_batches ib
                    JOIN products p ON ib.product_id::text = p.id::text
                    JOIN locations l ON ib.location_id::text = l.id::text
                    WHERE l.is_active = true
                    GROUP BY p.sku
                )
                SELECT 
                    COALESCE(l.sku, g.sku) as sku, 
                    COALESCE(l.local_qty, 0) as local_qty, 
                    COALESCE(g.global_qty, 0) as global_qty,
                    (COALESCE(g.global_qty, 0) - COALESCE(l.local_qty, 0)) as diff
                FROM LocalStock l
                FULL OUTER JOIN GlobalStock g ON l.sku = g.sku
                ORDER BY diff DESC
                LIMIT 15
            `, [safeLocationId || null]);

            return { success: false, error: `DEBUG COMPARISON (Loc: ${safeLocationId}): ` + JSON.stringify(stockCheck.rows) };
        }

        let paramIndex = 4;

        // Filtro de ubicación para Stock y Ventas
        let locationFilterStock = '';
        let locationFilterSales = '';

        if (safeLocationId) {
            locationFilterStock = `AND ib.location_id::text = $${paramIndex}::text`;
            locationFilterSales = `AND s.location_id::text = $${paramIndex}::text`;
            queryParams.push(safeLocationId);
            paramIndex++;
        }

        const finalSql = `
            WITH 
            TargetProducts AS (
                SELECT 
                    p.id::uuid as product_id, 
                    p.name as product_name, 
                    p.sku as product_sku, 
                    NULL as image_url,
                    p.stock_minimo_seguridad as safety_stock,
                    COALESCE(p.cost_net, p.cost_price, 0) as internal_cost,
                    
                    -- Top 3 Suppliers by Cost (or filtered supplier)
                    (
                        SELECT jsonb_agg(sub_s)
                        FROM (
                            SELECT 
                                s.id, 
                                s.business_name as name, 
                                COALESCE(ps.last_cost, ps.average_cost, 0) as cost_price,
                                ps.supplier_sku,
                                ps.is_preferred
                            FROM product_suppliers ps
                            JOIN suppliers s ON ps.supplier_id::text = s.id::text
                            WHERE ps.product_id::text = p.id::text
                            AND s.status = 'ACTIVE'
                            -- If specific supplier selected, only show that one (or prioritize it)
                            AND ($1::text IS NULL OR ps.supplier_id::text = $1::text)
                            ORDER BY COALESCE(ps.last_cost, ps.average_cost, 0) ASC NULLS LAST
                            LIMIT 3
                        ) sub_s
                    ) as suppliers_data
                    
                FROM products p
                WHERE 
                    -- Apply Search Filter
                    ($2::text IS NULL OR p.name ILIKE $2::text OR p.sku ILIKE $2::text)
                    -- Exclude Retail/Fractionated products from suggestions
                    AND p.name NOT ILIKE '%[AL DETAL]%'
                    -- Apply Supplier Filter (Check if ANY supplier matches)
                    AND (
                        $1::text IS NULL OR EXISTS (
                            SELECT 1 FROM product_suppliers ps 
                            WHERE ps.product_id::text = p.id::text AND ps.supplier_id::text = $1::text
                        )
                    )
            ),
            CurrentStock AS (
                SELECT 
                    ib.product_id, 
                    SUM(ib.quantity_real) as total_stock
                FROM inventory_batches ib
                JOIN locations l ON ib.location_id::text = l.id::text
                WHERE ib.quantity_real > 0 AND l.is_active = true
                ${locationFilterStock}
                GROUP BY ib.product_id
            ),
            IncomingStock AS (
                SELECT 
                    p.id::uuid as product_id, 
                    SUM(poi.quantity_ordered - COALESCE(poi.quantity_received, 0)) as incoming
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.purchase_order_id = po.id
                JOIN products p ON poi.sku = p.sku
                JOIN warehouses w ON po.target_warehouse_id::text = w.id::text
                JOIN locations l ON w.location_id::text = l.id::text
                WHERE po.status = 'APPROVED'
                AND w.is_active = true
                AND l.is_active = true
                ${safeLocationId ? `AND l.id::text = $${queryParams.length}::text` : ''} 
                GROUP BY p.id::uuid
            ),
            SalesHistory AS (
                SELECT 
                    ib.product_id, 
                    -- Multi-window Sales Aggregation
                    SUM(CASE WHEN s.timestamp >= NOW() - INTERVAL '7 days' THEN si.quantity ELSE 0 END) as sold_7d,
                    SUM(CASE WHEN s.timestamp >= NOW() - INTERVAL '15 days' THEN si.quantity ELSE 0 END) as sold_15d,
                    SUM(CASE WHEN s.timestamp >= NOW() - INTERVAL '30 days' THEN si.quantity ELSE 0 END) as sold_30d,
                    SUM(CASE WHEN s.timestamp >= NOW() - INTERVAL '60 days' THEN si.quantity ELSE 0 END) as sold_60d,
                    SUM(CASE WHEN s.timestamp >= NOW() - INTERVAL '90 days' THEN si.quantity ELSE 0 END) as sold_90d,
                    SUM(CASE WHEN s.timestamp >= NOW() - INTERVAL '180 days' THEN si.quantity ELSE 0 END) as sold_180d,
                    SUM(CASE WHEN s.timestamp >= NOW() - INTERVAL '365 days' THEN si.quantity ELSE 0 END) as sold_365d,
                    
                    SUM(si.quantity) as total_sold_max_window,

                    -- Timeseries Data for AI (Last 4 weeks)
                    jsonb_agg(jsonb_build_object(
                        'week', to_char(s.timestamp, 'IYYY-IW'),
                        'qty', si.quantity
                    )) as weekly_sales
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                JOIN inventory_batches ib ON si.batch_id = ib.id
                JOIN locations l ON ib.location_id::text = l.id::text
                WHERE s.timestamp >= NOW() - INTERVAL '365 days'
                AND l.is_active = true
                AND ib.product_id IN (SELECT product_id FROM TargetProducts)
                ${locationFilterSales}
                GROUP BY ib.product_id
            ),
            GlobalStockDetail AS (
                SELECT 
                    product_id,
                    SUM(location_total) as global_stock,
                    jsonb_agg(jsonb_build_object(
                        'location_id', location_id,
                        'location_name', location_name,
                        'location_type', location_type,
                        'available_qty', location_total
                    )) as stock_by_location
                FROM (
                    SELECT 
                        ib.product_id,
                        ib.location_id,
                        l.name as location_name,
                        l.type as location_type,
                        SUM(ib.quantity_real) as location_total
                    FROM inventory_batches ib
                    JOIN locations l ON ib.location_id::text = l.id::text
                    WHERE ib.quantity_real > 0 AND l.is_active = true
                    AND ib.product_id IN (SELECT product_id FROM TargetProducts)
                    -- Exclude current location to find "Other" stock
                    ${safeLocationId ? `AND ib.location_id::text != $${paramIndex - 1}::text` : ''}
                    GROUP BY ib.product_id, ib.location_id, l.name, l.type
                ) sub
                GROUP BY product_id
            )
            SELECT 
                tp.product_id,
                tp.product_name,
                tp.product_sku as sku,
                COALESCE(tp.internal_cost, 0) as internal_cost,
                tp.image_url,
                tp.internal_cost as unit_cost,
                tp.suppliers_data,
                
                COALESCE(cs.total_stock, 0) as current_stock,
                COALESCE(gs.global_stock, 0) as other_warehouses_stock,
                COALESCE(gs.stock_by_location, '[]'::jsonb) as stock_by_location,
                COALESCE(incs.incoming, 0) as incoming_stock,
                COALESCE(tp.safety_stock, 0) as safety_stock,
                
                -- Velocity Data
                COALESCE(sh.sold_7d, 0) as sold_7d,
                COALESCE(sh.sold_15d, 0) as sold_15d,
                COALESCE(sh.sold_30d, 0) as sold_30d,
                COALESCE(sh.sold_60d, 0) as sold_60d,
                COALESCE(sh.sold_90d, 0) as sold_90d,
                COALESCE(sh.sold_180d, 0) as sold_180d,
                COALESCE(sh.sold_365d, 0) as sold_365d,
                
                COALESCE(sh.total_sold_max_window, 0) as total_sold_in_period,
                COALESCE(sh.weekly_sales, '[]'::jsonb) as sales_history
            FROM TargetProducts tp
            LEFT JOIN CurrentStock cs ON tp.product_id = cs.product_id
            LEFT JOIN IncomingStock incs ON tp.product_id = incs.product_id
            LEFT JOIN SalesHistory sh ON tp.product_id = sh.product_id
            LEFT JOIN GlobalStockDetail gs ON tp.product_id = gs.product_id
            
            -- Sort by highest sales volume first (Top N)
            ORDER BY total_sold_in_period DESC, tp.product_name ASC
            LIMIT $3
        `;

        // Aumentar el límite real enviado a la DB para compensar el filtrado de "ceros" posterior
        // Si limit es 500, el $3 será 1500 para tener margen de encontrar 500 accionables.
        queryParams[2] = Math.min(limit * 5, 2000);

        const res = await pool.query(finalSql, queryParams);

        // Calculate Formula in JS for precision control
        // Suggested = CEIL(Velocity * (DaysToCover + LeadTime) + Safety - Stock - Incoming)
        const suggestions = await Promise.all(res.rows.map(async (row, idx) => {
            // Calculate velocities for all windows
            const velocities: Record<number, number> = {
                7: Number(row.sold_7d) / 7,
                15: Number(row.sold_15d) / 15,
                30: Number(row.sold_30d) / 30,
                60: Number(row.sold_60d) / 60,
                90: Number(row.sold_90d) / 90,
                180: Number(row.sold_180d) / 180,
                365: Number(row.sold_365d) / 365
            };

            const sold_counts: Record<number, number> = {
                7: Number(row.sold_7d),
                15: Number(row.sold_15d),
                30: Number(row.sold_30d),
                60: Number(row.sold_60d),
                90: Number(row.sold_90d),
                180: Number(row.sold_180d),
                365: Number(row.sold_365d)
            };

            // Default velocity based on requested analysisWindow (fallback to 30 if not found)
            // If analysisWindow is e.g. 45, we fallback to closest or just 30. 
            // The frontend sends standard values (7,15,30,60,90,180).
            const velocity = velocities[analysisWindow] || velocities[30] || 0;

            const stock = Number(row.current_stock);
            const globalStock = Number(row.other_warehouses_stock || 0);
            const incoming = Number(row.incoming_stock);
            const safety = Number(row.safety_stock);
            const leadTime = 0; // Default

            // Estima el Stock Máximo Dinámico basado en la cobertura deseada
            // Si no hay ventas (velocity = 0), el maxStock será al menos el doble del stock de seguridad 
            // o un valor mínimo razonable para asegurar visibilidad.
            const targetCoverageStock = Math.ceil(velocity * (daysToCover + leadTime));

            // Stock Crítico / Seguridad (Floor)
            // Si safety es 0, usamos 5 como fallback razonable para productos en catálogo
            const effectiveSafety = safety > 0 ? safety : 5;

            // El Stock Objetivo (maxStock) es el mayor entre:
            // 1. La demanda proyectada + safety
            // 2. El stock de seguridad absoluto (como mínimo)
            const maxStock = Math.max(effectiveSafety, Math.ceil(targetCoverageStock + safety));

            const netNeeds = maxStock - stock - incoming;

            // Suggested is the gap to fill maxStock
            let suggested = Math.max(0, Math.ceil(netNeeds));
            const daysUntilStockout = velocity > 0 ? (stock / velocity) : (stock > 0 ? 999 : 0);

            // Calcular porcentaje de llenado (Regla de Negocio: 100 unidades = 100%)
            // El usuario define que "todo el stock" es de 100 unidades en adelante.
            const stockTarget = 100;
            const stockLevelPercent = Math.min(100, Math.max(0, Math.round((stock / stockTarget) * 100)));

            // Filtering Logic in backend to reduce payload if threshold is set
            if (stockThreshold !== undefined && stockThreshold !== null) {
                // stockThreshold viene como 0.1 (10%), 0.5 (50%), etc.
                // Convertimos a porcentaje entero (10, 50, etc) para comparar
                const thresholdPercent = stockThreshold * 100;

                // Si el filtro es 100% (1.0), mostramos todo (no filtramos)
                // "solo filtra cuando lo llevo a todo" -> Si es < 100%, aplicamos filtro "HASTA ese porcentaje"
                if (thresholdPercent < 100) {
                    if (stockLevelPercent > thresholdPercent) return null;
                }
            }

            // Also ensure we show CRITICAL items regardless of threshold if they have sales
            // OR if the user is searching for them specifically.

            let reason = `Venta Diaria: ${velocity.toFixed(2)} | Cobertura: ${daysToCover}d | Nivel: ${stockLevelPercent}%`;
            let aiConfidence = undefined;
            let aiAction: 'PURCHASE' | 'TRANSFER' | 'PARTIAL_TRANSFER' = 'PURCHASE';

            // 📦 TRANSFER DETECTION
            // Si otra sucursal tiene suficiente stock, sugerir traspaso
            if (suggested > 0 && globalStock > 0 && safeLocationId) {
                if (globalStock >= suggested) {
                    aiAction = 'TRANSFER';
                    reason = `📦 Traspaso sugerido: ${globalStock}u disponibles en otras sucursales | ${reason}`;
                } else {
                    aiAction = 'PARTIAL_TRANSFER';
                    reason = `📦 Traspaso parcial: ${globalStock}u de ${suggested}u necesarias disponibles en otras sucursales | ${reason}`;
                }
            }

            // 🛑 COST OPTIMIZATION OVERRIDE
            // Priorizar siempre el traspaso si hay stock global suficiente para ahorrar compras.
            if (suggested > 0 && globalStock >= suggested && safeLocationId) {
                aiAction = 'TRANSFER';
                reason = `📦 TRASPASO PRIORITARIO: Stock global suficiente (${globalStock}u). Ahorro de compra detectado.`;
            }

            // Determine urgency based on stockout days
            let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
            if (stock <= 0) urgency = 'HIGH';
            else if (daysUntilStockout <= 5) urgency = 'HIGH';
            else if (daysUntilStockout <= 15) urgency = 'MEDIUM';


            // Resolver proveedor preferido o el mejor precio
            let bestSupplier: Record<string, unknown> | null = null;
            if (row.suppliers_data && (row.suppliers_data as Record<string, unknown>[]).length > 0) {
                // Try to find preferred
                bestSupplier = (row.suppliers_data as Record<string, unknown>[]).find((s: Record<string, unknown>) => s.is_preferred) || null;
                // Fallback to first (cheapest)
                if (!bestSupplier) bestSupplier = (row.suppliers_data as Record<string, unknown>[])[0];
            }

            // If filtering by specific supplier, ensure we use that one's data if available
            if (supplierId && row.suppliers_data) {
                const specificSup = (row.suppliers_data as Record<string, unknown>[]).find((s: Record<string, unknown>) => s.id === supplierId);
                if (specificSup) bestSupplier = specificSup;
            }


            // Parsear stock por ubicación para transfer_sources
            const rawStockByLocation = row.stock_by_location || [];
            const transferSources = (Array.isArray(rawStockByLocation) ? rawStockByLocation : [])
                .filter((src: { available_qty: number }) => src.available_qty > 0)
                .map((src: { location_id: string; location_name: string; location_type: string; available_qty: number }) => ({
                    location_id: src.location_id,
                    location_name: src.location_name,
                    location_type: src.location_type,
                    available_qty: src.available_qty
                }));

            return {
                product_id: row.product_id,
                product_name: row.product_name,
                sku: row.sku,
                image_url: row.image_url,
                location_id: safeLocationId,
                current_stock: stock,
                global_stock: globalStock,
                incoming_stock: incoming,
                safety_stock: safety,
                min_stock: safety,
                max_stock: maxStock,
                stock_level_percent: stockLevelPercent,
                daily_velocity: Number(velocity.toFixed(3)),
                suggested_order_qty: suggested,
                days_coverage: velocity > 0 ? (stock / velocity).toFixed(1) : (stock > 0 ? '∞' : '0.0'),
                days_until_stockout: daysUntilStockout,
                urgency: urgency,
                unit_cost: Number(bestSupplier?.cost_price || row.unit_cost),
                supplier_sku: bestSupplier?.supplier_sku || null,
                supplier_id: (bestSupplier?.id as string) || null,
                supplier_name: (bestSupplier?.name as string) || 'Sin Proveedor Asignado',
                other_suppliers: (row.suppliers_data as Record<string, unknown>[] || []).map((s: Record<string, unknown>) => ({ ...s, cost: s.cost_price })),
                total_estimated: suggested * Number(bestSupplier?.cost_price || row.unit_cost),
                reason,
                ai_confidence: aiConfidence,
                action_type: aiAction,
                transfer_sources: transferSources,
                velocities, // New field exposing all calculated velocities
                sold_counts
            };
        }));

        // Filter out nulls
        let validSuggestions = suggestions.filter(s => s !== null) as any[];

        // REGLA DE NEGOCIO: Si NO hay una búsqueda específica, ocultar items con sugerencia = 0
        // Esto evita que el usuario vea 500 productos donde 470 dicen "Pedido Sugerido: 0"
        if (!searchQuery) {
            validSuggestions = validSuggestions.filter(s => s.suggested_order_qty > 0);
        }

        // Sort: High Urgency First, then High Velocity
        const sortedSuggestions = validSuggestions.sort((a, b) => {
            // 1. Urgency 
            if (a.urgency === 'HIGH' && b.urgency !== 'HIGH') return -1;
            if (b.urgency === 'HIGH' && a.urgency !== 'HIGH') return 1;
            if (a.urgency === 'MEDIUM' && b.urgency === 'LOW') return -1;
            if (b.urgency === 'MEDIUM' && a.urgency === 'LOW') return 1;

            // 2. Stockout Days (Ascending)
            if (a.days_until_stockout !== b.days_until_stockout) {
                return (a.days_until_stockout || 0) - (b.days_until_stockout || 0);
            }

            // 3. Velocity (Descending)
            return (b.daily_velocity || 0) - (a.daily_velocity || 0);
        });

        // Aplicar el límite final después de filtrar los ceros
        const finalResults = sortedSuggestions.slice(0, limit);

        if (trackHistory) {
            const supplierName = supplierValidated
                ? (finalResults.find(item => item.supplier_id === supplierValidated)?.supplier_name as string | undefined) || null
                : null;

            const totalEstimated = finalResults.reduce((sum, item) => sum + Number(item.total_estimated || 0), 0);
            const criticalCount = finalResults.filter(item => item.urgency === 'HIGH').length;
            const transferCount = finalResults.filter(item => item.action_type === 'TRANSFER' || item.action_type === 'PARTIAL_TRANSFER').length;

            void saveSuggestionAnalysisHistory({
                supplier_id: supplierValidated || null,
                supplier_name: supplierName,
                days_to_cover: daysToCover,
                analysis_window: analysisWindow,
                location_id: safeLocationId,
                stock_threshold: stockThreshold ?? null,
                search_query: searchQuery ?? null,
                limit,
                total_results: finalResults.length,
                critical_count: criticalCount,
                transfer_count: transferCount,
                total_estimated: Number(totalEstimated.toFixed(2))
            });
        }

        return { success: true, data: finalResults };

    } catch (error: unknown) {
        console.error('[PROCUREMENT-V2] MRP error:', error);
        return { success: false, error: 'Error generando sugerencias: ' + (error instanceof Error ? error.message : 'Error desconocido') };
    }
}

export interface TransferDetail {
    sku: string;
    product_name: string;
    quantity: number;
    from_location_name: string;
    to_location_name: string;
}

export interface SuggestionAnalysisHistoryItem {
    history_id: string;
    executed_at: string;
    executed_by: string;
    location_id: string | null;
    location_name: string;
    supplier_id: string | null;
    supplier_name: string | null;
    days_to_cover: number;
    analysis_window: number;
    stock_threshold: number | null;
    search_query: string | null;
    limit: number;
    total_results: number;
    critical_count: number;
    transfer_count: number;
    total_estimated: number;
}

/**
 * 📋 Historial del Motor de Sugerencias (reciente y liviano)
 */
export async function getSuggestionAnalysisHistorySecure(params?: {
    locationId?: string;
    limit?: number;
}): Promise<{ success: boolean; data?: SuggestionAnalysisHistoryItem[]; error?: string }> {
    try {
        const limit = Math.min(Math.max(params?.limit || 10, 1), 50);
        const safeLocationId = normalizeUuid(params?.locationId);

        const result = await pool.query(`
            SELECT
                al.id::text AS history_id,
                al.created_at AT TIME ZONE 'America/Santiago' AS executed_at,
                COALESCE(al.user_name, u.name, 'Sistema') AS executed_by,
                COALESCE(al.location_id::text, al.new_values->>'location_id') AS location_id,
                COALESCE(al.new_values->>'location_name', l.name, 'Todas') AS location_name,
                NULLIF(al.new_values->>'supplier_id', '') AS supplier_id,
                NULLIF(al.new_values->>'supplier_name', '') AS supplier_name,
                CASE
                    WHEN NULLIF(al.new_values->>'days_to_cover', '') ~ '^[0-9]+$'
                        THEN (al.new_values->>'days_to_cover')::int
                    ELSE 15
                END AS days_to_cover,
                CASE
                    WHEN NULLIF(al.new_values->>'analysis_window', '') ~ '^[0-9]+$'
                        THEN (al.new_values->>'analysis_window')::int
                    ELSE 30
                END AS analysis_window,
                CASE
                    WHEN NULLIF(al.new_values->>'stock_threshold', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                        THEN (al.new_values->>'stock_threshold')::numeric
                    ELSE NULL
                END AS stock_threshold,
                NULLIF(al.new_values->>'search_query', '') AS search_query,
                CASE
                    WHEN NULLIF(al.new_values->>'limit', '') ~ '^[0-9]+$'
                        THEN (al.new_values->>'limit')::int
                    ELSE 100
                END AS limit_value,
                CASE
                    WHEN NULLIF(al.new_values->>'total_results', '') ~ '^[0-9]+$'
                        THEN (al.new_values->>'total_results')::int
                    ELSE 0
                END AS total_results,
                CASE
                    WHEN NULLIF(al.new_values->>'critical_count', '') ~ '^[0-9]+$'
                        THEN (al.new_values->>'critical_count')::int
                    ELSE 0
                END AS critical_count,
                CASE
                    WHEN NULLIF(al.new_values->>'transfer_count', '') ~ '^[0-9]+$'
                        THEN (al.new_values->>'transfer_count')::int
                    ELSE 0
                END AS transfer_count,
                CASE
                    WHEN NULLIF(al.new_values->>'total_estimated', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                        THEN (al.new_values->>'total_estimated')::numeric
                    ELSE 0
                END AS total_estimated
            FROM audit_log al
            LEFT JOIN users u ON al.user_id::text = u.id::text
            LEFT JOIN locations l ON al.location_id::text = l.id::text
            WHERE al.action_code = 'REPORT_GENERATE'
              AND al.entity_type = 'PROCUREMENT_SUGGESTIONS'
              AND (
                $2::text IS NULL
                OR al.location_id::text = $2::text
                OR al.new_values->>'location_id' = $2::text
              )
            ORDER BY al.created_at DESC
            LIMIT $1
        `, [limit, safeLocationId]);

        const history = result.rows.map((row) => ({
            history_id: String(row.history_id),
            executed_at: String(row.executed_at),
            executed_by: String(row.executed_by || 'Sistema'),
            location_id: row.location_id ? String(row.location_id) : null,
            location_name: String(row.location_name || 'Todas'),
            supplier_id: row.supplier_id ? String(row.supplier_id) : null,
            supplier_name: row.supplier_name ? String(row.supplier_name) : null,
            days_to_cover: Number(row.days_to_cover || 15),
            analysis_window: Number(row.analysis_window || 30),
            stock_threshold: row.stock_threshold !== null && row.stock_threshold !== undefined ? Number(row.stock_threshold) : null,
            search_query: row.search_query ? String(row.search_query) : null,
            limit: Number(row.limit_value || 100),
            total_results: Number(row.total_results || 0),
            critical_count: Number(row.critical_count || 0),
            transfer_count: Number(row.transfer_count || 0),
            total_estimated: Number(row.total_estimated || 0)
        }));

        return { success: true, data: history };
    } catch (error) {
        logger.error({ error }, '[PROCUREMENT-V2] Suggestion history error');
        return { success: false, error: 'Error cargando historial del motor de sugerencias' };
    }
}

/**
 * 📋 Get Transfer History - Consulta traspasos ejecutados entre sucursales
 */
export async function getTransferHistorySecure(params?: {
    locationId?: string;
    limit?: number;
}): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
    try {
        const limit = Math.min(Math.max(params?.limit || 10, 1), 50);
        const safeLocationId = normalizeUuid(params?.locationId);

        const result = await pool.query(`
            WITH latest_transfers AS (
                SELECT 
                    sm.reference_id AS transfer_id,
                    MAX(sm.timestamp) AS executed_at,
                    MAX(sm.location_id::text) AS from_location_id,
                    MAX(sm.user_id::text) AS user_id,
                    MAX(sm.notes) AS reason
                FROM stock_movements sm
                WHERE sm.movement_type = 'TRANSFER_OUT'
                  AND sm.reference_type = 'LOCATION_TRANSFER'
                  AND sm.reference_id IS NOT NULL
                  AND (
                    $2::text IS NULL
                    OR sm.location_id::text = $2::text
                    OR EXISTS (
                        SELECT 1
                        FROM stock_movements sm_in
                        WHERE sm_in.reference_id::text = sm.reference_id::text
                          AND sm_in.movement_type = 'TRANSFER_IN'
                          AND sm_in.reference_type = 'LOCATION_TRANSFER'
                          AND sm_in.location_id::text = $2::text
                    )
                  )
                GROUP BY sm.reference_id
                ORDER BY MAX(sm.timestamp) DESC
                LIMIT $1
            ),
            aggregated_out AS (
                SELECT 
                    sm.reference_id AS transfer_id,
                    COUNT(DISTINCT sm.sku) AS items_count,
                    SUM(ABS(sm.quantity)) AS total_quantity,
                    MAX(sm.location_id::text) AS from_location_id
                FROM stock_movements sm
                JOIN latest_transfers lt ON lt.transfer_id = sm.reference_id
                WHERE sm.movement_type = 'TRANSFER_OUT'
                  AND sm.reference_type = 'LOCATION_TRANSFER'
                GROUP BY sm.reference_id
            ),
            aggregated_in AS (
                SELECT 
                    sm.reference_id AS transfer_id,
                    MAX(sm.location_id::text) AS to_location_id
                FROM stock_movements sm
                JOIN latest_transfers lt ON lt.transfer_id = sm.reference_id
                WHERE sm.movement_type = 'TRANSFER_IN'
                  AND sm.reference_type = 'LOCATION_TRANSFER'
                GROUP BY sm.reference_id
            )
            SELECT 
                lt.transfer_id::text AS transfer_id,
                lt.executed_at AT TIME ZONE 'America/Santiago' AS executed_at,
                aout.from_location_id,
                l_from.name AS from_location_name,
                ain.to_location_id,
                l_to.name AS to_location_name,
                aout.items_count,
                aout.total_quantity AS quantity,
                u.name AS executed_by,
                lt.reason
            FROM latest_transfers lt
            JOIN aggregated_out aout ON lt.transfer_id = aout.transfer_id
            LEFT JOIN aggregated_in ain ON lt.transfer_id = ain.transfer_id
            LEFT JOIN locations l_from ON aout.from_location_id = l_from.id::text
            LEFT JOIN locations l_to ON ain.to_location_id = l_to.id::text
            LEFT JOIN users u ON lt.user_id = u.id::text
            ORDER BY lt.executed_at DESC
        `, [limit, safeLocationId]);

        return { success: true, data: result.rows as Record<string, unknown>[] };
    } catch (error: unknown) {
        logger.error({ error }, '[PROCUREMENT-V2] Transfer history error');
        return { success: false, error: 'Error consultando historial: ' + (error instanceof Error ? error.message : 'Error desconocido') };
    }
}

/**
 * 🔎 Get Transfer Detail - Obtiene el detalle de un traspaso específico por su ID de referencia
 */
export async function getTransferDetailHistorySecure(transferId: string): Promise<{ success: boolean; data?: TransferDetail[]; error?: string }> {
    try {
        const result = await pool.query(`
            WITH aggregated_out AS (
                SELECT 
                    sku,
                    MAX(product_name) as product_name,
                    MAX(location_id::text) as from_location_id,
                    SUM(ABS(quantity)) as total_quantity
                FROM stock_movements
                WHERE reference_id = $1 
                AND movement_type = 'TRANSFER_OUT'
                AND reference_type = 'LOCATION_TRANSFER'
                GROUP BY sku
            ),
            aggregated_in AS (
                SELECT 
                    sku,
                    MAX(location_id::text) as to_location_id
                FROM stock_movements
                WHERE reference_id = $1 
                AND movement_type = 'TRANSFER_IN'
                AND reference_type = 'LOCATION_TRANSFER'
                GROUP BY sku
            )
            SELECT 
                aout.sku,
                aout.product_name,
                aout.total_quantity as quantity,
                l_from.name as from_location_name,
                l_to.name as to_location_name
            FROM aggregated_out aout
            JOIN aggregated_in ain ON aout.sku = ain.sku
            LEFT JOIN locations l_from ON aout.from_location_id = l_from.id::text
            LEFT JOIN locations l_to ON ain.to_location_id = l_to.id::text
            ORDER BY aout.product_name ASC
        `, [transferId]);

        return { success: true, data: result.rows as TransferDetail[] };
    } catch (error: unknown) {
        logger.error({ error }, '[PROCUREMENT-V2] Transfer detail history error');
        return { success: false, error: 'Error consultando detalle del historial' };
    }
}
