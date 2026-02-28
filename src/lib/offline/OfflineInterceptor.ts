'use client';
/**
 * OfflineInterceptor — Puente entre el Store de Zustand y SQLite de Electron
 *
 * Este módulo se ejecuta SOLO en Electron. Intercepta los cambios del store
 * para persistirlos en SQLite local y enqueue-a las operaciones para sync.
 *
 * Funciones principales:
 * 1. Al iniciar: Carga datos de SQLite al store si estamos offline
 * 2. Al hacer login online: Copia datos del servidor a SQLite
 * 3. Al hacer una venta offline: Guarda en SQLite + enqueue sync
 * 4. Al abrir/cerrar caja: Guarda en SQLite + enqueue sync
 */

import { isElectronEnv } from '../../hooks/useOfflineDB';

// ─────────────────────────────────────────────────
// TYPES (matching Electron API)
// ─────────────────────────────────────────────────
interface ElectronOfflineAPI {
    offlineDB: {
        getAll: (table: string, where?: Record<string, unknown>, orderBy?: string) => Promise<unknown[]>;
        getById: (table: string, id: string) => Promise<unknown | null>;
        upsert: (table: string, data: Record<string, unknown>) => Promise<unknown>;
        upsertMany: (table: string, rows: Record<string, unknown>[]) => Promise<{ success: boolean; count: number }>;
        delete: (table: string, id: string) => Promise<unknown>;
        count: (table: string, where?: Record<string, unknown>) => Promise<number>;
        query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
    };
    sync: {
        enqueue: (table: string, operation: string, recordId: string, payload: unknown) => Promise<{ success: boolean }>;
        sendPullResponse: (table: string, rows: unknown[]) => void;
        onPullRequest: (callback: (data: { tables: string[] }) => void) => void;
    };
}

function getAPI(): ElectronOfflineAPI | null {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
        return (window as any).electronAPI;
    }
    return null;
}

// ─────────────────────────────────────────────────
// MIRROR: Copiar datos del store online a SQLite
// ─────────────────────────────────────────────────

/**
 * Copia datos del servidor (ya en el store) a SQLite local.
 * Llamar después de un syncData exitoso para tener datos offline.
 */
export async function mirrorStoreToSQLite(storeState: {
    employees?: unknown[];
    locations?: unknown[];
    inventory?: unknown[];
    customers?: unknown[];
    suppliers?: unknown[];
    salesHistory?: unknown[];
}) {
    const api = getAPI();
    if (!api) return;

    const tasks: Promise<unknown>[] = [];

    // Mirror employees to users table
    if (storeState.employees?.length) {
        const users = (storeState.employees as any[]).map(e => ({
            id: e.id,
            name: e.full_name || e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
            rut: e.rut || null,
            email: e.email || null,
            pin_hash: e.access_pin || null,
            role: e.role || 'vendedor',
            location_id: e.assigned_location_id || null,
            is_active: e.is_active !== false ? 1 : 0,
            permissions: e.permissions ? JSON.stringify(e.permissions) : null,
            updated_at: new Date().toISOString(),
        }));
        tasks.push(api.offlineDB.upsertMany('users', users));
    }

    // Mirror locations
    if (storeState.locations?.length) {
        const locations = (storeState.locations as any[]).map(l => ({
            id: l.id,
            name: l.name,
            address: l.address || null,
            city: l.city || null,
            phone: l.phone || null,
            is_active: l.is_active !== false ? 1 : 0,
            config: l.config ? JSON.stringify(l.config) : null,
            updated_at: new Date().toISOString(),
        }));
        tasks.push(api.offlineDB.upsertMany('locations', locations));
    }

    // Mirror inventory
    if (storeState.inventory?.length) {
        const batches = (storeState.inventory as any[]).map(b => ({
            id: b.id,
            product_id: b.product_id || b.sku || b.id,
            location_id: b.location_id || '',
            warehouse_id: b.warehouse_id || null,
            batch_number: b.batch_number || b.lote || null,
            expiry_date: b.expiry_date ? new Date(b.expiry_date).toISOString() : null,
            quantity: b.stock_actual ?? b.quantity ?? 0,
            reserved_quantity: b.reserved_quantity || 0,
            cost_price: b.cost_price ?? b.precio_costo ?? 0,
            sell_price: b.sell_price ?? b.precio_venta ?? 0,
            updated_at: new Date().toISOString(),
        }));

        // Also extract unique products
        const productsMap = new Map<string, Record<string, unknown>>();
        for (const b of storeState.inventory as any[]) {
            const productId = b.product_id || b.sku || b.id;
            if (!productsMap.has(productId)) {
                productsMap.set(productId, {
                    id: productId,
                    sku: b.sku || null,
                    barcode: b.barcode || null,
                    name: b.product_name || b.name || 'Sin nombre',
                    generic_name: b.generic_name || null,
                    lab: b.lab || b.laboratory || null,
                    category: b.category || null,
                    requires_prescription: b.requires_prescription ? 1 : 0,
                    is_controlled: b.is_controlled ? 1 : 0,
                    is_refrigerated: b.is_refrigerated ? 1 : 0,
                    is_active: b.is_active !== false ? 1 : 0,
                    updated_at: new Date().toISOString(),
                });
            }
        }

        if (productsMap.size > 0) {
            tasks.push(api.offlineDB.upsertMany('products', Array.from(productsMap.values())));
        }
        tasks.push(api.offlineDB.upsertMany('inventory_batches', batches));
    }

    // Mirror customers
    if (storeState.customers?.length) {
        const clients = (storeState.customers as any[]).map(c => ({
            id: c.id,
            name: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            rut: c.rut || null,
            email: c.email || null,
            phone: c.phone || null,
            address: c.address || null,
            loyalty_points: c.totalPoints || c.loyalty_points || 0,
            is_active: 1,
            updated_at: new Date().toISOString(),
        }));
        tasks.push(api.offlineDB.upsertMany('clients', clients));
    }

    await Promise.all(tasks);
    console.log('[OfflineInterceptor] ✅ Store mirrored to SQLite');
}

// ─────────────────────────────────────────────────
// LOAD: Cargar datos de SQLite al store (cuando offline)
// ─────────────────────────────────────────────────

/**
 * Carga datos desde SQLite local.
 * Retorna datos en el formato que el store espera.
 */
export async function loadFromSQLite(): Promise<{
    users: unknown[];
    locations: unknown[];
    products: unknown[];
    inventory: unknown[];
    clients: unknown[];
} | null> {
    const api = getAPI();
    if (!api) return null;

    const [users, locations, products, inventory, clients] = await Promise.all([
        api.offlineDB.getAll('users', { is_active: 1 }),
        api.offlineDB.getAll('locations', { is_active: 1 }),
        api.offlineDB.getAll('products', { is_active: 1 }),
        api.offlineDB.getAll('inventory_batches'),
        api.offlineDB.getAll('clients', { is_active: 1 }),
    ]);

    return { users, locations, products, inventory, clients };
}

// ─────────────────────────────────────────────────
// OFFLINE OPERATIONS
// ─────────────────────────────────────────────────

/** Guardar una venta offline en SQLite y encolar sync */
export async function saveOfflineSale(sale: {
    id: string;
    locationId: string;
    terminalId: string;
    cashierId: string;
    customerId?: string;
    items: Array<{
        id: string;
        productId: string;
        batchId?: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        tax: number;
        total: number;
    }>;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    paymentMethod: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        // Save sale header
        await api.offlineDB.upsert('sales', {
            id: sale.id,
            location_id: sale.locationId,
            terminal_id: sale.terminalId,
            cashier_id: sale.cashierId,
            customer_id: sale.customerId || null,
            subtotal: sale.subtotal,
            tax: sale.tax,
            discount: sale.discount,
            total: sale.total,
            payment_method: sale.paymentMethod,
            status: 'completed',
            synced: 0,
        });

        // Save sale items
        for (const item of sale.items) {
            await api.offlineDB.upsert('sale_items', {
                id: item.id,
                sale_id: sale.id,
                product_id: item.productId,
                batch_id: item.batchId || null,
                product_name: item.productName,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                discount: item.discount,
                tax: item.tax,
                total: item.total,
            });

            // Update local stock
            if (item.batchId) {
                const batch = await api.offlineDB.getById('inventory_batches', item.batchId) as any;
                if (batch) {
                    await api.offlineDB.upsert('inventory_batches', {
                        ...batch,
                        quantity: Math.max(0, (batch.quantity || 0) - item.quantity),
                    });
                }
            }
        }

        // Enqueue for sync
        await api.sync.enqueue('sales', 'INSERT', sale.id, sale);

        console.log(`[OfflineInterceptor] 💾 Sale saved offline: ${sale.id}`);
        return true;
    } catch (err) {
        console.error('[OfflineInterceptor] ❌ Failed to save offline sale:', err);
        return false;
    }
}

/** Guardar operación de caja offline */
export async function saveOfflineCashOperation(operation: {
    type: 'open' | 'close' | 'movement';
    sessionId: string;
    locationId: string;
    terminalId: string;
    cashierId: string;
    amount: number;
    data: Record<string, unknown>;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        if (operation.type === 'open') {
            await api.offlineDB.upsert('cash_sessions', {
                id: operation.sessionId,
                location_id: operation.locationId,
                terminal_id: operation.terminalId,
                cashier_id: operation.cashierId,
                opening_amount: operation.amount,
                status: 'open',
                synced: 0,
                ...operation.data,
            });
            await api.sync.enqueue('cash_sessions', 'INSERT', operation.sessionId, operation);
        } else if (operation.type === 'close') {
            await api.offlineDB.upsert('cash_sessions', {
                id: operation.sessionId,
                closing_amount: operation.amount,
                status: 'closed',
                closed_at: new Date().toISOString(),
                synced: 0,
                ...operation.data,
            });
            await api.sync.enqueue('cash_sessions', 'UPDATE', operation.sessionId, operation);
        } else if (operation.type === 'movement') {
            const movementId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await api.offlineDB.upsert('cash_movements', {
                id: movementId,
                session_id: operation.sessionId,
                type: (operation.data.type as string) || 'deposit',
                amount: operation.amount,
                description: (operation.data.description as string) || '',
                created_by: operation.cashierId,
                synced: 0,
            });
            await api.sync.enqueue('cash_movements', 'INSERT', movementId, {
                ...operation,
                movementId,
            });
        }

        console.log(`[OfflineInterceptor] 💾 Cash ${operation.type} saved offline`);
        return true;
    } catch (err) {
        console.error('[OfflineInterceptor] ❌ Failed to save cash operation:', err);
        return false;
    }
}

/** Guardar movimiento WMS offline */
export async function saveOfflineWMSMovement(movement: {
    id: string;
    type: 'reception' | 'dispatch' | 'transfer' | 'adjustment' | 'return';
    productId: string;
    batchId?: string;
    quantity: number;
    sourceLocationId?: string;
    destinationLocationId?: string;
    reason?: string;
    createdBy: string;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('wms_movements', {
            id: movement.id,
            type: movement.type,
            product_id: movement.productId,
            batch_id: movement.batchId || null,
            quantity: movement.quantity,
            source_location_id: movement.sourceLocationId || null,
            destination_location_id: movement.destinationLocationId || null,
            reason: movement.reason || null,
            created_by: movement.createdBy,
            synced: 0,
        });

        // Update local stock for adjustments
        if (movement.batchId && (movement.type === 'adjustment' || movement.type === 'dispatch')) {
            const batch = await api.offlineDB.getById('inventory_batches', movement.batchId) as any;
            if (batch) {
                const delta = movement.type === 'dispatch' ? -movement.quantity : movement.quantity;
                await api.offlineDB.upsert('inventory_batches', {
                    ...batch,
                    quantity: Math.max(0, (batch.quantity || 0) + delta),
                });
            }
        }

        await api.sync.enqueue('wms_movements', 'INSERT', movement.id, movement);
        console.log(`[OfflineInterceptor] 💾 WMS ${movement.type} saved offline`);
        return true;
    } catch (err) {
        console.error('[OfflineInterceptor] ❌ Failed to save WMS movement:', err);
        return false;
    }
}

// ─────────────────────────────────────────────────
// PULL REQUEST HANDLER (responds to syncService requests)
// ─────────────────────────────────────────────────

/**
 * Inicializar el handler de pull requests.
 * Cuando syncService pide datos frescos del servidor (pull),
 * el renderer fetchea y envía la respuesta.
 */
export function initPullHandler(fetchFunctions: {
    fetchLocations: () => Promise<unknown[]>;
    fetchUsers: () => Promise<unknown[]>;
    fetchProducts: () => Promise<unknown[]>;
    fetchInventory: () => Promise<unknown[]>;
    fetchClients: () => Promise<unknown[]>;
}) {
    const api = getAPI();
    if (!api) return;

    api.sync.onPullRequest(async (data) => {
        console.log(`[OfflineInterceptor] 📥 Pull request for: ${data.tables.join(', ')}`);

        for (const table of data.tables) {
            try {
                let rows: unknown[] = [];

                switch (table) {
                    case 'locations':
                        rows = await fetchFunctions.fetchLocations();
                        break;
                    case 'users':
                        rows = await fetchFunctions.fetchUsers();
                        break;
                    case 'products':
                        rows = await fetchFunctions.fetchProducts();
                        break;
                    case 'inventory_batches':
                        rows = await fetchFunctions.fetchInventory();
                        break;
                    case 'clients':
                        rows = await fetchFunctions.fetchClients();
                        break;
                }

                if (rows.length > 0) {
                    api.sync.sendPullResponse(table, rows);
                }
            } catch (err) {
                console.error(`[OfflineInterceptor] Pull failed for ${table}:`, err);
            }
        }
    });
}
