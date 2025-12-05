import { ReorderConfig, AutoOrderSuggestion, StockMovement, InventoryBatch, PurchaseOrder, Supplier } from '../../domain/types';

/**
 * Intelligent Ordering Service
 * Handles demand forecasting, reorder analysis, and automated PO generation
 */
export class IntelligentOrderingService {
    /**
     * Analyzes sales history from stock movements to calculate demand
     */
    static getSalesHistory(
        stockMovements: StockMovement[],
        sku: string,
        locationId: string,
        days: number
    ): { total: number; daily_avg: number } {
        const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);

        const sales = stockMovements.filter(m =>
            m.sku === sku &&
            m.location_id === locationId &&
            m.movement_type === 'SALE' &&
            m.timestamp >= cutoffDate
        );

        // Sales are negative quantities, so we take absolute value
        const total = Math.abs(sales.reduce((sum, s) => sum + s.quantity, 0));
        const daily_avg = days > 0 ? total / days : 0;

        return { total, daily_avg };
    }

    /**
     * Analyzes inventory to identify products needing reorder
     */
    static analyzeReorderNeeds(
        inventory: InventoryBatch[],
        reorderConfigs: ReorderConfig[],
        stockMovements: StockMovement[],
        locationId: string,
        analysisDays: number = 30
    ): AutoOrderSuggestion[] {
        const suggestions: AutoOrderSuggestion[] = [];

        // Get all inventory for this location
        const locationStock = inventory.filter(b => b.location_id === locationId);

        locationStock.forEach(batch => {
            const config = reorderConfigs.find(
                c => c.sku === batch.sku && c.location_id === locationId
            );

            if (!config?.auto_reorder_enabled) return;

            const currentStock = batch.stock_actual;
            const { total, daily_avg } = this.getSalesHistory(
                stockMovements,
                batch.sku,
                locationId,
                analysisDays
            );

            // Calculate forecast for next 14 days
            const forecast_14d = Math.ceil(daily_avg * 14);

            // Calculate days until stockout
            const days_until_stockout = daily_avg > 0
                ? Math.floor(currentStock / daily_avg)
                : 999;

            // Determine if reorder is needed
            const needsReorder = currentStock <= config.min_stock;
            const urgentReorder = days_until_stockout <= config.lead_time_days;

            if (needsReorder || urgentReorder) {
                // Calculate suggested order quantity
                // Formula: (max - current) + safety stock
                const suggested_qty = Math.ceil(
                    (config.max_stock - currentStock) + config.safety_stock
                );

                // Determine urgency level
                let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
                if (days_until_stockout <= config.lead_time_days) {
                    urgency = 'HIGH';
                } else if (currentStock <= config.min_stock) {
                    urgency = 'MEDIUM';
                }

                // Generate reason
                let reason = `Stock bajo (${currentStock} / ${config.min_stock} min)`;
                if (urgentReorder) {
                    reason = `Stockout en ${days_until_stockout} días`;
                }

                suggestions.push({
                    sku: batch.sku,
                    product_name: batch.name,
                    location_id: locationId,
                    current_stock: currentStock,
                    min_stock: config.min_stock,
                    max_stock: config.max_stock,
                    daily_avg_sales: daily_avg,
                    forecast_demand_14d: forecast_14d,
                    days_until_stockout,
                    suggested_order_qty: suggested_qty,
                    urgency,
                    reason,
                    supplier_id: config.preferred_supplier_id,
                    estimated_cost: batch.cost_price ? batch.cost_price * suggested_qty : undefined
                });
            }
        });

        // Sort by urgency (HIGH -> MEDIUM -> LOW)
        return suggestions.sort((a, b) => {
            const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
            return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        });
    }

    /**
     * Generates draft Purchase Orders from suggestions, grouped by supplier
     */
    static generateSuggestedPOs(
        suggestions: AutoOrderSuggestion[],
        suppliers: Supplier[],
        inventory: InventoryBatch[]
    ): PurchaseOrder[] {
        // Group suggestions by supplier
        const posBySupplier = new Map<string, AutoOrderSuggestion[]>();

        suggestions.forEach(s => {
            const supplierId = s.supplier_id || 'DEFAULT_SUPPLIER';
            if (!posBySupplier.has(supplierId)) {
                posBySupplier.set(supplierId, []);
            }
            posBySupplier.get(supplierId)!.push(s);
        });

        // Create a PO for each supplier
        const generatedPOs: PurchaseOrder[] = [];

        posBySupplier.forEach((items, supplierId) => {
            const supplier = suppliers.find(s => s.id === supplierId);
            const locationId = items[0].location_id; // All items from same location

            const poItems = items.map(item => {
                const batch = inventory.find(
                    b => b.sku === item.sku && b.location_id === locationId
                );

                return {
                    sku: item.sku,
                    name: item.product_name,
                    quantity_ordered: item.suggested_order_qty,
                    quantity_received: 0,
                    cost_price: batch?.cost_price || 0,
                    quantity: item.suggested_order_qty, // Legacy
                    suggested_quantity: item.suggested_order_qty
                };
            });

            // Calculate total estimated cost
            const total_estimated = poItems.reduce(
                (sum, item) => sum + (item.cost_price * item.quantity_ordered),
                0
            );

            generatedPOs.push({
                id: `PO-AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                supplier_id: supplierId,
                supplier_name: supplier?.fantasy_name,
                destination_location_id: locationId,
                created_at: Date.now(),
                status: 'DRAFT',
                items: poItems,
                total_estimated,
                is_auto_generated: true,
                generation_reason: 'LOW_STOCK'
            });
        });

        return generatedPOs;
    }

    /**
     * Helper: Get summary statistics for a location
     */
    static getLocationSummary(
        suggestions: AutoOrderSuggestion[]
    ): {
        critical_count: number;
        low_count: number;
        total_estimated_cost: number;
        suppliers_count: number;
    } {
        const critical_count = suggestions.filter(s => s.urgency === 'HIGH').length;
        const low_count = suggestions.filter(s => s.urgency === 'MEDIUM').length;
        const total_estimated_cost = suggestions.reduce(
            (sum, s) => sum + (s.estimated_cost || 0),
            0
        );
        const suppliers_count = new Set(suggestions.map(s => s.supplier_id)).size;

        return { critical_count, low_count, total_estimated_cost, suppliers_count };
    }
}
