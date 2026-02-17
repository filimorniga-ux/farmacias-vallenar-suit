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

import { pool } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

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

async function validateApproverPin(client: any, pin: string, requiredRoles: readonly string[]): Promise<{
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

async function insertProcurementAudit(client: any, params: {
    actionCode: string;
    userId: string;
    orderId: string;
    details: Record<string, any>;
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
            let sku = item.sku || 'UNKNOWN';

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

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[PROCUREMENT-V2] Create PO error:', error);
        return {
            success: false,
            error: error.message || 'Error al crear orden de compra'
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
            SELECT id, status, total_estimated, supplier_id
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
        const total = Number(order.total_estimated);
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

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[PROCUREMENT-V2] Approve PO error:', error);

        if (error.code === '55P03') {
            return { success: false, error: 'Orden está siendo procesada' };
        }

        return {
            success: false,
            error: error.message || 'Error al aprobar orden'
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

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[PROCUREMENT-V2] Receive PO error:', error);
        return {
            success: false,
            error: error.message || 'Error al recibir orden'
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
            SELECT id, status, total_estimated
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
                total: order.total_estimated,
                cancelled_by_name: pinCheck.approver!.name,
                reason: validated.data.reason
            }
        });

        await client.query('COMMIT');

        revalidatePath('/procurement');
        revalidatePath('/logistica');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('[PROCUREMENT-V2] Cancel PO error:', error);
        return {
            success: false,
            error: error.message || 'Error al cancelar orden'
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

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar estado (solo borradores) y obtener ubicación vía warehouse
        const orderRes = await client.query(`
            SELECT po.status, po.created_by, w.location_id 
            FROM purchase_orders po
            LEFT JOIN warehouses w ON po.target_warehouse_id = w.id
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

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error deleting PO:', error);
        return { success: false, error: error.message };
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
        orders: any[];
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
        const params: any[] = [];
        let paramIndex = 1;

        if (filters?.supplierId) {
            conditions.push(`supplier_id = $${paramIndex++}`);
            params.push(filters.supplierId);
        }

        if (filters?.status) {
            conditions.push(`status = $${paramIndex++}`);
            params.push(filters.status);
        }

        if (filters?.startDate) {
            conditions.push(`created_at >= $${paramIndex++}`);
            params.push(filters.startDate);
        }

        if (filters?.endDate) {
            conditions.push(`created_at <= $${paramIndex++}`);
            params.push(filters.endDate);
        }

        if (filters?.minTotal !== undefined) {
            conditions.push(`total_estimated >= $${paramIndex++}`);
            params.push(filters.minTotal);
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        // Get total
        const countResult = await pool.query(`
            SELECT COUNT(*) as total
            FROM purchase_orders
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
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u1 ON po.created_by = u1.id
            LEFT JOIN users u2 ON po.approved_by = u2.id
            LEFT JOIN users u3 ON po.received_by = u3.id
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
            ordersResult.rows.forEach(order => {
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

    } catch (error: any) {
        console.error('[PROCUREMENT-V2] Get history error:', error);
        return {
            success: false,
            error: error.message || 'Error obteniendo historial'
        };
    }
}

/**
 * 🧠 Generate Restock Suggestion (MRP Algorithm - Secure)
 */
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
    limit: number = 100      // New: Top N results
): Promise<{
    success: boolean;
    data?: any[];
    error?: string;
}> {
    console.log('[MRP] Generate Suggestion Params:', { supplierId, daysToCover, analysisWindow, locationId, stockThreshold, searchQuery, limit });

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

    try {
        // Parametros para la query
        // $1: SupplierID (Optional)
        // $2: AnalysisWindow (Days)
        // $3: SearchQuery (Optional)
        // $4: LocationID (Optional) - For stock filtering
        // $5: Limit

        const queryParams: any[] = [
            supplierValidated || null,
            searchQuery ? `%${searchQuery}%` : null,
            limit
        ];

        // DEBUG BACKDOOR
        if (false) {
            // Comparative STOCK Analysis: GLOBAL vs LOCAL
            const stockCheck = await pool.query(`
                WITH LocalStock AS (
                    SELECT p.sku, SUM(ib.quantity_real) as local_qty
                    FROM inventory_batches ib
                    JOIN warehouses w ON ib.warehouse_id = w.id
                    JOIN products p ON ib.product_id::text = p.id::text
                    WHERE ($1::uuid IS NULL OR w.location_id = $1::uuid)
                    GROUP BY p.sku
                ),
                GlobalStock AS (
                    SELECT p.sku, SUM(ib.quantity_real) as global_qty
                    FROM inventory_batches ib
                    JOIN products p ON ib.product_id::text = p.id::text
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
            `, [locationId || null]);

            return { success: false, error: `DEBUG COMPARISON (Loc: ${locationId}): ` + JSON.stringify(stockCheck.rows) };
        }

        let paramIndex = 4;

        // Filtro de ubicación para Stock y Ventas
        let locationFilterStock = '';
        let locationFilterSales = '';

        if (locationId) {
            locationFilterStock = `AND w.location_id = $${paramIndex}::uuid`;
            locationFilterSales = `AND w.location_id = $${paramIndex}::uuid`;
            queryParams.push(locationId);
            paramIndex++;
        }

        const finalSql = `
            WITH 
            TargetProducts AS (
                SELECT 
                    p.id as product_id, 
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
                            JOIN suppliers s ON ps.supplier_id = s.id
                            WHERE ps.product_id::text = p.id
                            AND s.status = 'ACTIVE'
                            -- If specific supplier selected, only show that one (or prioritize it)
                            AND ($1::uuid IS NULL OR ps.supplier_id = $1::uuid)
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
                        $1::uuid IS NULL OR EXISTS (
                            SELECT 1 FROM product_suppliers ps 
                            WHERE ps.product_id::text = p.id AND ps.supplier_id = $1::uuid
                        )
                    )
            ),
            CurrentStock AS (
                SELECT 
                    ib.product_id, 
                    SUM(ib.quantity_real) as total_stock
                FROM inventory_batches ib
                JOIN warehouses w ON ib.warehouse_id = w.id
                WHERE ib.quantity_real > 0
                ${locationFilterStock}
                GROUP BY ib.product_id
            ),
            IncomingStock AS (
                SELECT 
                    p.id as product_id, 
                    SUM(poi.quantity_ordered - COALESCE(poi.quantity_received, 0)) as incoming
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.purchase_order_id = po.id
                JOIN products p ON poi.sku = p.sku
                WHERE po.status = 'APPROVED'
                ${locationId ? `AND po.target_warehouse_id IN (SELECT id FROM warehouses WHERE location_id = $${queryParams.length}::uuid)` : ''} 
                GROUP BY p.id
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
                JOIN warehouses w ON ib.warehouse_id = w.id
                WHERE s.timestamp >= NOW() - INTERVAL '365 days'
                ${locationFilterSales}
                GROUP BY ib.product_id
            ),
            GlobalStock AS (
                SELECT 
                    ib.product_id,
                    SUM(ib.quantity_real) as global_stock
                FROM inventory_batches ib
                WHERE ib.quantity_real > 0
                -- Exclude current location to find "Other" stock
                ${locationId ? `AND ib.warehouse_id NOT IN (SELECT id FROM warehouses WHERE location_id = $${paramIndex - 1}::uuid)` : ''}
                GROUP BY ib.product_id
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
            LEFT JOIN CurrentStock cs ON tp.product_id::text = cs.product_id::text
            LEFT JOIN IncomingStock incs ON tp.product_id::text = incs.product_id::text
            LEFT JOIN SalesHistory sh ON tp.product_id::text = sh.product_id::text
            LEFT JOIN GlobalStock gs ON tp.product_id::text = gs.product_id::text
            
            -- Sort by highest sales volume first (Top N)
            ORDER BY total_sold_in_period DESC, tp.product_name ASC
            LIMIT $3
        `;

        const res = await pool.query(finalSql, queryParams);

        // Calculate Formula in JS for precision control
        // Suggested = CEIL(Velocity * (DaysToCover + LeadTime) + Safety - Stock - Incoming)
        const suggestions = await Promise.all(res.rows.map(async (row) => {
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
            const maxStock = Math.ceil((velocity * (daysToCover + leadTime)) + safety);

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
            let aiAction = 'PURCHASE';

            // 🧠 AI ENHANCEMENT (Hybrid)
            // Solo analizar si es crítico (Stockout < 7 días) o alto valor
            const isCritical = daysUntilStockout <= 7;
            const isHighValue = (suggested * Number(row.unit_cost)) > 100000;

            if (isCritical || isHighValue) {
                try {
                    // Dynamic Import to avoid bundle issues
                    const { AIForecastingService } = await import('@/services/ai-forecasting');

                    const aiResult = await AIForecastingService.predictDemand({
                        productName: row.product_name,
                        currentStock: stock,
                        branchName: 'Sucursal Actual', // Deberíamos pasar el nombre real si lo tenemos
                        salesHistory: [], // Not needed, utilizing weeklySales
                        weeklySales: row.sales_history,
                        context: `Days to cover: ${daysToCover}. Lead time: ${leadTime} days.`,
                        globalStock,
                        supplierName: row.suppliers_data?.[0]?.name || 'Unknown'
                    });

                    // Merge AI Logic
                    if (aiResult.confidence === 'HIGH' || aiResult.confidence === 'MEDIUM') {
                        // Si la IA sugiere, usamos su sugerencia pero respetamos el techo del maxStock si es 'PURCHASE'
                        // A veces la IA puede sugerir más por tendencias estacionales no capturadas en el promedio simple
                        suggested = aiResult.suggestedOrderQty;
                        reason = `🤖 IA: ${aiResult.reasoning}`;
                        aiConfidence = aiResult.confidence;
                        aiAction = (aiResult as any).suggestedAction || 'PURCHASE';

                        // If AI suggests TRANSFER, set purchase qty to 0 (or reflect transfer logic)
                        if (aiAction === 'TRANSFER') {
                            // suggestion remains but marked as transfer needed
                            reason = `📦 TRANSFERENCIA SUGERIDA: ${aiResult.reasoning}`;
                        }
                    }
                } catch (err) {
                    console.warn('AI Forecast skipped for item:', row.sku);
                }
            }

            // Determine urgency based on stockout days
            let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
            if (stock <= 0) urgency = 'HIGH';
            else if (daysUntilStockout <= 5) urgency = 'HIGH';
            else if (daysUntilStockout <= 15) urgency = 'MEDIUM';


            // Resolver proveedor preferido o el mejor precio
            let bestSupplier = null;
            if (row.suppliers_data && row.suppliers_data.length > 0) {
                // Try to find preferred
                bestSupplier = row.suppliers_data.find((s: any) => s.is_preferred);
                // Fallback to first (cheapest)
                if (!bestSupplier) bestSupplier = row.suppliers_data[0];
            }

            // If filtering by specific supplier, ensure we use that one's data if available
            if (supplierId && row.suppliers_data) {
                const specificSup = row.suppliers_data.find((s: any) => s.id === supplierId);
                if (specificSup) bestSupplier = specificSup;
            }


            return {
                product_id: row.product_id,
                product_name: row.product_name,
                sku: row.sku,
                image_url: row.image_url,
                location_id: locationId,
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
                supplier_id: bestSupplier?.id || null,
                supplier_name: bestSupplier?.name || 'Sin Proveedor Asignado',
                other_suppliers: (row.suppliers_data || []).map((s: any) => ({ ...s, cost: s.cost_price })),
                total_estimated: suggested * Number(bestSupplier?.cost_price || row.unit_cost),
                reason,
                ai_confidence: aiConfidence,
                action_type: aiAction,
                velocities, // New field exposing all calculated velocities
                sold_counts
            };
        }));

        // Filter out nulls (items that didn't pass threshold)
        const validSuggestions = suggestions.filter(s => s !== null);

        // Sort: High Urgency First, then High Velocity
        const sortedSuggestions = validSuggestions.sort((a, b) => {
            // 1. Urgency 
            if (a.urgency === 'HIGH' && b.urgency !== 'HIGH') return -1;
            if (b.urgency === 'HIGH' && a.urgency !== 'HIGH') return 1;

            // 2. Stockout Days (Ascending)
            if (a.days_until_stockout !== b.days_until_stockout) {
                return a.days_until_stockout - b.days_until_stockout;
            }

            // 3. Velocity (Descending)
            return b.daily_velocity - a.daily_velocity;
        });

        return { success: true, data: sortedSuggestions };

    } catch (error: any) {
        console.error('[PROCUREMENT-V2] MRP error:', error);
        return { success: false, error: 'Error generando sugerencias: ' + error.message };
    }
}
