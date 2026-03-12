/**
 * ============================================================================
 * WEB PRICE ENGINE — Electron Main Process
 * 
 * Usa una BrowserWindow oculta (Chromium real) para buscar precios en
 * DuckDuckGo, evitando CAPTCHA/anomaly blocks de server-side fetch.
 * 
 * Reutiliza las mismas reglas de negocio que web-price-search.ts:
 *   - extractCLPPrices (regex de precios chilenos)
 *   - identifySource (farmacias .cl confiables)
 *   - calculateConfidence (similitud nombre/resultado)
 *   - calculateSmartPrice (IQR + mediana + descuento + margen)
 * ============================================================================
 */

const { BrowserWindow, powerSaveBlocker } = require('electron');

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
    /** Delay between searches (ms) to avoid rate limiting */
    searchDelayMs: 3000,
    /** Random jitter added to delay (ms) */
    jitterMs: 1500,
    /** Timeout waiting for page load (ms) */
    pageLoadTimeoutMs: 15000,
    /** Max results to extract per search */
    maxResultsPerProduct: 10,
    /** User agent (matches real Chrome) */
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

/** Common pharmacy abbreviations → expanded Spanish */
const PHARMA_ABBREVIATIONS = {
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

/** Trusted Chilean pharmacy domains */
const TRUSTED_SOURCES = {
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

// ============================================================================
// STATE
// ============================================================================

let isRunning = false;
let isPaused = false;
let powerBlockerId = null;
let hiddenWindow = null;
let processedCount = 0;
let totalCount = 0;

// ============================================================================
// CORE: SEARCH VIA HIDDEN BROWSER WINDOW
// ============================================================================

/**
 * Creates (or reuses) a hidden BrowserWindow for scraping.
 */
function getOrCreateHiddenWindow() {
    if (hiddenWindow && !hiddenWindow.isDestroyed()) {
        return hiddenWindow;
    }

    hiddenWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            // No preload needed — we inject JS via executeJavaScript
        },
    });

    hiddenWindow.webContents.setUserAgent(CONFIG.userAgent);

    hiddenWindow.on('closed', () => {
        hiddenWindow = null;
    });

    return hiddenWindow;
}

/**
 * Destroys the hidden window when done.
 */
function destroyHiddenWindow() {
    if (hiddenWindow && !hiddenWindow.isDestroyed()) {
        hiddenWindow.close();
        hiddenWindow = null;
    }
}

/**
 * Searches DuckDuckGo for a product using a real browser.
 * Returns raw text data from the results page.
 */
async function searchDuckDuckGo(query) {
    const win = getOrCreateHiddenWindow();
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&kl=cl-es&ia=web`;

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            resolve({ results: [], pageTitle: 'timeout' });
        }, CONFIG.pageLoadTimeoutMs);

        win.webContents.once('did-finish-load', async () => {
            clearTimeout(timeout);
            await sleep(1500);

            try {
                const data = await win.webContents.executeJavaScript(`
                    (function() {
                        const results = [];
                        const articles = document.querySelectorAll('article[data-testid="result"], .result, [data-nrn="result"]');
                        
                        articles.forEach((article, i) => {
                            if (i >= ${CONFIG.maxResultsPerProduct}) return;
                            
                            const linkEl = article.querySelector('a[data-testid="result-title-a"], a.result__a, h2 a');
                            const snippetEl = article.querySelector('[data-result="snippet"], .result__snippet, span[class*="snippet"]');
                            const urlEl = article.querySelector('a[data-testid="result-extras-url-link"], .result__url, span[class*="url"]');
                            
                            const title = linkEl ? linkEl.textContent.trim() : '';
                            const url = urlEl ? (urlEl.href || urlEl.textContent.trim()) : (linkEl ? linkEl.href : '');
                            const snippet = snippetEl ? snippetEl.textContent.trim() : '';
                            
                            if (title || snippet) {
                                results.push({ title, url, snippet });
                            }
                        });
                        
                        if (results.length === 0) {
                            const bodyText = document.body ? document.body.innerText : '';
                            results.push({ title: '', url: '', snippet: bodyText.substring(0, 5000) });
                        }
                        
                        return { results, pageTitle: document.title };
                    })()
                `);
                resolve(data);
            } catch (err) {
                reject(err);
            }
        });

        win.webContents.once('did-fail-load', () => {
            clearTimeout(timeout);
            resolve({ results: [], pageTitle: 'fail' });
        });

        win.loadURL(searchUrl).catch(() => {
            clearTimeout(timeout);
            resolve({ results: [], pageTitle: 'error' });
        });
    });
}

/**
 * Searches Google Shopping for a product (fallback).
 * Google Shopping shows prices directly in structured product cards.
 */
async function searchGoogleShopping(query) {
    const win = getOrCreateHiddenWindow();
    const searchUrl = `https://www.google.cl/search?q=${encodeURIComponent(query)}&tbm=shop&hl=es`;

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            resolve({ results: [], pageTitle: 'timeout' });
        }, CONFIG.pageLoadTimeoutMs);

        win.webContents.once('did-finish-load', async () => {
            clearTimeout(timeout);
            await sleep(2000);

            try {
                const data = await win.webContents.executeJavaScript(`
                    (function() {
                        const results = [];
                        
                        // Google Shopping renders products in a grid
                        // Each card has a title, price, and merchant name
                        const cards = document.querySelectorAll('.sh-dgr__content, .sh-dlr__list-result, [data-docid], .KZmu8e');
                        
                        cards.forEach((card, i) => {
                            if (i >= ${CONFIG.maxResultsPerProduct}) return;
                            
                            // Title
                            const titleEl = card.querySelector('h3, .tAxDx, a.translate-content, [class*="title"]');
                            const title = titleEl ? titleEl.textContent.trim() : '';
                            
                            // Price — Google Shopping uses various patterns
                            const priceEl = card.querySelector('.a8Pemb, .HRLxBb, [class*="price"], b');
                            const priceText = priceEl ? priceEl.textContent.trim() : '';
                            
                            // Merchant / source
                            const merchantEl = card.querySelector('.aULzUe, .IuHnof, [class*="merchant"]');
                            const merchant = merchantEl ? merchantEl.textContent.trim() : '';
                            
                            // Link
                            const linkEl = card.querySelector('a');
                            const url = linkEl ? linkEl.href : '';
                            
                            if (title || priceText) {
                                results.push({ 
                                    title: title, 
                                    url: url, 
                                    snippet: priceText + ' ' + merchant,
                                    merchant: merchant
                                });
                            }
                        });
                        
                        // Fallback: try to get all visible text with prices
                        if (results.length === 0) {
                            const bodyText = document.body ? document.body.innerText : '';
                            results.push({ title: '', url: '', snippet: bodyText.substring(0, 8000), merchant: '' });
                        }
                        
                        return { results, pageTitle: document.title };
                    })()
                `);
                resolve(data);
            } catch (err) {
                reject(err);
            }
        });

        win.webContents.once('did-fail-load', () => {
            clearTimeout(timeout);
            resolve({ results: [], pageTitle: 'fail' });
        });

        win.loadURL(searchUrl).catch(() => {
            clearTimeout(timeout);
            resolve({ results: [], pageTitle: 'error' });
        });
    });
}

/**
 * Multi-strategy search: DuckDuckGo first, Google Shopping fallback.
 */
async function searchWithBrowser(productName) {
    const normalizedName = normalizeProductName(productName);
    const query = buildSearchQuery(normalizedName);

    // Strategy 1: DuckDuckGo
    const ddgResults = await searchDuckDuckGo(query);
    
    // Check if we got usable price data from DuckDuckGo
    const ddgHasPrices = ddgResults.results.some(r => {
        const text = `${r.title} ${r.snippet}`;
        return extractCLPPrices(text).length > 0;
    });

    if (ddgHasPrices && ddgResults.results.length > 1) {
        return ddgResults;
    }

    // Strategy 2: Google Shopping (better for pharmacy prices)
    console.log(`[WebPriceEngine] DDG no prices for "${productName}", trying Google Shopping...`);
    await sleep(1000); // Brief pause between engines
    const gsResults = await searchGoogleShopping(query);
    
    // Merge: Google Shopping results first, then DDG
    return {
        results: [...gsResults.results, ...ddgResults.results],
        pageTitle: gsResults.pageTitle,
    };
}

// ============================================================================
// PARSERS (pure functions, same logic as web-price-search.ts)
// ============================================================================

/**
 * Normalizes pharmacy product names by expanding abbreviations,
 * cleaning special characters, and formatting for better search results.
 * 
 * Examples:
 *   "3A OFTENO SOL.OFT.0,1%5ML"         → "3A Ofteno Solucion Oftalmica 0.1% 5ml"
 *   "AB ANTISEP.BUC.12COM."              → "AB Antiseptico Bucal 12 comprimidos"
 *   "AARTAM METRONIDAZOL 500MG X20"      → "Metronidazol 500 mg x20"
 *   "[AL DETAL] PARACETAMOL 500MG COMP." → "Paracetamol 500 mg comprimidos"
 */
function normalizeProductName(productName) {
    let name = productName
        .replace(/^\s*\[AL DETAL\]\s*/i, '')
        .replace(/^\s*\[FRACCIONADO\]\s*/i, '')
        .trim();

    // Expand abbreviations (case-insensitive, order matters: longer first)
    const sortedAbbrevs = Object.entries(PHARMA_ABBREVIATIONS)
        .sort((a, b) => b[0].length - a[0].length);
    
    let lower = name.toLowerCase();
    for (const [abbrev, expansion] of sortedAbbrevs) {
        if (lower.includes(abbrev)) {
            // Replace only the first occurrence
            const idx = lower.indexOf(abbrev);
            name = name.substring(0, idx) + expansion + name.substring(idx + abbrev.length);
            lower = name.toLowerCase();
        }
    }

    // Separate numbers stuck to units: "500MG" → "500 mg", "0,1%5ML" → "0.1% 5ml"
    name = name
        .replace(/(\d+),(\d+)/g, '$1.$2')               // comma → dot in decimals
        .replace(/(\d)(mg|ml|mcg|g|ui|iu|%)/gi, '$1 $2')  // separate num+unit
        .replace(/(%)\s*(\d)/g, '$1 $2')                  // separate % from next number
        .replace(/(\d+)\s*(com|und|tab|cap)/gi, '$1 $2') // separate num+form count
        .replace(/\./g, (match, offset, str) => {          // remove trailing dots
            // Don't remove dots in decimal numbers like 0.1
            if (/\d/.test(str[offset - 1] || '') && /\d/.test(str[offset + 1] || '')) return '.';
            return ' ';
        });

    // Collapse multiple spaces, strip trailing whitespace
    name = name.replace(/\s+/g, ' ').trim();

    return name;
}

/**
 * Builds search query optimized for Chilean pharmacies.
 */
function buildSearchQuery(productName) {
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
 * Extracts CLP prices from text.
 */
function extractCLPPrices(text) {
    const prices = [];

    // $XX.XXX (thousands separator)
    const pattern1 = /\$\s*(\d{1,3}(?:\.\d{3})+)/g;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
        const price = parseInt(match[1].replace(/\./g, ''), 10);
        if (!isNaN(price)) prices.push(price);
    }

    // $XXXXX (no separator, ≥3 digits)
    const pattern2 = /\$\s*(\d{3,6})(?!\.\d{3})/g;
    while ((match = pattern2.exec(text)) !== null) {
        const price = parseInt(match[1], 10);
        if (!isNaN(price) && !prices.includes(price)) prices.push(price);
    }

    // CLP XXXXX or CLP XX.XXX
    const pattern3 = /CLP\s*(\d{1,3}(?:\.\d{3})*)/gi;
    while ((match = pattern3.exec(text)) !== null) {
        const price = parseInt(match[1].replace(/\./g, ''), 10);
        if (!isNaN(price) && !prices.includes(price)) prices.push(price);
    }

    return prices;
}

/**
 * Identifies source from URL.
 * Returns trusted source if known, or generic .cl domain, or null.
 */
function identifySource(url) {
    const lower = (url || '').toLowerCase();

    // Check trusted sources first (pharmacy-specific)
    for (const [domain, name] of Object.entries(TRUSTED_SOURCES)) {
        if (lower.includes(domain)) {
            return { name, domain, trusted: true };
        }
    }

    // Accept ANY .cl domain as a Chilean source
    const clMatch = lower.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.cl)/i);
    if (clMatch) {
        const domain = clMatch[1];
        // Prettify: "redfarma.cl" → "Redfarma"
        const name = domain.replace('.cl', '').replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        return { name, domain, trusted: false };
    }

    // Google Shopping merchant text (not a URL)
    if (lower && !lower.startsWith('http') && lower.length > 2) {
        return { name: lower.trim(), domain: 'google-shopping', trusted: false };
    }

    return null;
}

/**
 * Calculates match confidence using fuzzy character matching.
 * Compares the *normalized* product name against the search result title.
 * Uses both word-level and character-level matching.
 */
function calculateConfidence(resultTitle, productName) {
    const titleLower = (resultTitle || '').toLowerCase();
    const normalizedName = normalizeProductName(productName).toLowerCase();

    // Stop words que no aportan a la coincidencia
    const stopWords = new Set(['con', 'del', 'para', 'que', 'los', 'las', 'por', 'una',
        'und', 'precio', 'farmacia', 'chile', 'comprar', 'oferta', 'venta']);

    const nameWords = normalizedName.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));

    if (nameWords.length === 0) return 'LOW';

    // Word-level matching (original approach, but with normalized name)
    const wordMatchCount = nameWords.filter(word => titleLower.includes(word)).length;
    const wordMatchRatio = wordMatchCount / nameWords.length;

    // Character-level fuzzy matching (new): 
    // Compare significant chars from product name against title
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

    // Combined score: weight words more, but chars help with abbreviations
    const combinedScore = wordMatchRatio * 0.6 + charMatchRatio * 0.4;

    if (combinedScore >= 0.50) return 'HIGH';
    if (combinedScore >= 0.30) return 'MEDIUM';
    return 'LOW';
}

/**
 * Filters outliers using IQR (Interquartile Range).
 */
function filterOutliersIQR(sortedPrices) {
    if (sortedPrices.length < 3) {
        return { filtered: [...sortedPrices], outlierLow: [], outlierHigh: [] };
    }

    const q1 = calculatePercentile(sortedPrices, 25);
    const q3 = calculatePercentile(sortedPrices, 75);
    const iqr = q3 - q1;
    const effectiveIQR = iqr > 0 ? iqr : q1 * 0.1;

    const lowerBound = q1 - 1.5 * effectiveIQR;
    const upperBound = q3 + 1.5 * effectiveIQR;

    const filtered = [];
    const outlierLow = [];
    const outlierHigh = [];

    for (const price of sortedPrices) {
        if (price < lowerBound) outlierLow.push(price);
        else if (price > upperBound) outlierHigh.push(price);
        else filtered.push(price);
    }

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

function calculateMedian(sorted) {
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function calculatePercentile(sorted, percentile) {
    if (sorted.length === 0) return 0;
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Smart Price calculation (same algorithm as web-price-search.ts).
 */
function calculateSmartPrice(webResults, currentPrice, costPrice) {
    const cfg = { competitiveDiscountPercent: 3, minMarginPercent: 15 };

    const confidentResults = webResults.filter(
        r => (r.confidence === 'HIGH' || r.confidence === 'MEDIUM') && r.price > 0
    );

    // Relaxed: accept with just 1 confident result (was 2)
    if (confidentResults.length < 1) return null;

    const allPrices = confidentResults.map(r => r.price).sort((a, b) => a - b);
    const { filtered, outlierLow, outlierHigh } = filterOutliersIQR(allPrices);

    if (filtered.length === 0) return null;

    const medianPrice = calculateMedian(filtered);
    const discountFactor = 1 - (cfg.competitiveDiscountPercent / 100);
    let recommendedPrice = Math.round(medianPrice * discountFactor);

    let marginProtectionApplied = false;
    if (costPrice > 0) {
        const minAllowedPrice = Math.round(costPrice * (1 + cfg.minMarginPercent / 100));
        if (recommendedPrice < minAllowedPrice) {
            recommendedPrice = minAllowedPrice;
            marginProtectionApplied = true;
        }
    }

    // Round to $50 CLP
    recommendedPrice = Math.ceil(recommendedPrice / 50) * 50;

    return {
        recommendedPrice,
        medianPrice,
        filteredPrices: filtered,
        outlierLowPrices: outlierLow,
        outlierHighPrices: outlierHigh,
        competitiveDiscountPercent: cfg.competitiveDiscountPercent,
        marginProtectionApplied,
        reasoning: `${allPrices.length} precios encontrados, ${filtered.length} válidos. Mediana: $${medianPrice.toLocaleString()}. Descuento: -${cfg.competitiveDiscountPercent}%.${marginProtectionApplied ? ' ⚠️ Protección de margen activada.' : ''}`,
    };
}

// ============================================================================
// SINGLE PRODUCT SEARCH (called from IPC)
// ============================================================================

/**
 * Searches for a single product and returns structured results.
 */
async function searchSingleProduct(productName, currentPrice, costPrice) {
    try {
        const searchData = await searchWithBrowser(productName);
        const webResults = [];

        for (const item of searchData.results) {
            const fullText = `${item.title} ${item.snippet}`;
            const prices = extractCLPPrices(fullText);
            if (prices.length === 0) continue;

            // Accept ANY identifiable source (trusted .cl, generic .cl, or merchant text)
            const sourceInfo = identifySource(item.url || item.merchant || '');
            const sourceName = sourceInfo ? sourceInfo.name : 'Web';

            const confidence = calculateConfidence(item.title || item.snippet, productName);
            const validPrices = prices.filter(p => p >= 100 && p <= 500000);
            if (validPrices.length === 0) continue;

            const bestPrice = Math.min(...validPrices);

            // Boost confidence if source is a known trusted pharmacy
            const finalConfidence = (sourceInfo && sourceInfo.trusted && confidence === 'LOW') 
                ? 'MEDIUM' 
                : confidence;

            webResults.push({
                source: sourceName,
                price: bestPrice,
                url: item.url || '',
                title: (item.title || '').substring(0, 120),
                confidence: finalConfidence,
            });
        }

        // Calculate market stats
        const validPrices = webResults
            .filter(r => r.confidence !== 'LOW')
            .map(r => r.price)
            .filter(p => p > 0);

        const marketPriceMin = validPrices.length > 0 ? Math.min(...validPrices) : 0;
        const marketPriceMax = validPrices.length > 0 ? Math.max(...validPrices) : 0;
        const marketPriceAvg = validPrices.length > 0
            ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
            : 0;

        const priceDiffPercent = currentPrice > 0 && marketPriceAvg > 0
            ? Math.round(((marketPriceAvg - currentPrice) / currentPrice) * 10000) / 100
            : 0;

        const smartPrice = calculateSmartPrice(webResults, currentPrice, costPrice);

        return {
            success: true,
            result: {
                productName,
                webResults,
                marketPriceMin,
                marketPriceMax,
                marketPriceAvg,
                priceDiffPercent,
                smartPrice,
                currentPrice,
                costPrice,
                researchedAt: new Date().toISOString(),
            },
        };

    } catch (error) {
        console.error(`[WebPriceEngine] Error searching "${productName}":`, error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Run batch price research with progress reporting.
 *
 * @param {BrowserWindow} mainWin - Main app window (for sending events)
 * @param {Array<{name: string, sku: string, currentPrice: number, costPrice: number}>} products
 */
async function runBatch(mainWin, products) {
    isRunning = true;
    isPaused = false;
    processedCount = 0;
    totalCount = products.length;

    // Prevent system sleep
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.log(`[WebPriceEngine] Batch started — ${totalCount} products. PowerBlocker: ${powerBlockerId}`);

    try {
        for (let i = 0; i < products.length; i++) {
            if (!isRunning) break;

            // Pause loop
            while (isPaused && isRunning) {
                await sleep(500);
            }
            if (!isRunning) break;

            const product = products[i];
            processedCount = i + 1;

            // Report: searching
            mainWin.webContents.send('web-price-progress', {
                current: processedCount,
                total: totalCount,
                productName: product.name,
                sku: product.sku,
                status: 'SEARCHING',
            });

            const result = await searchSingleProduct(
                product.name,
                product.currentPrice,
                product.costPrice
            );

            // Report: result
            mainWin.webContents.send('web-price-result', {
                current: processedCount,
                total: totalCount,
                sku: product.sku,
                result: result.success ? result.result : null,
                error: result.error || null,
            });

            // Rate limit + jitter
            if (i < products.length - 1 && isRunning) {
                const delay = CONFIG.searchDelayMs + Math.random() * CONFIG.jitterMs;
                await sleep(delay);
            }
        }

        if (isRunning) {
            mainWin.webContents.send('web-price-complete', {
                processed: processedCount,
                total: totalCount,
            });
        }

    } catch (error) {
        console.error('[WebPriceEngine] Critical error:', error);
        mainWin.webContents.send('web-price-error', { error: error.message });
    } finally {
        if (powerBlockerId !== null) {
            powerSaveBlocker.stop(powerBlockerId);
            powerBlockerId = null;
        }
        destroyHiddenWindow();
        isRunning = false;
    }
}

function pauseBatch() {
    isPaused = !isPaused;
    return { isPaused, processedCount, totalCount };
}

function stopBatch() {
    isRunning = false;
    isPaused = false;
    destroyHiddenWindow();
    if (powerBlockerId !== null) {
        powerSaveBlocker.stop(powerBlockerId);
        powerBlockerId = null;
    }
    return { stopped: true, processedCount, totalCount };
}

function getStatus() {
    return { isRunning, isPaused, processedCount, totalCount };
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    searchSingleProduct,
    runBatch,
    pauseBatch,
    stopBatch,
    getStatus,
    // Export pure functions for testing
    normalizeProductName,
    buildSearchQuery,
    extractCLPPrices,
    identifySource,
    calculateConfidence,
    filterOutliersIQR,
    calculateMedian,
    calculatePercentile,
    calculateSmartPrice,
};
