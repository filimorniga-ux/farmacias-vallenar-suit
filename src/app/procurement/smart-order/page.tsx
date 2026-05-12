'use client';

import React, { Suspense, useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    generateRestockSuggestionSecure,
    createPurchaseOrderSecure,
    approvePurchaseOrderSecure,
    getSmartOrderLowStockPrefillSecure,
    type SmartOrderLowStockPrefillPayload,
} from '@/actions/procurement-v2';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useLocationStore } from '@/presentation/store/useLocationStore';
import { useBootstrapSupplyProcurement } from '@/presentation/hooks/useBootstrapSupplyProcurement';
import { PinModal } from '@/components/shared/PinModal';
import { Calculator, ShoppingCart, Loader2, AlertTriangle, CheckCircle, TrendingUp, Shield, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { resolveProcurementVisibleContext } from '@/presentation/lib/procurement-visible-context';
import {
    getOperationalQuickActionHint,
    parseOperationalQuickActionParams,
} from '@/lib/operational-quick-actions';
import {
    emitOperationalQuickActionUxEvent,
    resolveOperationalQuickActionDestinationStatus,
} from '@/lib/operational-quick-action-telemetry';
import {
    OPERATIONAL_AUTHORITY_LABELS,
    OPERATIONAL_CONTEXT_ORIGIN_LABELS,
    OPERATIONAL_CONTEXT_STATUS_LABELS,
    OPERATIONAL_REJECTION_REASON_LABELS,
} from '@/lib/operational-message-catalog';

const MANAGER_THRESHOLD = 500000;
const GERENTE_THRESHOLD = 1000000;
const SMART_ORDER_FIELD_CLASS = 'w-full min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const SMART_ORDER_SELECT_CLASS = `${SMART_ORDER_FIELD_CLASS} bg-slate-50`;

export default function SmartOrderPage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-slate-500">Cargando pedido inteligente...</div>}>
            <SmartOrderPageContent />
        </Suspense>
    );
}

function SmartOrderPageContent() {
    const searchParams = useSearchParams();
    const user = usePharmaStore((state) => state.user);
    const currentLocationId = usePharmaStore((state) => state.currentLocationId);
    const currentWarehouseId = usePharmaStore((state) => state.currentWarehouseId);
    const locations = useLocationStore((state) => state.locations);
    const currentLocation = useLocationStore((state) => state.currentLocation);
    const quickActionContext = useMemo(() => parseOperationalQuickActionParams(searchParams), [searchParams]);
    const quickActionHint = useMemo(() => getOperationalQuickActionHint(quickActionContext.alertId), [quickActionContext.alertId]);
    const isLowStockQuickAction = quickActionContext.isOperationalSuggestion
        && quickActionContext.alertId === 'inventory-critical-low-stock';
    const quickActionLocationId = useMemo(() => {
        const requestedLocationId = quickActionContext.locationId || '';
        return locations.some((location) => location.id === requestedLocationId) ? requestedLocationId : '';
    }, [locations, quickActionContext.locationId]);
    const quickActionWarehouseId = useMemo(() => {
        const requestedWarehouseId = quickActionContext.warehouseId || '';
        if (!quickActionLocationId || !requestedWarehouseId) return '';
        const requestedLocation = locations.find((location) => location.id === quickActionLocationId);
        return requestedLocation?.default_warehouse_id === requestedWarehouseId ? requestedWarehouseId : '';
    }, [locations, quickActionLocationId, quickActionContext.warehouseId]);
    const isQuickActionPrefill = quickActionContext.isOperationalSuggestion && Boolean(quickActionLocationId);
    const quickActionContextRejected = Boolean(quickActionContext.isOperationalSuggestion && !isQuickActionPrefill);

    // filters
    const [supplierId, setSupplierId] = useState('');
    const [locationId, setLocationId] = useState('');
    const procurementContext = useMemo(() => resolveProcurementVisibleContext({
        requestedLocationId: locationId,
        requestedWarehouseId: quickActionWarehouseId,
        currentLocationId,
        currentWarehouseId,
        user,
        locationStoreCurrent: currentLocation,
        locations,
    }), [
        currentLocation,
        currentLocationId,
        currentWarehouseId,
        locationId,
        locations,
        quickActionWarehouseId,
        user,
    ]);
    const { suppliers } = useBootstrapSupplyProcurement({
        activeLocationId: procurementContext.locationId || currentLocationId,
        enableKanbanBootstrap: false,
        loadSuppliers: true,
        loadLocations: true,
    });
    const [daysToCover, setDaysToCover] = useState(15);
    const [analysisWindow, setAnalysisWindow] = useState(30);

    // data
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [editableQuantities, setEditableQuantities] = useState<Record<string, number>>({});
    const [lowStockPrefill, setLowStockPrefill] = useState<SmartOrderLowStockPrefillPayload | null>(null);
    const [lowStockPrefillError, setLowStockPrefillError] = useState('');
    const [loadingLowStockPrefill, setLoadingLowStockPrefill] = useState(false);
    const [lowStockPrefillApplied, setLowStockPrefillApplied] = useState(false);

    // creating
    const [creatingOrder, setCreatingOrder] = useState(false);
    const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
    const [showPinModal, setShowPinModal] = useState(false);

    useEffect(() => {
        if (!quickActionContext.source) return;

        const contextAccepted = Boolean(
            isQuickActionPrefill
            && (!quickActionContext.warehouseId || quickActionWarehouseId)
        );
        const destinationStatus = resolveOperationalQuickActionDestinationStatus({
            source: quickActionContext.source,
            isOperationalSuggestion: quickActionContext.isOperationalSuggestion,
            contextAccepted,
        });
        const contextEvent = destinationStatus === 'contextAccepted'
            ? 'destination_context_accepted'
            : destinationStatus === 'contextRejected'
                ? 'destination_context_rejected'
                : 'destination_context_ignored';
        const baseEvent = {
            alertId: quickActionContext.alertId,
            targetModule: 'procurement',
            destination: '/procurement/smart-order',
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
                ? 'prefill validado'
                : 'locationId o warehouseId no corresponde al contexto visible',
            ...baseEvent,
        });
    }, [
        isQuickActionPrefill,
        quickActionContext.alertId,
        quickActionContext.endDate,
        quickActionContext.isOperationalSuggestion,
        quickActionContext.locationId,
        quickActionContext.source,
        quickActionContext.startDate,
        quickActionContext.warehouseId,
        quickActionWarehouseId,
    ]);

    useEffect(() => {
        if (locationId) return;
        if (quickActionLocationId) {
            setLocationId(quickActionLocationId);
            return;
        }
        if (procurementContext.locationId) {
            setLocationId(procurementContext.locationId);
        }
    }, [locationId, procurementContext.locationId, quickActionLocationId]);

    useEffect(() => {
        if (!isLowStockQuickAction) return;

        let cancelled = false;
        setLoadingLowStockPrefill(true);
        setLowStockPrefill(null);
        setLowStockPrefillError('');
        setLowStockPrefillApplied(false);

        getSmartOrderLowStockPrefillSecure({
            alertId: 'inventory-critical-low-stock',
            locationId: quickActionContext.locationId || undefined,
            warehouseId: quickActionContext.warehouseId || undefined,
            limit: 8,
        }).then((result) => {
            if (cancelled) return;
            if (result.success) {
                setLowStockPrefill(result.data);
                setLowStockPrefillError('');
                setLocationId((current) => current || result.data.locationId);
            } else {
                setLowStockPrefill(null);
                setLowStockPrefillError(result.error);
            }
        }).catch((error: Error) => {
            if (cancelled) return;
            setLowStockPrefill(null);
            setLowStockPrefillError(error.message || 'Error generando canasta sugerida');
        }).finally(() => {
            if (!cancelled) {
                setLoadingLowStockPrefill(false);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [
        isLowStockQuickAction,
        quickActionContext.locationId,
        quickActionContext.warehouseId,
    ]);

    const handleApplyLowStockPrefill = () => {
        if (!lowStockPrefill || lowStockPrefill.items.length === 0) return;

        const basketSuggestions = lowStockPrefill.items.map((item) => ({
            product_id: item.productId,
            product_name: item.productName,
            sku: item.sku,
            unit_cost: item.suggestedSupplierCost || item.unitCost,
            suggested_quantity: item.suggestedQuantity,
            current_stock: item.currentStock,
            daily_velocity: 0,
            suppliers_data: item.suggestedSupplierId
                ? [{
                    id: item.suggestedSupplierId,
                    name: item.suggestedSupplierName || 'Proveedor sugerido',
                    cost_price: item.suggestedSupplierCost || item.unitCost,
                    is_preferred: true,
                }]
                : null,
            prefill_reason: item.reason,
        }));
        const quantities = lowStockPrefill.items.reduce<Record<string, number>>((acc, item) => {
            acc[item.productId] = item.suggestedQuantity;
            return acc;
        }, {});

        setSuggestions(basketSuggestions);
        setEditableQuantities(quantities);
        setLowStockPrefillApplied(true);
    };

    const handleCalculate = async () => {
        if (!supplierId) return;
        setLoading(true);
        setSuggestions([]);

        try {
            const res = await generateRestockSuggestionSecure(
                supplierId,
                daysToCover,
                analysisWindow,
                procurementContext.locationId || undefined,
            );
            if (res.success && res.data) {
                setSuggestions(res.data);
                const initial: Record<string, number> = {};
                res.data.forEach((item: any) => {
                    initial[item.product_id] = item.suggested_quantity;
                });
                setEditableQuantities(initial);
            } else {
                toast.error(res.error || 'Error generando sugerencias');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleQuantityChange = (productId: string, val: string) => {
        const num = parseInt(val) || 0;
        setEditableQuantities(prev => ({ ...prev, [productId]: num }));
    };

    const handleCreateOrder = async () => {
        if (!supplierId || suggestions.length === 0 || !user?.id) return;

        const itemsToOrder = suggestions
            .map(s => ({
                productId: s.product_id,
                productName: s.product_name,
                sku: s.sku,
                quantity: editableQuantities[s.product_id] || 0,
                unitCost: s.unit_cost
            }))
            .filter(i => i.quantity > 0);

        if (itemsToOrder.length === 0) {
            toast.error('No hay items con cantidad mayor a 0');
            return;
        }
        if (!procurementContext.locationId || !procurementContext.warehouseId) {
            toast.error('No hay contexto válido de sucursal y bodega para generar la orden');
            return;
        }

        setCreatingOrder(true);
        try {
            const res = await createPurchaseOrderSecure({
                supplierId,
                warehouseId: procurementContext.warehouseId,
                items: itemsToOrder,
                userId: user.id,
                notes: `Generado automáticamente - ${daysToCover} días cobertura [LOC:${procurementContext.locationId}]`
            });

            if (res.success && res.data) {
                const { orderId, total, requiresApproval } = res.data;

                if (requiresApproval) {
                    setPendingOrderId(orderId);
                    setShowPinModal(true);
                    toast.info(`Orden #${orderId.slice(0, 8)} creada. Requiere aprobación (total: $${total.toLocaleString('es-CL')})`);
                } else {
                    toast.success(`Orden #${orderId.slice(0, 8)} creada exitosamente`);
                    // Reset
                    setSuggestions([]);
                    setEditableQuantities({});
                }
            } else {
                toast.error(res.error || 'Error creando orden');
            }
        } catch (e: any) {
            toast.error(e.message || 'Error inesperado');
        } finally {
            setCreatingOrder(false);
        }
    };

    const handleApproveOrder = async (pin: string): Promise<boolean> => {
        if (!pendingOrderId) return false;

        const res = await approvePurchaseOrderSecure({
            orderId: pendingOrderId,
            approverPin: pin,
            notes: `Aprobación automática - Smart Order - ${new Date().toISOString()}`
        });

        if (res.success) {
            toast.success('Orden aprobada exitosamente');
            setPendingOrderId(null);
            setSuggestions([]);
            setEditableQuantities({});
            return true;
        } else {
            throw new Error(res.error || 'Error aprobando orden');
        }
    };

    const totalEstimated = suggestions.reduce((acc, curr) => {
        const qty = editableQuantities[curr.product_id] || 0;
        return acc + (qty * curr.unit_cost);
    }, 0);

    const itemsCount = suggestions.filter(s => (editableQuantities[s.product_id] || 0) > 0).length;
    const smartOrderNextStep = !procurementContext.locationId
        ? 'Selecciona una sucursal válida para continuar.'
        : !supplierId
            ? lowStockPrefillApplied
                ? 'Canasta sugerida cargada: selecciona proveedor manualmente antes de generar la orden.'
                : isQuickActionPrefill
                    ? 'Contexto listo: selecciona proveedor y calcula la propuesta.'
                : 'Selecciona proveedor para calcular una propuesta.'
            : suggestions.length === 0
                ? 'Listo para calcular: revisa cobertura y ventana antes de continuar.'
                : 'Propuesta lista: revisa cantidades antes de generar la orden.';
    const smartOrderContextSource = isQuickActionPrefill
        ? `Origen: ${OPERATIONAL_CONTEXT_ORIGIN_LABELS.inheritedContext}`
        : quickActionContextRejected
            ? `Origen: ${OPERATIONAL_AUTHORITY_LABELS.serverSourceOfTruth}`
            : locationId
                ? `Origen: ${OPERATIONAL_CONTEXT_ORIGIN_LABELS.manualSelection}`
                : `Origen: ${OPERATIONAL_AUTHORITY_LABELS.serverSourceOfTruth}`;
    const smartOrderContextExplanation = quickActionContextRejected
        ? `Motivo: ${OPERATIONAL_REJECTION_REASON_LABELS.outOfScope}. La sucursal o bodega heredada no pertenece al contexto visible. No se aplicó prefill.`
        : quickActionWarehouseId
            ? `Origen del estado: ${OPERATIONAL_CONTEXT_ORIGIN_LABELS.inheritedContext}. Se usó la sucursal y se confirmó su bodega; el proveedor sigue manual.`
            : `Origen del estado: ${OPERATIONAL_CONTEXT_ORIGIN_LABELS.inheritedContext}. Se usó la sucursal; el proveedor sigue manual.`;
    const validatedWarehouseName = useMemo(() => {
        if (!quickActionWarehouseId || !quickActionLocationId) return '';
        return locations.find((location) => location.id === quickActionWarehouseId)?.name || quickActionWarehouseId;
    }, [locations, quickActionLocationId, quickActionWarehouseId]);

    // Determine required role for approval
    const getRequiredRole = () => {
        if (totalEstimated >= GERENTE_THRESHOLD) return 'GERENTE_GENERAL';
        if (totalEstimated >= MANAGER_THRESHOLD) return 'MANAGER';
        return null;
    };

    const requiredRole = getRequiredRole();

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Calculator className="text-purple-600" />
                        Pedido Inteligente (Smart Order)
                    </h1>
                    <p className="text-slate-500">Genera propuestas de compra basadas en MRP con aprobación segura.</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg">
                    <Shield size={14} className="text-emerald-600" />
                    <span>Flujo protegido con revisión manual</span>
                </div>
            </div>

            {quickActionContext.isOperationalSuggestion && (
                <div
                    data-testid="smart-order-quick-action-context"
                    className={`rounded-xl border px-4 py-3 text-sm ${quickActionContextRejected
                        ? 'border-amber-100 bg-amber-50 text-amber-900'
                        : 'border-emerald-100 bg-emerald-50 text-emerald-900'
                        }`}
                >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <p className="font-semibold">
                                {quickActionContextRejected
                                    ? OPERATIONAL_CONTEXT_STATUS_LABELS.rejected
                                    : `${OPERATIONAL_CONTEXT_STATUS_LABELS.accepted}: contexto cargado desde la alerta operativa.`}
                            </p>
                            <p className="mt-1">
                                {quickActionHint?.destinationCopy || 'El contexto heredado solo prellena la pantalla; la orden sigue requiriendo revisión manual.'}
                            </p>
                            {quickActionContextRejected && (
                                <p className="mt-2 text-xs font-semibold text-amber-700">
                                    La sucursal o bodega de la alerta no coincide con el contexto visible. Selecciona la sucursal manualmente.
                                </p>
                            )}
                            <p
                                data-testid="smart-order-context-explanation"
                                className={`mt-2 text-xs ${quickActionContextRejected ? 'text-amber-700' : 'text-emerald-700'}`}
                            >
                                {smartOrderContextExplanation}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                            <span className="rounded-full bg-white px-2.5 py-1">
                                {quickActionContextRejected ? `${OPERATIONAL_AUTHORITY_LABELS.safePrefill} bloqueado` : OPERATIONAL_CONTEXT_STATUS_LABELS.accepted}
                            </span>
                            {!quickActionContextRejected && procurementContext.locationName && (
                                <span className="rounded-full bg-white px-2.5 py-1">
                                    Sucursal preseleccionada: {procurementContext.locationName}
                                </span>
                            )}
                            {!quickActionContextRejected && quickActionWarehouseId && (
                                <span className="rounded-full bg-white px-2.5 py-1">
                                    Bodega validada: {validatedWarehouseName || quickActionWarehouseId}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isLowStockQuickAction && (
                <div
                    data-testid="smart-order-low-stock-prefill"
                    className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-4 text-sm text-sky-950"
                >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <p className="font-semibold">Canasta sugerida por alerta validada</p>
                            <p className="mt-1 text-sky-800">
                                La canasta se deriva en servidor desde bajo stock crítico. El proveedor y la confirmación siguen siendo decisiones manuales.
                            </p>
                            {loadingLowStockPrefill && (
                                <p className="mt-2 text-xs font-semibold text-sky-700">Buscando productos bajo stock en el contexto validado...</p>
                            )}
                            {lowStockPrefillError && (
                                <p className="mt-2 text-xs font-semibold text-amber-700">
                                    No se aplicó canasta sugerida: {lowStockPrefillError}
                                </p>
                            )}
                            {lowStockPrefill && (
                                <div className="mt-3 space-y-2">
                                    <p className="text-xs font-semibold text-sky-700">
                                        Sucursal: {lowStockPrefill.locationName} · Bodega: {lowStockPrefill.warehouseName}
                                    </p>
                                    {lowStockPrefill.items.length === 0 ? (
                                        <p className="text-xs text-sky-700">No hay productos bajo stock para sugerir en esta bodega.</p>
                                    ) : (
                                        <ul className="grid gap-2 md:grid-cols-2">
                                            {lowStockPrefill.items.slice(0, 6).map((item) => (
                                                <li key={item.productId} className="rounded-lg bg-white px-3 py-2">
                                                    <div className="font-semibold text-slate-900">{item.productName}</div>
                                                    <div className="text-xs text-slate-500">
                                                        SKU {item.sku} · stock {item.currentStock}/{item.stockMin} · sugerido {item.suggestedQuantity}
                                                    </div>
                                                    {item.suggestedSupplierName && (
                                                        <div className="mt-1 text-xs font-semibold text-sky-700">
                                                            Proveedor sugerido: {item.suggestedSupplierName} · selección manual requerida
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleApplyLowStockPrefill}
                            disabled={!lowStockPrefill || lowStockPrefill.items.length === 0 || loadingLowStockPrefill}
                            className="min-h-11 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Usar canasta sugerida
                        </button>
                    </div>
                </div>
            )}

            {/* Config Panel */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Sucursal</label>
                    <select
                        className={SMART_ORDER_SELECT_CLASS}
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                    >
                        <option value="">-- Contexto activo --</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    {procurementContext.locationId && (
                        <p className="text-xs text-slate-400">
                            Contexto efectivo: {procurementContext.locationName}
                        </p>
                    )}
                    <p data-testid="smart-order-context-source" className="text-xs font-semibold text-slate-500">
                        {smartOrderContextSource}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Proveedor</label>
                    <select
                        autoFocus={isQuickActionPrefill && !supplierId}
                        className={SMART_ORDER_SELECT_CLASS}
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                    >
                        <option value="">-- Seleccionar --</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {lowStockPrefill?.items.some(item => item.suggestedSupplierName) && !supplierId && (
                        <p className="text-xs font-semibold text-sky-700">
                            Hay proveedor sugerido en la canasta, pero no se selecciona automáticamente.
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Días de Cobertura</label>
                    <div className="relative">
                        <input
                            type="number"
                            className={`${SMART_ORDER_FIELD_CLASS} pr-14`}
                            value={daysToCover}
                            onChange={(e) => setDaysToCover(Number(e.target.value))}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">días</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Ventana de Análisis</label>
                    <div className="relative">
                        <input
                            type="number"
                            className={`${SMART_ORDER_FIELD_CLASS} pr-24`}
                            value={analysisWindow}
                            onChange={(e) => setAnalysisWindow(Number(e.target.value))}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">días atrás</span>
                    </div>
                </div>

                <button
                    onClick={handleCalculate}
                    disabled={!supplierId || loading}
                    aria-describedby="smart-order-next-step"
                    className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <TrendingUp size={20} />}
                    Calcular Propuesta
                </button>
                <div
                    id="smart-order-next-step"
                    data-testid="smart-order-next-step"
                    className="md:col-span-5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"
                >
                    {smartOrderNextStep}
                </div>
            </div>

            {/* Results Grid */}
            {suggestions.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <tr>
                                    <th className="p-4 font-semibold">Producto</th>
                                    <th className="p-4 font-semibold text-center">Stock Actual</th>
                                    <th className="p-4 font-semibold text-center">Velocidad</th>
                                    <th className="p-4 font-semibold text-center bg-purple-50 text-purple-700">Sugerido (IA)</th>
                                    <th className="p-4 font-semibold text-center w-32">A Pedir</th>
                                    <th className="p-4 font-semibold text-right">Costo Est.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {suggestions.map((item) => {
                                    const isCritical = item.current_stock < (item.daily_velocity * 3);
                                    return (
                                        <tr key={item.product_id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-medium text-slate-900">{item.product_name}</div>
                                                <div className="text-xs text-slate-500">SKU: {item.sku}</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${isCritical ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                    {isCritical && <AlertTriangle size={10} className="mr-1" />}
                                                    {item.current_stock} un
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="text-slate-700 font-medium">{item.daily_velocity}</div>
                                                <div className="text-[10px] text-slate-400">un/día</div>
                                            </td>
                                            <td className="p-4 text-center bg-purple-50/30">
                                                <span className="font-bold text-purple-700 text-lg">{item.suggested_quantity}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-20 p-2 text-center border rounded-md focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                                                    value={editableQuantities[item.product_id] || 0}
                                                    onChange={(e) => handleQuantityChange(item.product_id, e.target.value)}
                                                />
                                            </td>
                                            <td className="p-4 text-right font-medium text-slate-700">
                                                ${((editableQuantities[item.product_id] || 0) * item.unit_cost).toLocaleString('es-CL')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-slate-600 flex items-center gap-4">
                            <span><span className="font-bold text-slate-900">{itemsCount} items</span> seleccionados</span>
                            {requiredRole && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                                    <Lock size={12} />
                                    Requiere PIN de {requiredRole}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <div className="text-xs text-slate-500">Total Estimado</div>
                                <div className={`text-2xl font-bold ${requiredRole ? 'text-amber-600' : 'text-slate-900'}`}>
                                    ${totalEstimated.toLocaleString('es-CL')}
                                </div>
                            </div>
                            <button
                                onClick={handleCreateOrder}
                                disabled={creatingOrder || itemsCount === 0 || !supplierId}
                                className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:shadow-none"
                            >
                                {creatingOrder ? <Loader2 className="animate-spin" /> : <ShoppingCart size={20} />}
                                Generar Orden de Compra
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && suggestions.length === 0 && supplierId && (
                <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <Calculator size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No se encontraron sugerencias para este proveedor con los parámetros actuales.</p>
                </div>
            )}

            {/* PIN Modal */}
            <PinModal
                isOpen={showPinModal}
                onClose={() => {
                    setShowPinModal(false);
                    setPendingOrderId(null);
                }}
                onSubmit={handleApproveOrder}
                title="Aprobar Orden de Compra"
                description={`Esta orden por $${totalEstimated.toLocaleString('es-CL')} CLP requiere aprobación del nivel gerencial.`}
                requiredRole={requiredRole || undefined}
            />
        </div>
    );
}
