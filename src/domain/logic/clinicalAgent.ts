
import { Customer, SaleItem, ClinicalAnalysisResult, HealthTag } from '../types';

const BLOCK_MAP = {
    HYPERTENSION: ['Pseudoefedrina', 'Vasoconstrictor'],
    PREGNANT: ['Ibuprofeno', 'Naproxeno'],
};

export const ClinicalAgent = {
    analyzeSymptom(symptom: string, customer: Customer): ClinicalAnalysisResult {
        if (customer.healthTags.includes('HYPERTENSION') && symptom.includes('congestión')) {
            return { status: 'WARNING', message: '¡Cuidado! El cliente es hipertenso. Evite pseudoefedrina.' };
        }
        return { status: 'SAFE', message: 'Análisis clínico rápido OK.' };
    },

    analyzeCart(cartItems: SaleItem[], customer: Customer): ClinicalAnalysisResult {
        let result: ClinicalAnalysisResult = { status: 'SAFE', message: 'Venta OK.' };
        const blockingItems: string[] = [];
        const suggestedItems: string[] = [];

        cartItems.forEach(item => {
            if (customer.healthTags.includes('PREGNANT') && BLOCK_MAP.PREGNANT.some(name => item.name.includes(name))) {
                result.status = 'BLOCK';
                result.message = `❌ BLOQUEADO: ${item.name} contraindicado para embarazo.`;
                blockingItems.push(item.name);
            }

            if (item.name.includes('Antibiótico')) {
                suggestedItems.push('Probiótico (Reponer flora intestinal)');
            }
        });

        if (blockingItems.length > 0) {
            result.message = `¡ALERTA CLÍNICA! ${blockingItems.join(', ')} debe ser revisado por Q.F.`;
            result.blockingItems = blockingItems;
        }

        result.suggestedItems = suggestedItems;
        return result;
    }
};
