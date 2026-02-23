import { SaleTransaction, InventoryBatch, EmployeeProfile, CashMovement, Expense } from '../types';

/**
 * TigerDataService - Abstraction layer for data persistence
 * 
 * This service simulates API calls to Tiger Data with network latency.
 * Functions are prepared for future integration with real API endpoints.
 * 
 * Current Mode: SIMULATION (using setTimeout)
 * Future Mode: Replace with fetch/axios calls to Tiger Data API
 */

const SIMULATE_NETWORK_DELAY = 200; // ms - Faster for dev
const SIMULATE_FAILURE_RATE = 0; // 0% chance of failure - Stable for dev
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Simulated in-memory storage (will be replaced by real DB)
const inMemoryStorage = {
    sales: [] as SaleTransaction[],
    cashMovements: [] as CashMovement[],
    expenses: [] as Expense[],
    products: [] as InventoryBatch[],
    employees: [] as EmployeeProfile[]
};

function normalizeLocationId(locationId?: string): string | undefined {
    if (typeof locationId !== 'string') return undefined;
    const trimmed = locationId.trim();
    if (!trimmed) return undefined;
    return UUID_REGEX.test(trimmed) ? trimmed : undefined;
}

/**
 * Simulate network delay and potential failures
 */
const simulateNetworkCall = async <T>(
    operation: () => T,
    operationName: string
): Promise<T> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // Simulate random network failures
            if (Math.random() < SIMULATE_FAILURE_RATE) {
                console.error(`❌ [Tiger Data] ${operationName} failed (simulated network error)`);
                reject(new Error(`Network error: ${operationName} failed`));
                return;
            }

            try {
                const result = operation();
                console.log(`✅ [Tiger Data] ${operationName} successful`);
                resolve(result);
            } catch (error) {
                console.error(`❌ [Tiger Data] ${operationName} error:`, error);
                reject(error);
            }
        }, SIMULATE_NETWORK_DELAY);
    });
};

export const TigerDataService = {
    /**
     * 0. Bulk Upload Inventory (Chunks)
     */
    uploadBulkInventory: async (
        products: InventoryBatch[],
        onProgress?: (progress: number, message: string) => void
    ) => {
        const BATCH_SIZE = 50; // Enviar de a 50 para no saturar
        const total = products.length;
        let processed = 0;

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const chunk = products.slice(i, i + BATCH_SIZE);
            let retries = 3;
            let success = false;

            while (retries > 0 && !success) {
                try {
                    // Llamada al API Route que maneja la transacción SQL
                    const response = await fetch('/api/inventory/batch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ products: chunk }),
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        const errorMessage = `${errorData.error} - Details: ${errorData.details || 'No details'} (Code: ${errorData.code || 'N/A'})`;
                        throw new Error(errorMessage);
                    }

                    processed += chunk.length;
                    success = true;

                    // Actualizar barra de progreso si existe callback
                    if (onProgress) {
                        const percentage = Math.round((processed / total) * 100);
                        onProgress(percentage, `Guardando ${processed} de ${total}...`);
                    }

                } catch (error) {
                    console.error(`Error en carga masiva (Intento ${4 - retries}/3):`, error);
                    retries--;
                    if (retries === 0) {
                        throw error; // Detener proceso si falla tras 3 intentos
                    }
                    // Wait 1 second before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        return { success: true, count: total };
    },

    /**
     * 1. Fetch Inventory (Strict Location Filter)
     * Updated to use getInventory from actions/inventory.ts
     */
    /**
     * 1. Fetch Inventory (Legacy - Fetch ALL for POS/Offline)
     * Calls secure action with pagination: false
     */
    fetchInventory: async (locationId?: string): Promise<InventoryBatch[]> => {
        const normalizedLocationId = normalizeLocationId(locationId);
        console.log('🐯 [Tiger Data] Fetching FULL inventory for location:', normalizedLocationId || 'ALL');

        if (!normalizedLocationId) return [];

        try {
            const { getInventorySecure } = await import('../../actions/inventory-v2');
            // Explicitly disable pagination to get all items
            const result = await getInventorySecure(normalizedLocationId, { pagination: false });

            if (result.success && result.data) {
                console.log(`✅ [Tiger Data] Loaded ${result.data.length} items (FULL) from DB`);
                return result.data as InventoryBatch[];
            }
            return [];
        } catch (error) {
            console.error('❌ [Tiger Data] Full Inventory Fetch failed:', error);
            return [];
        }
    },

    /**
     * 1.1 Fetch Inventory Lite (WMS)
     * Solo lotes con stock disponible para acelerar Transferencia/Despacho
     */
    fetchInventoryWMS: async (locationId?: string): Promise<InventoryBatch[]> => {
        console.log('🐯 [Tiger Data] Fetching WMS inventory (lite) for location:', locationId);

        if (!locationId) return [];

        try {
            const { getWMSInventorySecure } = await import('../../actions/inventory-v2');
            const result = await getWMSInventorySecure(locationId);

            if (result.success && result.data) {
                console.log(`✅ [Tiger Data] Loaded ${result.data.length} items (WMS lite) from DB`);
                return result.data as InventoryBatch[];
            }
            return [];
        } catch (error) {
            console.error('❌ [Tiger Data] WMS Inventory Fetch failed:', error);
            return [];
        }
    },

    /**
     * 1.1 Fetch Inventory Paged (For Management UI)
     */
    fetchInventoryPaged: async (
        locationId: string,
        params: {
            page?: number;
            limit?: number;
            search?: string;
            category?: 'ALL' | 'MEDS' | 'RETAIL' | 'DETAIL' | 'CONTROLLED';
            stockStatus?: 'CRITICAL' | 'EXPIRING' | 'NORMAL' | 'ALL';
            incomplete?: boolean;
        }
    ): Promise<{ data: InventoryBatch[]; meta: { total: number; page: number; totalPages: number } }> => {
        console.log('🐯 [Tiger Data] Fetching PAGED inventory:', params);

        try {
            const { getInventorySecure } = await import('../../actions/inventory-v2');
            const result = await getInventorySecure(locationId, { ...params, pagination: true });

            if (result.success && result.data) {
                return {
                    data: result.data as InventoryBatch[],
                    meta: result.meta || { total: 0, page: 1, totalPages: 1 }
                };
            }
            throw new Error(result.error || 'Failed to fetch paged inventory');
        } catch (error) {
            console.error('❌ [Tiger Data] Paged Fetch failed:', error);
            // Don't swallow error, let React Query handle it (it will show error state in UI)
            throw new Error(error instanceof Error ? error.message : 'Failed to fetch inventory');
        }
    },

    /**
     * 1b. Fetch Customers
     */
    fetchCustomers: async (): Promise<any[]> => {
        console.log('🐯 [Tiger Data] Fetching customers...');
        try {
            const { getCustomersSecure } = await import('../../actions/customers-v2');
            const result = await getCustomersSecure();
            if (result.success && result.data) {
                console.log(`✅ [Tiger Data] Loaded ${result.data.customers.length} customers`);
                return result.data.customers;
            }
            return [];
        } catch (error) {
            console.error('❌ [Tiger Data] Fetch Customers failed:', error);
            return [];
        }
    },

    /**
     * 2. Save Sale Transaction (CRITICAL)
     */
    saveSaleTransaction: async (
        saleData: SaleTransaction,
        locationId: string,
        terminalId?: string
    ): Promise<{ success: boolean; transactionId: string; error?: string }> => {
        try {
            const { createSaleSecure } = await import('../../actions/sales-v2');

            // Map SaleTransaction (snake_case) to createSaleSecure format (camelCase)
            const mappedParams = {
                locationId: saleData.branch_id || locationId,
                terminalId: saleData.terminal_id || terminalId || '',
                sessionId: saleData.session_id || '',
                userId: saleData.seller_id || '',
                items: saleData.items.map(item => ({
                    batch_id: item.batch_id,
                    sku: item.sku,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    discount: item.discount || 0
                })),
                paymentMethod: saleData.payment_method as 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER' | 'MIXED',
                customerRut: saleData.customer?.rut,
                customerName: saleData.customer?.fullName || saleData.customer?.name,
                pointsRedeemed: saleData.points_redeemed || 0,
                pointsDiscount: saleData.points_discount || 0,
                transferId: saleData.transfer_id,
                notes: saleData.notes
            };

            // 🔍 DEBUG: Log all IDs for diagnosis
            console.log('🔍 [Tiger Data] Sale params:', {
                locationId: mappedParams.locationId,
                terminalId: mappedParams.terminalId,
                sessionId: mappedParams.sessionId,
                userId: mappedParams.userId,
                itemCount: mappedParams.items.length,
                firstItemBatchId: mappedParams.items[0]?.batch_id,
                paymentMethod: mappedParams.paymentMethod
            });

            const result = await createSaleSecure(mappedParams);

            if (result.success && result.saleId) {
                console.log(`✅ [Tiger Data] Sale saved to DB: ${result.saleId}`);
                inMemoryStorage.sales.push(saleData);
                return { success: true, transactionId: result.saleId as string };
            } else {
                return { success: false, transactionId: '', error: result.error || 'Server action failed' };
            }
        } catch (error) {
            console.error('❌ [Tiger Data] DB Save failed:', error);
            return {
                success: false,
                transactionId: '',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    },

    /**
     * 3. Save Cash Movement
     */
    saveCashMovement: async (
        movement: CashMovement
    ): Promise<{ success: boolean; movementId: string }> => {
        try {
            const { createCashMovementSecure } = await import('../../actions/cash-v2');
            const result = await createCashMovementSecure(movement as any);
            if (result.success && result.movementId) {
                console.log(`💵 [Tiger Data] Cash movement saved to DB: ${result.movementId}`);
                inMemoryStorage.cashMovements.push({ ...movement, id: result.movementId });
                return { success: true, movementId: result.movementId };
            }
            throw new Error(result.error);
        } catch (error) {
            console.error('❌ [Tiger Data] Cash Save failed:', error);
            return { success: false, movementId: '' };
        }
    },

    /**
     * 4. Save Expense
     */
    saveExpense: async (
        expense: Expense
    ): Promise<{ success: boolean; expenseId: string }> => {
        try {
            const { createExpenseSecure } = await import('../../actions/cash-v2');
            // Note: createExpenseSecure requires PIN, use empty string for system operations
            const result = await createExpenseSecure(expense as any, '');
            if (result.success && result.expenseId) {
                console.log(`📝 [Tiger Data] Expense saved to DB: ${result.expenseId}`);
                inMemoryStorage.expenses.push({ ...expense, id: result.expenseId });
                return { success: true, expenseId: result.expenseId };
            }
            throw new Error(result.error || 'Error guardando gasto');
        } catch (error) {
            console.error('❌ [Tiger Data] Expense Save failed:', error);
            return { success: false, expenseId: '' };
        }
    },

    /**
     * 4b. Fetch Cash Movements
     */
    fetchCashMovements: async (limit = 50) => {
        try {
            const { getCashMovementsSecure } = await import('../../actions/cash-v2');
            const result = await getCashMovementsSecure(undefined, limit);
            if (result.success && result.data) {
                console.log(`✅ [Tiger Data] Loaded ${result.data.length} cash movements`);
                inMemoryStorage.cashMovements = result.data as any;
                return result.data;
            }
            return [];
        } catch (error) {
            console.error('❌ [Tiger Data] Fetch Cash failed:', error);
            return [];
        }
    },

    /**
     * 6. Fetch Sales History
     */
    async fetchSalesHistory(
        locationId?: string,
        startDate?: number,
        endDate?: number,
        sessionId?: string
    ): Promise<SaleTransaction[]> {
        const normalizedLocationId = normalizeLocationId(locationId);
        console.log(`🐯 [Tiger Data] Fetching sales history... Loc:${normalizedLocationId || 'ALL'} Session:${sessionId}`);
        try {
            const { getSalesHistory } = await import('../../actions/sales-v2');

            // Convert timestamps to YYYY-MM-DD
            const start = startDate ? new Date(startDate).toISOString().split('T')[0] : undefined;
            const end = endDate ? new Date(endDate).toISOString().split('T')[0] : undefined;

            const result = await getSalesHistory({
                limit: 200, // Aumentamos límite para turnos ocupados
                locationId: normalizedLocationId,
                sessionId,
                startDate: start,
                endDate: end
            });

            if (result.success && result.data) {
                console.log(`✅ [Tiger Data] Loaded ${result.data.length} sales from DB`);
                inMemoryStorage.sales = result.data as any;
                return result.data as any;
            }
            return [];
        } catch (error) {
            console.error('❌ [Tiger Data] Fetch Sales failed:', error);
            return [];
        }
    },

    /**
     * 🚚 Fetch Shipments (Real)
     */
    fetchShipments: async (locationId?: string): Promise<any[]> => {
        const normalizedLocationId = normalizeLocationId(locationId);

        console.log('🐯 [Tiger Data] Fetching shipments for location:', normalizedLocationId || 'ALL');
        try {
            const { getShipmentsSecure } = await import('../../actions/wms-v2');
            const result = await getShipmentsSecure({
                locationId: normalizedLocationId,
                page: 1,
                pageSize: 100 // Aumentamos límite para ver más despachos
            });

            if (result.success && result.data && result.data.shipments.length > 0) {
                console.log(`✅ [Tiger Data] Loaded ${result.data.shipments.length} shipments from DB`);
                return result.data.shipments;
            }

            if (normalizedLocationId && result.success && result.data && result.data.shipments.length === 0) {
                console.warn('⚠️ [Tiger Data] Sin resultados por ubicación, intentando vista corporativa de envíos...');
                const globalResult = await getShipmentsSecure({
                    page: 1,
                    pageSize: 100
                });

                if (globalResult.success && globalResult.data && globalResult.data.shipments.length > 0) {
                    console.log(`⚠️ [Tiger Data] Loaded ${globalResult.data.shipments.length} shipments (global fallback)`);
                    return globalResult.data.shipments;
                }
            }

            console.warn(`⚠️ [Tiger Data] Primary shipment fetch without resultados, activando fallback histórico: ${result.error || 'empty result'}`);
        } catch (error) {
            console.error('❌ [Tiger Data] Fetch Shipments failed:', error);
        }

        try {
            const { getSupplyChainHistorySecure } = await import('../../actions/supply-v2');
            const fallback = await getSupplyChainHistorySecure({
                page: 1,
                pageSize: 200,
                type: 'SHIPMENT',
                locationId: normalizedLocationId
            });

            const mapRows = (rows: Record<string, unknown>[]) => rows.map((row: Record<string, unknown>) => ({
                id: row.id,
                status: row.status,
                type: row.shipment_type || 'INTER_BRANCH',
                origin_location_id: row.origin_location_id || null,
                origin_location_name: row.origin_location_name || 'Origen',
                destination_location_id: row.location_id || null,
                destination_location_name: row.location_name || 'Destino',
                created_at: row.created_at ? new Date(String(row.created_at)).getTime() : Date.now(),
                updated_at: row.updated_at ? new Date(String(row.updated_at)).getTime() : null,
                notes: row.notes || '',
                items_count: Number(row.items_count || 0)
            }));

            if (fallback.success && fallback.data && fallback.data.length > 0) {
                const shipments = mapRows(fallback.data as Record<string, unknown>[]);
                console.log(`⚠️ [Tiger Data] Loaded ${shipments.length} shipments (fallback source)`);
                return shipments;
            }

            if (normalizedLocationId) {
                const fallbackGlobal = await getSupplyChainHistorySecure({
                    page: 1,
                    pageSize: 200,
                    type: 'SHIPMENT',
                });

                if (fallbackGlobal.success && fallbackGlobal.data && fallbackGlobal.data.length > 0) {
                    const shipments = mapRows(fallbackGlobal.data as Record<string, unknown>[]);
                    console.log(`⚠️ [Tiger Data] Loaded ${shipments.length} shipments (fallback source global)`);
                    return shipments;
                }
            }

            return [];
        } catch (error) {
            console.error('❌ [Tiger Data] Fallback shipment fetch failed:', error);
            return [];
        }
    },

    /**
     * 🛒 Fetch Purchase Orders (Real)
     */
    fetchPurchaseOrders: async (locationId?: string): Promise<any[]> => {
        const normalizedLocationId = normalizeLocationId(locationId);

        console.log('🐯 [Tiger Data] Fetching purchase orders for location:', normalizedLocationId || 'ALL');

        try {
            const { getPurchaseOrdersSecure } = await import('../../actions/wms-v2');
            const result = await getPurchaseOrdersSecure({
                locationId: normalizedLocationId,
                page: 1,
                pageSize: 200
            });

            if (result.success && result.data?.purchaseOrders && result.data.purchaseOrders.length > 0) {
                console.log(`✅ [Tiger Data] Loaded ${result.data.purchaseOrders.length} purchase orders (WMS source)`);
                return result.data.purchaseOrders;
            }

            if (normalizedLocationId && result.success && result.data?.purchaseOrders?.length === 0) {
                console.warn('⚠️ [Tiger Data] Sin OC por ubicación, intentando vista corporativa...');
                const globalResult = await getPurchaseOrdersSecure({
                    page: 1,
                    pageSize: 200
                });

                if (globalResult.success && globalResult.data?.purchaseOrders && globalResult.data.purchaseOrders.length > 0) {
                    console.log(`⚠️ [Tiger Data] Loaded ${globalResult.data.purchaseOrders.length} purchase orders (global fallback)`);
                    return globalResult.data.purchaseOrders;
                }
            }

            console.warn(`⚠️ [Tiger Data] Primary purchase order fetch sin resultados, activando fallback: ${result.error || 'empty result'}`);
        } catch (error) {
            console.error('❌ [Tiger Data] Primary purchase order fetch failed:', error);
        }

        try {
            const { getSupplyChainHistorySecure } = await import('../../actions/supply-v2');
            const fallback = await getSupplyChainHistorySecure({
                page: 1,
                pageSize: 200,
                type: 'PO',
                locationId: normalizedLocationId
            });

            const mapRows = (rows: Record<string, unknown>[]) => rows.map((order: Record<string, unknown>) => ({
                ...order,
                supplier_name: order.supplier_name || 'Proveedor Desconocido',
                location_name: order.location_name || 'Sin ubicación',
                items_count: Number(order.items_count || 0),
                created_at: order.created_at ? new Date(String(order.created_at)).getTime() : Date.now(),
                updated_at: order.updated_at ? new Date(String(order.updated_at)).getTime() : null,
            }));

            if (fallback.success && fallback.data && fallback.data.length > 0) {
                const filtered = mapRows(fallback.data as Record<string, unknown>[]);
                console.log(`⚠️ [Tiger Data] Loaded ${filtered.length} purchase orders (fallback source)`);
                return filtered;
            }

            if (normalizedLocationId) {
                const fallbackGlobal = await getSupplyChainHistorySecure({
                    page: 1,
                    pageSize: 200,
                    type: 'PO',
                });

                if (fallbackGlobal.success && fallbackGlobal.data && fallbackGlobal.data.length > 0) {
                    const filtered = mapRows(fallbackGlobal.data as Record<string, unknown>[]);
                    console.log(`⚠️ [Tiger Data] Loaded ${filtered.length} purchase orders (fallback source global)`);
                    return filtered;
                }
            }

            return [];
        } catch (error) {
            console.error('❌ [Tiger Data] Fallback purchase order fetch failed:', error);
            return [];
        }
    },

    /**
     * 7. Update Inventory Stock
     */
    updateInventoryStock: async (
        productId: string,
        quantity: number,
        operation: 'ADD' | 'SUBTRACT'
    ): Promise<{ success: boolean }> => {
        return simulateNetworkCall(() => {
            const product = inMemoryStorage.products.find(p => p.id === productId);

            if (!product) {
                throw new Error(`Product not found: ${productId}`);
            }

            if (operation === 'SUBTRACT') {
                if (product.stock_actual < quantity) {
                    throw new Error(`Insufficient stock for ${product.name}`);
                }
                product.stock_actual -= quantity;
            } else {
                product.stock_actual += quantity;
            }

            console.log(`📦 [Tiger Data] Stock updated: ${product.name} | ${operation} ${quantity} | New stock: ${product.stock_actual}`);

            return { success: true };
        }, 'updateInventoryStock');
    },

    /**
     * 7b. Fractionate Batch (Persistent)
     */
    fractionateBatch: async (params: {
        batchId: string;
        userId: string;
        unitsInBox: number;
    }): Promise<{ success: boolean; error?: string; newBatchId?: string }> => {
        console.log('🐯 [Tiger Data] Fractionating batch:', params.batchId);
        try {
            const { fractionateBatchSecureDetailed } = await import('../../actions/inventory-v2');
            const result = await fractionateBatchSecureDetailed(params);
            return result;
        } catch (error) {
            console.error('❌ [Tiger Data] Fractionation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Error al fraccionar lote'
            };
        }
    },

    /**
     * UTILITY: Initialize in-memory storage with data from store
     */
    initializeStorage: (data: {
        products?: InventoryBatch[];
        employees?: EmployeeProfile[];
        sales?: SaleTransaction[];
        cashMovements?: CashMovement[];
        expenses?: Expense[];
    }) => {
        if (data.products) inMemoryStorage.products = data.products;
        if (data.employees) inMemoryStorage.employees = data.employees;
        if (data.sales) inMemoryStorage.sales = data.sales;
        if (data.cashMovements) inMemoryStorage.cashMovements = data.cashMovements;
        if (data.expenses) inMemoryStorage.expenses = data.expenses;

        console.log('🔄 [Tiger Data] Storage initialized with local data');
    },

    /**
     * 8. Authenticate User
     */
    authenticate: async (
        userId: string,
        pin: string
    ): Promise<{ success: boolean; user?: EmployeeProfile; error?: string }> => {
        return simulateNetworkCall(() => {
            const employee = inMemoryStorage.employees.find(e => e.id === userId && e.access_pin === pin);

            if (!employee) {
                console.warn(`⚠️ [Tiger Data] Auth failed for user ${userId}. Invalid credentials.`);
                return { success: false, error: 'Invalid credentials' };
            }

            console.log(`🔐 [Tiger Data] User authenticated: ${employee.name}`);
            return { success: true, user: employee };
        }, 'authenticate');
    },

    /**
     * UTILITY: Get current storage state (for debugging)
     */
    getStorageState: () => {
        return {
            salesCount: inMemoryStorage.sales.length,
            productsCount: inMemoryStorage.products.length,
            employeesCount: inMemoryStorage.employees.length,
            cashMovementsCount: inMemoryStorage.cashMovements.length,
            expensesCount: inMemoryStorage.expenses.length
        };
    }
};

/**
 * Configuration for future API integration
 */
export const TigerDataConfig = {
    API_BASE_URL: process.env.REACT_APP_TIGER_DATA_URL || 'http://localhost:3001/api',
    API_TIMEOUT: 10000, // 10 seconds
    RETRY_ATTEMPTS: 3,
    ENABLE_CACHE: true,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
};
