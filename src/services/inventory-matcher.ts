
import { Client } from 'pg';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Ensure OpenAI client is initialized
const apiKey = process.env.OPENAI_API_KEY || 'dummy-key-for-init';
if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️ OPENAI_API_KEY is missing. AI matching will fail.");
}
const openai = new OpenAI({
    apiKey: apiKey,
});

// Reuse DB connection logic or create new pool
// For this service, we'll create a new Client for batch processing to avoid interfering with web app pool if any
const getClient = () => new Client({ connectionString: process.env.DATABASE_URL });

export interface MatchInput {
    title: string;
    sku?: string;
    branch?: string;
    lab?: string;
    ispCode?: string;
    barcodes?: string;
}

export interface MatchResult {
    matchType: 'ISP_MATCH' | 'BARCODE_MATCH' | 'AI_SUGGESTION' | 'AI_SKIPPED' | '';
    targetProductId: string | null; // ID if found in local DB
    confidence: number;
    status: 'MATCHED' | 'NEEDS_REVIEW' | 'PENDING';
    suggestion: any;
}

export const matchProduct = async (client: Client, input: MatchInput): Promise<MatchResult> => {
    let matchType: MatchResult['matchType'] = '';
    let targetProductId: string | null = null;
    let confidence = 0;
    let suggestion: any = null;
    let status: MatchResult['status'] = 'NEEDS_REVIEW';

    // --- LEVEL 1: ISP CODE MATCH ---
    if (input.ispCode) {
        const ispRes = await client.query(`
            SELECT registration_number, product_name FROM isp_registry 
            WHERE registration_number = $1
        `, [input.ispCode]);

        if (ispRes.rows.length > 0) {
            matchType = 'ISP_MATCH';
            confidence = 1.0;
            suggestion = {
                source: 'ISP_REGISTRY',
                ispData: ispRes.rows[0],
                action: 'CREATE_FROM_ISP'
            };
            // Note: We don't settle targetProductId yet unless we find a linked product. 
            // Ideally we would search in products table by isp_code if we had it.
        }
    }

    // --- LEVEL 2: BARCODE MATCH ---
    if (!matchType && input.barcodes) {
        const barcodes = input.barcodes.split(',').map(b => b.trim()).filter(b => b);
        if (barcodes.length > 0) {
            const productRes = await client.query(`
                SELECT id, name, barcode FROM products 
                WHERE barcode = ANY($1)
            `, [barcodes]);

            if (productRes.rows.length > 0) {
                matchType = 'BARCODE_MATCH';
                targetProductId = productRes.rows[0].id;
                confidence = 1.0;
                status = 'MATCHED';
                suggestion = {
                    source: 'PRODUCT_TABLE',
                    product: productRes.rows[0],
                    matchParams: 'BARCODE'
                };
            }
        }
    }

    // --- LEVEL 3: AI FUZZY MATCH ---
    if (!matchType) {
        const candidatesRes = await client.query(`
            SELECT registration_number, product_name, holder_name 
            FROM isp_registry 
            WHERE product_name ILIKE $1 OR active_component ILIKE $1
            LIMIT 5
        `, [`%${input.title.split(' ')[0]}%`]);

        const candidates = candidatesRes.rows;

        if (candidates.length > 0) {
            const prompt = `
                Actúa como experto farmacéutico.
                Tengo este producto sucio del inventario: "${input.title}" (Lab: "${input.lab || 'N/A'}", Branch: "${input.branch || 'N/A'}").
                
                Aquí tienes posibles candidatos oficiales del ISP Chile:
                ${JSON.stringify(candidates)}
                
                1. ¿Corresponde alguno de estos candidatos al producto sucio?
                2. Si es así, dame su registration_number y un confidence_score (0-1).
                3. Si no, genera un nombre estandarizado sugerido.
                
                Responde SOLO en JSON formato:
                {
                    "match_found": boolean,
                    "registration_number": string | null,
                    "suggested_name": string,
                    "confidence": number,
                    "reason": string
                }
            `;

            try {
                const completion = await openai.chat.completions.create({
                    messages: [{ role: "user", content: prompt }],
                    model: "gpt-4o",
                    response_format: { type: "json_object" }
                });

                const content = completion.choices[0].message.content;
                if (content) {
                    const result = JSON.parse(content);
                    suggestion = {
                        source: 'AI_GPT4',
                        ...result
                    };
                    confidence = result.confidence || 0.5;
                    matchType = 'AI_SUGGESTION';

                    if (result.match_found && result.confidence > 0.85) {
                        status = 'NEEDS_REVIEW'; // Safety first for AI
                    }
                }
            } catch (aiError) {
                console.error("AI Error", aiError);
            }
        } else {
            suggestion = { source: 'AI_SKIPPED', reason: 'No ISP candidates found for context' };
        }
    }

    return { matchType, targetProductId, confidence, status, suggestion };
};

interface InventoryImport {
    id: string;
    source_file: string;
    raw_branch?: string;
    raw_sku?: string;
    raw_title: string;
    raw_category?: string;
    raw_lab?: string;
    raw_stock?: number;
    raw_price?: number;
    raw_isp_code?: string;
    raw_barcodes?: string; // Comma separated
    ai_confidence_score?: number;
    ai_suggestion?: any;
    status: string;
}

export const processImportBatch = async (batchSize: number = 50) => {
    const client = getClient();
    await client.connect();

    try {
        console.log(`🤖 AI Matcher: Processing batch of ${batchSize}...`);

        // 1. Select Pending
        const res = await client.query<InventoryImport>(`
            SELECT * FROM inventory_imports 
            WHERE processed_status = 'PENDING' 
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        `, [batchSize]);

        const rows = res.rows;
        if (rows.length === 0) {
            console.log('✅ AI Matcher: No pending items.');
            return { processed: 0, message: "No pending items" };
        }

        console.log(`   Found ${rows.length} pending items.`);

        for (const row of rows) {
            const input: MatchInput = {
                title: row.raw_title,
                sku: row.raw_sku,
                branch: row.raw_branch,
                lab: row.raw_lab,
                ispCode: row.raw_isp_code,
                barcodes: row.raw_barcodes
            };

            const result = await matchProduct(client, input);

            // --- ARBITRAJE DE PRECIOS (Si existe match de producto) ---
            if (result.targetProductId) {
                // Check price diff
                // TODO: Implement historical price check if needed
            }

            // --- UPDATE ROW ---
            await client.query(`
                UPDATE inventory_imports 
                SET 
                    target_product_id = $1,
                    processed_status = $2,
                    ai_suggestion = $3,
                    ai_confidence_score = $4,
                    processed_at = NOW()
                WHERE id = $5
            `, [result.targetProductId, result.status, result.suggestion, result.confidence, row.id]);
        }

        console.log(`✅ Batch procesado.`);
        return { processed: rows.length };

    } catch (error) {
        console.error("🔥 Error in batch process:", error);
        throw error;
    } finally {
        await client.end();
    }
};
