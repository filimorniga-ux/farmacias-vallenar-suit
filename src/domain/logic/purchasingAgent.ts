
import { InventoryBatch, PurchaseOrder, Supplier } from '../types';

const MOCK_SALES_HISTORY = {
    'A100': { totalSoldLast30Days: 90, dailyVelocity: 3, stockMin: 60 },
    'B200': { totalSoldLast30Days: 15, dailyVelocity: 0.5, stockMin: 20 },
};

export const PurchasingAgent = {
    analyzeStockAndSuggest(inventory: InventoryBatch[], salesHistory = MOCK_SALES_HISTORY): PurchaseOrder[] {
        const suggestedOrders: PurchaseOrder[] = [];
        const supplierSuggestions: { [supplierId: string]: PurchaseOrder } = {};
        const PROJECTION_DAYS = 15;

        inventory.forEach(item => {
            const history = salesHistory[item.sku] || { dailyVelocity: 0.1, stockMin: item.stockMin };

            const demandProjection = history.dailyVelocity * PROJECTION_DAYS;
            const coverageDays = item.stockActual / history.dailyVelocity;

            if (coverageDays < 20 || item.stockActual < item.stockMin) {
                const orderQty = Math.max(0, (item.stockMin * 2) - item.stockActual);

                if (orderQty > 0) {
                    if (!supplierSuggestions[item.supplierId]) {
                        supplierSuggestions[item.supplierId] = {
                            id: Math.random().toString(36).substring(2, 9),
                            supplierId: item.supplierId,
                            dateCreated: new Date().toISOString(),
                            status: 'PENDING',
                            items: [],
                        };
                    }

                    supplierSuggestions[item.supplierId].items.push({
                        itemId: item.id,
                        name: item.name,
                        quantity: orderQty,
                    });
                }
            }
        });

        return Object.values(supplierSuggestions);
    }
};
