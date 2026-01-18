/**
 * ============================================================================
 * PRICE AUDIT ENGINE - Electron Main Process
 * Scraping engine for competitor price analysis
 * ============================================================================
 */

const https = require('https');
const http = require('http');
const { powerSaveBlocker, BrowserWindow } = require('electron');

// State management
let isRunning = false;
let isPaused = false;
let currentBatchId = null;
let processedCount = 0;
let totalCount = 0;
let powerBlockerId = null;
let abortController = null;

// Configuration
const CONFIG = {
    delayMin: 10000,      // 10 seconds
    delayMax: 18000,      // 18 seconds
    retryAttempts: 3,
    retryDelay: 60000,    // 1 minute
    timeout: 15000,       // 15 seconds per request
    minMargin: 0.30,      // 30% minimum margin
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * Get random delay between min and max
 */
function getRandomDelay() {
    return Math.floor(Math.random() * (CONFIG.delayMax - CONFIG.delayMin + 1)) + CONFIG.delayMin;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTP request to DuckDuckGo with Chilean region filter
 */
function fetchDuckDuckGo(query) {
    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        // kl=cl-cl forces Chilean region results
        const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}&kl=cl-cl`;

        const options = {
            headers: {
                'User-Agent': CONFIG.userAgent,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'es-CL,es;q=0.9'
            },
            timeout: CONFIG.timeout
        };

        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Extract prices from HTML using regex (no cheerio dependency)
 * STRICT CHILE FILTERING: Only accepts CLP prices from .cl domains
 */
function extractPricesFromHTML(html, productName) {
    const prices = [];
    const sources = [];

    // Verify we have Chilean domain results (.cl)
    const hasChileanDomains = /\.cl[\s\/"'>]/i.test(html);
    if (!hasChileanDomains) {
        console.log('[PriceAudit] No Chilean domains found, skipping extraction');
        return { prices: [], sources: [] };
    }

    // Pattern to find Chilean peso prices (with $ symbol)
    const pricePatterns = [
        /\$\s*([\d.]+)/g,           // $1.990 or $1990
        /CLP\s*([\d.]+)/g,          // CLP 1.990
        /([\d.]+)\s*pesos/gi        // 1990 pesos
    ];

    // Known Chilean pharmacy domains (MUST end in .cl)
    const pharmacyPatterns = [
        { name: 'Cruz Verde', pattern: /cruzverde\.cl/i },
        { name: 'Salcobrand', pattern: /salcobrand\.cl/i },
        { name: 'Ahumada', pattern: /(ahumada|fahorro)\.cl/i },
        { name: 'Dr. Simi', pattern: /(drsimi|similares)\.cl/i },
        { name: 'Farmex', pattern: /farmex\.cl/i },
        { name: 'Farmacias.cl', pattern: /farmacias\.cl/i },
        { name: 'Yapp', pattern: /yapp\.cl/i },
        { name: 'Knop', pattern: /knop\.cl/i }
    ];

    // Extract all price-like patterns
    for (const pattern of pricePatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            // Remove thousands separator (.) and parse
            const priceStr = match[1].replace(/\./g, '').replace(',', '.');
            const price = parseFloat(priceStr);

            // STRICT CLP VALIDATION:
            // - Minimum $500 CLP (avoids USD/MXN confusion)
            // - Maximum $500,000 CLP (reasonable pharmacy limit)
            // - Ignore suspicious round numbers that might be USD (like 50, 100, 200)
            if (price >= 500 && price <= 500000) {
                // Extra check: if price is suspiciously low and round, skip it
                if (price < 1000 && price % 100 === 0) {
                    continue; // Skip $500, $600, $700 etc (likely USD)
                }
                prices.push(price);
            }
        }
    }

    // Check which Chilean pharmacies (.cl) appear in results
    for (const pharmacy of pharmacyPatterns) {
        if (pharmacy.pattern.test(html)) {
            sources.push(pharmacy.name);
        }
    }

    return { prices, sources };
}

/**
 * Analyze prices using OpenAI (called via IPC to renderer)
 */
async function analyzePricesWithAI(win, productName, htmlContent) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('AI analysis timeout'));
        }, 30000);

        // Send to renderer for API call (OpenAI runs in Next.js)
        win.webContents.send('analyze-prices-request', {
            productName,
            htmlSnippet: htmlContent.substring(0, 10000) // Limit size
        });

        // Listen for response
        const handler = (event, result) => {
            clearTimeout(timeout);
            resolve(result);
        };

        require('electron').ipcMain.once('analyze-prices-response', handler);
    });
}

/**
 * Calculate suggested price with margin protection
 */
function calculateSuggestedPrice(prices, costPrice) {
    if (!prices.length) return null;

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = (min + max) / 2;
    const suggested = avg * 0.90; // 10% below average

    // Margin protection: Cost + IVA + minimum margin
    const minAllowedPrice = costPrice * 1.19 * (1 + CONFIG.minMargin);

    return {
        min,
        max,
        avg,
        suggested: Math.max(suggested, minAllowedPrice),
        isViable: suggested >= minAllowedPrice,
        margin: ((suggested / (costPrice * 1.19)) - 1) * 100
    };
}

/**
 * Process a single product
 */
async function processProduct(win, product, batchId) {
    // STRICT CHILE FILTER: Force .cl domains only
    const query = `${product.name} precio farmacia site:.cl`;

    try {
        // Fetch search results
        const html = await fetchDuckDuckGo(query);

        // Extract prices from HTML
        const { prices, sources } = extractPricesFromHTML(html, product.name);

        // Calculate pricing
        const result = calculateSuggestedPrice(prices, product.cost_net || product.cost_price || 0);

        // Prepare proposal
        const proposal = {
            batch_id: batchId,
            product_id: product.id,
            sku: product.sku,
            product_name: product.name,
            current_price: product.price_sell_box || product.price || 0,
            cost_price: product.cost_net || product.cost_price || 0,
            competitor_min: result?.min || null,
            competitor_max: result?.max || null,
            competitor_avg: result?.avg || null,
            suggested_price: result?.suggested || null,
            margin_percent: result?.margin || null,
            status: result?.isViable === false ? 'NOT_VIABLE' : 'PENDING',
            rejection_reason: result?.isViable === false ? 'Precio sugerido inferior al margen mínimo (30%)' : null,
            sources_found: sources.length,
            raw_search_data: { sources, pricesFound: prices.length }
        };

        return { success: true, proposal };

    } catch (error) {
        console.error(`[PriceAudit] Error processing ${product.sku}:`, error.message);
        return {
            success: false,
            error: error.message,
            proposal: {
                batch_id: batchId,
                product_id: product.id,
                sku: product.sku,
                product_name: product.name,
                current_price: product.price_sell_box || 0,
                cost_price: product.cost_net || 0,
                status: 'NOT_VIABLE',
                rejection_reason: `Error de búsqueda: ${error.message}`,
                sources_found: 0
            }
        };
    }
}

/**
 * Main audit process
 */
async function runAudit(win, batchId, products, startOffset = 0) {
    isRunning = true;
    isPaused = false;
    currentBatchId = batchId;
    processedCount = startOffset;
    totalCount = products.length + startOffset;

    // Prevent system sleep
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.log(`[PriceAudit] Started with power blocker ID: ${powerBlockerId}`);

    try {
        for (let i = 0; i < products.length; i++) {
            // Check if paused or stopped
            if (isPaused || !isRunning) {
                console.log('[PriceAudit] Process paused/stopped');
                break;
            }

            const product = products[i];
            processedCount = startOffset + i + 1;

            // Send progress update
            win.webContents.send('price-audit-progress', {
                batchId,
                processed: processedCount,
                total: totalCount,
                currentProduct: product.name,
                estimatedTimeRemaining: (products.length - i - 1) * ((CONFIG.delayMin + CONFIG.delayMax) / 2) / 1000 / 60
            });

            // Process product
            const result = await processProduct(win, product, batchId);

            // Send result to save via IPC
            win.webContents.send('price-audit-result', result.proposal);

            // Random delay to avoid detection
            if (i < products.length - 1) {
                const delay = getRandomDelay();
                await sleep(delay);
            }
        }

        // Mark as complete if not paused
        if (!isPaused && isRunning) {
            win.webContents.send('price-audit-complete', {
                batchId,
                processed: processedCount,
                total: totalCount
            });
        }

    } catch (error) {
        console.error('[PriceAudit] Critical error:', error);
        win.webContents.send('price-audit-error', {
            batchId,
            error: error.message,
            lastOffset: processedCount
        });
    } finally {
        // Release power blocker
        if (powerBlockerId !== null) {
            powerSaveBlocker.stop(powerBlockerId);
            powerBlockerId = null;
        }
        isRunning = false;
    }
}

/**
 * Pause the current audit
 */
function pauseAudit() {
    isPaused = true;
    return { paused: true, lastOffset: processedCount };
}

/**
 * Stop the current audit
 */
function stopAudit() {
    isRunning = false;
    isPaused = false;
    if (powerBlockerId !== null) {
        powerSaveBlocker.stop(powerBlockerId);
        powerBlockerId = null;
    }
    return { stopped: true, lastOffset: processedCount };
}

/**
 * Get current status
 */
function getStatus() {
    return {
        isRunning,
        isPaused,
        currentBatchId,
        processedCount,
        totalCount,
        progress: totalCount > 0 ? (processedCount / totalCount * 100).toFixed(1) : 0
    };
}

module.exports = {
    runAudit,
    pauseAudit,
    stopAudit,
    getStatus,
    CONFIG
};
