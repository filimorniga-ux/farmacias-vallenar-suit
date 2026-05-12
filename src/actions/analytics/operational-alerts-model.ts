export type OperationalAlertSeverity = 'info' | 'warning' | 'critical';

export type OperationalAlertDrilldownTarget =
    | 'cash'
    | 'inventory-low-stock'
    | 'procurement-orders'
    | 'wms-transfers'
    | 'wms-receptions'
    | 'sales-products';

export interface OperationalAlert {
    id: string;
    name: string;
    definition: string;
    trigger: string;
    severity: OperationalAlertSeverity;
    source: string;
    owner: 'ventas' | 'caja' | 'inventario' | 'procurement' | 'wms';
    value: number;
    threshold: string;
    drilldown: {
        target: OperationalAlertDrilldownTarget;
        filters: {
            startDate?: string;
            endDate?: string;
            locationId?: string;
            warehouseId?: string;
        };
    };
}

export interface OperationalAlertsPayload {
    scope: {
        startDate: string;
        endDate: string;
        locationId?: string;
        warehouseId?: string;
        granularity: 'day' | 'week' | 'month';
    };
    generatedAt: string;
    alerts: OperationalAlert[];
    exclusions: Array<{ name: string; reason: string }>;
}

export type OperationalAlertsResult =
    | { success: true; data: OperationalAlertsPayload }
    | { success: false; error: string };

export const OPERATIONAL_ALERT_EXCLUSIONS = [
    { name: 'forecast de demanda', reason: 'requiere modelo predictivo y normalización histórica' },
    { name: 'márgenes y rentabilidad', reason: 'costos/márgenes siguen fuera del contrato ready' },
    { name: 'SLA avanzado WMS', reason: 'necesita eventos temporales normalizados por etapa' },
    { name: 'alertas IA', reason: 'no hay contrato validado de inferencia operacional' },
    { name: 'alertas compuestas ponderadas', reason: 'evita pesos arbitrarios sin owner de negocio' },
] as const;
