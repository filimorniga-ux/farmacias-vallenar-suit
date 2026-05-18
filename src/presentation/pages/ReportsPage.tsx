import React, { Suspense, lazy, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { usePharmaStore } from '../store/useStore';
import TimeFilter, { DateRange } from '../components/bi/TimeFilter';
import { TrendingUp, DollarSign, FileText, Package, Users, Download, RefreshCw, ArrowDown, ArrowUp, Clock, X, ChevronDown, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';

// V2 Backend Actions - Todas las funciones seguras
import {
    getCashFlowLedgerSecure, getTaxSummarySecure, getInventoryValuationSecure,
    getDetailedFinancialSummarySecure, getLogisticsKPIsSecure, getStockMovementsDetailSecure,
    getCriticalLowStockReportSecure,
    getOpenPurchaseOrdersReportSecure,
    getPendingShipmentsReportSecure,
    CashFlowEntry, TaxSummary, InventoryValuation, LogisticsKPIs, PayrollPreview,
    type CriticalLowStockReportRow,
    type OpenPurchaseOrderReportRow,
    type PendingShipmentReportRow,
} from '../../actions/reports-detail-v2';
import { exportCashFlowSecure, exportLogisticsReportSecure, exportTaxSummarySecure } from '../../actions/finance-export-v2';
import { exportAttendanceSummarySecure } from '../../actions/attendance-export-v2';
import { buildAnalyticsDrilldownHref } from '@/presentation/lib/analytics-report-drilldown';
import {
    getOperationalQuickActionHint,
    parseOperationalQuickActionParams,
} from '@/lib/operational-quick-actions';
import {
    emitOperationalQuickActionUxEvent,
    resolveOperationalQuickActionDestinationStatus,
} from '@/lib/operational-quick-action-telemetry';
import {
    OPERATIONAL_CONTEXT_ORIGIN_LABELS,
    OPERATIONAL_CONTEXT_STATUS_LABELS,
    OPERATIONAL_REJECTION_REASON_LABELS,
} from '@/lib/operational-message-catalog';

const LazyHRReportTab = lazy(async () => {
    const module = await import('../components/reports/HRReportTab');
    return { default: module.HRReportTab };
});

const LazyCashReceiptsReport = lazy(async () => {
    const module = await import('../components/reports/CashReceiptsReport');
    return { default: module.CashReceiptsReport };
});

const REPORTS_STALE_TIME_MS = 1000 * 60 * 5;

type ReportsTab = 'cash' | 'tax' | 'logistics' | 'hr' | 'receipts' | 'inventory' | 'procurement';
type LogisticsDetailType = 'IN' | 'OUT' | null;
type PendingShipmentKind = 'TRANSFERS' | 'RECEPTIONS' | null;
type ReportPresetId = 'cash-today' | 'inventory-low-stock' | 'wms-pending-transfers' | 'wms-pending-receptions' | 'procurement-open-orders';
type ExportPackId = 'stock-and-supply';

const REPORT_TABS = ['cash', 'tax', 'logistics', 'hr', 'receipts', 'inventory', 'procurement'] as const;

const REPORT_PRESETS: Array<{
    id: ReportPresetId;
    label: string;
    description: string;
    tab: ReportsTab;
    dateMode: 'today' | 'keep';
    detailType: LogisticsDetailType;
    pendingShipmentKind: PendingShipmentKind;
    filtersLabel: string;
    exportIncludes: string[];
}> = [
        {
            id: 'cash-today',
            label: 'Caja de hoy',
            description: 'Flujo de caja del día para la sucursal vigente.',
            tab: 'cash',
            dateMode: 'today',
            detailType: null,
            pendingShipmentKind: null,
            filtersLabel: 'Hoy + sucursal efectiva',
            exportIncludes: ['Flujo de caja'],
        },
        {
            id: 'inventory-low-stock',
            label: 'Bajo stock crítico',
            description: 'Productos bajo mínimo con contexto de sucursal y bodega.',
            tab: 'inventory',
            dateMode: 'keep',
            detailType: null,
            pendingShipmentKind: null,
            filtersLabel: 'Sucursal/bodega efectiva',
            exportIncludes: ['CSV de bajo stock'],
        },
        {
            id: 'wms-pending-transfers',
            label: 'Transferencias pendientes',
            description: 'Shipments de transferencia pendientes para revisión logística.',
            tab: 'logistics',
            dateMode: 'keep',
            detailType: null,
            pendingShipmentKind: 'TRANSFERS',
            filtersLabel: 'Rango actual + ubicación/bodega',
            exportIncludes: ['CSV de transferencias pendientes'],
        },
        {
            id: 'wms-pending-receptions',
            label: 'Recepciones pendientes',
            description: 'Recepciones pendientes para priorizar entrada física.',
            tab: 'logistics',
            dateMode: 'keep',
            detailType: null,
            pendingShipmentKind: 'RECEPTIONS',
            filtersLabel: 'Rango actual + ubicación/bodega',
            exportIncludes: ['CSV de recepciones pendientes'],
        },
        {
            id: 'procurement-open-orders',
            label: 'Compras abiertas',
            description: 'Órdenes no cerradas dentro del contexto operativo.',
            tab: 'procurement',
            dateMode: 'keep',
            detailType: null,
            pendingShipmentKind: null,
            filtersLabel: 'Rango actual + ubicación/bodega',
            exportIncludes: ['CSV de órdenes abiertas'],
        },
    ];

const EXPORT_PACKS: Array<{
    id: ExportPackId;
    label: string;
    description: string;
    includes: string[];
}> = [
        {
            id: 'stock-and-supply',
            label: 'Stock y abastecimiento',
            description: 'Bajo stock, compras abiertas y shipments pendientes usando reportes existentes.',
            includes: ['Bajo stock crítico', 'Órdenes abiertas', 'Transferencias pendientes', 'Recepciones pendientes'],
        },
    ];

function parseReportTab(value: string | null): ReportsTab {
    return REPORT_TABS.includes(value as ReportsTab) ? value as ReportsTab : 'cash';
}

function parseDateInput(value: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00.000`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateInput(date: Date) {
    return date.toISOString().slice(0, 10);
}

function getTodayDateRange(): DateRange {
    const now = new Date();
    return {
        from: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        to: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    };
}

function parseInitialDateRange(searchParams: { get: (name: string) => string | null }): DateRange {
    const from = parseDateInput(searchParams.get('startDate'));
    const to = parseDateInput(searchParams.get('endDate'));

    if (from && to && from <= to) {
        return { from, to };
    }

    const now = new Date();
    return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
}

function normalizeQueryFilter(value: string | null) {
    const normalized = value?.trim();
    return normalized && normalized !== 'ALL' ? normalized : undefined;
}

function parsePendingShipmentKind(detail: string | null): PendingShipmentKind {
    if (detail === 'transfers') return 'TRANSFERS';
    if (detail === 'receptions') return 'RECEPTIONS';
    return null;
}

function parseStockMovementDetail(detail: string | null): LogisticsDetailType {
    if (detail === 'stock-in') return 'IN';
    if (detail === 'stock-out') return 'OUT';
    return null;
}

type CsvCell = string | number | null | undefined;

function escapeCsvCell(value: CsvCell) {
    const normalized = String(value ?? '');
    if (/[",\n\r]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}

function downloadCsv<T>(
    filename: string,
    rows: T[],
    columns: Array<{ header: string; value: (row: T) => CsvCell }>,
) {
    const header = columns.map((column) => escapeCsvCell(column.header)).join(',');
    const body = rows.map((row) => (
        columns.map((column) => escapeCsvCell(column.value(row))).join(',')
    ));
    const csv = ['\uFEFF' + header, ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

function TabLoadingFallback({ label }: { label: string }) {
    return (
        <div className="flex justify-center items-center h-64 text-gray-500">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mr-3" />
            <span>{label}</span>
        </div>
    );
}

const ReportsPage: React.FC = () => {
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const { currentWarehouseId, currentLocationId } = usePharmaStore();
    const quickActionContext = parseOperationalQuickActionParams(searchParams);
    const quickActionHint = getOperationalQuickActionHint(quickActionContext.alertId);
    const requestedLocationId = normalizeQueryFilter(searchParams.get('locationId'));
    const requestedWarehouseId = normalizeQueryFilter(searchParams.get('warehouseId'));
    const quickActionStartDate = parseDateInput(quickActionContext.startDate ?? null);
    const quickActionEndDate = parseDateInput(quickActionContext.endDate ?? null);
    const [activeTab, setActiveTab] = useState<ReportsTab>(() => parseReportTab(searchParams.get('tab')));
    const [dateRange, setDateRange] = useState<DateRange>(() => parseInitialDateRange(searchParams));

    // Logistics Detail State
    const [activeDetailType, setActiveDetailType] = useState<LogisticsDetailType>(() => parseStockMovementDetail(searchParams.get('detail')));
    const [pendingShipmentKind, setPendingShipmentKind] = useState<PendingShipmentKind>(() => parsePendingShipmentKind(searchParams.get('detail')));
    const [hrRoleFilter, setHrRoleFilter] = useState<string>('ALL');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [appliedPresetId, setAppliedPresetId] = useState<ReportPresetId | null>(null);

    const startIso = dateRange.from.toISOString();
    const endIso = dateRange.to.toISOString();
    const startInput = formatDateInput(dateRange.from);
    const endInput = formatDateInput(dateRange.to);
    const effectiveLocationId = requestedLocationId || currentLocationId || undefined;
    const effectiveWarehouseId = requestedWarehouseId || currentWarehouseId || undefined;
    const effectiveWarehouseOrLocationId = effectiveWarehouseId || effectiveLocationId || '';
    const quickActionDateRangeAccepted = Boolean(
        quickActionStartDate
        && quickActionEndDate
        && quickActionStartDate <= quickActionEndDate
    );
    const quickActionReportContextAccepted = Boolean(
        quickActionContext.isOperationalSuggestion
        && quickActionDateRangeAccepted
    );
    const drilldownFilters = {
        startDate: startInput,
        endDate: endInput,
        locationId: effectiveLocationId,
        warehouseId: effectiveWarehouseId,
    };

    useEffect(() => {
        if (!quickActionContext.source) return;

        const destinationStatus = resolveOperationalQuickActionDestinationStatus({
            source: quickActionContext.source,
            isOperationalSuggestion: quickActionContext.isOperationalSuggestion,
            contextAccepted: quickActionReportContextAccepted,
        });
        const contextEvent = destinationStatus === 'contextAccepted'
            ? 'destination_context_accepted'
            : destinationStatus === 'contextRejected'
                ? 'destination_context_rejected'
                : 'destination_context_ignored';

        const baseEvent = {
            alertId: quickActionContext.alertId,
            targetModule: 'reports',
            destination: '/reports',
            destinationStatus,
            hasDateRange: Boolean(quickActionContext.startDate && quickActionContext.endDate),
            hasLocationId: Boolean(quickActionContext.locationId),
            hasWarehouseId: Boolean(quickActionContext.warehouseId),
        };

        emitOperationalQuickActionUxEvent({
            event: 'destination_opened',
            ...baseEvent,
        });
        emitOperationalQuickActionUxEvent({
            event: contextEvent,
            reason: destinationStatus === 'contextAccepted'
                ? `tab:${activeTab}; filtros heredados visibles`
                : 'source, alertId o rango de fechas inválido',
            ...baseEvent,
        });
    }, [
        activeTab,
        quickActionReportContextAccepted,
        quickActionContext.alertId,
        quickActionContext.endDate,
        quickActionContext.isOperationalSuggestion,
        quickActionContext.locationId,
        quickActionContext.source,
        quickActionContext.startDate,
        quickActionContext.warehouseId,
    ]);

    const cashQuery = useQuery({
        queryKey: ['reports', 'cash', startIso, endIso, effectiveLocationId ?? 'all'],
        enabled: activeTab === 'cash',
        staleTime: REPORTS_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const [ledgerResult, summaryResult] = await Promise.all([
                getCashFlowLedgerSecure({ startDate: startIso, endDate: endIso, locationId: effectiveLocationId }),
                getDetailedFinancialSummarySecure(startIso, endIso, effectiveLocationId),
            ]);

            if (!ledgerResult.success || !ledgerResult.data) {
                throw new Error(ledgerResult.error || 'Error cargando flujo de caja');
            }

            if (!summaryResult.success || !summaryResult.data) {
                throw new Error(summaryResult.error || 'Error cargando resumen financiero');
            }

            return {
                ledger: ledgerResult.data,
                summary: summaryResult.data,
            };
        },
    });

    const taxQuery = useQuery({
        queryKey: ['reports', 'tax', dateRange.from.getFullYear(), dateRange.from.getMonth() + 1],
        enabled: activeTab === 'tax',
        staleTime: REPORTS_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const monthStr = `${dateRange.from.getFullYear()}-${(dateRange.from.getMonth() + 1).toString().padStart(2, '0')}`;
            const result = await getTaxSummarySecure(monthStr);

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Error cargando datos tributarios');
            }

            return result.data;
        },
    });

    const logisticsQuery = useQuery({
        queryKey: ['reports', 'logistics', startIso, endIso, effectiveWarehouseOrLocationId || 'all'],
        enabled: activeTab === 'logistics',
        staleTime: REPORTS_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const [valuationResult, kpiResult] = await Promise.all([
                getInventoryValuationSecure(effectiveWarehouseOrLocationId),
                getLogisticsKPIsSecure(startIso, endIso, effectiveWarehouseOrLocationId),
            ]);

            if (!valuationResult.success || !valuationResult.data) {
                throw new Error(valuationResult.error || 'Error cargando valoración de inventario');
            }

            if (!kpiResult.success || !kpiResult.data) {
                throw new Error(kpiResult.error || 'Error cargando KPIs logísticos');
            }

            return {
                valuation: valuationResult.data as InventoryValuation,
                kpis: kpiResult.data as LogisticsKPIs,
            };
        },
    });

    const logisticsDetailQuery = useQuery({
        queryKey: ['reports', 'logistics', 'detail', activeDetailType ?? 'none', startIso, endIso, effectiveWarehouseOrLocationId || 'all'],
        enabled: activeTab === 'logistics' && activeDetailType !== null,
        staleTime: REPORTS_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const result = await getStockMovementsDetailSecure(
                activeDetailType as 'IN' | 'OUT',
                startIso,
                endIso,
                effectiveWarehouseOrLocationId,
            );

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Error cargando detalles');
            }

            return result.data;
        },
    });

    const pendingShipmentsQuery = useQuery({
        queryKey: ['reports', 'logistics', 'pending-shipments', pendingShipmentKind ?? 'none', startInput, endInput, effectiveLocationId ?? 'all', effectiveWarehouseId ?? 'all'],
        enabled: activeTab === 'logistics' && pendingShipmentKind !== null,
        staleTime: REPORTS_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const result = await getPendingShipmentsReportSecure(pendingShipmentKind as Exclude<PendingShipmentKind, null>, {
                startDate: startInput,
                endDate: endInput,
                locationId: effectiveLocationId,
                warehouseId: effectiveWarehouseId,
            });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Error cargando shipments pendientes');
            }

            return result.data;
        },
    });

    const inventoryLowStockQuery = useQuery({
        queryKey: ['reports', 'inventory', 'critical-low-stock', effectiveLocationId ?? 'all', effectiveWarehouseId ?? 'all'],
        enabled: activeTab === 'inventory',
        staleTime: REPORTS_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const result = await getCriticalLowStockReportSecure({
                locationId: effectiveLocationId,
                warehouseId: effectiveWarehouseId,
            });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Error cargando bajo stock crítico');
            }

            return result.data;
        },
    });

    const procurementOrdersQuery = useQuery({
        queryKey: ['reports', 'procurement', 'open-orders', startInput, endInput, effectiveLocationId ?? 'all', effectiveWarehouseId ?? 'all'],
        enabled: activeTab === 'procurement',
        staleTime: REPORTS_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const result = await getOpenPurchaseOrdersReportSecure({
                startDate: startInput,
                endDate: endInput,
                locationId: effectiveLocationId,
                warehouseId: effectiveWarehouseId,
            });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Error cargando órdenes de compra abiertas');
            }

            return result.data;
        },
    });

    const loading =
        activeTab === 'cash'
            ? cashQuery.isLoading
            : activeTab === 'tax'
                ? taxQuery.isLoading
                : activeTab === 'logistics'
                    ? logisticsQuery.isLoading
                    : activeTab === 'inventory'
                        ? inventoryLowStockQuery.isLoading
                        : activeTab === 'procurement'
                            ? procurementOrdersQuery.isLoading
                            : false;

    const cashLedger: CashFlowEntry[] = cashQuery.data?.ledger ?? [];
    const summary = cashQuery.data?.summary ?? null;
    const taxData: TaxSummary | null = taxQuery.data ?? null;
    const logisticsData: InventoryValuation | null = logisticsQuery.data?.valuation ?? null;
    const logisticsKPIs: LogisticsKPIs | null = logisticsQuery.data?.kpis ?? null;
    const movementDetail = logisticsDetailQuery.data ?? [];
    const loadingDetail = logisticsDetailQuery.isLoading;
    const pendingShipments: PendingShipmentReportRow[] = pendingShipmentsQuery.data ?? [];
    const loadingPendingShipments = pendingShipmentsQuery.isLoading;
    const criticalLowStockRows: CriticalLowStockReportRow[] = inventoryLowStockQuery.data ?? [];
    const openPurchaseOrderRows: OpenPurchaseOrderReportRow[] = procurementOrdersQuery.data ?? [];
    const payrollData: PayrollPreview[] = [];

    const handleTabChange = (tab: ReportsTab) => {
        setAppliedPresetId(null);
        setActiveTab(tab);
    };

    const handleApplyPreset = (presetId: ReportPresetId) => {
        const preset = REPORT_PRESETS.find((item) => item.id === presetId);
        if (!preset) return;

        setAppliedPresetId(preset.id);
        setActiveTab(preset.tab);
        setActiveDetailType(preset.detailType);
        setPendingShipmentKind(preset.pendingShipmentKind);

        if (preset.dateMode === 'today') {
            setDateRange(getTodayDateRange());
        }
    };

    const handleShowDetail = (type: 'IN' | 'OUT') => {
        setAppliedPresetId(null);
        setPendingShipmentKind(null);
        if (activeDetailType === type) {
            setActiveDetailType(null); // Toggle off
            return;
        }

        setActiveDetailType(type);
    };

    const handleShowPendingShipments = (kind: Exclude<PendingShipmentKind, null>) => {
        setAppliedPresetId(null);
        setActiveDetailType(null);
        setPendingShipmentKind((current) => current === kind ? null : kind);
    };

    useEffect(() => {
        if (cashQuery.error instanceof Error && activeTab === 'cash') {
            toast.error(cashQuery.error.message);
        }
    }, [activeTab, cashQuery.error]);

    useEffect(() => {
        if (taxQuery.error instanceof Error && activeTab === 'tax') {
            toast.error(taxQuery.error.message);
        }
    }, [activeTab, taxQuery.error]);

    useEffect(() => {
        if (logisticsQuery.error instanceof Error && activeTab === 'logistics') {
            toast.error(logisticsQuery.error.message);
        }
    }, [activeTab, logisticsQuery.error]);

    useEffect(() => {
        if (logisticsDetailQuery.error instanceof Error && activeTab === 'logistics' && activeDetailType) {
            toast.error(logisticsDetailQuery.error.message);
        }
    }, [activeTab, activeDetailType, logisticsDetailQuery.error]);

    useEffect(() => {
        if (pendingShipmentsQuery.error instanceof Error && activeTab === 'logistics' && pendingShipmentKind) {
            toast.error(pendingShipmentsQuery.error.message);
        }
    }, [activeTab, pendingShipmentKind, pendingShipmentsQuery.error]);

    useEffect(() => {
        if (inventoryLowStockQuery.error instanceof Error && activeTab === 'inventory') {
            toast.error(inventoryLowStockQuery.error.message);
        }
    }, [activeTab, inventoryLowStockQuery.error]);

    useEffect(() => {
        if (procurementOrdersQuery.error instanceof Error && activeTab === 'procurement') {
            toast.error(procurementOrdersQuery.error.message);
        }
    }, [activeTab, procurementOrdersQuery.error]);

    useEffect(() => {
        if (activeTab !== 'logistics') {
            setActiveDetailType(null);
            setPendingShipmentKind(null);
        }
    }, [activeTab]);

    // Export Logic
    const [isExporting, setIsExporting] = useState(false);
    const [isExportingPack, setIsExportingPack] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            if (activeTab === 'cash') {
                await cashQuery.refetch();
            } else if (activeTab === 'tax') {
                await taxQuery.refetch();
            } else if (activeTab === 'logistics') {
                await logisticsQuery.refetch();
                if (activeDetailType) {
                    await logisticsDetailQuery.refetch();
                }
                if (pendingShipmentKind) {
                    await pendingShipmentsQuery.refetch();
                }
            } else if (activeTab === 'hr') {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['reports', 'attendance-summary'] }),
                    queryClient.invalidateQueries({ queryKey: ['reports', 'attendance-kpis'] }),
                ]);
            } else if (activeTab === 'receipts') {
                await queryClient.invalidateQueries({ queryKey: ['reports', 'receipts'] });
            } else if (activeTab === 'inventory') {
                await inventoryLowStockQuery.refetch();
            } else if (activeTab === 'procurement') {
                await procurementOrdersQuery.refetch();
            }
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const startDate = dateRange.from.toISOString().split('T')[0];
            const endDate = dateRange.to.toISOString().split('T')[0];
            const locationId = effectiveLocationId;

            let result: { success: boolean; data?: string; filename?: string; error?: string } = { success: false };

            if (activeTab === 'inventory') {
                downloadCsv(`BajoStock_${startDate}.csv`, criticalLowStockRows, [
                    { header: 'Producto', value: (row) => row.name },
                    { header: 'SKU', value: (row) => row.sku },
                    { header: 'Sucursal', value: (row) => row.locationName || row.locationId },
                    { header: 'Bodega', value: (row) => row.warehouseName || row.warehouseId },
                    { header: 'Stock', value: (row) => row.quantity },
                    { header: 'Minimo', value: (row) => row.stockMin },
                    { header: 'Deficit', value: (row) => row.deficit },
                ]);
                toast.success('CSV de bajo stock generado correctamente');
                return;
            }

            if (activeTab === 'procurement') {
                downloadCsv(`OrdenesCompraAbiertas_${startDate}.csv`, openPurchaseOrderRows, [
                    { header: 'Creada', value: (row) => row.createdAt || '' },
                    { header: 'Proveedor', value: (row) => row.supplierName },
                    { header: 'Estado', value: (row) => row.status },
                    { header: 'Sucursal', value: (row) => row.locationName || row.locationId },
                    { header: 'Bodega', value: (row) => row.warehouseName || row.warehouseId },
                    { header: 'Items', value: (row) => row.itemCount },
                    { header: 'Total', value: (row) => row.totalAmount },
                ]);
                toast.success('CSV de órdenes abiertas generado correctamente');
                return;
            }

            if (activeTab === 'logistics' && pendingShipmentKind) {
                downloadCsv(`ShipmentsPendientes_${pendingShipmentKind}_${startDate}.csv`, pendingShipments, [
                    { header: 'Creado', value: (row) => row.createdAt || '' },
                    { header: 'Tipo', value: (row) => row.type },
                    { header: 'Estado', value: (row) => row.status },
                    { header: 'Origen', value: (row) => row.originLocationName },
                    { header: 'Destino', value: (row) => row.destinationLocationName },
                    { header: 'Items', value: (row) => row.itemCount },
                    { header: 'Creado por', value: (row) => row.createdByName },
                ]);
                toast.success('CSV de shipments pendientes generado correctamente');
                return;
            }

            // V2: Usar función específica según tab
            if (activeTab === 'cash') {
                result = await exportCashFlowSecure({ startDate, endDate, locationId });
            } else if (activeTab === 'tax') {
                const monthStr = `${dateRange.from.getFullYear()}-${(dateRange.from.getMonth() + 1).toString().padStart(2, '0')}`;
                result = await exportTaxSummarySecure(monthStr);
            } else if (activeTab === 'hr') {
                result = await exportAttendanceSummarySecure({
                    startDate,
                    endDate,
                    locationId,
                    role: hrRoleFilter !== 'ALL' ? hrRoleFilter : undefined,
                });
            } else if (activeTab === 'receipts') {
                toast.info('Utilice el botón de exportar dentro de la tabla de recibos.');
                setIsExporting(false);
                return;
            } else if (activeTab === 'logistics') {
                result = await exportLogisticsReportSecure({
                    startDate,
                    endDate,
                    warehouseId: effectiveWarehouseOrLocationId || undefined,
                    movementType: activeDetailType || undefined,
                });
            }

            if (result.success && result.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename || 'reporte.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('Reporte Excel generado correctamente');
            } else {
                toast.error('Error al generar: ' + (result.error || 'Desconocido'));
            }
        } catch (error) {
            console.error(error);
            toast.error('Error inesperado al exportar');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportPack = async (packId: ExportPackId) => {
        const pack = EXPORT_PACKS.find((item) => item.id === packId);
        if (!pack) return;

        setIsExportingPack(true);
        try {
            const [lowStockResult, purchaseOrdersResult, pendingTransfersResult, pendingReceptionsResult] = await Promise.all([
                getCriticalLowStockReportSecure({
                    locationId: effectiveLocationId,
                    warehouseId: effectiveWarehouseId,
                }),
                getOpenPurchaseOrdersReportSecure({
                    startDate: startInput,
                    endDate: endInput,
                    locationId: effectiveLocationId,
                    warehouseId: effectiveWarehouseId,
                }),
                getPendingShipmentsReportSecure('TRANSFERS', {
                    startDate: startInput,
                    endDate: endInput,
                    locationId: effectiveLocationId,
                    warehouseId: effectiveWarehouseId,
                }),
                getPendingShipmentsReportSecure('RECEPTIONS', {
                    startDate: startInput,
                    endDate: endInput,
                    locationId: effectiveLocationId,
                    warehouseId: effectiveWarehouseId,
                }),
            ]);

            if (!lowStockResult.success || !lowStockResult.data) {
                throw new Error(lowStockResult.error || 'Error preparando bajo stock');
            }
            if (!purchaseOrdersResult.success || !purchaseOrdersResult.data) {
                throw new Error(purchaseOrdersResult.error || 'Error preparando compras abiertas');
            }
            if (!pendingTransfersResult.success || !pendingTransfersResult.data) {
                throw new Error(pendingTransfersResult.error || 'Error preparando transferencias pendientes');
            }
            if (!pendingReceptionsResult.success || !pendingReceptionsResult.data) {
                throw new Error(pendingReceptionsResult.error || 'Error preparando recepciones pendientes');
            }

            downloadCsv(`Pack_${pack.id}_BajoStock_${startInput}.csv`, lowStockResult.data, [
                { header: 'Producto', value: (row) => row.name },
                { header: 'SKU', value: (row) => row.sku },
                { header: 'Sucursal', value: (row) => row.locationName || row.locationId },
                { header: 'Bodega', value: (row) => row.warehouseName || row.warehouseId },
                { header: 'Stock', value: (row) => row.quantity },
                { header: 'Minimo', value: (row) => row.stockMin },
                { header: 'Deficit', value: (row) => row.deficit },
            ]);
            downloadCsv(`Pack_${pack.id}_OrdenesAbiertas_${startInput}.csv`, purchaseOrdersResult.data, [
                { header: 'Creada', value: (row) => row.createdAt || '' },
                { header: 'Proveedor', value: (row) => row.supplierName },
                { header: 'Estado', value: (row) => row.status },
                { header: 'Sucursal', value: (row) => row.locationName || row.locationId },
                { header: 'Bodega', value: (row) => row.warehouseName || row.warehouseId },
                { header: 'Items', value: (row) => row.itemCount },
                { header: 'Total', value: (row) => row.totalAmount },
            ]);
            downloadCsv(`Pack_${pack.id}_TransferenciasPendientes_${startInput}.csv`, pendingTransfersResult.data, [
                { header: 'Creado', value: (row) => row.createdAt || '' },
                { header: 'Tipo', value: (row) => row.type },
                { header: 'Estado', value: (row) => row.status },
                { header: 'Origen', value: (row) => row.originLocationName },
                { header: 'Destino', value: (row) => row.destinationLocationName },
                { header: 'Items', value: (row) => row.itemCount },
                { header: 'Creado por', value: (row) => row.createdByName },
            ]);
            downloadCsv(`Pack_${pack.id}_RecepcionesPendientes_${startInput}.csv`, pendingReceptionsResult.data, [
                { header: 'Creado', value: (row) => row.createdAt || '' },
                { header: 'Tipo', value: (row) => row.type },
                { header: 'Estado', value: (row) => row.status },
                { header: 'Origen', value: (row) => row.originLocationName },
                { header: 'Destino', value: (row) => row.destinationLocationName },
                { header: 'Items', value: (row) => row.itemCount },
                { header: 'Creado por', value: (row) => row.createdByName },
            ]);

            toast.success(`Pack "${pack.label}" exportado con ${pack.includes.length} reportes`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error inesperado al exportar pack');
        } finally {
            setIsExportingPack(false);
        }
    };

    // Role-based Access Control
    const userRole = usePharmaStore(state => state.user?.role);

    const allTabs = [
        { id: 'cash' as const, label: 'Flujo de Caja', icon: DollarSign, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] },
        { id: 'receipts' as const, label: 'Recibos', icon: FileText, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'CAJERO'] },
        { id: 'tax' as const, label: 'Tributario', icon: FileText, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'CONTADOR'] },
        { id: 'logistics' as const, label: 'Logística', icon: Package, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'WAREHOUSE', 'QF'] },
        { id: 'inventory' as const, label: 'Bajo Stock', icon: Package, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'WAREHOUSE', 'QF'] },
        { id: 'procurement' as const, label: 'Compras', icon: ClipboardList, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'WAREHOUSE', 'QF'] },
        { id: 'hr' as const, label: 'RR.HH.', icon: Users, roles: ['RRHH', 'ADMIN', 'GERENTE_GENERAL', 'MANAGER'] }
    ];

    const tabs = allTabs.filter(t => !t.roles || (userRole && t.roles.includes(userRole)));
    const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? 'Reportes';
    const appliedPreset = REPORT_PRESETS.find((preset) => preset.id === appliedPresetId) ?? null;
    const reportsReadinessHint = quickActionReportContextAccepted
        ? `Vista lista: ${activeTabLabel} filtrado del ${startInput} al ${endInput}.`
        : `Vista actual: ${activeTabLabel}. Ajusta filtros si necesitas otro período.`;
    const reportsContextExplanation = quickActionReportContextAccepted
        ? `Origen del estado: ${OPERATIONAL_CONTEXT_ORIGIN_LABELS.inheritedFilters}. Se usaron pestaña y rango de fechas; la URL no ejecuta acciones.`
        : `Motivo: ${OPERATIONAL_REJECTION_REASON_LABELS.invalid}. Rango de fechas inválido o incompleto. Se usan filtros seguros de reportes.`;

    return (
        <div data-testid="reports-page" className="p-3 md:p-6 space-y-4 md:space-y-6 h-[calc(100dvh-80px)] overflow-y-auto bg-gray-50 pb-safe touch-pan-y overscroll-contain">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <TrendingUp className="w-7 h-7 md:w-8 md:h-8 text-blue-600" />
                        Reportes de Gestión
                    </h1>
                    <p className="text-sm md:text-base text-gray-600 mt-1">Auditoría detallada y cumplimiento normativo</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full md:flex md:flex-wrap md:w-auto">
                    <Link
                        data-testid="reports-sales-by-product-button"
                        href={buildAnalyticsDrilldownHref('sales-products', drilldownFilters)}
                        className="col-span-2 md:col-span-1 min-h-11 px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2 font-bold shadow-sm transition-colors"
                    >
                        <Package className="w-5 h-5" />
                        Ventas por Producto
                    </Link>

                    <button
                        onClick={handleRefresh}
                        aria-label="Actualizar reportes"
                        className="min-h-11 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition flex items-center justify-center"
                    >
                        <RefreshCw className={`w-5 h-5 ${(loading || isRefreshing) ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting || loading || isRefreshing}
                        className="min-h-11 px-4 md:px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 flex items-center justify-center gap-2 font-bold shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isExporting ? <RefreshCw className="animate-spin w-5 h-5" /> : <Download className="w-5 h-5" />}
                        <span className="hidden sm:inline">Exportar Excel</span>
                        <span className="sm:hidden">Exportar</span>
                    </button>
                </div>
            </div>

            {quickActionContext.isOperationalSuggestion && (
                <div
                    data-testid="reports-quick-action-context"
                    className={`rounded-xl border p-4 text-sm ${quickActionReportContextAccepted
                        ? 'border-sky-100 bg-sky-50 text-sky-900'
                        : 'border-amber-100 bg-amber-50 text-amber-900'
                        }`}
                >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            <p className="font-bold">
                                {quickActionReportContextAccepted ? OPERATIONAL_CONTEXT_STATUS_LABELS.accepted : OPERATIONAL_CONTEXT_STATUS_LABELS.rejected}: {quickActionHint?.title || 'revisión operativa'}
                            </p>
                            <p className={`mt-1 ${quickActionReportContextAccepted ? 'text-sky-700' : 'text-amber-700'}`}>
                                {quickActionReportContextAccepted
                                    ? quickActionHint?.destinationCopy || 'Los filtros se heredaron desde analytics. Esta vista no ejecuta cambios de estado.'
                                    : 'El contexto heredado no pasó validación de fechas. Se muestran filtros seguros de la pantalla.'}
                            </p>
                            <p
                                data-testid="reports-context-explanation"
                                className={`mt-2 text-xs ${quickActionReportContextAccepted ? 'text-sky-700' : 'text-amber-700'}`}
                            >
                                {reportsContextExplanation}
                            </p>
                        </div>
                        <div className={`flex flex-wrap gap-2 text-xs font-semibold ${quickActionReportContextAccepted ? 'text-sky-700' : 'text-amber-700'}`}>
                            <span className="rounded-full bg-white px-2.5 py-1">Pestaña: {activeTabLabel}</span>
                            <span className="rounded-full bg-white px-2.5 py-1">Desde {startInput}</span>
                            <span className="rounded-full bg-white px-2.5 py-1">Hasta {endInput}</span>
                            {effectiveLocationId && <span className="rounded-full bg-white px-2.5 py-1">Sucursal filtrada</span>}
                            {effectiveWarehouseId && <span className="rounded-full bg-white px-2.5 py-1">Bodega filtrada</span>}
                        </div>
                    </div>
                </div>
            )}

            {/* Time Filter */}
            <TimeFilter onFilterChange={setDateRange} initialRange={dateRange} />
            <div
                data-testid="reports-readiness-hint"
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${quickActionReportContextAccepted
                    ? 'border-sky-100 bg-sky-50 text-sky-700'
                    : 'border-slate-100 bg-white text-slate-500'
                    }`}
            >
                {reportsReadinessHint}
            </div>

            <section
                aria-label="Presets y packs de reportes"
                className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4"
            >
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                        <div>
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">Presets rápidos</h2>
                            <p className="text-xs text-slate-500 mt-1">
                                Combinaciones frecuentes de reportes y filtros. No cambian permisos ni ejecutan exports.
                            </p>
                        </div>
                        {appliedPreset && (
                            <div
                                data-testid="reports-applied-preset"
                                className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800"
                            >
                                <p className="font-bold">Preset aplicado: {appliedPreset.label}</p>
                                <p className="mt-1">Filtros: {appliedPreset.filtersLabel}</p>
                                <p className="mt-1">Export incluye: {appliedPreset.exportIncludes.join(', ')}</p>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                        {REPORT_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                data-testid={`reports-preset-${preset.id}`}
                                type="button"
                                aria-label={`Aplicar preset ${preset.label}`}
                                onClick={() => handleApplyPreset(preset.id)}
                                aria-pressed={appliedPresetId === preset.id}
                                className={`rounded-xl border p-3 text-left transition-colors ${appliedPresetId === preset.id
                                    ? 'border-sky-300 bg-sky-50 text-sky-800'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="block text-sm font-bold">{preset.label}</span>
                                <span className="mt-1 block text-xs text-slate-500">{preset.description}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">Pack de export</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Descarga CSVs separados con endpoints ya defendidos. El usuario revisa antes de usar.
                    </p>
                    {EXPORT_PACKS.map((pack) => (
                        <div key={pack.id} className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <p className="font-bold text-slate-800">{pack.label}</p>
                            <p className="mt-1 text-xs text-slate-500">{pack.description}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {pack.includes.map((item) => (
                                    <span key={item} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                                        {item}
                                    </span>
                                ))}
                            </div>
                            <button
                                data-testid={`reports-export-pack-${pack.id}`}
                                type="button"
                                aria-label={`Descargar pack ${pack.label}`}
                                onClick={() => handleExportPack(pack.id)}
                                disabled={isExportingPack}
                                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isExportingPack ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                {isExportingPack ? 'Preparando pack...' : 'Exportar pack stock'}
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="md:hidden border-b border-gray-200 bg-slate-50/70 p-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Sección activa
                    </label>
                    <div className="relative">
                        <select
                            aria-label="Cambiar sección de reportes"
                            value={activeTab}
                            onChange={(e) => handleTabChange(e.target.value as ReportsTab)}
                            className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm font-bold text-slate-700 shadow-sm"
                        >
                            {tabs.map((tab) => (
                                <option key={tab.id} value={tab.id}>
                                    {tab.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                        Vista actual: <span className="font-semibold text-slate-700">{activeTabLabel}</span>
                    </p>
                </div>

                <div className="hidden md:block border-b border-gray-200">
                    <div className="flex gap-1 p-2 overflow-x-auto touch-pan-x no-scrollbar">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-lg'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-3 md:p-6 min-h-[320px] md:min-h-[400px]">
                    {loading && (
                        <div className="flex justify-center items-center h-64">
                            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    )}

                    {!loading && activeTab === 'cash' && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4">

                            {/* NEW: Financial KPI Cards */}
                            {summary && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Ventas Totales</p>
                                        <p className="text-2xl font-bold text-blue-600 mt-1">${summary.total_sales.toLocaleString('es-CL')}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Nómina (Sueldos)</p>
                                        <p className="text-2xl font-bold text-red-600 mt-1">${summary.total_payroll.toLocaleString('es-CL')}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Leyes Sociales</p>
                                        <p className="text-2xl font-bold text-red-500 mt-1">${summary.total_social_security.toLocaleString('es-CL')}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-orange-100 shadow-sm">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Gastos Operativos</p>
                                        <p className="text-2xl font-bold text-orange-600 mt-1">${summary.total_operational_expenses.toLocaleString('es-CL')}</p>
                                    </div>
                                    <div className={`p-4 rounded-xl border shadow-sm ${summary.net_income >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                        <p className={`text-xs font-bold uppercase ${summary.net_income >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Utilidad Neta Real</p>
                                        <p className={`text-2xl font-bold mt-1 ${summary.net_income >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>${summary.net_income.toLocaleString('es-CL')}</p>
                                    </div>
                                </div>
                            )}

                            <h3 className="text-lg font-bold text-gray-800">Cartola de Movimientos (Ingresos vs Egresos)</h3>
                            <div className="overflow-x-auto rounded-lg border border-gray-200 touch-pan-x">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                                        <tr>
                                            <th className="p-3 text-left">Fecha</th>
                                            <th className="p-3 text-left">Descripción</th>
                                            <th className="p-3 text-left">Categoría</th>
                                            <th className="p-3 text-left">Responsable</th>
                                            <th className="p-3 text-right text-green-600">Entrada</th>
                                            <th className="p-3 text-right text-red-600">Salida</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {cashLedger.map((row) => (
                                            <tr key={row.id} className="hover:bg-gray-50">
                                                <td className="p-3 font-mono text-gray-600">
                                                    {new Date(row.timestamp).toLocaleString('es-CL')}
                                                </td>
                                                <td className="p-3 font-medium text-gray-900">{row.description}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${row.category === 'SALE' ? 'bg-blue-100 text-blue-700' :
                                                        row.category === 'EXPENSE' ? 'bg-red-100 text-red-700' :
                                                            row.category === 'INCOME' ? 'bg-green-100 text-green-700' :
                                                                'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {row.category}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-gray-500">{row.user_name}</td>
                                                <td className="p-3 text-right font-mono text-green-600 font-bold">
                                                    {row.amount_in > 0 ? `$${row.amount_in.toLocaleString('es-CL')}` : '-'}
                                                </td>
                                                <td className="p-3 text-right font-mono text-red-600 font-bold">
                                                    {row.amount_out > 0 ? `$${row.amount_out.toLocaleString('es-CL')}` : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                        {cashLedger.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-8 text-center text-gray-400">
                                                    No hay movimientos registrados en este período.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'tax' && taxData && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6">
                                <h3 className="font-bold text-blue-900 text-base md:text-lg">Simulacro F29 - IVA Mensual</h3>
                                <p className="text-blue-700">Período calculado: {taxData.period}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100 rounded-bl-full -mr-4 -mt-4 opacity-50" />
                                    <p className="text-gray-500 font-medium">IVA Débito (Ventas)</p>
                                    <p className="text-3xl font-bold text-gray-900 mt-2">${taxData.total_vat_debit.toLocaleString('es-CL')}</p>
                                    <p className="text-sm text-gray-400 mt-1">Neto: ${taxData.total_net_sales.toLocaleString('es-CL')}</p>
                                </div>

                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-100 rounded-bl-full -mr-4 -mt-4 opacity-50" />
                                    <p className="text-gray-500 font-medium">IVA Crédito (Compras)</p>
                                    <p className="text-3xl font-bold text-green-600 mt-2">${taxData.total_vat_credit.toLocaleString('es-CL')}</p>
                                    <p className="text-sm text-gray-400 mt-1">Neto: ${taxData.total_net_purchases.toLocaleString('es-CL')}</p>
                                </div>

                                <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden text-white">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-700 rounded-bl-full -mr-4 -mt-4 opacity-50" />
                                    <p className="text-slate-400 font-medium">Impuesto a Pagar (Est.)</p>
                                    <p className="text-4xl font-bold text-white mt-2">${taxData.estimated_tax_payment.toLocaleString('es-CL')}</p>
                                    <p className="text-sm text-slate-400 mt-1">Sin considerar PPM ni multas.</p>
                                </div>
                            </div>

                            <div className="text-center text-xs text-gray-400 mt-8">
                                * Este reporte es una simulación basada en los registros del sistema. No reemplaza la contabilidad oficial.
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'logistics' && logisticsData && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">

                            {/* KPI Logistics Cards */}
                            {logisticsKPIs && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <button
                                        type="button"
                                        onClick={() => handleShowDetail('IN')}
                                        aria-pressed={activeDetailType === 'IN'}
                                        aria-label="Ver detalle de entradas"
                                        className={`w-full text-left bg-white p-4 rounded-xl shadow-sm border border-emerald-100 cursor-pointer transition-all hover:shadow-md hover:scale-105 ${activeDetailType === 'IN' ? 'ring-2 ring-emerald-500' : ''}`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                                                <ArrowDown className="w-5 h-5" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 uppercase">Entradas</p>
                                        </div>
                                        <p className="text-2xl font-bold text-emerald-700">{logisticsKPIs.total_in}</p>
                                        <p className="text-xs text-slate-400 mt-1">Ver detalle de entradas</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleShowDetail('OUT')}
                                        aria-pressed={activeDetailType === 'OUT'}
                                        aria-label="Ver detalle de salidas"
                                        className={`w-full text-left bg-white p-4 rounded-xl shadow-sm border border-red-100 cursor-pointer transition-all hover:shadow-md hover:scale-105 ${activeDetailType === 'OUT' ? 'ring-2 ring-red-500' : ''}`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-red-100 rounded-lg text-red-600">
                                                <ArrowUp className="w-5 h-5" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 uppercase">Salidas</p>
                                        </div>
                                        <p className="text-2xl font-bold text-red-700">{logisticsKPIs.total_out}</p>
                                        <p className="text-xs text-slate-400 mt-1">Ver detalle de salidas</p>
                                    </button>

                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                                <Clock className="w-5 h-5" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 uppercase">Último Movimiento</p>
                                        </div>
                                        <p className="text-lg font-bold text-slate-700 truncate">
                                            {logisticsKPIs.last_movement ? new Date(logisticsKPIs.last_movement).toLocaleDateString('es-CL') : 'Sin movimientos'}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            {logisticsKPIs.last_movement ? new Date(logisticsKPIs.last_movement).toLocaleTimeString('es-CL') : '-'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-bold text-slate-800">Shipments pendientes</h3>
                                        <p className="text-xs text-slate-500">Drill-down del dashboard operativo, sin recalcular KPIs en cliente.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleShowPendingShipments('TRANSFERS')}
                                            className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${pendingShipmentKind === 'TRANSFERS' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            Transferencias pendientes
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleShowPendingShipments('RECEPTIONS')}
                                            className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${pendingShipmentKind === 'RECEPTIONS' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            Recepciones pendientes
                                        </button>
                                    </div>
                                </div>

                                {pendingShipmentKind && (
                                    <div className="mt-4 overflow-x-auto border border-slate-100 rounded-lg touch-pan-x">
                                        {loadingPendingShipments ? (
                                            <div className="p-8 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-blue-500" /></div>
                                        ) : (
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                                                    <tr>
                                                        <th className="p-3 text-left">Creado</th>
                                                        <th className="p-3 text-left">Tipo</th>
                                                        <th className="p-3 text-left">Estado</th>
                                                        <th className="p-3 text-left">Origen</th>
                                                        <th className="p-3 text-left">Destino</th>
                                                        <th className="p-3 text-right">Ítems</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {pendingShipments.map((shipment) => (
                                                        <tr key={shipment.id} className="hover:bg-slate-50">
                                                            <td className="p-3 text-slate-500 whitespace-nowrap">{shipment.createdAt ? new Date(shipment.createdAt).toLocaleDateString('es-CL') : '-'}</td>
                                                            <td className="p-3 font-semibold text-slate-700">{shipment.type}</td>
                                                            <td className="p-3">
                                                                <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">{shipment.status}</span>
                                                            </td>
                                                            <td className="p-3 text-slate-500">{shipment.originLocationName || '-'}</td>
                                                            <td className="p-3 text-slate-500">{shipment.destinationLocationName || '-'}</td>
                                                            <td className="p-3 text-right font-bold text-slate-700">{shipment.itemCount}</td>
                                                        </tr>
                                                    ))}
                                                    {pendingShipments.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="p-8 text-center text-slate-400">
                                                                No hay shipments pendientes para este contexto.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Detail Table */}
                            {activeDetailType && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8 animate-in slide-in-from-top-4">
                                    <div className={`p-4 border-b border-gray-200 flex justify-between items-center ${activeDetailType === 'IN' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                        <h3 className={`font-bold ${activeDetailType === 'IN' ? 'text-emerald-800' : 'text-red-800'}`}>
                                            Detalle de {activeDetailType === 'IN' ? 'Entradas' : 'Salidas'}
                                        </h3>
                                        <button onClick={() => setActiveDetailType(null)} className="text-gray-400 hover:text-gray-600">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {loadingDetail ? (
                                        <div className="p-8 text-center ml-auto mr-auto flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-blue-500" /></div>
                                    ) : (
                                        <div className="overflow-x-auto max-h-96 touch-pan-x">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0">
                                                    <tr>
                                                        <th className="p-3 text-left">Fecha</th>
                                                        <th className="p-3 text-left">Tipo</th>
                                                        <th className="p-3 text-left">Producto</th>
                                                        <th className="p-3 text-right">Cant.</th>
                                                        <th className="p-3 text-left pl-6">Origen/Destino</th>
                                                        <th className="p-3 text-left">Usuario</th>
                                                        <th className="p-3 text-left">Motivo/Nota</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {movementDetail.map((mov) => (
                                                        <tr key={mov.id} className="hover:bg-gray-50">
                                                            <td className="p-3 text-gray-500 whitespace-nowrap">
                                                                {new Date(mov.timestamp).toLocaleString('es-CL')}
                                                            </td>
                                                            <td className="p-3 overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px]">
                                                                <span className="px-2 py-1 rounded-md bg-gray-100 text-xs font-bold text-gray-700">
                                                                    {mov.type}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 font-medium text-gray-800">{mov.product}</td>
                                                            <td className={`p-3 text-right font-bold ${activeDetailType === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {activeDetailType === 'IN' ? '+' : '-'}{mov.quantity}
                                                            </td>
                                                            <td className="p-3 pl-6 text-gray-500 text-xs">{(mov as any).location_context || '-'}</td>
                                                            <td className="p-3 text-gray-500 text-xs">{mov.user}</td>
                                                            <td className="p-3 text-gray-400 italic text-xs truncate max-w-xs">{mov.reason}</td>
                                                        </tr>
                                                    ))}
                                                    {movementDetail.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="p-8 text-center text-gray-400">
                                                                No se encontraron movimientos.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-5 border border-purple-200 bg-purple-50 rounded-xl">
                                    <p className="text-purple-600 font-bold uppercase text-xs">Costo Inmovilizado</p>
                                    <p className="text-3xl font-bold text-purple-900 mt-1">${logisticsData.total_cost_value.toLocaleString('es-CL')}</p>
                                </div>
                                <div className="p-5 border border-cyan-200 bg-cyan-50 rounded-xl">
                                    <p className="text-cyan-600 font-bold uppercase text-xs">Valor Venta Potencial</p>
                                    <p className="text-3xl font-bold text-cyan-900 mt-1">${logisticsData.total_sales_value.toLocaleString('es-CL')}</p>
                                </div>
                                <div className="p-5 border border-green-200 bg-green-50 rounded-xl">
                                    <p className="text-green-600 font-bold uppercase text-xs">Margen Bruto Proyectado</p>
                                    <p className="text-3xl font-bold text-green-900 mt-1">${logisticsData.potential_gross_margin.toLocaleString('es-CL')}</p>
                                </div>
                            </div>

                            <h3 className="font-bold text-gray-800 text-lg mt-8">Top 20 Productos de Alto Valor (Pareto)</h3>
                            <div className="overflow-x-auto border border-gray-200 rounded-lg touch-pan-x">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 font-bold">
                                        <tr>
                                            <th className="p-3 text-left">Producto</th>
                                            <th className="p-3 text-right">Stock</th>
                                            <th className="p-3 text-right">Costo Unit.</th>
                                            <th className="p-3 text-right">Valor Costo Total</th>
                                            <th className="p-3 text-right text-green-700">Valor Venta Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {logisticsData.top_products?.map((prod, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="p-3 font-medium text-gray-900">{prod.name}</td>
                                                <td className="p-3 text-right">{prod.quantity}</td>
                                                <td className="p-3 text-right text-gray-500">${prod.cost_value > 0 ? Math.round(prod.cost_value / prod.quantity).toLocaleString('es-CL') : 0}</td>
                                                <td className="p-3 text-right font-bold text-purple-700">${prod.cost_value.toLocaleString('es-CL')}</td>
                                                <td className="p-3 text-right font-bold text-green-700">${prod.sales_value.toLocaleString('es-CL')}</td>
                                            </tr>
                                        ))}
                                        {(!logisticsData.top_products || logisticsData.top_products.length === 0) && (
                                            <tr>
                                                <td colSpan={5} className="p-4 text-center text-gray-400">Sin datos de productos valorizados</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'inventory' && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4">
                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                                <h3 className="font-bold text-amber-900">Bajo stock crítico</h3>
                                <p className="text-sm text-amber-700 mt-1">
                                    Listado server-side de productos bajo mínimo para el contexto seleccionado.
                                </p>
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-gray-200 touch-pan-x">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                                        <tr>
                                            <th className="p-3 text-left">Producto</th>
                                            <th className="p-3 text-left">SKU</th>
                                            <th className="p-3 text-left">Sucursal</th>
                                            <th className="p-3 text-left">Bodega</th>
                                            <th className="p-3 text-right">Stock</th>
                                            <th className="p-3 text-right">Mínimo</th>
                                            <th className="p-3 text-right">Déficit</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {criticalLowStockRows.map((row) => (
                                            <tr key={`${row.productId}-${row.warehouseId || 'global'}`} className="hover:bg-gray-50">
                                                <td className="p-3 font-semibold text-gray-900">{row.name}</td>
                                                <td className="p-3 text-gray-500">{row.sku || '-'}</td>
                                                <td className="p-3 text-gray-500">{row.locationName || row.locationId || '-'}</td>
                                                <td className="p-3 text-gray-500">{row.warehouseName || row.warehouseId || '-'}</td>
                                                <td className="p-3 text-right font-bold text-amber-700">{row.quantity}</td>
                                                <td className="p-3 text-right text-gray-600">{row.stockMin}</td>
                                                <td className="p-3 text-right font-bold text-red-600">{row.deficit}</td>
                                            </tr>
                                        ))}
                                        {criticalLowStockRows.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="p-8 text-center text-gray-400">
                                                    No hay productos bajo mínimo en este contexto.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'procurement' && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4">
                            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                                <h3 className="font-bold text-blue-900">Órdenes de compra abiertas</h3>
                                <p className="text-sm text-blue-700 mt-1">
                                    Órdenes no recibidas ni canceladas, filtradas por fecha y contexto operativo.
                                </p>
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-gray-200 touch-pan-x">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                                        <tr>
                                            <th className="p-3 text-left">Creada</th>
                                            <th className="p-3 text-left">Proveedor</th>
                                            <th className="p-3 text-left">Estado</th>
                                            <th className="p-3 text-left">Sucursal</th>
                                            <th className="p-3 text-left">Bodega</th>
                                            <th className="p-3 text-right">Ítems</th>
                                            <th className="p-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {openPurchaseOrderRows.map((row) => (
                                            <tr key={row.id} className="hover:bg-gray-50">
                                                <td className="p-3 text-gray-500 whitespace-nowrap">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('es-CL') : '-'}</td>
                                                <td className="p-3 font-semibold text-gray-900">{row.supplierName}</td>
                                                <td className="p-3">
                                                    <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">{row.status}</span>
                                                </td>
                                                <td className="p-3 text-gray-500">{row.locationName || row.locationId || '-'}</td>
                                                <td className="p-3 text-gray-500">{row.warehouseName || row.warehouseId || '-'}</td>
                                                <td className="p-3 text-right text-gray-600">{row.itemCount}</td>
                                                <td className="p-3 text-right font-bold text-gray-900">${row.totalAmount.toLocaleString('es-CL')}</td>
                                            </tr>
                                        ))}
                                        {openPurchaseOrderRows.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="p-8 text-center text-gray-400">
                                                    No hay órdenes abiertas en este período.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'receipts' && (
                        <Suspense fallback={<TabLoadingFallback label="Cargando recibos..." />}>
                            <LazyCashReceiptsReport startDate={dateRange.from} endDate={dateRange.to} />
                        </Suspense>
                    )}

                    {!loading && activeTab === 'hr' && (
                        <div className="space-y-8">
                            <Suspense fallback={<TabLoadingFallback label="Cargando reporte de asistencia..." />}>
                                <LazyHRReportTab
                                    dateRange={dateRange}
                                    locationId={effectiveLocationId}
                                    roleFilter={hrRoleFilter}
                                    onRoleFilterChange={setHrRoleFilter}
                                />
                            </Suspense>

                            <div className="border-t border-gray-200 pt-8 animate-in slide-in-from-right-4">
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                                    <Users size={20} className="text-gray-400" />
                                    Pre-Nómina de Remuneraciones
                                </h3>

                                <div className="overflow-x-auto border border-gray-200 rounded-lg touch-pan-x">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-500 font-bold">
                                            <tr>
                                                <th className="p-3 text-left">RUT</th>
                                                <th className="p-3 text-left">Colaborador</th>
                                                <th className="p-3 text-left">Cargo</th>
                                                <th className="p-3 text-right">Sueldo Base</th>
                                                <th className="p-3 text-right text-red-500">AFP (11%)</th>
                                                <th className="p-3 text-right text-red-500">Salud (7%)</th>
                                                <th className="p-3 text-right bg-blue-50 font-bold text-blue-800">Líquido a Pagar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {payrollData.map((emp) => (
                                                <tr key={emp.employee_id} className="hover:bg-gray-50">
                                                    <td className="p-3 font-mono text-gray-500">{emp.rut}</td>
                                                    <td className="p-3 font-bold text-gray-800">{emp.name}</td>
                                                    <td className="p-3 text-gray-600">{emp.job_title}</td>
                                                    <td className="p-3 text-right">${emp.base_salary.toLocaleString('es-CL')}</td>
                                                    <td className="p-3 text-right text-red-600">-${emp.deductions.afp.toLocaleString('es-CL')}</td>
                                                    <td className="p-3 text-right text-red-600">-${emp.deductions.health.toLocaleString('es-CL')}</td>
                                                    <td className="p-3 text-right bg-blue-50 font-bold text-blue-800 border-l border-blue-100">
                                                        ${emp.total_liquid.toLocaleString('es-CL')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-gray-400 mt-2">
                                    * Cálculo referencial basado en sueldo base bruto. No incluye gratificaciones, bonos, horas extra ni cargas familiares.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
};

export default ReportsPage;
