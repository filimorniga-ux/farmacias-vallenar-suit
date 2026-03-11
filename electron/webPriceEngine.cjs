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
    pageLoadTimeoutMs: 12000,
    /** Max results to extract per search */
    maxResultsPerProduct: 8,
    /** User agent (matches real Chrome) */
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
 *
 * @param {string} productName - Product name to search
 * @returns {Promise<{results: Array<{title: string, url: string, snippet: string}>}>}
 */
async function searchWithBrowser(productName) {
    const win = getOrCreateHiddenWindow();
    const query = buildSearchQuery(productName);
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&kl=cl-es&ia=web`;

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Page load timeout'));
        }, CONFIG.pageLoadTimeoutMs);

        win.webContents.once('did-finish-load', async () => {
            clearTimeout(timeout);

            // Wait a bit for JS rendering
            await sleep(1500);

            try {
                // Extract search results from real rendered DOM
                const data = await win.webContents.executeJavaScript(`
                    (function() {
                        const results = [];
                        // DuckDuckGo renders results in article[data-testid="result"] or .result
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
                        
                        // Fallback: extract all visible text if no structured results
                        if (results.length === 0) {
                            const bodyText = document.body ? document.body.innerText : '';
                            // Try to find price patterns in raw body text
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

        win.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
            clearTimeout(timeout);
            reject(new Error(`Page load failed: ${errorDescription}`));
        });

        win.loadURL(searchUrl).catch(err => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

// ============================================================================
// PARSERS (pure functions, same logic as web-price-search.ts)
// ============================================================================

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
    if (words.length > 6) {
        clean = words.slice(0, 6).join(' ');
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
 * Identifies trusted pharmacy source from URL.
 */
function identifySource(url) {
    const lower = (url || '').toLowerCase();
    for (const [domain, name] of Object.entries(TRUSTED_SOURCES)) {
        if (lower.includes(domain)) {
            return { name, domain };
        }
    }
    return null;
}

/**
 * Calculates match confidence.
 */
function calculateConfidence(resultTitle, productName) {
    const titleLower = (resultTitle || '').toLowerCase();
    const nameLower = productName.toLowerCase()
        .replace(/^\s*\[al detal\]\s*/i, '')
        .replace(/^\s*\[fraccionado\]\s*/i, '');

    const stopWords = new Set(['con', 'del', 'para', 'que', 'los', 'las', 'por', 'una', 'comp', 'lab', 'und']);
    const nameWords = nameLower.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));

    if (nameWords.length === 0) return 'LOW';

    const matchCount = nameWords.filter(word => titleLower.includes(word)).length;
    const matchRatio = matchCount / nameWords.length;

    if (matchRatio >= 0.7) return 'HIGH';
    if (matchRatio >= 0.4) return 'MEDIUM';
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

    if (confidentResults.length < 2) return null;

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

            const sourceInfo = identifySource(item.url);
            if (!sourceInfo) continue;

            const confidence = calculateConfidence(item.title, productName);
            const validPrices = prices.filter(p => p >= 100 && p <= 500000);
            if (validPrices.length === 0) continue;

            const bestPrice = Math.min(...validPrices);

            webResults.push({
                source: sourceInfo.name,
                price: bestPrice,
                url: item.url || '',
                title: (item.title || '').substring(0, 120),
                confidence,
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
    buildSearchQuery,
    extractCLPPrices,
    identifySource,
    calculateConfidence,
    filterOutliersIQR,
    calculateMedian,
    calculatePercentile,
    calculateSmartPrice,
};
