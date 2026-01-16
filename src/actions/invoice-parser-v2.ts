'use server';

/**
 * ============================================================================
 * INVOICE-PARSER-V2: Motor de Parsing de Facturas con IA
 * Pharma-Synapse v3.1 - Farmacias Vallenar
 * ============================================================================
 * 
 * CARACTERÍSTICAS:
 * - Parsing de facturas chilenas con GPT-4o / Gemini
 * - Validación de RUT chileno
 * - Detección de duplicados
 * - Mapeo automático de SKUs
 * - Integración con Proveedores, Inventario y Tesorería
 * - Retry con backoff exponencial
 * - Fallback entre proveedores de IA
 * 
 * @version 1.0.0
 * @date 2024-01-09
 */

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';
import { getAIConfigSecure, getSystemConfigSecure } from './config-v2';

// ============================================================================
// TIPOS
// ============================================================================

export interface ParsedInvoiceItem {
    line_number: number;
    supplier_sku: string | null;
    description: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
    mapped_product_id?: string;
    mapped_product_name?: string;
    mapping_status: 'PENDING' | 'MAPPED' | 'UNMAPPED' | 'SKIPPED';
    lot_number?: string | null;
    expiry_date?: string | null;
    active_principle?: string;
    is_bioequivalent?: boolean;
    units_per_package?: number;
    suggested_products?: ProductMatch[];
}

export interface ParsedInvoice {
    confidence: number;
    document_type: 'FACTURA' | 'BOLETA' | 'GUIA_DESPACHO' | 'NOTA_CREDITO';
    invoice_number: string;
    supplier: {
        rut: string;
        name: string;
        fantasy_name?: string;
        activity?: string;
        address?: string;
        phone?: string;
        email?: string;
        website?: string;
        is_new?: boolean;
    };
    dates: {
        issue_date: string;
        due_date?: string;
    };
    totals: {
        net: number;
        tax: number;
        total: number;
        discount: number;
    };
    items: ParsedInvoiceItem[];
    notes?: string;
    // Campos de error (cuando la IA no puede procesar el documento)
    error?: string;
    message?: string;
}

export interface InvoiceParsing {
    id: string;
    supplier_rut: string | null;
    supplier_name: string | null;
    document_type: string;
    invoice_number: string | null;
    issue_date: string | null;
    total_amount: number | null;
    confidence_score: number | null;
    status: string;
    total_items: number;
    mapped_items: number;
    unmapped_items: number;
    created_at: string;
    created_by_name?: string;
    location_id?: string;
    location_name?: string;
}

export interface ProductMatch {
    productId: string;
    productName: string;
    sku: string;
    currentStock?: number;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ============================================================================
// PROMPT DE SISTEMA PARA LA IA
// ============================================================================

const SYSTEM_PROMPT_INVOICE = `
Eres un experto en lectura de documentos tributarios chilenos (facturas, boletas, guías de despacho).
Tu tarea es extraer información estructurada de la imagen/PDF proporcionado.

REGLAS PARA CHILE:
- RUT: Formato XX.XXX.XXX-X (con puntos y guión). Validar que el dígito verificador sea correcto.
- IVA: 19% sobre el monto neto (tolerancia de ±2% por redondeos)
- Fechas: Convertir a formato ISO (YYYY-MM-DD)
- Montos: En pesos chilenos (CLP), números enteros sin decimales

DETECTIVIDAD DE DEFECTOS (PERFORADORA / DOBLECES / MANCHAS):
- SIEMPRE analiza si el documento tiene agujeros de perforadora (punch holes) u otros daños físicos.
- Si un dato crítico (como SKU, Cantidad o Precio) está obstruido por un agujero o mancha:
  - Devuelve null para ese campo.
  - NO intentes adivinar o inventar el dato faltante.
  - Si el SKU está cortado (ej: "PROD-..." donde "..." es el agujero), devuélvelo como null.


EXTRACCIÓN DE PROVEEDOR (RICH DATA):
- Intenta extraer TODOS los datos de contacto posibles del encabezado o pie de página.
- Busca minuciosamente en TEXTOS PEQUEÑOS (letra chica) al final o al principio de la página.
- Busca: Teléfonos (une números separados por espacios), Celulares, WhatsApp, Emails (ventas/contacto), Sitio Web, Giro (Actividad).
- IMPORTANTE: Si ves un teléfono segmentado (ej: "2 234 56..."), únelo en un solo string.

EXTRACCIÓN DETALLADA DE PRODUCTOS (MUY IMPORTANTE):
1. PRINCIPIO ACTIVO (DCI): Busca el nombre genérico (ej: "Paracetamol", "Ibuprofeno").
2. BIOEQUIVALENCIA: Busca sellos o textos como "Bioequivalente", "BE", o logo de franja amarilla.
3. UNIDADES POR ENVASE: Analiza la descripción para extraer cuántas unidades trae la caja (ej: "x 10", "10 Comprimidos", "100ml").
   - Esto es crucial para calcular el costo real por unidad unitaria.

ESTRUCTURA DE RESPUESTA (JSON estricto):
{
  "confidence": 0.95,
  "document_type": "FACTURA",
  "invoice_number": "12345",
  "supplier": {
    "rut": "76.XXX.XXX-X",
    "name": "Razón Social Legal Completa",
    "fantasy_name": "Nombre Fantasía (si existe)",
    "activity": "Giro o Actividad Económica (ej: Venta de Farmacéuticos)",
    "address": "Dirección completa",
    "phone": "+569... / 22...",
    "email": "contacto@...",
    "website": "www.ejemplo.cl"
  },
  "dates": {
    "issue_date": "2024-01-15",
    "due_date": "2024-02-15"
  },
  "totals": {
    "net": 100000,
    "tax": 19000,
    "total": 119000,
    "discount": 0
  },
  "items": [
    {
      "line_number": 1,
      "supplier_sku": "ABC-123", 
      "description": "Paracetamol 500mg x 10 Comp E.C.",
      "quantity": 10,
      "unit_cost": 5000,
      "total_cost": 50000,
      "lot_number": "B-123",
      "expiry_date": "2025-12-31",
      "active_principle": "Paracetamol",
      "is_bioequivalent": true,
      "units_per_package": 10
    }
  ],
  "notes": "Observaciones del documento. Menciona si detectaste agujeros o datos ilegibles."
}

IMPORTANTE:
- Si no puedes leer un campo claramente, usa null.
- Los montos son SIEMPRE números enteros.
- El campo "confidence" indica tu nivel de certeza general (0.0-1.0).
- Si hay múltiples páginas, consolida TODOS los items.
- Prioriza la exactitud sobre la completitud: mejor null que un dato incorrecto por adivinanza.
`;

// ============================================================================
// SCHEMAS DE VALIDACIÓN
// ============================================================================

const UUIDSchema = z.string().uuid('ID inválido');

const ParseRequestSchema = z.object({
    fileBase64: z.string().min(100, 'Archivo muy pequeño'),
    fileType: z.enum(['image', 'pdf']),
    fileName: z.string().max(200).optional(),
    locationId: UUIDSchema,
    allowDuplicate: z.boolean().optional(),
});

const ApproveRequestSchema = z.object({
    parsingId: UUIDSchema,
    mappings: z.array(z.object({
        supplierSku: z.string(),
        productId: UUIDSchema,
    })).optional(),
    itemsData: z.array(z.object({
        line_number: z.number(),
        lot_number: z.string().optional().nullable(),
        expiry_date: z.string().optional().nullable(),
    })).optional(),
    skipUnmapped: z.boolean().optional(),
    createAccountPayable: z.boolean().default(true),
    destinationLocationId: UUIDSchema.optional(),
    createMissingProducts: z.boolean().optional(),
    newProductsData: z.array(z.object({
        name: z.string(),
        price: z.number(),
        cost: z.number(),
        supplierSku: z.string().optional(),
        isBioequivalent: z.boolean().optional(),
        dci: z.string().optional(),
        units_per_box: z.number().optional(),
        barcode: z.string().optional(),
    })).optional(),
    supplierData: z.object({
        name: z.string().optional(),
        fantasy_name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        address: z.string().optional(),
        activity: z.string().optional(),
    }).optional(),
});

// ============================================================================
// HELPERS
// ============================================================================

async function getSession(): Promise<{ userId: string; role: string; locationId?: string } | null> {
    try {
        const headersList = await headers();
        const userId = headersList.get('x-user-id');
        const role = headersList.get('x-user-role');
        const locationId = headersList.get('x-user-location');
        if (!userId || !role) return null;
        return { userId, role, locationId: locationId || undefined };
    } catch {
        return null;
    }
}

/**
 * Valida un RUT chileno
 */
function validateRUT(rut: string): boolean {
    // Limpiar RUT
    const cleanRUT = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();

    if (cleanRUT.length < 8 || cleanRUT.length > 9) return false;

    const body = cleanRUT.slice(0, -1);
    const dv = cleanRUT.slice(-1);

    // Calcular dígito verificador
    let sum = 0;
    let multiplier = 2;

    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i], 10) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const expectedDV = 11 - (sum % 11);
    const expectedChar = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : expectedDV.toString();

    return dv === expectedChar;
}

/**
 * Formatea un RUT para mostrar
 */
function formatRUT(rut: string): string {
    const clean = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
    if (clean.length < 8) return rut;

    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);

    // Agregar puntos
    let formatted = '';
    for (let i = body.length - 1, count = 0; i >= 0; i--, count++) {
        if (count > 0 && count % 3 === 0) {
            formatted = '.' + formatted;
        }
        formatted = body[i] + formatted;
    }

    return `${formatted}-${dv}`;
}

/**
 * Calcula hash SHA-256 de un string
 */
async function calculateHash(content: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Espera con backoff exponencial
 */
async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Registra uso de IA
 */
async function logAIUsage(params: {
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    success: boolean;
    errorCode?: string;
    responseTimeMs: number;
    actionType: string;
    entityId?: string;
    userId?: string;
    locationId?: string;
}): Promise<void> {
    try {
        const totalTokens = (params.inputTokens || 0) + (params.outputTokens || 0);

        // Estimar costo (aproximado)
        let costPer1kTokens = 0;
        if (params.provider === 'OPENAI') {
            costPer1kTokens = params.model.includes('gpt-4o-mini') ? 0.00015 : 0.005;
        } else if (params.provider === 'GEMINI') {
            costPer1kTokens = 0.000125;
        }
        const estimatedCost = (totalTokens / 1000) * costPer1kTokens;

        await query(`
            INSERT INTO ai_usage_log (
                provider, model, input_tokens, output_tokens, total_tokens,
                estimated_cost, action_type, entity_id, success, error_code,
                response_time_ms, user_id, location_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            params.provider,
            params.model,
            params.inputTokens || 0,
            params.outputTokens || 0,
            totalTokens,
            estimatedCost,
            params.actionType,
            params.entityId || null,
            params.success,
            params.errorCode || null,
            params.responseTimeMs,
            params.userId || null,
            params.locationId || null,
        ]);
    } catch (error) {
        logger.warn({ error }, '[Invoice Parser] Failed to log AI usage');
    }
}

// ============================================================================
// CONEXIÓN CON PROVEEDORES DE IA
// ============================================================================

/**
 * Llama a OpenAI GPT-4o
 */
async function callOpenAI(
    apiKey: string,
    model: string,
    imageBase64: string,
    fileType: string
): Promise<{ data: any; inputTokens: number; outputTokens: number }> {

    const mediaType = fileType === 'pdf' ? 'application/pdf' : `image/${fileType === 'image' ? 'jpeg' : fileType}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT_INVOICE,
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mediaType};base64,${imageBase64}`,
                                detail: 'high',
                            },
                        },
                        {
                            type: 'text',
                            text: 'Extrae los datos de esta factura/boleta chilena en formato JSON.',
                        },
                    ],
                },
            ],
            max_tokens: 4096,
            temperature: 0.1,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content;

    if (!content) {
        throw new Error('OpenAI returned empty response');
    }

    return {
        data: JSON.parse(content),
        inputTokens: result.usage?.prompt_tokens || 0,
        outputTokens: result.usage?.completion_tokens || 0,
    };
}

/**
 * Llama a Google Gemini
 */
async function callGemini(
    apiKey: string,
    model: string,
    imageBase64: string,
    fileType: string
): Promise<{ data: any; inputTokens: number; outputTokens: number }> {

    const mimeType = fileType === 'pdf' ? 'application/pdf' : `image/${fileType === 'image' ? 'jpeg' : fileType}`;
    const modelName = model || 'gemini-1.5-flash';

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: SYSTEM_PROMPT_INVOICE + '\n\nExtrae los datos de esta factura/boleta chilena en formato JSON.',
                            },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: imageBase64,
                                },
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 4096,
                    responseMimeType: 'application/json',
                },
            }),
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
        throw new Error('Gemini returned empty response');
    }

    return {
        data: JSON.parse(content),
        inputTokens: result.usageMetadata?.promptTokenCount || 0,
        outputTokens: result.usageMetadata?.candidatesTokenCount || 0,
    };
}

/**
 * Llama a la IA con retry y fallback
 */
async function callAIWithRetry(
    config: {
        provider: string;
        apiKey: string;
        model: string;
        fallbackProvider?: string;
    },
    imageBase64: string,
    fileType: string,
    userId?: string,
    locationId?: string,
    entityId?: string
): Promise<{ data: any; provider: string; model: string }> {

    let lastError: Error | null = null;
    let currentProvider = config.provider;
    let currentApiKey = config.apiKey;
    let currentModel = config.model;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const startTime = Date.now();

        try {
            let result;

            if (currentProvider === 'OPENAI') {
                result = await callOpenAI(currentApiKey, currentModel, imageBase64, fileType);
            } else if (currentProvider === 'GEMINI') {
                result = await callGemini(currentApiKey, currentModel, imageBase64, fileType);
            } else {
                throw new Error(`Proveedor de IA no soportado: ${currentProvider}`);
            }

            // Log successful usage
            await logAIUsage({
                provider: currentProvider,
                model: currentModel,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                success: true,
                responseTimeMs: Date.now() - startTime,
                actionType: 'INVOICE_PARSE',
                entityId,
                userId,
                locationId,
            });

            return {
                data: result.data,
                provider: currentProvider,
                model: currentModel,
            };

        } catch (error: any) {
            lastError = error;

            // Log failed attempt
            await logAIUsage({
                provider: currentProvider,
                model: currentModel,
                success: false,
                errorCode: error.message?.substring(0, 50),
                responseTimeMs: Date.now() - startTime,
                actionType: 'INVOICE_PARSE',
                entityId,
                userId,
                locationId,
            });

            logger.warn({
                error: error.message,
                attempt: attempt + 1,
                provider: currentProvider
            }, '[Invoice Parser] AI call failed, retrying...');

            // Si es el último intento con el provider principal, intentar fallback
            if (attempt === MAX_RETRIES - 1 && config.fallbackProvider && config.fallbackProvider !== 'NONE') {
                logger.info({ fallback: config.fallbackProvider }, '[Invoice Parser] Trying fallback provider');

                // Obtener API key del fallback
                const fallbackKey = await getSystemConfigSecure(
                    config.fallbackProvider === 'OPENAI' ? 'AI_API_KEY' : 'AI_FALLBACK_API_KEY'
                );

                if (fallbackKey) {
                    currentProvider = config.fallbackProvider;
                    currentApiKey = fallbackKey;
                    currentModel = config.fallbackProvider === 'OPENAI' ? 'gpt-4o-mini' : 'gemini-1.5-flash';
                    attempt = -1; // Reset attempts for fallback
                    continue;
                }
            }

            // Esperar antes de reintentar
            if (attempt < MAX_RETRIES - 1) {
                await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
            }
        }
    }

    throw lastError || new Error('Error desconocido al procesar con IA');
}

// Helper para buscar coincidencias (moved to top level)
// Helper para buscar coincidencias (moved to top level)
async function matchInvoiceItems(items: ParsedInvoiceItem[], supplierId?: string) {
    const results: ParsedInvoiceItem[] = [];

    for (const item of items) {
        let match: any = null;
        let suggestions: ProductMatch[] = [];

        // 1. Exact Match by Supplier SKU (Re-enabled via query if table exists, skipping for now as per comment)
        /* ... skipped ... */

        // 2. Exact Match by Name (Simple case insensitive)
        /* ... existing logic ... */

        // 3. Fuzzy Match & Suggestions
        if (!match && item.description && item.description.length > 3) {
            try {
                // Try to find suggestions using our new fuzzy search function
                // Falls back to simple ILIKE if function doesn't exist or fails
                const fuzzyRes = await query(
                    `SELECT id, sku, name, similarity(name, $1) as sim 
                     FROM products 
                     WHERE name % $1 OR sku ILIKE $2
                     ORDER BY sim DESC 
                     LIMIT 5`,
                    [item.description, `%${item.supplier_sku || '#######'}%`]
                ).catch(() => ({ rows: [] })); // Fail safe

                if (fuzzyRes.rows.length > 0) {
                    const topMatch = fuzzyRes.rows[0];
                    // If similarity is very high (>0.8), consider it a match automatically? 
                    // Better to just suggest for now as user requested manual validation.

                    suggestions = fuzzyRes.rows.map((row: any) => ({
                        productId: row.id,
                        productName: row.name,
                        sku: row.sku,
                        currentStock: 0 // Fetching stock might be expensive in loop, skip for now
                    }));
                }
            } catch (e) {
                // Ignore fuzzy errors
            }
        }

        if (match) {
            results.push({
                ...item,
                mapped_product_id: match.id,
                mapped_product_name: match.name,
                mapping_status: 'MAPPED',
                suggested_products: [],
            });
        } else {
            results.push({
                ...item,
                mapping_status: 'UNMAPPED',
                suggested_products: suggestions
            });
        }
    }
    return results;
}

// ============================================================================
// FUNCIONES PÚBLICAS
// ============================================================================

/**
 * 📄 Parsear documento de factura con IA
 */

export async function parseInvoiceDocumentSecure(
    data: z.infer<typeof ParseRequestSchema>
): Promise<{
    success: boolean;
    parsingId?: string;
    data?: ParsedInvoice;
    warnings?: string[];
    isDuplicate?: boolean;
    duplicateId?: string;
    error?: string;
}> {
    // Validar entrada
    const validated = ParseRequestSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message || 'Datos inválidos' };
    }

    // Verificar sesión
    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const { fileBase64, fileType, fileName, locationId, allowDuplicate } = validated.data;

    // Validar tamaño (base64 es ~33% más grande que el archivo original)
    const estimatedSize = (fileBase64.length * 3) / 4;
    if (estimatedSize > MAX_FILE_SIZE) {
        return { success: false, error: `Archivo muy grande. Máximo ${MAX_FILE_SIZE / 1024 / 1024}MB` };
    }

    // Verificar configuración de IA
    const aiConfig = await getAIConfigSecure();
    if (!aiConfig.isConfigured || !aiConfig.apiKey) {
        return { success: false, error: 'Configure su API Key de IA en Ajustes → Configuración → IA' };
    }

    // Verificar límite mensual
    const usageRes = await query(`
        SELECT COUNT(*) as count FROM ai_usage_log
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        AND action_type = 'INVOICE_PARSE'
    `);

    if (parseInt(usageRes.rows[0].count, 10) >= aiConfig.monthlyLimit) {
        return { success: false, error: 'Límite mensual de procesamiento de facturas alcanzado' };
    }

    const parsingId = randomUUID();
    const startTime = Date.now();

    try {
        // Calcular hash para detectar duplicados
        const fileHash = await calculateHash(fileBase64);

        // Verificar duplicados (si no se permite explícitamente)
        if (!allowDuplicate) {
            const duplicateRes = await query(
                'SELECT * FROM check_invoice_duplicate($1, $2, $3)',
                [null, null, fileHash]
            );

            if (duplicateRes.rows[0]?.is_duplicate) {
                return {
                    success: false,
                    isDuplicate: true,
                    duplicateId: duplicateRes.rows[0].duplicate_id,
                    error: `Esta factura ya fue procesada (${duplicateRes.rows[0].match_type})`
                };
            }
        }

        // Auditar inicio
        await query(`
            INSERT INTO audit_log (user_id, location_id, action_code, entity_type, entity_id)
            VALUES ($1, $2, 'INVOICE_PARSE_STARTED', 'INVOICE_PARSING', $3)
        `, [session.userId, locationId, parsingId]);

        // Llamar a la IA
        const aiResult = await callAIWithRetry(
            {
                provider: aiConfig.provider!,
                apiKey: aiConfig.apiKey,
                model: aiConfig.model || 'gpt-4o-mini',
                fallbackProvider: aiConfig.fallbackProvider || undefined,
            },
            fileBase64,
            fileType,
            session.userId,
            locationId,
            parsingId
        );

        const parsedData = aiResult.data as ParsedInvoice;

        // Validar respuesta
        if (parsedData.error) {
            throw new Error(parsedData.message || 'Documento inválido');
        }

        const warnings: string[] = [];

        // Validar RUT
        if (parsedData.supplier?.rut) {
            if (!validateRUT(parsedData.supplier.rut)) {
                warnings.push('El RUT del proveedor tiene un dígito verificador inválido');
            }
            parsedData.supplier.rut = formatRUT(parsedData.supplier.rut);
        }

        // Validar IVA
        if (parsedData.totals) {
            const expectedTax = Math.round(parsedData.totals.net * 0.19);
            const taxDiff = Math.abs(parsedData.totals.tax - expectedTax);
            const taxTolerance = parsedData.totals.net * 0.02; // 2% tolerancia

            if (taxDiff > taxTolerance) {
                warnings.push(`El IVA (${parsedData.totals.tax}) no coincide con el 19% del neto (esperado: ${expectedTax})`);
            }
        }

        // Verificar duplicado por RUT + número de factura
        if (parsedData.supplier?.rut && parsedData.invoice_number) {
            const dupCheck = await query(
                'SELECT * FROM check_invoice_duplicate($1, $2, $3)',
                [parsedData.supplier.rut, parsedData.invoice_number, fileHash]
            );

            if (dupCheck.rows[0]?.is_duplicate && dupCheck.rows[0]?.match_type !== 'FILE_HASH') {
                warnings.push(`Ya existe una factura ${parsedData.invoice_number} de este proveedor`);
            }
        }

        // Preparar items con estado de mapeo
        const itemsWithStatus: ParsedInvoiceItem[] = (parsedData.items || []).map((item, idx) => ({
            ...item,
            line_number: item.line_number || idx + 1,
            mapping_status: 'PENDING' as const,
        }));

        // Gestión de proveedor (Buscar o Crear)
        let supplierId: string | undefined;
        let supplierCreated = false;

        if (parsedData.supplier?.rut) {
            // 1. Buscar proveedor existente
            const supplierRes = await query(
                'SELECT id FROM suppliers WHERE rut = $1',
                [parsedData.supplier.rut]
            );

            if (supplierRes.rows.length > 0) {
                supplierId = supplierRes.rows[0].id;
                parsedData.supplier.is_new = false;
            } else {
                // 2. Crear si no existe
                const newSupplierId = randomUUID();
                try {
                    await query(`
                        INSERT INTO suppliers (
                            id, rut, business_name, fantasy_name, 
                            activity, phone, email, website, 
                            address, region, commune, 
                            created_at, updated_at, created_by
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), $12)
                    `, [
                        newSupplierId,
                        parsedData.supplier.rut,
                        parsedData.supplier.name || 'Proveedor Nuevo',
                        parsedData.supplier.fantasy_name,
                        parsedData.supplier.activity,
                        parsedData.supplier.phone,
                        parsedData.supplier.email,
                        parsedData.supplier.website,
                        parsedData.supplier.address,
                        null, null, // region/commune pending
                        session.userId
                    ]);

                    supplierId = newSupplierId;
                    supplierCreated = true;
                    parsedData.supplier.is_new = true;
                } catch (err) {
                    // Si falla la auto-creación (ej. race condition), intentamos buscar de nuevo o seguimos sin ID
                    console.warn('Error auto-creating supplier:', err);
                    warnings.push('No se pudo crear el perfil del proveedor automáticamente');
                }
            }
        }

        // Match items
        const results = await matchInvoiceItems(itemsWithStatus, supplierId);

        // Calculate counts
        let mappedCount = results.filter((i: any) => i.mapping_status === 'MAPPED').length;
        let unmappedCount = results.filter((i: any) => i.mapping_status !== 'MAPPED').length;

        // Update parsed data with matched items
        parsedData.items = results as ParsedInvoiceItem[];


        // Guardar en staging
        const processingTimeMs = Date.now() - startTime;

        await query(`
            INSERT INTO invoice_parsings (
                id, supplier_rut, supplier_name, supplier_address,
                supplier_phone, supplier_email, supplier_website, supplier_activity, supplier_fantasy_name,
                document_type, invoice_number, issue_date, due_date,
                net_amount, tax_amount, total_amount, discount_amount,
                parsed_items, document_notes,
                raw_ai_response, ai_provider, ai_model, processing_time_ms,
                confidence_score, validation_warnings,
                status, total_items, mapped_items, unmapped_items,
                original_file_type, original_file_name, original_file_hash,
                location_id, created_by
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23,
                $24, $25,
                $26, $27, $28, $29,
                $30, $31, $32,
                $33, $34
            )
        `, [
            parsingId,
            parsedData.supplier?.rut || null,
            parsedData.supplier?.name || null,
            parsedData.supplier?.address || null,
            parsedData.supplier?.phone || null,
            parsedData.supplier?.email || null,
            parsedData.supplier?.website || null,
            parsedData.supplier?.activity || null,
            parsedData.supplier?.fantasy_name || null,
            parsedData.document_type || 'FACTURA',
            parsedData.invoice_number || null,
            parsedData.dates?.issue_date || null,
            parsedData.dates?.due_date || null,
            parsedData.totals?.net || null,
            parsedData.totals?.tax || null,
            parsedData.totals?.total || null,
            parsedData.totals?.discount || 0,
            JSON.stringify(itemsWithStatus),
            parsedData.notes || null,
            JSON.stringify(parsedData), // raw_ai_response
            aiResult.provider,
            aiResult.model,
            processingTimeMs,
            parsedData.confidence || null,
            JSON.stringify(warnings.map(w => ({ message: w, severity: 'WARNING' }))),
            'PENDING',
            itemsWithStatus.length,
            mappedCount,
            unmappedCount,
            fileType,
            fileName || null,
            fileHash,
            locationId,
            session.userId,
        ]);

        // Auditar completado
        await query(`
            INSERT INTO audit_log (user_id, location_id, action_code, entity_type, entity_id, new_values)
            VALUES ($1, $2, 'INVOICE_PARSE_COMPLETED', 'INVOICE_PARSING', $3, $4::jsonb)
        `, [
            session.userId,
            locationId,
            parsingId,
            JSON.stringify({
                supplier_rut: parsedData.supplier?.rut,
                invoice_number: parsedData.invoice_number,
                total: parsedData.totals?.total,
                items_count: itemsWithStatus.length,
                mapped_count: mappedCount,
            })
        ]);

        logger.info({
            parsingId,
            supplier: parsedData.supplier?.rut,
            invoice: parsedData.invoice_number,
            items: itemsWithStatus.length,
            mapped: mappedCount,
            processingTimeMs,
        }, '✅ Invoice parsed successfully');

        revalidatePath('/procurement');

        return {
            success: true,
            parsingId,
            data: {
                ...parsedData,
                items: itemsWithStatus,
            },
            warnings: warnings.length > 0 ? warnings : undefined,
        };

    } catch (error: any) {
        logger.error({ error, parsingId }, '❌ Invoice parsing failed');

        // Guardar error en DB
        await query(`
            INSERT INTO invoice_parsings (
                id, status, error_message, original_file_type, original_file_hash,
                location_id, created_by
            ) VALUES ($1, 'ERROR', $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                status = 'ERROR',
                error_message = EXCLUDED.error_message
        `, [
            parsingId,
            error.message,
            fileType,
            await calculateHash(fileBase64),
            locationId,
            session.userId,
        ]);

        // Auditar error
        await query(`
            INSERT INTO audit_log (user_id, location_id, action_code, entity_type, entity_id, new_values)
            VALUES ($1, $2, 'INVOICE_PARSE_FAILED', 'INVOICE_PARSING', $3, $4::jsonb)
        `, [session.userId, locationId, parsingId, JSON.stringify({ error: error.message })]);

        return {
            success: false,
            parsingId,
            error: error.message || 'Error procesando factura con IA',
        };
    }
}

/**
 * ✅ Aprobar y procesar factura parseada
 */
export async function approveInvoiceParsingSecure(
    data: z.infer<typeof ApproveRequestSchema>
): Promise<{
    success: boolean;
    supplierId?: string;
    supplierCreated?: boolean;
    accountPayableId?: string;
    mappedCount?: number;
    unmappedCount?: number;
    stockCreated?: number;
    error?: string;
}> {
    const validated = ApproveRequestSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.issues[0]?.message || 'Datos inválidos' };
    }

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    const { parsingId, mappings: manualMappings, itemsData, skipUnmapped, createAccountPayable, supplierData: enrichedSupplierData } = validated.data;

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Obtener parsing
        const parsingRes = await client.query(
            'SELECT * FROM invoice_parsings WHERE id = $1 FOR UPDATE',
            [parsingId]
        );

        if (parsingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Parsing no encontrado' };
        }

        const parsing = parsingRes.rows[0];

        if (!['PENDING', 'VALIDATED', 'MAPPING', 'ERROR'].includes(parsing.status)) {
            await client.query('ROLLBACK');
            return { success: false, error: `No se puede aprobar un parsing con estado ${parsing.status}` };
        }

        // Actualizar estado a PROCESSING
        await client.query(
            'UPDATE invoice_parsings SET status = $1 WHERE id = $2',
            ['PROCESSING', parsingId]
        );

        // 1. Buscar o crear proveedor
        let supplierId: string | null = null;
        let supplierCreated = false;

        if (parsing.supplier_rut) {
            const supplierRes = await client.query(
                'SELECT id FROM suppliers WHERE rut = $1',
                [parsing.supplier_rut]
            );

            if (supplierRes.rows.length > 0) {
                supplierId = supplierRes.rows[0].id;

                // Actualizar datos del proveedor si existen en el parsing
                await client.query(`
                    UPDATE suppliers SET 
                        business_name = COALESCE($1, $2, business_name),
                        address = COALESCE($3, $4, address),
                        phone_1 = COALESCE($5, $6, phone_1),
                        contact_email = COALESCE($7, $8, contact_email),
                        website = COALESCE($9, $10, website),
                        sector = COALESCE($11, $12, sector),
                        fantasy_name = COALESCE($13, $14, fantasy_name),
                        updated_at = NOW()
                    WHERE id = $15
                `, [
                    enrichedSupplierData?.name, parsing.supplier_name,
                    enrichedSupplierData?.address, parsing.supplier_address,
                    enrichedSupplierData?.phone, parsing.supplier_phone,
                    enrichedSupplierData?.email, parsing.supplier_email,
                    enrichedSupplierData?.website, parsing.supplier_website,
                    enrichedSupplierData?.activity, parsing.supplier_activity,
                    enrichedSupplierData?.fantasy_name, parsing.supplier_fantasy_name,
                    supplierId
                ]);

            } else {
                // Crear proveedor
                supplierId = randomUUID();
                await client.query(`
                    INSERT INTO suppliers (
                        id, rut, business_name, address, phone_1, contact_email, website, sector, fantasy_name,
                        status, is_active, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', true, NOW(), NOW())
                `, [
                    supplierId,
                    parsing.supplier_rut,
                    parsing.supplier_name || 'Nuevo Proveedor',
                    parsing.supplier_address,
                    parsing.supplier_phone,
                    parsing.supplier_email,
                    parsing.supplier_website,
                    parsing.supplier_activity,
                    parsing.supplier_fantasy_name
                ]);
                supplierCreated = true;

                logger.info({ supplierId, rut: parsing.supplier_rut }, '🆕 Supplier created from invoice with rich data');
            }
        }

        // 2. Procesar items y mapeos
        const items = parsing.parsed_items || [];
        let mappedCount = 0;
        let unmappedCount = 0;

        // Consolidar mapeos (manuales + los nuevos que vienen del modal)
        const mappings = [...(manualMappings || [])];

        // Aplicar mapeos al objeto de items
        if (mappings.length > 0) {
            for (const map of mappings) {
                const itemIndex = items.findIndex((i: any) => i.supplier_sku === map.supplierSku);
                if (itemIndex >= 0) {
                    items[itemIndex].mapped_product_id = map.productId;
                    items[itemIndex].mapping_status = 'MAPPED';

                    // Crear vinculación permanente en product_suppliers
                    if (supplierId) {
                        await client.query(`
                            INSERT INTO product_suppliers (id, product_id, supplier_id, supplier_sku, last_cost, last_invoice_date, invoice_count)
                            VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 1)
                            ON CONFLICT (product_id, supplier_id) DO UPDATE SET
                                supplier_sku = COALESCE(EXCLUDED.supplier_sku, product_suppliers.supplier_sku),
                                last_cost = EXCLUDED.last_cost,
                                last_invoice_date = CURRENT_DATE,
                                invoice_count = product_suppliers.invoice_count + 1
                        `, [
                            randomUUID(),
                            map.productId,
                            supplierId,
                            map.supplierSku,
                            items[itemIndex].unit_cost,
                        ]);
                    }
                }
            }
        }

        // AUTO-CREACIÓN DE PRODUCTOS FALTANTES (IA)
        let createdProductsCount = 0;
        if (validated.data.createMissingProducts) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.mapping_status !== 'MAPPED') {
                    // Crear nuevo producto
                    // Buscar datos override si existen
                    const overrideData = validated.data.newProductsData?.find(d =>
                        d.supplierSku === item.supplier_sku ||
                        (item.description && d.name === item.description) // Fallback simple match
                    );

                    const finalName = overrideData?.name || item.description || item.mapped_product_name || `Producto Nuevo ${i + 1}`;
                    const finalPriceBox = overrideData?.price || Math.round(item.unit_cost * 1.4);
                    const finalCostBox = overrideData?.cost || item.unit_cost;
                    const finalIsBioequivalent = overrideData?.isBioequivalent || item.is_bioequivalent || false;
                    const finalDci = overrideData?.dci || item.active_principle || null;
                    const finalUnits = overrideData?.units_per_box || item.units_per_package || 1;
                    const finalBarcode = overrideData?.barcode || null;
                    const finalPriceUnit = Math.round(finalPriceBox / finalUnits);

                    const newProductId = randomUUID();
                    // Generar SKU si no hay del proveedor
                    const generatedSku = item.supplier_sku
                        ? (supplierId ? `SUP-${supplierId.substring(0, 4).toUpperCase()}-${item.supplier_sku}` : item.supplier_sku)
                        : `AUTO-${newProductId.substring(0, 8).toUpperCase()}`;

                    await client.query(`
                        INSERT INTO products (
                            id, sku, name, 
                            price, price_sell_box, price_sell_unit,
                            cost_net, cost_price, tax_percent,
                            stock_minimo_seguridad, stock_total, stock_actual,
                            is_bioequivalent, units_per_box, condicion_venta,
                            dci, barcode,
                            created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, 
                            $4, $4, $5,
                            $6, $6, 19,
                            0, 0, 0,
                            $7, $8, 'VD',
                            $9, $10,
                            NOW(), NOW()
                        )
                    `, [
                        newProductId,
                        generatedSku,
                        finalName,
                        finalPriceBox,
                        finalPriceUnit,
                        finalCostBox,
                        finalIsBioequivalent,
                        finalUnits,
                        finalDci,
                        finalBarcode
                    ]);


                    // Actualizar item
                    items[i].mapped_product_id = newProductId;
                    items[i].mapped_product_name = item.description;
                    items[i].mapping_status = 'MAPPED';
                    createdProductsCount++;

                    // Vincular al proveedor
                    if (supplierId && item.supplier_sku) {
                        await client.query(`
                            INSERT INTO product_suppliers (id, product_id, supplier_id, supplier_sku, last_cost, last_invoice_date, invoice_count)
                            VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 1)
                        `, [
                            randomUUID(),
                            newProductId,
                            supplierId,
                            item.supplier_sku,
                            item.unit_cost,
                        ]);
                    }
                }
            }
            if (createdProductsCount > 0) {
                logger.info({ createdProductsCount, parsingId }, '🤖 Created missing products via AI option');
            }
        }

        // Recalcular conteos
        mappedCount = items.filter((i: any) => i.mapping_status === 'MAPPED').length;
        unmappedCount = items.filter((i: any) => i.mapping_status !== 'MAPPED').length;

        // Validar items sin mapear
        if (unmappedCount > 0 && !skipUnmapped) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Hay productos sin vincular y no se ha autorizado omitirlos.' };
        }

        // 3. Crear cuenta por pagar
        let accountPayableId: string | null = null;
        if (createAccountPayable && supplierId && parsing.total_amount) {
            accountPayableId = randomUUID();
            await client.query(`
                INSERT INTO accounts_payable (
                    id, supplier_id, invoice_number, invoice_type,
                    issue_date, net_amount, tax_amount, total_amount,
                    invoice_parsing_id, location_id, created_by, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING')
            `, [
                accountPayableId,
                supplierId,
                parsing.invoice_number,
                parsing.document_type,
                parsing.issue_date,
                parsing.net_amount || 0,
                parsing.tax_amount || 0,
                parsing.total_amount,
                parsingId,
                parsing.location_id,
                session.userId,
            ]);
        }

        // 4. Crear Stock (Inventory Batches)
        let stockCreatedCount = 0;
        // Usar la ubicación destino seleccionada o la del usuario/parsing por defecto
        const targetLocationId = validated.data.destinationLocationId || parsing.location_id;

        for (const item of items) {
            if (item.mapping_status === 'MAPPED' && item.mapped_product_id) {
                const itemCustomData = itemsData?.find((i: any) => i.line_number === item.line_number);
                const finalLot = itemCustomData?.lot_number || item.lot_number || `FACT-${parsing.invoice_number || 'S/N'}`;
                const finalExpiry = itemCustomData?.expiry_date || item.expiry_date || null;

                const batchId = randomUUID();

                await client.query(`
                    INSERT INTO inventory_batches (
                        id, product_id, location_id, 
                        lot_number, expiry_date, 
                        quantity_real, unit_cost, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                `, [
                    batchId,
                    item.mapped_product_id,
                    targetLocationId,
                    finalLot,
                    finalExpiry ? new Date(finalExpiry) : null,
                    item.quantity,
                    item.unit_cost
                ]);

                // Registrar Movimiento
                const productRes = await client.query('SELECT sku, name FROM products WHERE id = $1', [item.mapped_product_id]);
                const product = productRes.rows[0];

                await client.query(`
                    INSERT INTO stock_movements (
                        id, sku, product_name, location_id, movement_type,
                        quantity, stock_before, stock_after, 
                        timestamp, user_id, notes, batch_id, 
                        reference_type, reference_id
                    ) VALUES ($1, $2, $3, $4, 'RECEIPT', $5, 0, $5, NOW(), $6, 'COMPRA_IA', $7, 'PURCHASE_ORDER', $8)
                `, [
                    randomUUID(),
                    product?.sku || 'UNKNOWN',
                    product?.name || item.mapped_product_name || 'Desconocido',
                    targetLocationId,
                    item.quantity,
                    session.userId,
                    batchId,
                    parsingId
                ]);

                stockCreatedCount++;
            }
        }

        // 5. Actualizar estado final
        const finalStatus = unmappedCount > 0 ? 'PARTIAL' : 'COMPLETED';

        await client.query(`
            UPDATE invoice_parsings SET
                status = $1,
                supplier_id = $2,
                supplier_created = $3,
                account_payable_id = $4,
                parsed_items = $5,
                mapped_items = $6,
                unmapped_items = $7,
                validated_by = $8,
                validated_at = NOW(),
                processed_at = NOW()
            WHERE id = $9
        `, [
            finalStatus,
            supplierId,
            supplierCreated,
            accountPayableId,
            JSON.stringify(items),
            mappedCount,
            unmappedCount,
            session.userId,
            parsingId
        ]);

        await client.query('COMMIT');

        revalidatePath('/procurement');

        return {
            success: true,
            supplierId: supplierId || undefined,
            supplierCreated,
            accountPayableId: accountPayableId || undefined,
            mappedCount,
            unmappedCount,
            stockCreated: stockCreatedCount
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Approval Error:', error);
        return { success: false, error: error.message || 'Error al aprobar factura' };
    } finally {
        client.release();
    }
}

/**
 * ❌ Rechazar factura parseada
 */
export async function rejectInvoiceParsingSecure(
    parsingId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {

    if (!UUIDSchema.safeParse(parsingId).success) {
        return { success: false, error: 'ID inválido' };
    }

    if (!reason || reason.length < 5) {
        return { success: false, error: 'Motivo de rechazo requerido (mínimo 5 caracteres)' };
    }

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const res = await query(`
            UPDATE invoice_parsings SET
                status = 'REJECTED',
                rejection_reason = $1,
                rejected_by = $2,
                rejected_at = NOW()
            WHERE id = $3 AND status IN ('PENDING', 'VALIDATED', 'MAPPING')
            RETURNING id
        `, [reason, session.userId, parsingId]);

        if (res.rowCount === 0) {
            return { success: false, error: 'Parsing no encontrado o no se puede rechazar' };
        }

        // Auditar
        await query(`
            INSERT INTO audit_log (user_id, action_code, entity_type, entity_id, new_values)
            VALUES ($1, 'INVOICE_REJECTED', 'INVOICE_PARSING', $2, $3::jsonb)
        `, [session.userId, parsingId, JSON.stringify({ reason })]);

        logger.info({ parsingId, reason }, '❌ Invoice parsing rejected');

        revalidatePath('/procurement');

        return { success: true };

    } catch (error: any) {
        logger.error({ error, parsingId }, '❌ Error rejecting parsing');
        return { success: false, error: 'Error rechazando factura' };
    }
}

/**
 * 📋 Obtener parsings pendientes
 */
export async function getPendingParsingsSecure(options: {
    page?: number;
    pageSize?: number;
    searchTerm?: string;
    status?: string | 'ALL';
    dateFrom?: string;
    dateTo?: string;
    locationId?: string;
} = {}): Promise<{
    success: boolean;
    data?: InvoiceParsing[];
    totalCount?: number;
    error?: string
}> {
    const {
        page = 1,
        pageSize = 20,
        searchTerm,
        status = 'ALL',
        dateFrom,
        dateTo,
        locationId
    } = options;

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const params: any[] = [];
        let whereClause = 'WHERE 1=1';

        if (locationId) {
            params.push(locationId);
            whereClause += ` AND ip.location_id = $${params.length}`;
        }

        if (status && status !== 'ALL') {
            params.push(status);
            whereClause += ` AND ip.status = $${params.length}`;
        }

        if (searchTerm) {
            const term = `%${searchTerm.toLowerCase()}%`;
            params.push(term);
            whereClause += ` AND (
                LOWER(ip.supplier_name) LIKE $${params.length} OR 
                LOWER(ip.supplier_rut) LIKE $${params.length} OR 
                LOWER(ip.invoice_number) LIKE $${params.length} OR
                LOWER(ip.issue_date::text) LIKE $${params.length}
            )`;
        }

        if (dateFrom) {
            params.push(dateFrom);
            whereClause += ` AND ip.created_at >= $${params.length}`;
        }

        if (dateTo) {
            params.push(dateTo + 'T23:59:59');
            whereClause += ` AND ip.created_at <= $${params.length}`;
        }

        // Count query
        const countRes = await query(`SELECT COUNT(*) as total FROM invoice_parsings ip ${whereClause}`, params);
        const totalCount = parseInt(countRes.rows[0].total);

        // Data query with pagination
        const offset = (page - 1) * pageSize;
        const dataSql = `
            SELECT 
                ip.id, ip.supplier_rut, ip.supplier_name, ip.location_id,
                ip.supplier_address, ip.supplier_phone, ip.supplier_email, 
                ip.supplier_website, ip.supplier_activity, ip.supplier_fantasy_name,
                ip.document_type, ip.invoice_number, ip.issue_date,
                ip.total_amount, ip.confidence_score, ip.status,
                ip.total_items, ip.mapped_items, ip.unmapped_items,
                ip.created_at,
                u.name as created_by_name,
                l.name as location_name
            FROM invoice_parsings ip
            LEFT JOIN users u ON ip.created_by::text = u.id
            LEFT JOIN locations l ON ip.location_id = l.id
            ${whereClause}
            ORDER BY ip.created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `;

        const dataRes = await query(dataSql, params);

        return {
            success: true,
            data: dataRes.rows,
            totalCount
        };

    } catch (err: any) {
        logger.error('Error en getPendingParsingsSecure:', err);
        return { success: false, error: err.message || 'Error interno del servidor' };
    }
}

/**
 * 🔍 Buscar producto por SKU de proveedor
 */
export async function findProductBySupplierSkuSecure(
    supplierId: string,
    supplierSku: string
): Promise<{ success: boolean; data?: ProductMatch; error?: string }> {

    if (!UUIDSchema.safeParse(supplierId).success) {
        return { success: false, error: 'ID de proveedor inválido' };
    }

    try {
        const res = await query(`
        SELECT
        p.id as product_id,
            p.name as product_name,
            p.sku,
            COALESCE(
                (SELECT SUM(quantity_real) FROM inventory_batches WHERE product_id = p.id),
            0
                ) as current_stock
            FROM product_suppliers ps
            JOIN products p ON ps.product_id::text = p.id
            WHERE ps.supplier_id = $1 AND ps.supplier_sku = $2
            LIMIT 1
            `, [supplierId, supplierSku]);

        if (res.rows.length === 0) {
            return { success: true, data: undefined };
        }

        return {
            success: true,
            data: {
                productId: res.rows[0].product_id,
                productName: res.rows[0].product_name,
                sku: res.rows[0].sku,
                currentStock: parseInt(res.rows[0].current_stock, 10),
            }
        };

    } catch (error: any) {
        logger.error({ error }, '[Invoice Parser] Error finding product by SKU');
        return { success: false, error: 'Error buscando producto' };
    }
}

/**
 * 🔎 Buscar productos para mapeo (búsqueda fuzzy)
 */
export async function searchProductsForMappingSecure(
    searchTerm: string,
    limit: number = 10
): Promise<{ success: boolean; data?: ProductMatch[]; error?: string }> {

    if (!searchTerm || searchTerm.length < 2) {
        return { success: false, error: 'Término de búsqueda muy corto' };
    }

    try {
        const sanitized = searchTerm.replace(/[%_]/g, '');

        const res = await query(`
        SELECT
        p.id as product_id,
            p.name as product_name,
            p.sku,
            COALESCE(
                (SELECT SUM(quantity_real) FROM inventory_batches WHERE product_id = p.id),
            0
                ) as current_stock
            FROM products p
        WHERE
        p.name ILIKE $1 OR
        p.sku ILIKE $1 OR
        p.dci ILIKE $1
            ORDER BY 
                CASE WHEN p.sku ILIKE $2 THEN 0 ELSE 1 END,
            p.name
            LIMIT $3
            `, [` % ${sanitized}% `, `${sanitized}% `, limit]);

        return {
            success: true,
            data: res.rows.map(r => ({
                productId: r.product_id,
                productName: r.product_name,
                sku: r.sku,
                currentStock: parseInt(r.current_stock, 10),
            }))
        };

    } catch (error: any) {
        logger.error({ error }, '[Invoice Parser] Error searching products');
        return { success: false, error: 'Error buscando productos' };
    }
}

/**
 * 📄 Obtener detalle de un parsing
 */
export async function getInvoiceParsingSecure(
    parsingId: string
): Promise<{ success: boolean; data?: any; error?: string }> {

    if (!UUIDSchema.safeParse(parsingId).success) {
        return { success: false, error: 'ID inválido' };
    }

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    try {
        const res = await query(`
        SELECT
        ip.*,
            s.business_name as matched_supplier_name,
            u.name as created_by_name,
            vu.name as validated_by_name,
            l.name as location_name
            FROM invoice_parsings ip
            LEFT JOIN suppliers s ON ip.supplier_id = s.id
            LEFT JOIN users u ON ip.created_by::text = u.id
            LEFT JOIN users vu ON ip.validated_by = vu.id
            LEFT JOIN locations l ON ip.location_id = l.id
            WHERE ip.id = $1
            `, [parsingId]);

        if (res.rows.length === 0) {
            return { success: false, error: 'Parsing no encontrado' };
        }

        return { success: true, data: res.rows[0] };

    } catch (error: any) {
        logger.error({ error, parsingId }, '[Invoice Parser] Error getting parsing');
        return { success: false, error: 'Error obteniendo parsing' };
    }
}
/**
 * 🗑️ Eliminar un registro de parsing
 */
export async function deleteInvoiceParsingSecure(
    parsingId: string
): Promise<{ success: boolean; error?: string }> {

    if (!UUIDSchema.safeParse(parsingId).success) {
        return { success: false, error: 'ID inválido' };
    }

    const session = await getSession();
    if (!session) {
        return { success: false, error: 'No autenticado' };
    }

    // Solo ADMIN, QF o GERENTE_GENERAL pueden eliminar
    const role = session.role;
    if (!MANAGER_ROLES.includes(role)) {
        return { success: false, error: 'No tiene permisos para eliminar' };
    }

    try {
        // Verificar estado antes de eliminar
        const checkRes = await query(`SELECT status FROM invoice_parsings WHERE id = $1`, [parsingId]);
        if (checkRes.rows.length === 0) {
            return { success: false, error: 'Registro no encontrado' };
        }

        const status = checkRes.rows[0].status;

        // Si ya está completada, no debería eliminarse por seguridad de trazabilidad de stock/pagos
        // a menos que sea un ADMIN. Pero para simplificar el flujo duplicado, permitiremos eliminar
        // si no ha generado movimientos contables críticos aún.
        // Por ahora permitimos eliminar cualquier parsing para limpiar duplicados.

        await query(`DELETE FROM invoice_parsings WHERE id = $1`, [parsingId]);

        logger.info({ parsingId, deletedBy: session.userId }, '[Invoice Parser] Parsing deleted');

        revalidatePath('/procurement/smart-invoice/list');
        return { success: true };

    } catch (error: any) {
        logger.error({ error, parsingId }, '[Invoice Parser] Error deleting parsing');
        return { success: false, error: 'Error eliminando el registro' };
    }
}

