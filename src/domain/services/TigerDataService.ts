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
     * 1. Fetch Products Catalog for POS
     * @param locationId - Branch/warehouse location ID
     * @returns Promise<InventoryBatch[]>
     * 
     * Future: GET /api/inventory?location={locationId}
     */
    /**
     * 0. Bulk Upload Inventory (Chunks)
     * @param products - Array of products to upload
     * @param onProgress - Optional callback for progress updates
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
     * 1. Fetch Inventory (Robust with Fallback)
     * @returns Promise<InventoryBatch[]>
     */
    fetchInventory: async (warehouseId?: string): Promise<InventoryBatch[]> => {
        console.log('🐯 [Tiger Data] Fetching inventory...');
        try {
            // 1. Try to fetch from Server Action (DB)
            const { fetchInventory } = await import('../../actions/sync');
            const dbInventory = await fetchInventory(warehouseId);

            // Allow empty DB (valid state after truncate)
            if (dbInventory) {
                console.log(`✅ [Tiger Data] Loaded ${dbInventory.length} items from DB`);
                return dbInventory;
            }

            // Only throw if dbInventory is null/undefined (connection error)
            throw new Error('DB Connection failed');
        } catch (error) {
            console.error('❌ [Tiger Data] DB Fetch failed, using MOCK data:', error);
            // 2. Fallback to Mock Data
            const { MOCK_INVENTORY } = await import('../mocks');
            return MOCK_INVENTORY;
        }
    },

    /**
     * 2. Save Sale Transaction (CRITICAL)
     * @param saleData - Complete sale transaction
     * @param locationId - Branch where sale occurred
     * @returns Promise<{ success: boolean; transactionId: string }>
     */
    saveSaleTransaction: async (
        saleData: SaleTransaction,
        locationId: string,
        terminalId?: string
    ): Promise<{ success: boolean; transactionId: string }> => {
        // Enriched Data logic moved to Action or kept here?
        // Let's keep augmentation here but delegate save.
        const enrichedSale: SaleTransaction = {
            ...saleData,
            branch_id: locationId,
            terminal_id: terminalId, // Added terminal_id
            timestamp: Date.now()
        };

        try {
            const { createSale } = await import('../../actions/sales');
            const result = await createSale(enrichedSale);

            if (result.success && result.transactionId) {
                console.log(`✅ [Tiger Data] Sale saved to DB: ${result.transactionId}`);
                // Update local memory for immediate UI feedback (Optimistic or just sync)
                inMemoryStorage.sales.push(enrichedSale);
                return { success: true, transactionId: result.transactionId };
            } else {
                throw new Error(result.error || 'Unknown DB Error');
            }
        } catch (error) {
            console.error('❌ [Tiger Data] DB Save failed:', error);
            // Fallback? No, strict mode.
            return { success: false, transactionId: '' };
        }
    },

    /**
     * 3. Save Cash Movement
     */
    saveCashMovement: async (
        movement: CashMovement
    ): Promise<{ success: boolean; movementId: string }> => {
        try {
            const { createCashMovement } = await import('../../actions/cash');
            const result = await createCashMovement(movement);
            if (result.success && result.id) {
                console.log(`💵 [Tiger Data] Cash movement saved to DB: ${result.id}`);
                inMemoryStorage.cashMovements.push({ ...movement, id: result.id });
                return { success: true, movementId: result.id };
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
            const { createExpense } = await import('../../actions/cash');
            const result = await createExpense(expense);
            if (result.success && result.id) {
                console.log(`📝 [Tiger Data] Expense saved to DB: ${result.id}`);
                inMemoryStorage.expenses.push({ ...expense, id: result.id });
                return { success: true, expenseId: result.id };
            }
            throw new Error(result.error);
        } catch (error) {
            console.error('❌ [Tiger Data] Expense Save failed:', error);
            return { success: false, expenseId: '' };
        }
    },

    /**
     * 4b. Fetch Cash Movements (NEW)
     */
    fetchCashMovements: async (limit = 50) => {
        try {
            const { getCashMovements } = await import('../../actions/cash');
            const movements = await getCashMovements(undefined, limit);
            console.log(`✅ [Tiger Data] Loaded ${movements.length} cash movements`);
            inMemoryStorage.cashMovements = movements as any; // Type alignment might be needed
            return movements;
        } catch (error) {
            console.error('❌ [Tiger Data] Fetch Cash failed:', error);
            return [];
        }
    },

    // ... cash movement ...

    /**
     * 6. Fetch Sales History
     */
    fetchSalesHistory: async (
        locationId?: string,
        startDate?: number,
        endDate?: number
    ): Promise<SaleTransaction[]> => {
        console.log('🐯 [Tiger Data] Fetching sales history from DB...');
        try {
            const { getSales } = await import('../../actions/sales');
            const sales = await getSales(100); // Limit 100 for now
            console.log(`✅ [Tiger Data] Loaded ${sales.length} sales from DB`);

            // Sync to in-memory for consistency
            inMemoryStorage.sales = sales;
            return sales;
        } catch (error) {
            console.error('❌ [Tiger Data] Fetch Sales failed:', error);
            return [];
        }
    },

    /**
     * 7. Update Inventory Stock
     * @param productId - Product ID
     * @param quantity - Quantity to add/subtract
     * @param operation - 'ADD' or 'SUBTRACT'
     * @returns Promise<{ success: boolean }>
     * 
     * Future: PATCH /api/inventory/{productId}
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
     * This is a temporary method for the simulation phase
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
     * @param userId - User ID (RUT)
     * @param pin - Access PIN
     * @returns Promise<{ success: boolean; user: EmployeeProfile }>
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
 * 
 * When ready to connect to real Tiger Data API:
 * 1. Replace simulateNetworkCall with actual fetch/axios calls
 * 2. Update API_BASE_URL with production endpoint
 * 3. Add authentication headers
 * 4. Handle real error responses
 */
export const TigerDataConfig = {
    API_BASE_URL: process.env.REACT_APP_TIGER_DATA_URL || 'http://localhost:3001/api',
    API_TIMEOUT: 10000, // 10 seconds
    RETRY_ATTEMPTS: 3,
    ENABLE_CACHE: true,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
};
