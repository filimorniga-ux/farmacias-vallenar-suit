'use server';

/**
 * ============================================================================
 * SYNC-V2: Sincronización Segura de Datos Maestros
 * Pharma-Synapse v3.1 - Security Hardened
 * ============================================================================
 * 
 * CORRECCIONES DE SEGURIDAD:
 * - NUNCA retorna access_pin ni access_pin_hash
 * - Audita cada acceso a datos maestros
 * - Filtra por ubicación asignada del usuario
 * - Solo usuarios autenticados pueden acceder
 * - Paginación para evitar sobrecarga
 */

import { query } from '@/lib/db';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { classifyPgError } from '@/lib/db-errors';
import { createCorrelationId, type ActionFailure } from '@/lib/action-response';
import { InventoryBatch, Location } from '@/domain/types';
import { getValidatedSession } from '@/lib/server-session';

// ============================================================================
// SCHEMAS
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const FetchInventorySchema = z.object({
    warehouseId: UUIDSchema.optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(500).default(200),
});

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    const session = await getValidatedSession();
    if (!session) return null;

    return {
        userId: session.userId,
        role: session.role,
        locationId: session.locationId,
    };
}

function hasGlobalSyncScope(role: string) {
    return ['ADMIN', 'GERENTE_GENERAL'].includes(String(role || '').toUpperCase());
}

async function resolveAllowedWarehouseScope(
    session: { role: string; locationId?: string },
    requestedWarehouseId?: string,
): Promise<{ success: true; warehouseId?: string; locationId?: string } | { success: false; error: string }> {
    if (hasGlobalSyncScope(session.role)) {
        return {
            success: true,
            warehouseId: requestedWarehouseId,
            locationId: session.locationId,
        };
    }

    if (!session.locationId) {
        return { success: false, error: 'No tienes una ubicación asignada' };
    }

    if (!requestedWarehouseId) {
        return { success: true, locationId: session.locationId };
    }

    const res = await query(
        'SELECT location_id::text AS location_id FROM warehouses WHERE id::text = $1::text LIMIT 1',
        [requestedWarehouseId],
    );

    const warehouseLocationId = String(res.rows[0]?.location_id || '');
    if (!warehouseLocationId) {
        return { success: false, error: 'Bodega no encontrada' };
    }

    if (warehouseLocationId !== session.locationId) {
        return { success: false, error: 'Acceso denegado a otra bodega' };
    }

    return {
        success: true,
        warehouseId: requestedWarehouseId,
        locationId: warehouseLocationId,
    };
}

async function auditDataAccess(userId: string, action: string, details: Record<string, any>): Promise<void> {
    try {
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, new_values, created_at)
            VALUES ($1, $2, 'DATA_SYNC', $3::jsonb, NOW())
        `, [userId, action, JSON.stringify(details)]);
    } catch (error) {
        logger.warn({ error }, '[Sync] Audit log failed');
    }
}

// ============================================================================
// INVENTARIO
// ============================================================================

/**
 * 📦 Fetch Inventory Securely
 * - Audita el acceso
 * - Paginación incluida
 */
export async function fetchInventorySecure(
    warehouseId?: string,
    options?: { page?: number; pageSize?: number }
): Promise<{ success: boolean; data?: InventoryBatch[]; total?: number; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const validated = FetchInventorySchema.safeParse({
        warehouseId,
        page: options?.page,
        pageSize: options?.pageSize,
    });

    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message };
    }

    const { page, pageSize } = validated.data;
    const offset = (page - 1) * pageSize;

    try {
        const warehouseScope = await resolveAllowedWarehouseScope(session, warehouseId);
        if (!warehouseScope.success) {
            return { success: false, error: warehouseScope.error };
        }

        // Construir query
        let sql = `
            SELECT 
                p.id as product_id, p.sku, p.name, p.dci, p.category,
                p.units_per_box, p.price_sell_box, p.format,
                ib.id as batch_id, ib.warehouse_id, ib.lot_number,
                ib.expiry_date, ib.quantity_real, ib.unit_cost, ib.sale_price
            FROM inventory_batches ib
            JOIN products p ON ib.product_id::text = p.id::text
        `;

        const params: any[] = [];
        let paramIndex = 1;
        const whereClauses: string[] = [];

        if (warehouseScope.warehouseId) {
            whereClauses.push(`ib.warehouse_id::text = $${paramIndex++}`);
            params.push(warehouseScope.warehouseId);
        } else if (warehouseScope.locationId) {
            whereClauses.push(`(
                ib.location_id::text = $${paramIndex}
                OR ib.warehouse_id IN (
                    SELECT id FROM warehouses WHERE location_id::text = $${paramIndex}::text
                )
            )`);
            params.push(warehouseScope.locationId);
            paramIndex += 1;
        }

        if (whereClauses.length > 0) {
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        // Count total
        const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
        const countRes = await query(countSql, params);
        const total = parseInt(countRes.rows[0]?.total || '0');

        // Paginated data
        sql += ` ORDER BY p.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(pageSize, offset);

        const res = await query(sql, params);

        // Auditar acceso
        await auditDataAccess(session.userId, 'DATA_SYNC', {
            type: 'INVENTORY',
            warehouse_id: warehouseScope.warehouseId || 'SCOPED',
            rows_returned: res.rows.length,
            page,
        });

        logger.info({ userId: session.userId, count: res.rows.length }, '📦 [Sync] Inventory fetched');

        const data: InventoryBatch[] = res.rows.map((row: any) => ({
            id: row.batch_id?.toString() || row.product_id?.toString(),
            sku: row.sku || 'UNKNOWN',
            name: row.name || 'Sin Nombre',
            dci: row.dci || '',
            laboratory: 'GENERICO',
            format: row.format || 'CAJA',
            units_per_box: Number(row.units_per_box) || 1,
            stock_actual: Number(row.quantity_real) || 0,
            lot_number: row.lot_number || '',
            expiry_date: row.expiry_date ? new Date(row.expiry_date).getTime() : Date.now() + 31536000000,
            price: Number(row.sale_price) || 0,
            cost_price: Number(row.unit_cost) || 0,
            location_id: row.warehouse_id?.toString() || 'UNKNOWN',
            category: row.category || 'MEDICAMENTO',
            condition: 'VD' as any,
            stock_min: 5,
            stock_max: 100,
            is_bioequivalent: false,
            allows_commission: false,
            active_ingredients: [],
            supplier_id: 'SUP-001',
            isp_register: '',
            concentration: '',
            unit_count: 1,
            is_generic: false,
            bioequivalent_status: 'NO_BIOEQUIVALENTE' as any,
            cost_net: 0,
            tax_percent: 19,
            price_sell_box: Number(row.sale_price) || 0,
            price_sell_unit: 0,
        }));

        return { success: true, data, total };

    } catch (error: any) {
        logger.error({ error }, '[Sync] Fetch inventory error');
        return { success: false, error: 'Error obteniendo inventario' };
    }
}

// ============================================================================
// EMPLEADOS - SIN access_pin
// ============================================================================

export interface SafeEmployeeProfile {
    id: string;
    rut: string;
    name: string;
    role: string;
    assigned_location_id?: string;
    status: string;
    job_title: string;
    is_active: boolean;
    token_version?: number;
    // NUNCA incluir access_pin ni access_pin_hash
}

/**
 * 👥 Fetch Employees Securely
 * - NUNCA retorna access_pin
 * - Solo usuarios autenticados
 */
export async function fetchEmployeesSecure(
    includeInactive: boolean = false
): Promise<{ success: boolean; data?: SafeEmployeeProfile[]; error?: string }> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        // IMPORTANTE: NO seleccionar access_pin ni access_pin_hash
        let sql = `
            SELECT 
                id, rut, name, role, 
                assigned_location_id, status, job_title, is_active, token_version
            FROM users 
            WHERE ($1 = true OR is_active = true)
        `;
        const params: any[] = [includeInactive];

        if (!hasGlobalSyncScope(session.role)) {
            if (session.locationId) {
                sql += ` AND assigned_location_id::text = $2::text`;
                params.push(session.locationId);
            } else {
                sql += ` AND id::text = $2::text`;
                params.push(session.userId);
            }
        }

        sql += `
            ORDER BY 
                CASE WHEN role = 'ADMIN' THEN 1 
                     WHEN role = 'GERENTE_GENERAL' THEN 2
                     WHEN role = 'MANAGER' THEN 3 
                     ELSE 4 END,
                name ASC
        `;

        const res = await query(sql, params);

        // Auditar
        await auditDataAccess(session.userId, 'DATA_SYNC', {
            type: 'EMPLOYEES',
            include_inactive: includeInactive,
            rows_returned: res.rows.length,
            location_id: hasGlobalSyncScope(session.role) ? 'ALL' : session.locationId || session.userId,
        });

        logger.info({ userId: session.userId, count: res.rows.length }, '👥 [Sync] Employees fetched');

        const data: SafeEmployeeProfile[] = res.rows.map((row: any) => ({
            id: row.id.toString(),
            rut: row.rut || '',
            name: row.name || '',
            role: row.role || 'STAFF',
            assigned_location_id: row.assigned_location_id?.toString(),
            status: row.status || 'ACTIVE',
            job_title: row.job_title || 'EMPLEADO',
            is_active: row.is_active !== false,
            token_version: Number(row.token_version) || 0,
            // NO SE INCLUYE access_pin
        }));

        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Sync] Fetch employees error');
        return { success: false, error: 'Error obteniendo empleados' };
    }
}

// ============================================================================
// LOGIN HELPERS
// ============================================================================

/**
 * 🔓 Get Users For Login (Public)
 * - Permite cargar usuarios para la pantalla de login sin sesión activa
 * - Retorna solo datos básicos necesarios para la UI de selección
 * - Opcionalmente filtra por ubicación asignada (para kiosko de asistencia)
 */
export async function getUsersForLoginSecure(
    locationId?: string
): Promise<{ success: true; data: SafeEmployeeProfile[] } | ActionFailure> {
    const correlationId = createCorrelationId();
    try {
        // No checks de sesión aquí - es público para el login

        let sql = `
            SELECT 
                id, rut, name, role, 
                assigned_location_id, status, job_title, is_active
            FROM users 
            WHERE is_active = true
        `;

        const params: any[] = [];

        // Filtrar por ubicación si se proporciona
        if (locationId) {
            sql += ` AND assigned_location_id = $1`;
            params.push(locationId);
        }

        sql += `
            ORDER BY 
                CASE WHEN role = 'ADMIN' THEN 1 
                     WHEN role = 'GERENTE_GENERAL' THEN 2
                     WHEN role = 'MANAGER' THEN 3 
                     ELSE 4 END,
                name ASC
        `;

        const res = await query(sql, params);

        // Sin auditoría de usuario porque no hay sesión aún

        const data: SafeEmployeeProfile[] = res.rows.map((row: any) => ({
            id: row.id.toString(),
            rut: row.rut || '',
            name: row.name || '',
            role: row.role || 'STAFF',
            assigned_location_id: row.assigned_location_id?.toString(),
            status: row.status || 'ACTIVE',
            job_title: row.job_title || 'EMPLEADO',
            is_active: row.is_active !== false,
        }));

        return { success: true, data };

    } catch (error) {
        const classified = classifyPgError(error);

        Sentry.captureException(error, {
            tags: {
                module: 'sync-v2',
                action: 'getUsersForLoginSecure',
                code: classified.code,
            },
            extra: {
                correlationId,
                locationId: locationId || null,
                retryable: classified.retryable,
            },
        });

        logger.error(
            {
                correlationId,
                code: classified.code,
                retryable: classified.retryable,
                technicalMessage: classified.technicalMessage,
                locationId: locationId || null,
            },
            '[Sync] Get users for login failed'
        );

        return {
            success: false,
            error: classified.userMessage,
            code: classified.code,
            retryable: classified.retryable,
            correlationId,
            userMessage: classified.userMessage,
        };
    }
}


// ============================================================================
// PROVEEDORES
// ============================================================================

/**
 * 🏭 Fetch Suppliers Securely
 */
export async function fetchSuppliersSecure(): Promise<{
    success: boolean;
    data?: any[];
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const res = await query(`
            SELECT id, rut, business_name, fantasy_name, contact_email, 
                   payment_terms, address, phone_1 as phone, is_active
            FROM suppliers 
            WHERE is_active = true
            ORDER BY business_name ASC
        `);

        await auditDataAccess(session.userId, 'DATA_SYNC', {
            type: 'SUPPLIERS',
            rows_returned: res.rows.length,
        });

        logger.info({ userId: session.userId, count: res.rows.length }, '🏭 [Sync] Suppliers fetched');

        return {
            success: true,
            data: res.rows.map((row: any) => ({
                id: row.id.toString(),
                rut: row.rut || '',
                business_name: row.business_name || '',
                fantasy_name: row.fantasy_name || row.business_name || '',
                contact_email: row.contact_email || '',
                payment_terms: row.payment_terms || 'CONTADO',
                address: row.address || '',
                phone: row.phone || '',
                is_active: row.is_active !== false,
            })),
        };

    } catch (error: any) {
        logger.error({ error }, '[Sync] Fetch suppliers error');
        return { success: false, error: 'Error obteniendo proveedores' };
    }
}

// ============================================================================
// UBICACIONES
// ============================================================================

/**
 * 📍 Fetch Locations Securely
 * - Filtra por rol: ADMIN ve todas, otros ven solo la asignada
 */
export async function fetchLocationsSecure(): Promise<{
    success: boolean;
    data?: Location[];
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        let sql = 'SELECT * FROM locations WHERE is_active = true';
        const params: any[] = [];

        // Solo ADMIN/GERENTE_GENERAL ven todas. El resto queda anclado a su ubicación.
        if (!hasGlobalSyncScope(session.role) && session.locationId) {
            sql += ' AND id = $1';
            params.push(session.locationId);
        }

        sql += ' ORDER BY name ASC';

        const res = await query(sql, params);

        await auditDataAccess(session.userId, 'DATA_SYNC', {
            type: 'LOCATIONS',
            rows_returned: res.rows.length,
            filtered_by_role: !hasGlobalSyncScope(session.role),
        });

        logger.info({ userId: session.userId, count: res.rows.length }, '📍 [Sync] Locations fetched');

        const data: Location[] = res.rows.map((row: any) => ({
            id: row.id.toString(),
            type: row.type || 'STORE',
            name: row.name || '',
            address: row.address || '',
            associated_kiosks: [],
            parent_id: row.parent_id?.toString(),
            default_warehouse_id: row.default_warehouse_id?.toString(),
            is_active: row.is_active !== false,
        }));

        return { success: true, data };

    } catch (error: any) {
        logger.error({ error }, '[Sync] Fetch locations error');
        return { success: false, error: 'Error obteniendo ubicaciones' };
    }
}

// ============================================================================
// SYNC COMPLETO
// ============================================================================

/**
 * 🔄 Sync All Data Securely
 * - Retorna todo en una sola llamada
 * - Audita la sincronización completa
 */
export async function syncAllDataSecure(
    warehouseId?: string
): Promise<{
    success: boolean;
    data?: {
        inventory: InventoryBatch[];
        employees: SafeEmployeeProfile[];
        suppliers: any[];
        locations: Location[];
    };
    error?: string;
}> {
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const [inventoryRes, employeesRes, suppliersRes, locationsRes] = await Promise.all([
            fetchInventorySecure(warehouseId),
            fetchEmployeesSecure(),
            fetchSuppliersSecure(),
            fetchLocationsSecure(),
        ]);

        if (!inventoryRes.success || !employeesRes.success || !suppliersRes.success || !locationsRes.success) {
            return { success: false, error: 'Error en sincronización parcial' };
        }

        await auditDataAccess(session.userId, 'DATA_SYNC', {
            type: 'FULL_SYNC',
            warehouse_id: warehouseId || 'ALL',
            inventory_count: inventoryRes.data?.length || 0,
            employees_count: employeesRes.data?.length || 0,
            suppliers_count: suppliersRes.data?.length || 0,
            locations_count: locationsRes.data?.length || 0,
        });

        logger.info({ userId: session.userId }, '🔄 [Sync] Full sync completed');

        return {
            success: true,
            data: {
                inventory: inventoryRes.data || [],
                employees: employeesRes.data || [],
                suppliers: suppliersRes.data || [],
                locations: locationsRes.data || [],
            },
        };

    } catch (error: any) {
        logger.error({ error }, '[Sync] Full sync error');
        return { success: false, error: 'Error en sincronización' };
    }
}
