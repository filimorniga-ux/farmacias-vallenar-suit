export const OPERATIONAL_QUICK_ACTION_SOURCE = 'operational-suggestion';

export interface OperationalQuickActionContext {
    startDate?: string;
    endDate?: string;
    locationId?: string;
    warehouseId?: string;
    alertId?: string;
    source?: string;
    isOperationalSuggestion: boolean;
}

interface SearchParamsLike {
    get(name: string): string | null;
}

const QUICK_ACTION_HINTS: Record<string, { title: string; destinationCopy: string }> = {
    'cash-long-open-sessions': {
        title: 'Revisar caja abierta',
        destinationCopy: 'Los filtros vienen desde la alerta. La pantalla no cierra caja ni cambia sesión automáticamente.',
    },
    'inventory-critical-low-stock': {
        title: 'Preparar pedido por bajo stock',
        destinationCopy: 'La sucursal y bodega llegan como contexto prellenado. Proveedor, cantidades y confirmación siguen siendo manuales.',
    },
    'sales-no-activity': {
        title: 'Revisar apertura de caja',
        destinationCopy: 'La navegación abre caja, pero la sesión visible siempre se valida contra el servidor.',
    },
    'procurement-stale-open-orders': {
        title: 'Dar seguimiento a órdenes',
        destinationCopy: 'El reporte abre compras filtradas. No cancela, reenvía ni cambia estados.',
    },
    'procurement-open-orders': {
        title: 'Revisar backlog de compras',
        destinationCopy: 'El reporte abre compras filtradas. No genera nuevas órdenes.',
    },
    'wms-pending-transfers': {
        title: 'Inspeccionar transferencias',
        destinationCopy: 'El reporte abre logística filtrada. No reintenta ni cambia estado WMS.',
    },
    'wms-pending-receptions': {
        title: 'Inspeccionar recepciones',
        destinationCopy: 'El reporte abre recepciones filtradas. No confirma ingreso de stock.',
    },
};

function normalize(value?: string | null) {
    const normalized = value?.trim();
    return normalized || undefined;
}

function addParam(params: URLSearchParams, key: string, value?: string) {
    const normalized = normalize(value);
    if (normalized) {
        params.set(key, normalized);
    }
}

export function buildOperationalQuickActionHref(
    pathname: string,
    context: Omit<OperationalQuickActionContext, 'source' | 'isOperationalSuggestion'>,
    extraParams: Record<string, string | undefined> = {},
) {
    const params = new URLSearchParams();

    addParam(params, 'startDate', context.startDate);
    addParam(params, 'endDate', context.endDate);
    addParam(params, 'locationId', context.locationId);
    addParam(params, 'warehouseId', context.warehouseId);
    addParam(params, 'source', OPERATIONAL_QUICK_ACTION_SOURCE);
    addParam(params, 'alertId', context.alertId);

    for (const [key, value] of Object.entries(extraParams)) {
        addParam(params, key, value);
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
}

export function parseOperationalQuickActionParams(searchParams: SearchParamsLike): OperationalQuickActionContext {
    const source = normalize(searchParams.get('source'));
    const alertId = normalize(searchParams.get('alertId'));

    return {
        startDate: normalize(searchParams.get('startDate')),
        endDate: normalize(searchParams.get('endDate')),
        locationId: normalize(searchParams.get('locationId')),
        warehouseId: normalize(searchParams.get('warehouseId')),
        source,
        alertId,
        isOperationalSuggestion: source === OPERATIONAL_QUICK_ACTION_SOURCE && Boolean(alertId),
    };
}

export function getOperationalQuickActionHint(alertId?: string) {
    return alertId ? QUICK_ACTION_HINTS[alertId] : undefined;
}
