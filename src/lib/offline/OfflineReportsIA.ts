'use client';
/**
 * OfflineReportsIA — Reportes y Caché de IA offline
 *
 * Funciones para:
 * - Generar reportes diarios/mensuales con datos locales de SQLite
 * - Cachear sugerencias de pedido IA para uso offline
 * - Snapshots de reportes para consulta sin conexión
 */

// ─────────────────────────────────────────────────
// ELECTRON API ACCESS
// ─────────────────────────────────────────────────
function getAPI(): any | null {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
        const api = (window as any).electronAPI;
        if (api?.isElectron) return api;
    }
    return null;
}

// ─────────────────────────────────────────────────
// REPORTES / BI CON DATOS LOCALES
// ─────────────────────────────────────────────────

/** Generar resumen diario desde datos locales */
export async function generateOfflineDailySummary(locationId: string, date: string): Promise<{
    totalSales: number;
    totalTransactions: number;
    avgTicket: number;
    topProducts: Array<{ name: string; quantity: number; total: number }>;
    paymentBreakdown: Record<string, number>;
} | null> {
    const api = getAPI();
    if (!api) return null;

    try {
        // Ventas del día
        const sales = await api.offlineDB.getAll('sales', {
            location_id: locationId,
            status: 'completed',
        }) as any[];

        const daySales = sales.filter(s => {
            const saleDate = (s.created_at || '').slice(0, 10);
            return saleDate === date;
        });

        if (daySales.length === 0) {
            return { totalSales: 0, totalTransactions: 0, avgTicket: 0, topProducts: [], paymentBreakdown: {} };
        }

        const totalSales = daySales.reduce((sum: number, s: any) => sum + (s.total || 0), 0);
        const totalTransactions = daySales.length;
        const avgTicket = totalTransactions > 0 ? Math.round(totalSales / totalTransactions) : 0;

        // Payment breakdown
        const paymentBreakdown: Record<string, number> = {};
        for (const s of daySales) {
            const method = s.payment_method || 'cash';
            paymentBreakdown[method] = (paymentBreakdown[method] || 0) + (s.total || 0);
        }

        // Top products (from sale_items)
        const allSaleIds = daySales.map((s: any) => s.id);
        const productTotals = new Map<string, { name: string; quantity: number; total: number }>();

        for (const saleId of allSaleIds) {
            const items = await api.offlineDB.getAll('sale_items', { sale_id: saleId }) as any[];
            for (const item of items) {
                const key = item.product_id || item.product_name;
                const existing = productTotals.get(key) || { name: item.product_name || key, quantity: 0, total: 0 };
                existing.quantity += item.quantity || 0;
                existing.total += item.total || 0;
                productTotals.set(key, existing);
            }
        }

        const topProducts = Array.from(productTotals.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        // Save snapshot
        const summaryId = `ds_${locationId}_${date}`;
        await api.offlineDB.upsert('daily_summaries', {
            id: summaryId,
            location_id: locationId,
            date,
            total_sales: totalSales,
            total_transactions: totalTransactions,
            avg_ticket: avgTicket,
            top_products: JSON.stringify(topProducts),
            payment_breakdown: JSON.stringify(paymentBreakdown),
            computed_at: new Date().toISOString(),
        });

        return { totalSales, totalTransactions, avgTicket, topProducts, paymentBreakdown };
    } catch (err) {
        console.error('[OfflineReports] ❌ Failed to generate daily summary:', err);
        return null;
    }
}

/** Obtener resumen diario guardado */
export async function getOfflineDailySummary(locationId: string, date: string): Promise<any | null> {
    const api = getAPI();
    if (!api) return null;

    try {
        const summaryId = `ds_${locationId}_${date}`;
        const row = await api.offlineDB.getById('daily_summaries', summaryId) as any;
        if (!row) return null;

        return {
            ...row,
            top_products: row.top_products ? JSON.parse(row.top_products) : [],
            payment_breakdown: row.payment_breakdown ? JSON.parse(row.payment_breakdown) : {},
        };
    } catch {
        return null;
    }
}

/** Guardar snapshot de reporte completo */
export async function saveReportSnapshot(report: {
    id: string;
    type: string;
    locationId: string;
    period: string;
    data: Record<string, unknown>;
}): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        await api.offlineDB.upsert('report_snapshots', {
            id: report.id,
            report_type: report.type,
            location_id: report.locationId,
            period: report.period,
            data: JSON.stringify(report.data),
        });
        return true;
    } catch (err) {
        console.error('[OfflineReports] ❌ Failed to save report snapshot:', err);
        return false;
    }
}

/** Obtener snapshots de reportes guardados */
export async function getReportSnapshots(type?: string, locationId?: string): Promise<any[]> {
    const api = getAPI();
    if (!api) return [];

    try {
        const where: Record<string, unknown> = {};
        if (type) where.report_type = type;
        if (locationId) where.location_id = locationId;

        const rows = await api.offlineDB.getAll('report_snapshots', where) as any[];
        return rows.map(r => ({
            ...r,
            data: r.data ? JSON.parse(r.data) : {},
        }));
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────────
// CACHÉ DE PEDIDO SUGERIDO IA
// ─────────────────────────────────────────────────

/** Cachear sugerencias de pedido IA para uso offline */
export async function cacheIASuggestions(suggestions: Array<{
    sku: string;
    productName: string;
    locationId: string;
    suggestedQuantity: number;
    currentStock: number;
    avgDailySales: number;
    supplierId: string;
    confidence: number;
    reasoning?: string;
}>): Promise<boolean> {
    const api = getAPI();
    if (!api) return false;

    try {
        const rows = suggestions.map(s => ({
            id: `ia_${s.sku}_${s.locationId}_${Date.now()}`,
            sku: s.sku,
            product_name: s.productName,
            location_id: s.locationId,
            suggested_qty: s.suggestedQuantity,
            current_stock: s.currentStock,
            avg_daily_sales: s.avgDailySales,
            supplier_id: s.supplierId,
            confidence: s.confidence,
            reasoning: s.reasoning || null,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        }));

        await api.offlineDB.upsertMany('suggestion_cache', rows);
        console.log(`[OfflineIA] ✅ Cached ${rows.length} IA suggestions`);
        return true;
    } catch (err) {
        console.error('[OfflineIA] ❌ Failed to cache suggestions:', err);
        return false;
    }
}

/** Obtener sugerencias IA cacheadas (solo vigentes) */
export async function getCachedIASuggestions(locationId?: string): Promise<any[]> {
    const api = getAPI();
    if (!api) return [];

    try {
        const where: Record<string, unknown> = {};
        if (locationId) where.location_id = locationId;

        const rows = await api.offlineDB.getAll('suggestion_cache', where) as any[];
        const now = new Date().toISOString();

        // Filter expired
        return rows.filter(r => !r.expires_at || r.expires_at > now);
    } catch {
        return [];
    }
}

/** Limpiar sugerencias IA expiradas */
export async function cleanExpiredSuggestions(): Promise<number> {
    const api = getAPI();
    if (!api) return 0;

    try {
        const now = new Date().toISOString();
        const expired = await api.offlineDB.query(
            `SELECT id FROM suggestion_cache WHERE expires_at < ?`,
            [now]
        ) as any[];

        for (const row of expired) {
            await api.offlineDB.delete('suggestion_cache', row.id);
        }

        return expired.length;
    } catch {
        return 0;
    }
}

// ─────────────────────────────────────────────────
// HOOK: Auto-cache IA suggestions after online fetch
// ─────────────────────────────────────────────────

/**
 * Wrapper que ejecuta el servicio de pedido sugerido y cachea los resultados.
 * Usar en lugar de llamar directamente al servicio cuando se quiere caché offline.
 */
export async function fetchAndCacheIASuggestions(
    locationId: string,
    fetchFn: () => Promise<any[]>
): Promise<any[]> {
    const api = getAPI();

    try {
        // Intentar fetch online
        const suggestions = await fetchFn();

        // Cachear si estamos en Electron
        if (api && suggestions.length > 0) {
            await cacheIASuggestions(suggestions.map(s => ({
                sku: s.sku || s.product_id,
                productName: s.product_name || s.productName || '',
                locationId,
                suggestedQuantity: s.suggested_qty || s.suggestedQuantity || 0,
                currentStock: s.current_stock || s.currentStock || 0,
                avgDailySales: s.avg_daily_sales || s.avgDailySales || 0,
                supplierId: s.supplier_id || s.supplierId || '',
                confidence: s.confidence || 0.5,
                reasoning: s.reasoning,
            })));
        }

        return suggestions;
    } catch (err) {
        // Offline: intentar desde caché
        if (api) {
            console.log('[OfflineIA] 📦 Fetching from cache (offline)...');
            return getCachedIASuggestions(locationId);
        }
        throw err;
    }
}
