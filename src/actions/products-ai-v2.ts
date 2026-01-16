import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getSystemConfigSecure, getAIConfigSecure } from './config-v2';

const ProductEnrichmentSchema = z.object({
    dci: z.string().optional().describe('Principio activo (Denominación Común Internacional) del medicamento. Ej: Paracetamol'),
    laboratory: z.string().optional().describe('Laboratorio fabricante. Ej: Chile, Bagó, Saval'),
    format: z.string().optional().describe('Formato farmacéutico. Ej: Comprimidos, Jarabe, Crema'),
    is_bioequivalent: z.boolean().optional().describe('Si es bioequivalente (franja amarilla en Chile)'),
    requires_prescription: z.boolean().optional().describe('Si requiere receta médica (Venta bajo receta)'),
    is_cold_chain: z.boolean().optional().describe('Si requiere cadena de frío (refrigeración)'),
    category_suggestion: z.string().optional().describe('Categoría sugerida. Ej: Analgésicos, Antibióticos, Vitaminas'),
    description_suggestion: z.string().optional().describe('Breve descripción comercial para el punto de venta'),
    units_per_box: z.number().int().optional().describe('Cantidad de unidades internas en la caja'),
});

/**
 * 🧠 Enriquecer datos de producto usando IA
 */
export async function enrichProductDataSecure(productName: string): Promise<{
    success: boolean;
    data?: z.infer<typeof ProductEnrichmentSchema>;
    error?: string;
}> {
    try {
        if (!productName || productName.length < 3) {
            return { success: false, error: 'Nombre de producto muy corto' };
        }

        const aiConfig = await getAIConfigSecure();

        // Use default model if not configured (fallback mechanism)
        const modelName = aiConfig.model || 'gpt-4o';
        const apiKey = aiConfig.apiKey;

        if (!apiKey) {
            return { success: false, error: 'IA no configurada (Falta API Key)' };
        }

        // Create specific provider instance with the DB key
        const openai = createOpenAI({
            apiKey: apiKey,
        });

        try {
            const { object } = await generateObject({
                model: openai(modelName) as any,
                schema: ProductEnrichmentSchema,
                prompt: `
                    Eres un experto farmacéutico en Chile. Identifica los datos técnicos del siguiente producto farmacéutico basándote en su nombre comercial o genérico.
                    
                    Nombre del producto: "${productName}"
                    
                    Reglas:
                    1. Si no estás seguro del laboratorio, intenta inferirlo o déjalo genérico.
                    2. Para bioequivalencia, asume FALSE a menos que sea un genérico bioequivalente conocido en Chile.
                    3. La categoría debe ser una de: Analgésicos, Antiinflamatorios, Antibióticos, Antialérgicos, Vitaminas, Cardiología, Respiratorio, Gastrointestinal, Dermatología, Psiquiatría, Neurología, Ginecología, Urología, Oftalmología, Otorrino, Dental, Insumos, Otros.
                    4. DCI debe ser el nombre genérico principal.
                `,
                temperature: 0.1, // Baja temperatura para datos factuales
            });

            return { success: true, data: object };

        } catch (aiError: any) {
            console.error('❌ AI Enrichment failed detailed:', JSON.stringify(aiError, Object.getOwnPropertyNames(aiError)));
            return { success: false, error: aiError.message || 'Error consultando a la IA' };
        }

    } catch (error: any) {
        console.error({ error }, 'Error in enrichProductDataSecure');
        return { success: false, error: 'Error interno de servidor' };
    }
}
