/**
 * web-price-search.ts — Servicio de búsqueda de precios en internet
 * 
 * Busca precios de productos farmacéuticos en internet via DuckDuckGo HTML.
 * Diseñado para ejecución nocturna en desktop (rate-limited, pausable).
 * 
 * Skills activos: financial-precision-math, timezone-santiago
 */

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
    webResults: WebPriceResult[];
    marketPriceMin: number;
    marketPriceMax: number;
    marketPriceAvg: number;
    priceDiffPercent: number;   // (avg_mercado - actual) / actual * 100
    researchedAt: string;
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
const MAX_RESULTS_PER_PRODUCT = 8;

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
            console.warn(`[WebPrice] Timeout for "${productName}"`);
        } else {
            console.error(`[WebPrice] Error searching "${productName}":`, message);
        }
        return [];
    }
}

/**
 * Construye la query de búsqueda optimizada para farmacias Chile
 */
export function buildSearchQuery(productName: string): string {
    // Limpiar nombre: remover prefijos como "[AL DETAL]", códigos internos
    let clean = productName
        .replace(/^\s*\[AL DETAL\]\s*/i, '')
        .replace(/^\s*\[FRACCIONADO\]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Si el nombre es muy largo (>60 chars), truncar a las primeras 6 palabras
    const words = clean.split(' ');
    if (words.length > 6) {
        clean = words.slice(0, 6).join(' ');
    }

    return `${clean} precio farmacia Chile`;
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
 * Identifica la fuente (farmacia) a partir de la URL
 */
export function identifySource(url: string): { name: string; domain: string } | null {
    const lower = url.toLowerCase();
    for (const [domain, name] of Object.entries(TRUSTED_SOURCES)) {
        if (lower.includes(domain)) {
            return { name, domain };
        }
    }
    return null;
}

/**
 * Calcula confianza del match basado en similitud del título
 */
export function calculateConfidence(resultTitle: string, productName: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const titleLower = resultTitle.toLowerCase();
    const nameLower = productName.toLowerCase()
        .replace(/^\s*\[al detal\]\s*/i, '')
        .replace(/^\s*\[fraccionado\]\s*/i, '');

    // Extract key words (3+ chars, without common words)
    const stopWords = new Set(['con', 'del', 'para', 'que', 'los', 'las', 'por', 'una', 'comp', 'lab', 'und']);
    const nameWords = nameLower.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));

    if (nameWords.length === 0) return 'LOW';

    const matchCount = nameWords.filter(word => titleLower.includes(word)).length;
    const matchRatio = matchCount / nameWords.length;

    if (matchRatio >= 0.7) return 'HIGH';
    if (matchRatio >= 0.4) return 'MEDIUM';
    return 'LOW';
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
    products: Array<{ name: string; sku: string; currentPrice: number }>,
    onProgress: (progress: BatchProgress) => void,
    signal?: AbortSignal
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

            const result: ProductResearchResult = {
                productName: product.name,
                sku: product.sku,
                currentPrice: product.currentPrice,
                webResults,
                marketPriceMin,
                marketPriceMax,
                marketPriceAvg,
                priceDiffPercent,
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
