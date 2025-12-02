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
    fetchInventory: async (): Promise<InventoryBatch[]> => {
        console.log('🐯 [Tiger Data] Fetching inventory...');
        try {
            // 1. Try to fetch from Server Action (DB)
            const { fetchInventory } = await import('../../actions/sync');
            const dbInventory = await fetchInventory();

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
     * 
     * Future: POST /api/sales
     */
    saveSaleTransaction: async (
        saleData: SaleTransaction,
        locationId: string
    ): Promise<{ success: boolean; transactionId: string }> => {
        return simulateNetworkCall(() => {
            // Validate sale data
            if (!saleData.items || saleData.items.length === 0) {
                throw new Error('Sale must have at least one item');
            }

            if (saleData.total <= 0) {
                throw new Error('Sale total must be greater than 0');
            }

            // Add location metadata
            const enrichedSale: SaleTransaction = {
                ...saleData,
                branch_id: locationId,
                timestamp: Date.now()
            };

            // Save to in-memory storage (simulates DB write)
            inMemoryStorage.sales.push(enrichedSale);

            console.log(`💰 [Tiger Data] Sale saved: $${saleData.total.toLocaleString('es-CL')} | Items: ${saleData.items.length} | Payment: ${saleData.payment_method}`);

            return {
                success: true,
                transactionId: enrichedSale.id
            };
        }, 'saveSaleTransaction');
    },

    /**
     * 3. Save Cash Movement (Expenses, Withdrawals, Advances)
     * @param movement - Cash movement data
     * @returns Promise<{ success: boolean; movementId: string }>
     * 
     * Future: POST /api/cash-movements
     */
    saveCashMovement: async (
        movement: CashMovement
    ): Promise<{ success: boolean; movementId: string }> => {
        return simulateNetworkCall(() => {
            // Validate movement
            if (movement.amount <= 0) {
                throw new Error('Movement amount must be greater than 0');
            }

            // Save to in-memory storage
            inMemoryStorage.cashMovements.push(movement);

            console.log(`💵 [Tiger Data] Cash movement saved: ${movement.type} | $${movement.amount.toLocaleString('es-CL')}`);

            return {
                success: true,
                movementId: movement.id
            };
        }, 'saveCashMovement');
    },

    /**
     * 4. Save Expense
     * @param expense - Expense data
     * @returns Promise<{ success: boolean; expenseId: string }>
     * 
     * Future: POST /api/expenses
     */
    saveExpense: async (
        expense: Expense
    ): Promise<{ success: boolean; expenseId: string }> => {
        return simulateNetworkCall(() => {
            // Save to in-memory storage
            inMemoryStorage.expenses.push(expense);

            console.log(`📝 [Tiger Data] Expense saved: ${expense.category} | $${expense.amount.toLocaleString('es-CL')}`);

            return {
                success: true,
                expenseId: expense.id
            };
        }, 'saveExpense');
    },

    /**
     * 5. Fetch Employees (for Login & HR)
     * @returns Promise<EmployeeProfile[]>
     * 
     * Future: GET /api/employees
     */
    fetchEmployees: async (): Promise<EmployeeProfile[]> => {
        return simulateNetworkCall(() => {
            console.log(`👥 [Tiger Data] Fetched ${inMemoryStorage.employees.length} employees`);
            return inMemoryStorage.employees;
        }, 'fetchEmployees');
    },

    /**
     * 6. Fetch Sales History
     * @param locationId - Optional location filter
     * @param startDate - Optional start date filter
     * @param endDate - Optional end date filter
     * @returns Promise<SaleTransaction[]>
     * 
     * Future: GET /api/sales?location={locationId}&start={startDate}&end={endDate}
     */
    fetchSalesHistory: async (
        locationId?: string,
        startDate?: number,
        endDate?: number
    ): Promise<SaleTransaction[]> => {
        return simulateNetworkCall(() => {
            let sales = inMemoryStorage.sales;

            // Apply filters
            if (locationId) {
                sales = sales.filter(s => s.branch_id === locationId);
            }

            if (startDate) {
                sales = sales.filter(s => s.timestamp >= startDate);
            }

            if (endDate) {
                sales = sales.filter(s => s.timestamp <= endDate);
            }

            console.log(`📊 [Tiger Data] Fetched ${sales.length} sales transactions`);
            return sales;
        }, 'fetchSalesHistory');
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
    ): Promise<{ success: boolean; user: EmployeeProfile }> => {
        return simulateNetworkCall(() => {
            const employee = inMemoryStorage.employees.find(e => e.id === userId && e.access_pin === pin);

            if (!employee) {
                throw new Error('Invalid credentials');
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
