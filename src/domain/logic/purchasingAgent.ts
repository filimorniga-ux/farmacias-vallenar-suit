import { InventoryBatch, PurchaseOrder, Supplier } from '../types';

export const PurchasingAgent = {
    /**
     * Calcula la velocidad de venta diaria (Mock simple para MVP).
     * En producción, esto vendría de un análisis histórico de transacciones.
     */
    /**
     * Calcula la velocidad de venta diaria basada en un periodo.
     */
    calculateVelocity(sku: string, period: 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_TRIMESTER' | 'LAST_SEMESTER' | 'LAST_YEAR'): number {
        // Simulación: Genera un número base
        const hash = sku.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const baseVelocity = (hash % 10) / 2 + 0.5;

        // Ajuste por periodo (Simulación de estacionalidad)
        switch (period) {
            case 'LAST_7_DAYS': return baseVelocity * 1.2; // Pico reciente
            case 'LAST_30_DAYS': return baseVelocity; // Normal
            case 'LAST_TRIMESTER': return baseVelocity * 0.9; // Estabilizado
            case 'LAST_SEMESTER': return baseVelocity * 0.8; // Largo plazo
            case 'LAST_YEAR': return baseVelocity * 0.7; // Anual
            default: return baseVelocity;
        }
    },

    /**
     * Calcula cuántos días durará el stock actual.
     */
    calculateCoverage(stock: number, velocity: number): number {
        if (velocity <= 0) return 999; // Cobertura infinita
        return Math.round(stock / velocity);
    },

    /**
     * Genera sugerencias de reabastecimiento agrupadas por proveedor.
     */
    generateSuggestions(
        inventory: InventoryBatch[],
        suppliers: Supplier[],
        period: 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_TRIMESTER' | 'LAST_SEMESTER' | 'LAST_YEAR' = 'LAST_30_DAYS'
    ): PurchaseOrder[] {
        const suggestions: PurchaseOrder[] = [];
        const itemsBySupplier: { [supplierId: string]: any[] } = {};

        inventory.forEach(item => {
            const velocity = this.calculateVelocity(item.sku, period);
            const coverage = this.calculateCoverage(item.stock_actual, velocity);

            // Configurable Target Days (Default 30)
            const targetDays = 30;

            // Fórmula: (velocity * targetDays) - currentStock
            const suggestedQty = Math.ceil((velocity * targetDays) - item.stock_actual);

            // Determine Status based on Coverage
            let status: 'CRITICAL' | 'LOW' | 'EXCESS' | 'OK' = 'OK';
            if (coverage < 7) status = 'CRITICAL';
            else if (coverage < 15) status = 'LOW';
            else if (coverage > 90) status = 'EXCESS';

            // Add to list if suggestion > 0 OR if it's critical/low/excess (to show visibility)
            // User requested: "Si el resultado es negativo (tengo de sobra), la sugerencia es 0."
            const finalSuggestion = Math.max(0, suggestedQty);

            // We include items that need attention (Critical/Low) or have suggestions
            if (finalSuggestion > 0 || status === 'CRITICAL' || status === 'LOW' || status === 'EXCESS') {
                const supplierId = item.supplier_id || 'SUP-001';
                if (!itemsBySupplier[supplierId]) {
                    itemsBySupplier[supplierId] = [];
                }

                itemsBySupplier[supplierId].push({
                    sku: item.sku,
                    name: item.name,
                    quantity: finalSuggestion,
                    cost_price: item.price * 0.6, // Costo estimado
                    current_stock: item.stock_actual,
                    velocity: velocity.toFixed(2),
                    coverage: coverage,
                    status: status
                });
            }
        });// Convertir agrupación a objetos PurchaseOrder
        Object.keys(itemsBySupplier).forEach(supplierId => {
            suggestions.push({
                id: `PO-SUG-${Date.now()}-${supplierId.substring(0, 3)}`,
                supplier_id: supplierId,
                destination_location_id: 'BODEGA_CENTRAL', // Default location for suggested orders
                created_at: Date.now(),
                status: 'SUGGESTED',
                items: itemsBySupplier[supplierId],
                total_estimated: 0, // Se calcularía con costos reales
                is_auto_generated: true, // Flag to identify AI-generated orders
                generation_reason: 'LOW_STOCK' // Reason for auto-generation
            });
        });

        return suggestions;
    }
};
