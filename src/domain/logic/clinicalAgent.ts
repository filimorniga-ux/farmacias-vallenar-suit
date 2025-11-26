import { Customer, SaleItem, ClinicalAnalysisResult, CartItem } from '../types';

// Base de conocimientos simplificada para MVP
const CONTRAINDICATIONS = {
    HYPERTENSION: ['Pseudoefedrina', 'Fenilefrina', 'Sodio'],
    PREGNANT: ['Ibuprofeno', 'Naproxeno', 'Isotretinoína', 'Warfarina'],
    DIABETIC: ['Jarabe con Azúcar', 'Dextrometorfano (con azúcar)'],
};

const CROSS_SELLING_RULES = [
    { trigger: 'Antibiótico', suggestion: 'Probiótico (Bioflora/Perenteryl) para proteger flora intestinal.' },
    { trigger: 'Pañales', suggestion: 'Crema para coceduras (Hipoglós/Pasta Lassar).' },
    { trigger: 'Cepillo Dental', suggestion: 'Pasta Dental o Hilo Dental.' },
    { trigger: 'Invierno', suggestion: 'Vitamina C o Propóleo.' }, // Ejemplo estacional
];

export class ClinicalAgent {
    /**
     * Analiza el carrito en busca de interacciones peligrosas con el perfil del paciente.
     */
    static analyzeCart(cart: CartItem[], customer?: Customer): ClinicalAnalysisResult {
        let result: ClinicalAnalysisResult = { status: 'SAFE', message: 'Análisis Clínico: OK' };
        const blockingItems: string[] = [];
        const suggestedItems: string[] = [];
        // let result: ClinicalAnalysisResult = { status: 'SAFE', message: 'Análisis Clínico: OK' }; // This line was removed in the provided diff
        // const blockingItems: string[] = []; // This line was removed in the provided diff
        // const suggestedItems: string[] = []; // This line was removed in the provided diff

        // 1. Análisis de Contraindicaciones (Solo si hay cliente identificado)
        if (customer) {
            cart.forEach(item => {
                // Revisar Hipertensión
                if (customer.health_tags.includes('HYPERTENSION')) {
                    const conflict = CONTRAINDICATIONS.HYPERTENSION.find(drug => item.name.includes(drug) || item.active_ingredients?.includes(drug));
                    if (conflict) {
                        blockingItems.push(`${item.name} (Contiene ${conflict})`);
                    }
                }

                // Revisar Embarazo
                if (customer.health_tags.includes('PREGNANT')) {
                    const conflict = CONTRAINDICATIONS.PREGNANT.find(drug => item.name.includes(drug) || item.active_ingredients?.includes(drug));
                    if (conflict) {
                        blockingItems.push(`${item.name} (Riesgo en Embarazo: ${conflict})`);
                    }
                }

                // Revisar Diabetes
                if (customer.health_tags.includes('DIABETIC')) {
                    const conflict = CONTRAINDICATIONS.DIABETIC.find(drug => item.name.includes(drug));
                    if (conflict) {
                        blockingItems.push(`${item.name} (No apto para diabéticos)`);
                    }
                }
            });
        }

        // 2. Lógica de Cross-Selling (Independiente del cliente)
        cart.forEach(item => {
            CROSS_SELLING_RULES.forEach(rule => {
                if (item.name.includes(rule.trigger) || item.active_ingredients?.includes(rule.trigger)) {
                    if (!suggestedItems.includes(rule.suggestion)) {
                        suggestedItems.push(rule.suggestion);
                    }
                }
            });
        });

        // 3. Construir Resultado
        if (blockingItems.length > 0) {
            result.status = 'BLOCK';
            result.message = `⛔ ALERTA DE SEGURIDAD: Interacción detectada.`;
            result.blocking_items = blockingItems;
        } else if (suggestedItems.length > 0) {
            // Si es seguro pero hay sugerencias, cambiamos mensaje (opcional, mantenemos SAFE si no hay warning)
            result.message = 'Venta Segura. Ver sugerencias.';
        }

        result.suggested_items = suggestedItems;
        return result;
    }
};
