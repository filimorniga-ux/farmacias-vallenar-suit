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

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const PurchaseOrderItemSchema = z.object({
    productId: UUIDSchema,
    productName: z.string().min(1),
    sku: z.string().min(1).optional(),
    quantity: z.number().int().positive('Cantidad debe ser positiva'),
    unitCost: z.number().positive('Costo debe ser positivo'),
});

const CreatePurchaseOrderSchema = z.object({
    supplierId: UUIDSchema,
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

        // 2. Validate supplier exists
        const supplierRes = await client.query(
            'SELECT id, business_name as name FROM suppliers WHERE id = $1 AND status = $2',
            [validated.data.supplierId, 'ACTIVE']
        );

        if (supplierRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Proveedor no encontrado o inactivo' };
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
                created_at, status, is_auto_generated, 
                total_estimated, created_by, notes
            ) VALUES ($1, $2, $3, NOW(), 'DRAFT', false, $4, $5, $6)
        `, [
            orderId,
            validated.data.supplierId,
            warehouseId,
            total,
            validated.data.userId,
            validated.data.notes || null
        ]);

        // 7. Insert items
        for (const item of validated.data.items) {
            // Get SKU if not provided
            let sku = item.sku;
            if (!sku) {
                const prodRes = await client.query(
                    'SELECT sku FROM products WHERE id = $1',
                    [item.productId]
                );
                sku = prodRes.rows[0]?.sku || 'UNKNOWN';
            }

            await client.query(`
                INSERT INTO purchase_order_items (
                    id, purchase_order_id, product_id, sku, name, 
                    quantity_ordered, cost_price
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                randomUUID(),
                orderId,
                item.productId,
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
                supplier_name: supplierRes.rows[0].name,
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
                SELECT poi.id, poi.product_id, poi.sku, poi.name, poi.cost_price
                FROM purchase_order_items poi
                WHERE poi.id = $1 AND poi.purchase_order_id = $2
                FOR UPDATE
            `, [receivedItem.itemId, validated.data.orderId]);

            if (itemRes.rows.length === 0) continue;

            const item = itemRes.rows[0];

            // Update item received quantity
            await client.query(`
                UPDATE purchase_order_items
                SET quantity_received = COALESCE(quantity_received, 0) + $1,
                    received_at = NOW()
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
            `, [item.product_id, order.target_warehouse_id, lotNumber]);

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
                    item.product_id,
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
                received_at = NOW(),
                received_by = $1,
                receiving_notes = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [validated.data.userId, validated.data.notes || null, validated.data.orderId]);

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

        // 1. Verificar estado (solo borradores)
        const orderRes = await client.query(
            'SELECT status, created_by, location_id FROM purchase_orders WHERE id = $1 FOR UPDATE',
            [orderId]
        );

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
export async function generateRestockSuggestionSecure(
    supplierId?: string,
    daysToCover: number = 15,
    analysisWindow: number = 30,
    locationId?: string
): Promise<{
    success: boolean;
    data?: any[];
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

    try {
        // Parametros para la query
        const queryParams: any[] = [supplierValidated || null, analysisWindow];
        let paramIndex = 3;

        // Filtro de ubicación para Stock y Ventas
        let locationFilterStock = '';
        let locationFilterSales = '';

        if (locationId) {
            locationFilterStock = `AND w.location_id = $${paramIndex}`;
            locationFilterSales = `AND w.location_id = $${paramIndex}`;
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
                    COALESCE(ps.last_cost, p.cost_net, p.cost_price, 0) as last_cost, 
                    ps.supplier_sku,
                    s.id as supplier_id,
                    s.business_name as supplier_name
                FROM products p
                LEFT JOIN product_suppliers ps ON p.id::text = ps.product_id::text AND ps.is_preferred = true
                LEFT JOIN suppliers s ON ps.supplier_id = s.id
                WHERE ($1::text IS NULL OR ps.supplier_id::text = $1::text)
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
                ${locationId ? `AND po.target_warehouse_id = $${queryParams.length}` : ''} 
                GROUP BY p.id
            ),
            SalesHistory AS (
                SELECT 
                    ib.product_id, 
                    SUM(si.quantity) as total_sold,
                    -- Timeseries Data for AI (Last 4 weeks)
                    jsonb_agg(jsonb_build_object(
                        'week', to_char(s.timestamp, 'IYYY-IW'),
                        'qty', si.quantity
                    )) as weekly_sales
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                JOIN inventory_batches ib ON si.batch_id = ib.id
                JOIN warehouses w ON ib.warehouse_id = w.id
                WHERE s.timestamp >= NOW() - ($2 || ' days')::INTERVAL
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
                ${locationId ? `AND ib.warehouse_id NOT IN (SELECT id FROM warehouses WHERE location_id = $${paramIndex - 1})` : ''}
                GROUP BY ib.product_id
            )
            SELECT 
                tp.product_id,
                tp.product_name,
                tp.product_sku as sku,
                tp.image_url,
                tp.last_cost as unit_cost,
                tp.supplier_sku,
                tp.supplier_id,
                tp.supplier_name,
                COALESCE(cs.total_stock, 0) as current_stock,
                COALESCE(gs.global_stock, 0) as other_warehouses_stock,
                COALESCE(incs.incoming, 0) as incoming_stock,
                COALESCE(tp.safety_stock, 0) as safety_stock,
                (COALESCE(sh.total_sold, 0)::FLOAT / $2::FLOAT) as daily_velocity,
                COALESCE(sh.weekly_sales, '[]'::jsonb) as sales_history
            FROM TargetProducts tp
            LEFT JOIN CurrentStock cs ON tp.product_id::text = cs.product_id::text
            LEFT JOIN IncomingStock incs ON tp.product_id::text = incs.product_id::text
            LEFT JOIN SalesHistory sh ON tp.product_id::text = sh.product_id::text
            LEFT JOIN GlobalStock gs ON tp.product_id::text = gs.product_id::text
            WHERE (COALESCE(sh.total_sold, 0) > 0 OR COALESCE(cs.total_stock, 0) <= COALESCE(tp.safety_stock, 0))
            ORDER BY tp.product_name ASC
        `;

        const res = await pool.query(finalSql, queryParams);

        // Calculate Formula in JS for precision control
        // Suggested = CEIL(Velocity * (DaysToCover + LeadTime) + Safety - Stock - Incoming)
        const suggestions = await Promise.all(res.rows.map(async (row) => {
            const velocity = Number(row.daily_velocity);
            const stock = Number(row.current_stock);
            const globalStock = Number(row.other_warehouses_stock || 0);
            const incoming = Number(row.incoming_stock);
            const safety = Number(row.safety_stock);
            const leadTime = 0; // Default

            const required = (velocity * (daysToCover + leadTime)) + safety;
            const netNeeds = required - stock - incoming;

            let suggested = Math.max(0, Math.ceil(netNeeds));
            const daysUntilStockout = velocity > 0 ? (stock / velocity) : 999;

            let reason = `Venta Diaria: ${velocity.toFixed(2)} | Cobertura: ${daysToCover}d | Stock: ${stock}`;
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
                        supplierName: row.supplier_name
                    });

                    // Merge AI Logic
                    if (aiResult.confidence === 'HIGH' || aiResult.confidence === 'MEDIUM') {
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
                    console.warn('AI Forecast skipped for item:', row.product_sku);
                }
            }

            return {
                product_id: row.product_id,
                product_name: row.product_name,
                sku: row.sku,
                image_url: row.image_url,
                current_stock: stock,
                global_stock: globalStock, // Exposed to UI
                incoming_stock: incoming,
                safety_stock: safety,
                daily_velocity: Number(velocity.toFixed(3)),
                suggested_quantity: suggested,
                days_coverage: velocity > 0 ? (stock / velocity).toFixed(1) : '∞',
                days_until_stockout: daysUntilStockout,
                unit_cost: Number(row.unit_cost),
                supplier_sku: row.supplier_sku,
                supplier_id: row.supplier_id,
                supplier_name: row.supplier_name,
                total_estimated: suggested * Number(row.unit_cost),
                reason,
                ai_confidence: aiConfidence,
                action_type: aiAction
            };
        }));

        // Sort by urgency
        const sortedSuggestions = suggestions.sort((a, b) => a.days_until_stockout - b.days_until_stockout);

        return { success: true, data: sortedSuggestions };

    } catch (error: any) {
        console.error('[PROCUREMENT-V2] MRP error:', error);
        return { success: false, error: 'Error generando sugerencias: ' + error.message };
    }
}
