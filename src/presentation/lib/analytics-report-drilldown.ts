export type AnalyticsDrilldownTarget =
    | 'reports-overview'
    | 'sales-products'
    | 'cash'
    | 'inventory-low-stock'
    | 'procurement-orders'
    | 'wms-transfers'
    | 'wms-receptions';

export interface AnalyticsDrilldownFilters {
    startDate?: string;
    endDate?: string;
    locationId?: string;
    warehouseId?: string;
}

const DRILLDOWN_TARGETS: Record<AnalyticsDrilldownTarget, { pathname: string; params?: Record<string, string> }> = {
    'reports-overview': { pathname: '/reports' },
    'sales-products': { pathname: '/reports/sales-by-product' },
    cash: { pathname: '/reports', params: { tab: 'cash' } },
    'inventory-low-stock': { pathname: '/reports', params: { tab: 'inventory', detail: 'low-stock' } },
    'procurement-orders': { pathname: '/reports', params: { tab: 'procurement', detail: 'open-orders' } },
    'wms-transfers': { pathname: '/reports', params: { tab: 'logistics', detail: 'transfers' } },
    'wms-receptions': { pathname: '/reports', params: { tab: 'logistics', detail: 'receptions' } },
};

function addParam(params: URLSearchParams, key: string, value?: string) {
    const normalized = value?.trim();
    if (normalized) {
        params.set(key, normalized);
    }
}

export function buildAnalyticsDrilldownHref(
    target: AnalyticsDrilldownTarget,
    filters: AnalyticsDrilldownFilters = {},
) {
    const config = DRILLDOWN_TARGETS[target];
    const params = new URLSearchParams(config.params);

    addParam(params, 'startDate', filters.startDate);
    addParam(params, 'endDate', filters.endDate);
    addParam(params, 'locationId', filters.locationId);
    addParam(params, 'warehouseId', filters.warehouseId);

    const query = params.toString();
    return query ? `${config.pathname}?${query}` : config.pathname;
}
