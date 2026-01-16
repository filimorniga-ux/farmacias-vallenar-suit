
import OpenAI from 'openai';
import { Client } from 'pg';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface InvoiceItemCandidate {
    id: string;
    title: string;
    sku?: string;
    activePrinciple?: string;
    score?: number; // DB full text score
}

export class InvoiceMapperService {

    /**
     * Ask AI to pick the best match for an invoice item from a list of candidates.
     */
    static async findBestMatch(
        invoiceItemName: string,
        invoiceItemCode: string,
        candidates: InvoiceItemCandidate[]
    ): Promise<{ bestMatchId: string | null; confidence: number; reasoning: string }> {

        if (candidates.length === 0) {
            return { bestMatchId: null, confidence: 0, reasoning: "No candidates provided" };
        }

        try {
            const prompt = `
                Act as a Pharmacy Inventory Matcher.
                
                Input Invoice Item: 
                - Name: "${invoiceItemName}"
                - Code/SKU: "${invoiceItemCode}"

                Potential Matches from Database:
                ${candidates.map(c => `- ID: ${c.id} | Name: "${c.title}" | SKU: "${c.sku}" | ActiveP: "${c.activePrinciple || ''}"`).join('\n')}

                Task: Select the ID of the product that is the EXACT same biological product (Bioequivalent) or the same Commercial Brand.
                
                Rules:
                1. If "Genérico" vs "Brand", treat as DIFFERENT unless name implies bioequivalence match is allowed (but usually we match exact products for stock).
                2. If names differ slightly (e.g. "Paracet 500" vs "Paracetamol 500mg"), it IS a match.
                3. If Quantity differs (e.g. x10 vs x20), it is a LOW confidence match (might be a different presentation).
                4. Confidence Score: 0.0 to 1.0. 
                   - 1.0 = Perfect match (Name + Dosage + Qty).
                   - 0.8 = High likely (Minor typo or abbreviation).
                   - < 0.5 = Unsure.

                Return JSON:
                {
                    "bestMatchId": "uuid" | null,
                    "confidence": number,
                    "reasoning": "short explanation"
                }
            `;

            const completion = await openai.chat.completions.create({
                messages: [{ role: "system", content: "You are a precise JSON semantic matcher." }, { role: "user", content: prompt }],
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                temperature: 0.0,
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("Empty AI response");

            const result = JSON.parse(content);
            return {
                bestMatchId: result.bestMatchId,
                confidence: result.confidence || 0,
                reasoning: result.reasoning || "AI Decision"
            };

        } catch (error) {
            console.error("AI Mapping Error:", error);
            return { bestMatchId: null, confidence: 0, reasoning: "AI Error" };
        }
    }

    /**
     * Learn the mapping for future use.
     */
    static async learnMapping(
        client: Client,
        supplierRut: string,
        supplierCode: string,
        supplierName: string,
        ourProductId: string
    ) {
        // Resolve supplier_id from RUT (Assuming we have a suppliers table or we mock it)
        // For now, let's assume we find supplier by RUT or create one.
        // Simplified: We need a supplier_id. 
        // If 'suppliers' table exists, use it. If not, we might need to skip or simplistic logic.

        // Check if supplier exists
        let supplierId: string | null = null;

        const suppRes = await client.query(`SELECT id FROM suppliers WHERE rut = $1`, [supplierRut]);
        if (suppRes.rows.length > 0) {
            supplierId = suppRes.rows[0].id;
        } else {
            // Create dummy supplier for now if not exists
            const newSupp = await client.query(`
                INSERT INTO suppliers (name, rut, contact_email) 
                VALUES ($1, $2, 'unknown@supplier.com') 
                RETURNING id`,
                [`Proveedor ${supplierRut}`, supplierRut]
            );
            supplierId = newSupp.rows[0].id;
        }

        // Upsert into product_suppliers
        await client.query(`
            INSERT INTO product_suppliers (product_id, supplier_id, supplier_sku, supplier_product_name, is_preferred)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (product_id, supplier_id) -- Note: Constraint might differ, usually we want unique (supplier_id, supplier_sku)
            DO UPDATE SET 
                supplier_sku = EXCLUDED.supplier_sku,
                supplier_product_name = EXCLUDED.supplier_product_name,
                updated_at = NOW()
        `, [ourProductId, supplierId, supplierCode, supplierName]);
    }
}
