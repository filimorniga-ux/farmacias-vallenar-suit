/**
 * web-price-search.ts — Servicio de búsqueda de precios en internet
 * 
 * Busca precios de productos farmacéuticos en internet via DuckDuckGo HTML.
 * Diseñado para ejecución nocturna en desktop (rate-limited, pausable).
 * 
 * Skills activos: financial-precision-math, timezone-santiago
 */

import { logger } from '@/lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface WebPriceResult {
    source: string;        // Nombre de la fuente (ej: "Cruz Verde", "Farmacias Ahumada")
    price: number;         // Precio en CLP
    url: string;           // URL del resultado
    title: string;         // Título del resultado
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';  // Confianza en el match
}

export interface ProductResearchResult {
    productName: string;
    sku: string;
    currentPrice: number;
    costPrice: number;
    webResults: WebPriceResult[];
    marketPriceMin: number;
    marketPriceMax: number;
    marketPriceAvg: number;
    priceDiffPercent: number;   // (avg_mercado - actual) / actual * 100
    smartPrice: SmartPriceResult | null;
    researchedAt: string;
}

/**
 * Resultado del algoritmo inteligente de selección de precios.
 * Filtra outliers, usa mediana, aplica descuento competitivo y protege margen.
 */
export interface SmartPriceResult {
    /** Precio recomendado final (redondeado a $50 CLP) */
    recommendedPrice: number;
    /** Precio mediana del mercado (sin descuento) */
    medianPrice: number;
    /** Precios después de filtrar outliers */
    filteredPrices: number[];
    /** Precios descartados como outliers bajos (ofertas flash) */
    outlierLowPrices: number[];
    /** Precios descartados como outliers altos */
    outlierHighPrices: number[];
    /** Descuento competitivo aplicado (%) */
    competitiveDiscountPercent: number;
    /** Si se aplicó protección de margen (precio no baja de costo + margen mínimo) */
    marginProtectionApplied: boolean;
    /** Razón legible del precio calculado */
    reasoning: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Farmacias chilenas confiables — dominios para filtrar resultados */
const TRUSTED_SOURCES: Record<string, string> = {
    'farmaciasahumada.cl': 'Farmacias Ahumada',
    'cruzverde.cl': 'Cruz Verde',
    'salcobrand.cl': 'Salcobrand',
    'drsimi.cl': 'Dr. Simi',
    'farmaciasknop.cl': 'Farmacias Knop',
    'farmaciasmapuche.cl': 'Farmacias Mapuche',
    'yapp.cl': 'Yapp',
    'farmalider.cl': 'FarmaLider',
    'mercadolibre.cl': 'MercadoLibre',
    'lider.cl': 'Lider',
    'jumbo.cl': 'Jumbo',
    'farmaciasdelahorro.cl': 'Del Ahorro',
};

/** Rate limit entre requests (ms) */
const RATE_LIMIT_MS = 2500;

/** Timeout por request (ms) */
const REQUEST_TIMEOUT_MS = 8000;

/** Max resultados por producto */
const MAX_RESULTS_PER_PRODUCT = 10;

/** Common pharmacy abbreviations → expanded Spanish */
const PHARMA_ABBREVIATIONS: Record<string, string> = {
    'sol.oft.': 'solucion oftalmica',
    'sol.oft': 'solucion oftalmica',
    'sol oft': 'solucion oftalmica',
    'sol.iny.': 'solucion inyectable',
    'sol.iny': 'solucion inyectable',
    'sol.oral': 'solucion oral',
    'sol.nas.': 'solucion nasal',
    'sol.nas': 'solucion nasal',
    'comp.rec.': 'comprimidos recubiertos',
    'comp.': 'comprimidos',
    'comp ': 'comprimidos ',
    'cap.': 'capsulas',
    'cap ': 'capsulas ',
    'caps.': 'capsulas',
    'caps ': 'capsulas ',
    'tab.': 'tabletas',
    'tab ': 'tabletas ',
    'buc.': 'bucal',
    'antisep.': 'antiseptico',
    'susp.': 'suspension',
    'susp ': 'suspension ',
    'amp.': 'ampollas',
    'amp ': 'ampollas ',
    'jbe.': 'jarabe',
    'jbe ': 'jarabe ',
    'cr.': 'crema',
    'cr ': 'crema ',
    'ung.': 'unguento',
    'ung ': 'unguento ',
    'sup.': 'supositorios',
    'sup ': 'supositorios ',
    'iny.': 'inyectable',
    'iny ': 'inyectable ',
    'gts.': 'gotas',
    'gts ': 'gotas ',
    'pol.': 'polvo',
    'pol ': 'polvo ',
    'sob.': 'sobres',
    'sob ': 'sobres ',
    'pom.': 'pomada',
    'pom ': 'pomada ',
    'aer.': 'aerosol',
    'aer ': 'aerosol ',
    'sol.': 'solucion',
    'sol ': 'solucion ',
    'lab.': 'laboratorio',
    'lab ': 'laboratorio ',
};

// ============================================================================
// CORE SEARCH FUNCTION
// ============================================================================

/**
 * Busca precios de un producto en internet usando DuckDuckGo HTML.
 * 
 * DuckDuckGo HTML (`html.duckduckgo.com`) es más permisivo con scraping
 * que Google y no requiere API key. Devuelve HTML limpio parseable.
 */
export async function searchProductPrice(productName: string): Promise<WebPriceResult[]> {
    const query = buildSearchQuery(productName);
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'es-CL,es;q=0.9',
            },
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`DuckDuckGo returned ${response.status}`);
        }

        const html = await response.text();
        return parseSearchResults(html, productName);

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('abort')) {
            logger.warn({ productName }, '[WebPrice] Timeout');
        } else {
            logger.error({ productName, message }, '[WebPrice] Search error');
        }
        return [];
    }
}

/**
 * Construye la query de búsqueda optimizada para farmacias Chile
 */
export function buildSearchQuery(productName: string): string {
    let clean = productName
        .replace(/^\s*\[AL DETAL\]\s*/i, '')
        .replace(/^\s*\[FRACCIONADO\]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    const words = clean.split(' ');
    if (words.length > 8) {
        clean = words.slice(0, 8).join(' ');
    }

    return `${clean} precio farmacia Chile`;
}

/**
 * Normalizes pharmacy product names by expanding abbreviations.
 */
export function normalizeProductName(productName: string): string {
    let name = productName
        .replace(/^\s*\[AL DETAL\]\s*/i, '')
        .replace(/^\s*\[FRACCIONADO\]\s*/i, '')
        .trim();

    const sortedAbbrevs = Object.entries(PHARMA_ABBREVIATIONS)
        .sort((a, b) => b[0].length - a[0].length);
    
    let lower = name.toLowerCase();
    for (const [abbrev, expansion] of sortedAbbrevs) {
        if (lower.includes(abbrev)) {
            const idx = lower.indexOf(abbrev);
            name = name.substring(0, idx) + expansion + name.substring(idx + abbrev.length);
            lower = name.toLowerCase();
        }
    }

    name = name
        .replace(/(\d+),(\d+)/g, '$1.$2')
        .replace(/(\d)(mg|ml|mcg|g|ui|iu|%)/gi, '$1 $2')
        .replace(/(%)\s*(\d)/g, '$1 $2')
        .replace(/(\d+)\s*(com|und|tab|cap)/gi, '$1 $2')
        .replace(/\./g, (match: string, offset: number, str: string) => {
            if (/\d/.test(str[offset - 1] || '') && /\d/.test(str[offset + 1] || '')) return '.';
            return ' ';
        });

    name = name.replace(/\s+/g, ' ').trim();
    return name;
}

// ============================================================================
// HTML PARSER
// ============================================================================

/**
 * Parsea resultados HTML de DuckDuckGo y extrae precios CLP.
 * 
 * DuckDuckGo HTML structure:
 * <div class="result">
 *   <a class="result__a" href="...">Title</a>
 *   <a class="result__url" href="...">url.com</a>
 *   <a class="result__snippet">... $12.990 ...</a>
 * </div>
 */
export function parseSearchResults(html: string, productName: string): WebPriceResult[] {
    const results: WebPriceResult[] = [];

    // Extract result blocks
    const resultBlocks = html.split(/class="result\s/i);

    for (let i = 1; i < resultBlocks.length && results.length < MAX_RESULTS_PER_PRODUCT; i++) {
        const block = resultBlocks[i];

        // Extract URL
        const urlMatch = block.match(/class="result__url"[^>]*href="([^"]*)"/) ||
            block.match(/class="result__url"[^>]*>([^<]*)</);
        const rawUrl = urlMatch?.[1]?.trim() || '';

        // Extract title
        const titleMatch = block.match(/class="result__a"[^>]*>([^<]*)</);
        const title = decodeHTMLEntities(titleMatch?.[1]?.trim() || '');

        // Extract snippet
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
            block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/td>/i);
        const snippet = decodeHTMLEntities(snippetMatch?.[1]?.replace(/<[^>]+>/g, ' ')?.trim() || '');

        // Combine title + snippet for price extraction
        const fullText = `${title} ${snippet}`;

        // Extract CLP prices — patterns like $12.990, $1.290, $45.000, $990
        const prices = extractCLPPrices(fullText);
        if (prices.length === 0) continue;

        // Determine source
        const sourceInfo = identifySource(rawUrl);
        if (!sourceInfo) continue;

        // Determine confidence based on title match
        const confidence = calculateConfidence(title, productName);

        // Take the best (most reasonable) price for pharma products
        // Filter out prices < $100 or > $500,000 (unreasonable for pharma)
        const validPrices = prices.filter(p => p >= 100 && p <= 500000);
        if (validPrices.length === 0) continue;

        // Use the lowest valid price (best deal)
        const bestPrice = Math.min(...validPrices);

        results.push({
            source: sourceInfo.name,
            price: bestPrice,
            url: cleanUrl(rawUrl),
            title: title.substring(0, 120),
            confidence,
        });
    }

    return results;
}

/**
 * Extrae precios en CLP de un texto.
 * Maneja formatos: $12.990, $1.290, $45.000, $990, CLP 12990
 */
export function extractCLPPrices(text: string): number[] {
    const prices: number[] = [];

    // Pattern 1: $XX.XXX (con separador de miles)
    const pattern1 = /\$\s*(\d{1,3}(?:\.\d{3})+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern1.exec(text)) !== null) {
        const price = parseInt(match[1].replace(/\./g, ''), 10);
        if (!isNaN(price)) prices.push(price);
    }

    // Pattern 2: $XXXXX (sin separador, ≥3 dígitos)
    const pattern2 = /\$\s*(\d{3,6})(?!\.\d{3})/g;
    while ((match = pattern2.exec(text)) !== null) {
        const price = parseInt(match[1], 10);
        if (!isNaN(price) && !prices.includes(price)) prices.push(price);
    }

    // Pattern 3: CLP XXXXX o CLP XX.XXX
    const pattern3 = /CLP\s*(\d{1,3}(?:\.\d{3})*)/gi;
    while ((match = pattern3.exec(text)) !== null) {
        const price = parseInt(match[1].replace(/\./g, ''), 10);
        if (!isNaN(price) && !prices.includes(price)) prices.push(price);
    }

    return prices;
}

/**
 * Identifica la fuente a partir de la URL.
 * Acepta fuentes confiables y cualquier dominio .cl.
 */
export function identifySource(url: string): { name: string; domain: string; trusted?: boolean } | null {
    const lower = url.toLowerCase();
    for (const [domain, name] of Object.entries(TRUSTED_SOURCES)) {
        if (lower.includes(domain)) {
            return { name, domain, trusted: true };
        }
    }

    // Accept any .cl domain
    const clMatch = lower.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.cl)/i);
    if (clMatch) {
        const domain = clMatch[1];
        const name = domain.replace('.cl', '').replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        return { name, domain, trusted: false };
    }

    return null;
}

/**
 * Calcula confianza del match usando fuzzy matching (palabras + caracteres).
 */
export function calculateConfidence(resultTitle: string, productName: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const titleLower = resultTitle.toLowerCase();
    const normalizedName = normalizeProductName(productName).toLowerCase();

    const stopWords = new Set(['con', 'del', 'para', 'que', 'los', 'las', 'por', 'una',
        'und', 'precio', 'farmacia', 'chile', 'comprar', 'oferta', 'venta']);
    const nameWords = normalizedName.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));

    if (nameWords.length === 0) return 'LOW';

    const wordMatchCount = nameWords.filter(word => titleLower.includes(word)).length;
    const wordMatchRatio = wordMatchCount / nameWords.length;

    // Character-level fuzzy matching
    const nameChars = normalizedName.replace(/[^a-z0-9]/g, '');
    const titleChars = titleLower.replace(/[^a-z0-9]/g, '');
    let charMatches = 0;
    let searchFrom = 0;
    for (const ch of nameChars) {
        const idx = titleChars.indexOf(ch, searchFrom);
        if (idx >= 0) {
            charMatches++;
            searchFrom = idx + 1;
        }
    }
    const charMatchRatio = nameChars.length > 0 ? charMatches / nameChars.length : 0;

    const combinedScore = wordMatchRatio * 0.6 + charMatchRatio * 0.4;

    if (combinedScore >= 0.50) return 'HIGH';
    if (combinedScore >= 0.30) return 'MEDIUM';
    return 'LOW';
}

// ============================================================================
// SMART PRICE ALGORITHM
// ============================================================================

/**
 * Configuración del algoritmo de precios inteligentes.
 */
export interface SmartPriceConfig {
    /** Descuento competitivo a aplicar (1-10%). Default: 3% */
    competitiveDiscountPercent: number;
    /** Margen mínimo sobre el costo (%). Default: 15% */
    minMarginPercent: number;
    /** Solo considerar resultados con confianza >= este nivel. Default: 'MEDIUM' */
    minConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const DEFAULT_SMART_CONFIG: SmartPriceConfig = {
    competitiveDiscountPercent: 3,
    minMarginPercent: 15,
    minConfidence: 'MEDIUM',
};

/**
 * Algoritmo inteligente de selección de precio v2 — Conservador basado en mercado.
 * 
 * Reglas:
 * 1. Filtra por confianza mínima (HIGH/MEDIUM)
 * 2. FILTRO DE SANIDAD: descarta precios <30% o >300% del precio actual
 *    (casi seguro son productos diferentes: otra concentración, formato o pack)
 * 3. Filtra outliers usando IQR
 * 4. Busca MODA (precio más repetido en buckets de $500) — si no hay moda, usa mediana
 * 5. Recomienda el precio de mercado SIN descuento competitivo
 * 6. NUNCA baja del costo + margen mínimo (protección de pérdida)
 * 7. Redondea a $50 CLP
 */
export function calculateSmartPrice(
    webResults: WebPriceResult[],
    currentPrice: number,
    costPrice: number,
    config: Partial<SmartPriceConfig> = {}
): SmartPriceResult | null {
    const cfg = { ...DEFAULT_SMART_CONFIG, ...config };

    // 1. Filtrar por confianza mínima
    const confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const minConfLevel = confidenceOrder[cfg.minConfidence];
    const confidentResults = webResults.filter(
        r => confidenceOrder[r.confidence] >= minConfLevel && r.price > 0
    );

    if (confidentResults.length < 1) {
        return null;
    }

    let prices = confidentResults.map(r => r.price).sort((a, b) => a - b);

    // 2. SANITY FILTER: discard prices wildly different from current price
    if (currentPrice > 0) {
        const sanityLow = currentPrice * 0.30;
        const sanityHigh = currentPrice * 3.00;
        const sane = prices.filter(p => p >= sanityLow && p <= sanityHigh);
        if (sane.length > 0) {
            prices = sane;
        }
    }

    // 3. Filtrar outliers con IQR
    const { filtered, outlierLow, outlierHigh } = filterOutliersIQR(prices);

    if (filtered.length === 0) {
        return null;
    }

    // 4. MODE: find the most common price bucket (rounded to nearest $500)
    const bucketSize = 500;
    const buckets: Record<number, number> = {};
    for (const p of filtered) {
        const bucket = Math.round(p / bucketSize) * bucketSize;
        buckets[bucket] = (buckets[bucket] || 0) + 1;
    }

    let modePrice: number | null = null;
    let maxCount = 0;
    for (const [bucket, count] of Object.entries(buckets)) {
        if (count > maxCount) {
            maxCount = count;
            modePrice = parseInt(bucket, 10);
        }
    }

    const medianPrice = calculateMedian(filtered);
    
    // Use MODE if it appears more than once, otherwise use MEDIAN
    const referencePrice = (maxCount >= 2 && modePrice !== null) ? modePrice : medianPrice;

    // 5. NO competitive discount — recommend market price as-is
    let recommendedPrice = referencePrice;

    // 6. Protección de margen
    let marginProtectionApplied = false;
    if (costPrice > 0) {
        const minAllowedPrice = Math.round(costPrice * (1 + cfg.minMarginPercent / 100));
        if (recommendedPrice < minAllowedPrice) {
            recommendedPrice = minAllowedPrice;
            marginProtectionApplied = true;
        }
    }

    // 7. Redondear a $50 CLP (hacia arriba)
    recommendedPrice = Math.ceil(recommendedPrice / 50) * 50;

    const usedMode = (maxCount >= 2 && modePrice !== null);

    // Generar razonamiento legible
    const reasoning = `${prices.length} precios válidos, ${filtered.length} tras filtros. ${usedMode ? `Moda: $${modePrice!.toLocaleString()} (×${maxCount})` : `Mediana: $${medianPrice.toLocaleString()}`}. Sin descuento aplicado.${marginProtectionApplied ? ' ⚠️ Protección de margen.' : ''}`;

    return {
        recommendedPrice,
        medianPrice,
        filteredPrices: filtered,
        outlierLowPrices: outlierLow,
        outlierHighPrices: outlierHigh,
        competitiveDiscountPercent: 0,
        marginProtectionApplied,
        reasoning,
    };
}

/**
 * Filtra outliers usando el método IQR (Interquartile Range).
 * 
 * Los precios fuera de [Q1 - 1.5*IQR, Q3 + 1.5*IQR] son outliers.
 * Esto elimina automáticamente ofertas flash (Q1-) y precios inflados (Q3+).
 */
export function filterOutliersIQR(sortedPrices: number[]): {
    filtered: number[];
    outlierLow: number[];
    outlierHigh: number[];
} {
    if (sortedPrices.length < 3) {
        // Con menos de 3 datos no podemos calcular IQR, retornar todo
        return { filtered: [...sortedPrices], outlierLow: [], outlierHigh: [] };
    }

    const q1 = calculatePercentile(sortedPrices, 25);
    const q3 = calculatePercentile(sortedPrices, 75);
    const iqr = q3 - q1;

    // Si IQR es 0 (todos los precios iguales o muy similares), usar 10% del valor
    const effectiveIQR = iqr > 0 ? iqr : q1 * 0.1;

    const lowerBound = q1 - 1.5 * effectiveIQR;
    const upperBound = q3 + 1.5 * effectiveIQR;

    const filtered: number[] = [];
    const outlierLow: number[] = [];
    const outlierHigh: number[] = [];

    for (const price of sortedPrices) {
        if (price < lowerBound) {
            outlierLow.push(price);
        } else if (price > upperBound) {
            outlierHigh.push(price);
        } else {
            filtered.push(price);
        }
    }

    // Seguridad: si todo fue filtrado, retornar todo menos extremos
    if (filtered.length === 0) {
        return {
            filtered: sortedPrices.slice(
                Math.floor(sortedPrices.length * 0.1),
                Math.ceil(sortedPrices.length * 0.9) || sortedPrices.length
            ),
            outlierLow: [],
            outlierHigh: [],
        };
    }

    return { filtered, outlierLow, outlierHigh };
}

/**
 * Calcula la mediana de un array ordenado.
 */
export function calculateMedian(sorted: number[]): number {
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Calcula un percentil de un array ordenado.
 */
export function calculatePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function buildReasoning(
    totalPrices: number,
    filteredCount: number,
    outlierLow: number[],
    outlierHigh: number[],
    medianPrice: number,
    discount: number,
    recommended: number,
    current: number,
    cost: number,
    marginProtected: boolean
): string {
    const parts: string[] = [];

    parts.push(`Se encontraron ${totalPrices} precios en el mercado.`);

    if (outlierLow.length > 0) {
        parts.push(`Se descartaron ${outlierLow.length} precio(s) muy bajo(s) como ofertas flash ($${outlierLow.map(p => p.toLocaleString()).join(', $')}).`);
    }
    if (outlierHigh.length > 0) {
        parts.push(`Se descartaron ${outlierHigh.length} precio(s) inflado(s) ($${outlierHigh.map(p => p.toLocaleString()).join(', $')}).`);
    }

    parts.push(`Mediana del mercado: $${medianPrice.toLocaleString()}.`);
    parts.push(`Descuento competitivo: -${discount}%.`);

    if (marginProtected) {
        parts.push(`⚠️ Protección de margen activada: el precio no baja del costo ($${cost.toLocaleString()}) + margen mínimo.`);
    }

    const diff = recommended - current;
    if (diff > 0) {
        parts.push(`📈 Recomendación: subir $${diff.toLocaleString()} (+${Math.round(diff / current * 100)}%).`);
    } else if (diff < 0) {
        parts.push(`📉 Recomendación: bajar $${Math.abs(diff).toLocaleString()} (${Math.round(diff / current * 100)}%).`);
    } else {
        parts.push(`✅ Precio actual es competitivo.`);
    }

    return parts.join(' ');
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

export interface BatchProgress {
    current: number;
    total: number;
    productName: string;
    sku: string;
    status: 'SEARCHING' | 'FOUND' | 'NOT_FOUND' | 'ERROR';
    result?: ProductResearchResult;
    elapsedMs: number;
}

/**
 * Procesa un lote de productos secuencialmente con rate limiting.
 * Usa un callback para reportar progreso (compatible con SSE).
 */
export async function researchPricesBatch(
    products: Array<{ name: string; sku: string; currentPrice: number; costPrice: number }>,
    onProgress: (progress: BatchProgress) => void,
    signal?: AbortSignal,
    smartConfig?: Partial<SmartPriceConfig>
): Promise<ProductResearchResult[]> {
    const results: ProductResearchResult[] = [];
    const startTime = Date.now();

    for (let i = 0; i < products.length; i++) {
        if (signal?.aborted) break;

        const product = products[i];

        // Report: searching
        onProgress({
            current: i + 1,
            total: products.length,
            productName: product.name,
            sku: product.sku,
            status: 'SEARCHING',
            elapsedMs: Date.now() - startTime,
        });

        try {
            const webResults = await searchProductPrice(product.name);

            // Calculate stats
            const validPrices = webResults
                .filter(r => r.confidence !== 'LOW')
                .map(r => r.price)
                .filter(p => p > 0);

            const marketPriceMin = validPrices.length > 0 ? Math.min(...validPrices) : 0;
            const marketPriceMax = validPrices.length > 0 ? Math.max(...validPrices) : 0;
            const marketPriceAvg = validPrices.length > 0
                ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
                : 0;

            const priceDiffPercent = product.currentPrice > 0 && marketPriceAvg > 0
                ? Math.round(((marketPriceAvg - product.currentPrice) / product.currentPrice) * 10000) / 100
                : 0;

            // Calculate smart price recommendation
            const smartPrice = calculateSmartPrice(webResults, product.currentPrice, product.costPrice, smartConfig);

            const result: ProductResearchResult = {
                productName: product.name,
                sku: product.sku,
                currentPrice: product.currentPrice,
                costPrice: product.costPrice,
                webResults,
                marketPriceMin,
                marketPriceMax,
                marketPriceAvg,
                priceDiffPercent,
                smartPrice,
                researchedAt: new Date().toISOString(),
            };

            results.push(result);

            onProgress({
                current: i + 1,
                total: products.length,
                productName: product.name,
                sku: product.sku,
                status: webResults.length > 0 ? 'FOUND' : 'NOT_FOUND',
                result,
                elapsedMs: Date.now() - startTime,
            });

        } catch {
            onProgress({
                current: i + 1,
                total: products.length,
                productName: product.name,
                sku: product.sku,
                status: 'ERROR',
                elapsedMs: Date.now() - startTime,
            });
        }

        // Rate limit — wait before next request
        if (i < products.length - 1 && !signal?.aborted) {
            await sleep(RATE_LIMIT_MS);
        }
    }

    return results;
}

// ============================================================================
// HELPERS
// ============================================================================

function decodeHTMLEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/<b>/g, '')
        .replace(/<\/b>/g, '');
}

function cleanUrl(rawUrl: string): string {
    // DuckDuckGo wraps URLs in redirect — extract the real URL
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
        try {
            return decodeURIComponent(uddgMatch[1]);
        } catch {
            return rawUrl;
        }
    }
    // If it's already a clean URL
    if (rawUrl.startsWith('http')) return rawUrl;
    return `https://${rawUrl}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
