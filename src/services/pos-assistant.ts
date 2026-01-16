
import { CartItem } from "@/domain/types";

export type POSCartItem = CartItem;
export type POSAnalysisResult = POSSuggestion[];

// Mock Data for MVP - This will later connect to a real Knowledge Base or Embedding Service
const INTERACTION_DB: Record<string, string[]> = {
    'IBUPROFENO': ['ASPIRINA', 'WARFARINA', 'ENALAPRIL'],
    'PARACETAMOL': ['ALCOHOL', 'WARFARINA'],
    'AMOXICILINA': ['ANTICONCEPTIVOS'],
    'CLORDIAZEPOXIDO': ['ALCOHOL', 'OPIOIDES'],
};

const CROSS_SELL_RULES: Record<string, string[]> = {
    'ANTIBIOTICO': ['PROBIOTICOS', 'VITAMINA C'],
    'ANALGESICO': ['GEL TOPICO', 'GUATERO'],
    'ANTIGRIPAL': ['PAÑUELOS', 'VITAMINA C', 'MIEL'],
    'DULCOLAX': ['SUERO REHIDRATANTE'],
};

export interface POSSuggestion {
    type: 'WARNING' | 'OPPORTUNITY' | 'INFO';
    message: string;
    actionLabel?: string;
    relatedSku?: string;
    savingsAmount?: number;
}

export class POSAssistantService {

    /**
     * Analyze current cart items to provide real-time suggestions
     */
    static analyzeCart(items: CartItem[]): POSSuggestion[] {
        const suggestions: POSSuggestion[] = [];

        // 1. Check for Duplicate Therapy (Bioequivalence)
        // If user buys Brand X, suggest Bioequivalent Y if cheaper
        // (Mock logic: Assuming we have access to alternatives - in MVP we check generic flag)

        items.forEach(item => {
            // Example Rule: Bioequivalent available (Simulated cost lookup)
            if (item.cost_price && item.price > item.cost_price * 3) {
                // High margin/High price -> Suggest generic
                suggestions.push({
                    type: 'OPPORTUNITY',
                    message: `💡 Existe bioequivalente más económico para ${item.name}`,
                    actionLabel: 'Ver Opción',
                    relatedSku: item.sku,
                    savingsAmount: Math.floor(item.price * 0.4)
                });
            }
        });

        // 2. Check Interactions
        const activeIngredients = items.flatMap(i => i.active_ingredients || []); // Requires updated CartItem definition
        // Simplified Check by Name for now
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                const name1 = items[i].name.toUpperCase();
                const name2 = items[j].name.toUpperCase();

                // Very naive check
                if (name1.includes('IBUPROFENO') && name2.includes('ASPIRINA')) {
                    suggestions.push({
                        type: 'WARNING',
                        message: `⚠️ Posible interacción: Ibuprofeno + Aspirina puede aumentar riesgo de sangrado.`,
                        relatedSku: items[i].sku
                    });
                }
            }
        }

        // 3. Cross-Selling opportunities
        items.forEach(item => {
            if (item.name.toUpperCase().includes('AMOXICILINA')) {
                suggestions.push({
                    type: 'INFO',
                    message: `🛡️ Recuerda ofrecer Probióticos para proteger la flora intestinal.`,
                    actionLabel: 'Agregar BioFlora',
                    relatedSku: 'PROBIO-123'
                });
            }
        });

        return suggestions;
    }

    /**
     * Specialized check for a single added product
     */
    static checkProductEntry(item: CartItem): POSSuggestion | null {
        // Validation logic when scanning a product
        if (item.is_fractional) {
            return {
                type: 'INFO',
                message: `💊 Este producto permite venta fraccionada. ¿Venderá la caja completa?`,
                actionLabel: 'Fraccionar',
                relatedSku: item.sku
            };
        }
        return null;
    }
}
