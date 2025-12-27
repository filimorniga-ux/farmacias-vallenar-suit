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

// Simulated in-memory storage (will be replaced by real DB)
let inMemoryStorage = {
    sales: [] as SaleTransaction[],
    cashMovements: [] as CashMovement[],
    expenses: [] as Expense[],
    products: [] as InventoryBatch[],
    employees: [] as EmployeeProfile[]
};

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
    fetchInventory: async (locationId?: string): Promise<InventoryBatch[]> => {
        console.log('🐯 [Tiger Data] Fetching inventory for location:', locationId);
        try {
            // 1. Try to fetch from Server Action (Strict Mode)
            const { getInventorySecure } = await import('../../actions/inventory-v2');

            // If no locationId, we might fetch all? Or fail safer? 
            // For now, if no location, return empty to force selection or handle gracefully.
            if (!locationId) {
                console.warn('⚠️ [Tiger Data] No location specified for inventory fetch.');
                return [];
            }

            const result = await getInventorySecure(locationId);

            if (result.success && result.data) {
                console.log(`✅ [Tiger Data] Loaded ${result.data.length} items from DB for ${locationId}`);
                return result.data as InventoryBatch[];
            }

            // Only throw if success is false 
            console.error('❌ [Tiger Data] DB Fetch returned error:', result.error);
            return []; // Return empty if error, but do NOT fall back to mocks. Mocks are for dev only.
        } catch (error) {
            console.error('❌ [Tiger Data] DB Fetch failed (Exception):', error);
            return []; // Return empty on crash. NEVER return mock data in this context to avoid confusion.
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
        // Enriched Data logic moved to Action or kept here?
        // Let's keep augmentation here but delegate save.
        const enrichedSale: SaleTransaction = {
            ...saleData,
            branch_id: locationId,
            terminal_id: terminalId, // Added terminal_id
            timestamp: Date.now()
        };

        try {
            const { createSaleSecure } = await import('../../actions/sales-v2');
            const result = await createSaleSecure(enrichedSale as any);

            if (result.success && result.saleId) {
                console.log(`✅ [Tiger Data] Sale saved to DB: ${result.saleId}`);
                // Update local memory for immediate UI feedback (Optimistic or just sync)
                inMemoryStorage.sales.push(enrichedSale);
                return { success: true, transactionId: result.saleId as string };
            } else {
                // If server action returned failure but didn't throw (handled error)
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
        endDate?: number
    ): Promise<SaleTransaction[]> {
        console.log('🐯 [Tiger Data] Fetching sales history from DB...');
        try {
            const { getSalesHistory } = await import('../../actions/sales-v2');
            const result = await getSalesHistory({ limit: 100 });
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
        try {
            // TODO: Implement getShipmentsSecure in wms-v2
            // For now, return empty array until V2 function is created
            return [];
        } catch (error) {
            console.error('❌ [Tiger Data] Fetch Shipments failed:', error);
            // Fallback to Mock if DB fails? Or empty.
            const { MOCK_SHIPMENTS } = await import('../mocks');
            return MOCK_SHIPMENTS;
        }
    },

    /**
     * 🛒 Fetch Purchase Orders (Real)
     */
    fetchPurchaseOrders: async (): Promise<any[]> => {
        try {
            const { getPurchaseOrderHistory } = await import('../../actions/procurement-v2');
            const result = await getPurchaseOrderHistory();
            return result.success ? (result.data?.orders || []) : [];
        } catch (error) {
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
