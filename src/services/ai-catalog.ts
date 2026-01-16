
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface ProductMetadata {
    unitsPerBox: number;
    format: string;
    isBioequivalent: boolean;
    activeIngredient: string | null;
    commonName: string | null; // e.g. "Paracetamol"
}

export class AICatalogService {
    /**
     * Parses a raw product string to extract structured metadata.
     * Use this when Regex fails or for validation.
     * Cost: ~0.5 tokens per char (Cheap with GPT-4o-mini).
     */
    static async parseProductMetadata(rawName: string): Promise<ProductMetadata> {
        try {
            const prompt = `
            Analyze this pharmacy product name and extract metadata.
            Product: "${rawName}"
            
            Return JSON:
            {
                "unitsPerBox": number (default 1 if liquid/cream, else count pills/units),
                "format": "string" (e.g. Comprimidos, Jarabe, Crema, Pack),
                "isBioequivalent": boolean (true if "BE" or "BIO" present),
                "activeIngredient": "string" or null,
                "commonName": "string" or null
            }
            `;

            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "gpt-4o-mini", // Fast & Cheap
                response_format: { type: "json_object" },
                temperature: 0,
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("No AI response");

            return JSON.parse(content) as ProductMetadata;
        } catch (error) {
            console.error("AI Parse Error:", error);
            // Fallback
            return {
                unitsPerBox: 1,
                format: 'Unidad',
                isBioequivalent: false,
                activeIngredient: null,
                commonName: rawName
            };
        }
    }
}
