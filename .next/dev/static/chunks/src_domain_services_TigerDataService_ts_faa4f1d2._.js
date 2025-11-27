(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/domain/services/TigerDataService.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TigerDataConfig",
    ()=>TigerDataConfig,
    "TigerDataService",
    ()=>TigerDataService
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
/**
 * TigerDataService - Abstraction layer for data persistence
 * 
 * This service simulates API calls to Tiger Data with network latency.
 * Functions are prepared for future integration with real API endpoints.
 * 
 * Current Mode: SIMULATION (using setTimeout)
 * Future Mode: Replace with fetch/axios calls to Tiger Data API
 */ const SIMULATE_NETWORK_DELAY = 800; // ms
const SIMULATE_FAILURE_RATE = 0.05; // 5% chance of simulated failure
// Simulated in-memory storage (will be replaced by real DB)
let inMemoryStorage = {
    sales: [],
    cashMovements: [],
    expenses: [],
    products: [],
    employees: []
};
/**
 * Simulate network delay and potential failures
 */ const simulateNetworkCall = async (operation, operationName)=>{
    return new Promise((resolve, reject)=>{
        setTimeout(()=>{
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
const TigerDataService = {
    /**
     * 1. Fetch Products Catalog for POS
     * @param locationId - Branch/warehouse location ID
     * @returns Promise<InventoryBatch[]>
     * 
     * Future: GET /api/inventory?location={locationId}
     */ fetchProducts: async (locationId)=>{
        return simulateNetworkCall(()=>{
            // Filter products by location
            const products = inMemoryStorage.products.filter((p)=>p.location_id === locationId || p.location_id === 'ALL');
            console.log(`📦 [Tiger Data] Fetched ${products.length} products for location: ${locationId}`);
            return products;
        }, 'fetchProducts');
    },
    /**
     * 2. Save Sale Transaction (CRITICAL)
     * @param saleData - Complete sale transaction
     * @param locationId - Branch where sale occurred
     * @returns Promise<{ success: boolean; transactionId: string }>
     * 
     * Future: POST /api/sales
     */ saveSaleTransaction: async (saleData, locationId)=>{
        return simulateNetworkCall(()=>{
            // Validate sale data
            if (!saleData.items || saleData.items.length === 0) {
                throw new Error('Sale must have at least one item');
            }
            if (saleData.total <= 0) {
                throw new Error('Sale total must be greater than 0');
            }
            // Add location metadata
            const enrichedSale = {
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
     */ saveCashMovement: async (movement)=>{
        return simulateNetworkCall(()=>{
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
     */ saveExpense: async (expense)=>{
        return simulateNetworkCall(()=>{
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
     */ fetchEmployees: async ()=>{
        return simulateNetworkCall(()=>{
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
     */ fetchSalesHistory: async (locationId, startDate, endDate)=>{
        return simulateNetworkCall(()=>{
            let sales = inMemoryStorage.sales;
            // Apply filters
            if (locationId) {
                sales = sales.filter((s)=>s.branch_id === locationId);
            }
            if (startDate) {
                sales = sales.filter((s)=>s.timestamp >= startDate);
            }
            if (endDate) {
                sales = sales.filter((s)=>s.timestamp <= endDate);
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
     */ updateInventoryStock: async (productId, quantity, operation)=>{
        return simulateNetworkCall(()=>{
            const product = inMemoryStorage.products.find((p)=>p.id === productId);
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
            return {
                success: true
            };
        }, 'updateInventoryStock');
    },
    /**
     * UTILITY: Initialize in-memory storage with data from store
     * This is a temporary method for the simulation phase
     */ initializeStorage: (data)=>{
        if (data.products) inMemoryStorage.products = data.products;
        if (data.employees) inMemoryStorage.employees = data.employees;
        if (data.sales) inMemoryStorage.sales = data.sales;
        if (data.cashMovements) inMemoryStorage.cashMovements = data.cashMovements;
        if (data.expenses) inMemoryStorage.expenses = data.expenses;
        console.log('🔄 [Tiger Data] Storage initialized with local data');
    },
    /**
     * UTILITY: Get current storage state (for debugging)
     */ getStorageState: ()=>{
        return {
            salesCount: inMemoryStorage.sales.length,
            productsCount: inMemoryStorage.products.length,
            employeesCount: inMemoryStorage.employees.length,
            cashMovementsCount: inMemoryStorage.cashMovements.length,
            expensesCount: inMemoryStorage.expenses.length
        };
    }
};
const TigerDataConfig = {
    API_BASE_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.REACT_APP_TIGER_DATA_URL || 'http://localhost:3001/api',
    API_TIMEOUT: 10000,
    RETRY_ATTEMPTS: 3,
    ENABLE_CACHE: true,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_domain_services_TigerDataService_ts_faa4f1d2._.js.map