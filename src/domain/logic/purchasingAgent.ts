import { InventoryBatch, PurchaseOrder, Supplier } from '../types';

export const PurchasingAgent = {
    /**
     * Calcula la velocidad de venta diaria (Mock simple para MVP).
     * En producción, esto vendría de un análisis histórico de transacciones.
     */
    calculateDailyVelocity(sku: string): number {
        // Simulación: Genera un número entre 0.5 y 5 unidades diarias
        // Usamos el SKU para que sea determinista (mismo SKU siempre da mismo resultado)
        const hash = sku.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return (hash % 10) / 2 + 0.5;
    },

    /**
     * Genera sugerencias de reabastecimiento agrupadas por proveedor.
     * Regla: Si Stock Actual < (Velocidad * LeadTime * 1.5 SafetyFactor), pedir para cubrir 15 días.
     */
    generateSuggestions(inventory: InventoryBatch[], suppliers: Supplier[]): PurchaseOrder[] {
        const suggestions: PurchaseOrder[] = [];
        const itemsBySupplier: { [supplierId: string]: any[] } = {};

        inventory.forEach(item => {
            const velocity = this.calculateDailyVelocity(item.sku);
            const supplier = suppliers.find(s => s.id === item.supplier_id);
            const leadTime = supplier ? supplier.lead_time_days : 3; // Default 3 días

            const safetyStock = velocity * leadTime * 1.5;
            // 3. Check for expiring batches (FEFO)
            const expiringBatches = inventory.filter(b =>
                b.sku === item.sku &&
                b.expiry_date < Date.now() + (90 * 24 * 60 * 60 * 1000)
            );

            if (expiringBatches.length > 0) {
                suggestions.push({
                    id: `PO-${Date.now()}-${item.sku}`,
                    supplier_id: 'SUP-001', // Default
                    items: [{
                        sku: item.sku,
                        name: item.name,
                        quantity: Math.max(50, Math.ceil(velocity * 30)), // Buy for 30 days
                        cost_price: item.price * 0.6
                    }],
                    status: 'DRAFT',
                    created_at: Date.now(),
                    total_estimated: 0
                });
            }
            const reorderPoint = safetyStock;

            if (item.stock_actual <= reorderPoint) {
                const supplierId = item.supplier_id || 'SUP-001';
                if (!itemsBySupplier[supplierId]) {
                    itemsBySupplier[supplierId] = [];
                }
                itemsBySupplier[supplierId].push({
                    sku: item.sku,
                    name: item.name,
                    quantity: Math.max(50, Math.ceil(velocity * 15)), // Buy for 15 days
                    cost_price: item.price * 0.6
                });
            }
        });// Convertir agrupación a objetos PurchaseOrder
        Object.keys(itemsBySupplier).forEach(supplierId => {
            suggestions.push({
                id: `PO-SUG-${Date.now()}-${supplierId.substring(0, 3)}`,
                supplier_id: supplierId,
                created_at: Date.now(),
                status: 'SUGGESTED',
                items: itemsBySupplier[supplierId],
                total_estimated: 0 // Se calcularía con costos reales
            });
        });

        return suggestions;
    }
};
