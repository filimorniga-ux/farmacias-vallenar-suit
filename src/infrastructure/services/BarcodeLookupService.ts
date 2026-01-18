/**
 * ============================================================================
 * BARCODE LOOKUP SERVICE
 * Uses OpenFoodFacts and OpenBeautyFacts APIs localized for Chile
 * ============================================================================
 */

interface OpenFactsProduct {
    product_name?: string;
    product_name_es?: string;
    generic_name?: string;
    generic_name_es?: string;
    brands?: string;
    image_url?: string;
    image_front_url?: string;
    image_front_small_url?: string;
    categories?: string;
    categories_es?: string;
    quantity?: string;
    code?: string;
}

interface OpenFactsResponse {
    status: number;
    status_verbose: string;
    product?: OpenFactsProduct;
}

export interface BarcodeLookupResult {
    found: boolean;
    source?: 'openfoodfacts' | 'openbeautyfacts';
    region?: 'cl' | 'world';
    name?: string;
    description?: string;
    brand?: string;
    imageUrl?: string;
    category?: string;
    quantity?: string;
    barcode: string;
}

/**
 * Lookup product by barcode using OpenFoodFacts/OpenBeautyFacts APIs
 * Prioritizes Chile (cl) subdomain, then falls back to world
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
    // Clean barcode (remove spaces, dashes)
    const cleanBarcode = barcode.replace(/[\s-]/g, '').trim();

    if (!cleanBarcode || cleanBarcode.length < 8) {
        return { found: false, barcode: cleanBarcode };
    }

    // Try OpenFoodFacts Chile first
    let result = await tryOpenFactsAPI('openfoodfacts', 'cl', cleanBarcode);
    if (result.found) return result;

    // Try OpenBeautyFacts Chile
    result = await tryOpenFactsAPI('openbeautyfacts', 'cl', cleanBarcode);
    if (result.found) return result;

    // Fallback to World (global) for imported products
    result = await tryOpenFactsAPI('openfoodfacts', 'world', cleanBarcode);
    if (result.found) return result;

    result = await tryOpenFactsAPI('openbeautyfacts', 'world', cleanBarcode);
    if (result.found) return result;

    return { found: false, barcode: cleanBarcode };
}

async function tryOpenFactsAPI(
    api: 'openfoodfacts' | 'openbeautyfacts',
    region: 'cl' | 'world',
    barcode: string
): Promise<BarcodeLookupResult> {
    const baseUrl = `https://${region}.${api}.org/api/v0/product/${barcode}.json`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(baseUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'FarmaciasVallenar/1.0'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return { found: false, barcode };
        }

        const data: OpenFactsResponse = await response.json();

        if (data.status !== 1 || !data.product) {
            return { found: false, barcode };
        }

        const product = data.product;

        // Prioritize Spanish (_es) fields
        const name = product.product_name_es || product.product_name || '';
        const description = product.generic_name_es || product.generic_name || '';

        // Get best image URL available
        const imageUrl = product.image_front_url || product.image_url || product.image_front_small_url;

        // Get category (prioritize Spanish)
        const category = product.categories_es || product.categories || '';

        return {
            found: true,
            source: api,
            region,
            name: name.trim(),
            description: description.trim(),
            brand: product.brands || undefined,
            imageUrl,
            category: category.split(',')[0]?.trim() || undefined, // Take first category
            quantity: product.quantity || undefined,
            barcode
        };

    } catch (error) {
        // Silently fail - network errors, timeouts, etc.
        console.debug(`[BarcodeLookup] ${api}/${region} failed for ${barcode}:`, error);
        return { found: false, barcode };
    }
}
