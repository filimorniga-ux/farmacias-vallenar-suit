import React, { useState, useEffect, useMemo } from 'react';
import { usePharmaStore } from '../store/useStore';
import { AutoOrderSuggestion } from '../../domain/types';
import { Package, Truck, CheckCircle, AlertCircle, Plus, Calendar, TrendingUp, RefreshCw, AlertTriangle, Zap, DollarSign, Trash2, Filter, Calculator, MapPin, Search, BarChart3, Users, ChevronDown, ScanBarcode, Settings, ArrowLeftRight, ShoppingCart, Clock } from 'lucide-react';
import { PurchaseOrderReceivingModal } from '../components/scm/PurchaseOrderReceivingModal';
import ManualOrderModal from '../components/supply/ManualOrderModal';
import { MovementDetailModal } from '../components/scm/MovementDetailModal';
import { useNotificationStore } from '../store/useNotificationStore';
import { toast } from 'sonner';
import { generateRestockSuggestionSecure, generateSaleBasedSuggestionSecure, type SuggestionAnalysisHistoryItem } from '../../actions/procurement-v2';
import { deletePurchaseOrderSecure } from '../../actions/supply-v2';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { CameraScanner } from '../components/ui/CameraScanner';
import SupplyKanban from '../components/supply/SupplyKanban';
import TransferSuggestionsPanel from '../components/supply/TransferSuggestionsPanel';
import SuggestionAnalysisHistoryPanel from '../components/supply/SuggestionAnalysisHistoryPanel';
import { exportSuggestedOrdersSecure } from '../../actions/procurement-export';
import { FileDown } from 'lucide-react';
import { usePlatform } from '@/hooks/usePlatform';

// Extended type for frontend logic
interface ExtendedSuggestion extends AutoOrderSuggestion {
    other_suppliers?: Array<{ id: string; name: string; cost: number; sku: string }>;
    supplier_id?: string;
    supplier_name?: string;
    supplier_sku?: string;
    total_estimated?: number;
    unit_cost?: number;
    daily_velocity: number;
    max_stock: number;
    incoming_stock?: number;
    current_stock: number;

    // Per-item customization
    velocities?: Record<number, number>;
    sold_counts?: Record<number, number>;
    selected_analysis_window?: number;
    selected_coverage_days?: number;
    safety_stock?: number;

    // Transfer-aware fields
    global_stock?: number;
    action_type?: 'PURCHASE' | 'TRANSFER' | 'PARTIAL_TRANSFER';
    transfer_sources?: Array<{
        location_name: string;
        available_qty: number;
        location_id: string;
    }>;
}

const SupplyChainPage: React.FC = () => {
    // ... (store hooks remain same)
    const {
        inventory,
        suppliers,
        purchaseOrders,
        receivePurchaseOrder,
        finalizePurchaseOrderReview,
        locations,
        fetchLocations,
        currentLocationId,
        user
    } = usePharmaStore();

    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [receptionModalMode, setReceptionModalMode] = useState<'RECEIVE' | 'VIEW' | 'REVIEW'>('RECEIVE');
    const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [selectedMovement, setSelectedMovement] = useState<any | null>(null);
    const [isMovementDetailOpen, setIsMovementDetailOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<string>('');

    // Intelligent Ordering State
    const [suggestions, setSuggestions] = useState<ExtendedSuggestion[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // New Filters & Settings
    const [analysisWindow, setAnalysisWindow] = useState(30);
    const [daysToCover, setDaysToCover] = useState(15);
    const [stockFilter, setStockFilter] = useState<number | null>(null);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<'suggestions' | 'transfers' | 'history'>('suggestions');
    const [suggestedQtyDrafts, setSuggestedQtyDrafts] = useState<Record<string, string>>({});

    // NEW: Search & Limits
    const [searchQuery, setSearchQuery] = useState('');
    const [topLimit, setTopLimit] = useState(100);
    const [isExporting, setIsExporting] = useState(false);
    const [analysisHistoryRefreshKey, setAnalysisHistoryRefreshKey] = useState(0);
    const { isDesktopLike, isLandscape, viewportWidth } = usePlatform();

    // NEW: Date-range analysis mode
    const [analysisMode, setAnalysisMode] = useState<'window' | 'daterange'>('window');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const isValidUuid = (value: string | undefined): value is string =>
        !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    // ... (scanner hook and useEffects remain same)
    // Barcode Scanner Integration (Keyboard Wedge)
    useBarcodeScanner({
        onScan: (barcode) => {
            setSearchQuery(barcode);
            toast.success(`Código escaneado: ${barcode}`);
            // Trigger analysis automatically after scan
            setTimeout(() => runIntelligentAnalysis(), 100);
        },
        minLength: 3
    });

    useEffect(() => {
        usePharmaStore.getState().syncData();
        fetchLocations();
    }, []);

    useEffect(() => {
        if (currentLocationId && !selectedLocation) {
            setSelectedLocation(currentLocationId);
        }
    }, [currentLocationId]);

    // Intelligent ordering analysis is now manual to allow users to configure filters first.
    // The analysis only runs when the "Analizar" button is clicked or "Enter" is pressed in the search box.

    // Helper to recalculate single item suggestion
    const recalculateItem = (item: ExtendedSuggestion, windowDays: number, coverageDays: number): ExtendedSuggestion => {
        const velocities = item.velocities || {};
        // Fallback to current daily_velocity if window not found (or if velocities is missing)
        const velocity = velocities[windowDays] ?? item.daily_velocity ?? 0;

        const safetyContent = item.safety_stock || 0;
        const leadTime = 0;

        // Effective safety fallback to 5 units if set to 0 in DB
        const effectiveSafety = safetyContent > 0 ? safetyContent : 5;

        // Goal stock is the max between projected demand + safety and the absolute safety floor
        const targetCoverageStock = Math.ceil(velocity * (coverageDays + leadTime));
        const maxStock = Math.max(effectiveSafety, Math.ceil(targetCoverageStock + safetyContent));

        const netNeeds = maxStock - item.current_stock - (item.incoming_stock || 0);

        const newSuggested = Math.max(0, Math.ceil(netNeeds));

        return {
            ...item,
            selected_analysis_window: windowDays,
            selected_coverage_days: coverageDays,
            suggested_order_qty: newSuggested,
            max_stock: maxStock,
            // Update daily_velocity for display purposes based on selected window
            daily_velocity: velocity,
            total_estimated: newSuggested * (item.unit_cost || 0)
        };
    };

    const runIntelligentAnalysis = async () => {
        setIsAnalyzing(true);
        setSuggestions([]);

        try {
            let result: { success: boolean; data?: Record<string, unknown>[]; error?: string };

            if (analysisMode === 'daterange') {
                // Date-range mode: pure sales-based analysis
                if (!dateFrom || !dateTo) {
                    toast.error('Seleccione las fechas Desde y Hasta');
                    setIsAnalyzing(false);
                    return;
                }
                result = await generateSaleBasedSuggestionSecure(
                    dateFrom,
                    dateTo,
                    daysToCover,
                    selectedSupplier || undefined,
                    selectedLocation || undefined,
                    searchQuery || undefined,
                    topLimit,
                    true
                );
            } else {
                // Window mode: traditional MRP analysis
                result = await generateRestockSuggestionSecure(
                    selectedSupplier || undefined,
                    daysToCover,
                    analysisWindow,
                    selectedLocation || undefined,
                    stockFilter || undefined,
                    searchQuery || undefined,
                    topLimit,
                    true
                );
            }

            if (!result.success || !result.data) {
                toast.error(result.error || 'Error al analizar demanda');
                setIsAnalyzing(false);
                return;
            }

            // Initialize items with the global settings and recalculate to ensure consistency
            const typedData = result.data as unknown as ExtendedSuggestion[];
            let initializedSuggestions: ExtendedSuggestion[];

            if (analysisMode === 'daterange') {
                // In date-range mode, suggestions come pre-calculated; no recalculation needed
                initializedSuggestions = typedData.map((item: ExtendedSuggestion) => ({
                    ...item,
                    velocities: item.velocities || {},
                    selected_analysis_window: analysisWindow,
                    selected_coverage_days: daysToCover
                }));
            } else {
                initializedSuggestions = typedData.map((item: ExtendedSuggestion) => {
                    const baseItem = {
                        ...item,
                        velocities: item.velocities || { [analysisWindow]: item.daily_velocity }
                    };
                    return recalculateItem(baseItem, analysisWindow, daysToCover);
                });
            }

            setSuggestions(initializedSuggestions);
            setAnalysisHistoryRefreshKey((prev) => prev + 1);

            // Auto-select only critical/high urgency items to avoid massive accidental orders
            const criticalSkus = new Set(typedData.filter((s) => s.urgency === 'HIGH' || s.urgency === 'MEDIUM').map((s) => s.sku));
            setSelectedSkus(criticalSkus);

            toast.success(`Análisis completado. ${result.data.length} sugerencias encontradas.`);

            // Notificar solo si hay productos críticos — con dedup para evitar spam si se repite el análisis
            const criticalCount = result.data.filter((s: any) => s.urgency === 'HIGH').length;
            if (criticalCount > 0) {
                const { createNotificationSecure } = await import('../../actions/notifications-v2');
                const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
                await createNotificationSecure({
                    type: 'PROCUREMENT',
                    severity: 'WARNING',
                    title: '⚠️ Stock Crítico Detectado',
                    message: `${criticalCount} producto${criticalCount > 1 ? 's' : ''} sin stock suficiente. Revisa el módulo de pedido sugerido.`,
                    actionUrl: '/supply-chain',
                    locationId: selectedLocation || undefined,
                    // Dedup: 1 notificación por sucursal por día
                    dedupKey: `supply_critical:${selectedLocation || 'all'}:${today}`,
                    dedupWindowHours: 24,
                    metadata: { criticalCount, locationId: selectedLocation }
                });
            }

        } catch (error) {
            console.error('Error in analysis:', error);
            toast.error('Error inesperado al analizar stock');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleRestoreAnalysis = async (entry: SuggestionAnalysisHistoryItem) => {
        setIsAnalyzing(true);
        setSuggestions([]);

        // Sync local states so UI reflects what was restored
        setAnalysisWindow(entry.analysis_window);
        setDaysToCover(entry.days_to_cover);
        setSelectedSupplier(entry.supplier_id || '');
        setSelectedLocation(entry.location_id || '');
        setStockFilter(entry.stock_threshold);
        setSearchQuery(entry.search_query || '');
        setTopLimit(entry.limit);

        try {
            const result = await generateRestockSuggestionSecure(
                entry.supplier_id || undefined,
                entry.days_to_cover,
                entry.analysis_window,
                entry.location_id || undefined,
                entry.stock_threshold ?? undefined,
                entry.search_query || undefined,
                entry.limit,
                false // Don't track history again for a restoration
            );

            if (!result.success || !result.data) {
                toast.error(result.error || 'Error al restaurar análisis');
                setIsAnalyzing(false);
                return;
            }

            const typedData = result.data as unknown as ExtendedSuggestion[];
            const initializedSuggestions = typedData.map((item: ExtendedSuggestion) => {
                const baseItem = {
                    ...item,
                    velocities: item.velocities || { [entry.analysis_window]: item.daily_velocity }
                };
                return recalculateItem(baseItem, entry.analysis_window, entry.days_to_cover);
            });

            setSuggestions(initializedSuggestions);
            const criticalSkus = new Set(typedData.filter((s) => s.urgency === 'HIGH' || s.urgency === 'MEDIUM').map((s) => s.sku));
            setSelectedSkus(criticalSkus);

            toast.success(`Análisis restaurado: ${result.data.length} sugerencias cargadas.`);
        } catch (error) {
            console.error('Error restoring analysis:', error);
            toast.error('Error inesperado al restaurar análisis');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const suggestionsDraftSignature = useMemo(
        () => suggestions.map((item) => `${item.sku}:${item.suggested_order_qty ?? 0}`).join('|'),
        [suggestions]
    );

    useEffect(() => {
        setSuggestedQtyDrafts((prev) => {
            const next: Record<string, string> = {};
            suggestions.forEach((item) => {
                next[item.sku] = prev[item.sku] ?? String(item.suggested_order_qty ?? 0);
            });
            return next;
        });
    }, [suggestionsDraftSignature]);


    const updateSuggestion = (sku: string, field: keyof ExtendedSuggestion, value: any) => {
        setSuggestions(items => items.map(item => {
            if (item.sku !== sku) return item;
            if (field === 'suggested_order_qty') {
                const safeQty = Math.max(0, Number(value) || 0);
                return {
                    ...item,
                    suggested_order_qty: safeQty,
                    total_estimated: safeQty * (item.unit_cost || 0)
                };
            }
            return { ...item, [field]: value };
        }));
    };

    const updateSuggestedQtyDraft = (item: ExtendedSuggestion, rawValue: string) => {
        const sanitized = rawValue.replace(/[^\d]/g, '');
        if (sanitized === '') {
            setSuggestedQtyDrafts((prev) => ({
                ...prev,
                [item.sku]: ''
            }));
            return;
        }

        const parsed = Number.parseInt(sanitized, 10);
        const normalized = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
        setSuggestedQtyDrafts((prev) => ({
            ...prev,
            [item.sku]: String(normalized)
        }));
        updateSuggestion(item.sku, 'suggested_order_qty', normalized);
    };

    const normalizeSuggestedQtyDraftOnBlur = (item: ExtendedSuggestion) => {
        setSuggestedQtyDrafts((prev) => {
            const current = prev[item.sku];
            if (current === undefined || current.trim() !== '') return prev;
            return {
                ...prev,
                [item.sku]: String(item.suggested_order_qty ?? 0)
            };
        });
    };

    const changeSupplier = (sku: string, supplierId: string) => {
        setSuggestions(items => items.map(item => {
            if (item.sku !== sku) return item;

            const newSupplier = item.other_suppliers?.find(s => s.id === supplierId);
            if (!newSupplier) return item;

            return {
                ...item,
                supplier_id: newSupplier.id,
                supplier_name: newSupplier.name,
                unit_cost: newSupplier.cost,
                supplier_sku: newSupplier.sku,
                total_estimated: (item.suggested_order_qty || 0) * newSupplier.cost
            };
        }));
    };

    const removeSuggestion = (sku: string) => {
        setSuggestions(items => items.filter(i => i.sku !== sku));
        const newSet = new Set(selectedSkus);
        newSet.delete(sku);
        setSelectedSkus(newSet);
    };

    const handleGenerateOrders = () => {
        if (suggestions.length === 0) {
            toast.error('No hay sugerencias para generar');
            return;
        }

        const selectedItems = suggestions.filter(s => selectedSkus.has(s.sku));

        if (selectedItems.length === 0) {
            toast.error('Seleccione al menos un producto');
            return;
        }

        // Group items by supplier_id
        const groupedBySupplier = new Map<string, typeof selectedItems>();
        for (const item of selectedItems) {
            const key = item.supplier_id || 'SIN_PROVEEDOR';
            if (!groupedBySupplier.has(key)) groupedBySupplier.set(key, []);
            groupedBySupplier.get(key)!.push(item);
        }

        const supplierGroups = Array.from(groupedBySupplier.entries());

        if (supplierGroups.length > 1) {
            toast.info(`Se agruparán en ${supplierGroups.length} órdenes por proveedor`, {
                description: supplierGroups.map(([, items]) =>
                    `${items[0]?.supplier_name || 'Sin Proveedor'}: ${items.length} productos`
                ).join(' • '),
                duration: 5000,
            });
        }

        // Open modal with first supplier group (or single group)
        const [firstSupplierId, firstGroupItems] = supplierGroups[0];

        const preloadedOrder = {
            id: `PO-AUTO-${Date.now()}`,
            supplier_id: firstSupplierId === 'SIN_PROVEEDOR' ? '' : firstSupplierId,
            supplier_name: firstGroupItems[0]?.supplier_name || '',
            status: 'DRAFT' as const,
            created_at: Date.now(),
            is_auto_generated: true,
            generation_reason: 'LOW_STOCK' as const,
            destination_location_id: selectedLocation || currentLocationId || '',
            target_warehouse_id: '',
            items: firstGroupItems.map(s => ({
                sku: s.sku,
                name: s.product_name,
                quantity_ordered: s.suggested_order_qty ?? 0,
                quantity_received: 0,
                cost_price: s.unit_cost ?? 0,
                quantity: s.suggested_order_qty ?? 0
            })),
            notes: firstGroupItems.some(s => s.action_type === 'TRANSFER') ? '[TRASPASO]' : '',
            total_estimated: firstGroupItems.reduce((sum, s) => sum + (s.total_estimated ?? 0), 0),
            // Metadata for multi-supplier generation
            _supplierGroups: supplierGroups.length > 1 ? supplierGroups.slice(1).map(([sid, items]) => ({
                supplier_id: sid === 'SIN_PROVEEDOR' ? '' : sid,
                supplier_name: items[0]?.supplier_name || '',
                items_count: items.length,
            })) : undefined,
        };

        setSelectedOrder(preloadedOrder);
        setIsManualOrderModalOpen(true);
    };

    const stats = {
        critical: suggestions.filter(s => s.urgency === 'HIGH').length,
        low: suggestions.filter(s => s.urgency === 'MEDIUM').length,
        transfers: suggestions.filter(s => s.action_type === 'TRANSFER' || s.action_type === 'PARTIAL_TRANSFER').length,
        totalCost: suggestions.filter(s => selectedSkus.has(s.sku)).reduce((sum, s) => sum + (s.total_estimated || 0), 0),
        potentialSavings: suggestions
            .filter(s => selectedSkus.has(s.sku) && s.action_type === 'TRANSFER')
            .reduce((sum, s) => sum + (s.total_estimated || 0), 0),
        suppliers: new Set(suggestions.filter(s => selectedSkus.has(s.sku)).map(s => s.supplier_id)).size
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const result = await exportSuggestedOrdersSecure({
                supplierId: selectedSupplier || undefined,
                daysToCover,
                analysisWindow,
                locationId: selectedLocation || undefined,
                stockThreshold: stockFilter || undefined,
                searchQuery: searchQuery || undefined,
                limit: topLimit
            });

            if (result.success && result.data) {
                // Decode base64 and download
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename || 'sugerencias_pedido.xlsx';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast.success('Reporte generado exitosamente');
            } else {
                toast.error(result.error || 'Error al exportar reporte');
            }
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Error inesperado al exportar reporte');
        } finally {
            setIsExporting(false);
        }
    };

    // ... Logic moved to SupplyKanban ...

    const showSplitPanels = isDesktopLike || (isLandscape && viewportWidth >= 900);

    return (
        <div data-testid="supply-chain-page" className="h-dvh p-3 md:p-6 pb-safe bg-slate-50 flex flex-col overflow-hidden">
            <header className="mb-4 md:mb-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 md:gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        <Truck className="text-cyan-600" /> Cadena de Suministro
                    </h1>
                    <p className="text-slate-500 text-sm">IA y Gestión Inteligente de Abastecimiento</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                    <button
                        onClick={handleGenerateOrders}
                        disabled={selectedSkus.size === 0}
                        className="flex-1 lg:flex-none min-w-[160px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Package size={18} /> Generar ({suggestions.filter(s => selectedSkus.has(s.sku)).length})
                    </button>
                    <button
                        onClick={() => {
                            setSelectedOrder(null);
                            setIsManualOrderModalOpen(true);
                        }}
                        className="flex-1 lg:flex-none min-w-[160px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition text-sm shadow-sm"
                    >
                        <Plus size={18} /> Orden Manual
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex-1 lg:flex-none min-w-[160px] flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition text-sm shadow-sm disabled:opacity-50"
                        title="Exportar análisis actual a Excel corporativo"
                    >
                        {isExporting ? <RefreshCw className="animate-spin" size={18} /> : <FileDown size={18} />}
                        {isExporting ? 'Exportando...' : 'Exportar Excel'}
                    </button>
                </div>
            </header>

            <div className={`flex-1 flex flex-col ${showSplitPanels ? 'sm:flex-row' : ''} gap-4 md:gap-6 overflow-hidden`}>
                {/* Left: Predictive Analysis */}
                <div className="flex-[3] bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    {/* Tab Bar */}
                    <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/50 rounded-t-3xl">
                        <button
                            onClick={() => setActiveTab('suggestions')}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'suggestions'
                                ? 'border-purple-600 text-purple-700 bg-white'
                                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/50'
                                }`}
                        >
                            <TrendingUp size={16} />
                            Motor de Sugerencias
                        </button>
                        <button
                            onClick={() => setActiveTab('transfers')}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'transfers'
                                ? 'border-emerald-600 text-emerald-700 bg-white'
                                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/50'
                                }`}
                        >
                            <ArrowLeftRight size={16} />
                            Traspasos Sugeridos
                            {suggestions.filter(s => s.action_type === 'TRANSFER' || s.action_type === 'PARTIAL_TRANSFER').length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                                    {suggestions.filter(s => s.action_type === 'TRANSFER' || s.action_type === 'PARTIAL_TRANSFER').length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'history'
                                ? 'border-amber-600 text-amber-700 bg-white'
                                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/50'
                                }`}
                        >
                            <Clock size={16} />
                            Historial
                        </button>
                    </div>

                    {/* Tab Content: Suggestions (existing) */}
                    {activeTab === 'suggestions' && (
                        <>
                            <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col gap-4">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                                    <div className="space-y-4 w-full">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg">
                                                <TrendingUp size={18} />
                                            </div>
                                            <h2 className="text-lg font-bold text-slate-800">Motor de Sugerencias</h2>
                                        </div>

                                        <div className="flex flex-wrap gap-3 w-full">
                                            {/* Search Box - NEW */}
                                            <div className="flex-1 min-w-[200px] relative group">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-purple-500 transition-colors" size={16} />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar producto..."
                                                    className="w-full pl-9 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all font-medium"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && runIntelligentAnalysis()}
                                                />
                                                <button
                                                    onClick={() => setIsScannerOpen(true)}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-purple-600 transition-colors"
                                                    title="Escanear código de barras"
                                                >
                                                    <ScanBarcode size={18} />
                                                </button>
                                            </div>

                                            {/* Camera Scanner Modal */}
                                            {isScannerOpen && (
                                                <CameraScanner
                                                    onScan={(code) => {
                                                        setSearchQuery(code);
                                                        toast.success(`Producto escaneado: ${code}`);
                                                        setIsScannerOpen(false);
                                                        setTimeout(() => runIntelligentAnalysis(), 500);
                                                    }}
                                                    onClose={() => setIsScannerOpen(false)}
                                                />
                                            )}

                                            {/* Filters Row */}
                                            <div className="flex gap-2 text-sm flex-wrap w-full lg:w-auto">

                                                {/* Supplier Selector */}
                                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 min-w-[150px]">
                                                    <Users size={14} className="text-slate-400" />
                                                    <select
                                                        className="bg-transparent font-bold text-slate-600 focus:outline-none cursor-pointer w-full text-xs"
                                                        value={selectedSupplier}
                                                        onChange={(e) => setSelectedSupplier(e.target.value)}
                                                    >
                                                        <option value="">Todos</option>
                                                        {suppliers.map(s => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.fantasy_name || s.business_name || 'Sin Nombre'}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Analysis Mode Toggle */}
                                                <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                                    <button
                                                        onClick={() => setAnalysisMode('window')}
                                                        className={`px-3 py-2 text-xs font-bold transition-all ${analysisMode === 'window'
                                                            ? 'bg-purple-600 text-white shadow-sm'
                                                            : 'text-slate-500 hover:bg-slate-100'}`}
                                                    >
                                                        📊 Ventana
                                                    </button>
                                                    <button
                                                        onClick={() => setAnalysisMode('daterange')}
                                                        className={`px-3 py-2 text-xs font-bold transition-all ${analysisMode === 'daterange'
                                                            ? 'bg-purple-600 text-white shadow-sm'
                                                            : 'text-slate-500 hover:bg-slate-100'}`}
                                                    >
                                                        📅 Por Fechas
                                                    </button>
                                                </div>

                                                {/* Window mode: Analysis Window selector */}
                                                {analysisMode === 'window' && (
                                                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200" title="Ventana de ventas a analizar">
                                                        <Settings size={14} className="text-slate-400" />
                                                        <div className="flex flex-col -space-y-1">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Venta</span>
                                                            <select
                                                                className="bg-transparent font-bold text-slate-600 focus:outline-none cursor-pointer text-xs"
                                                                value={analysisWindow}
                                                                onChange={(e) => setAnalysisWindow(Number(e.target.value))}
                                                            >
                                                                <option value={7}>7d</option>
                                                                <option value={15}>15d</option>
                                                                <option value={30}>30d</option>
                                                                <option value={60}>60d</option>
                                                                <option value={90}>90d</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Date-range mode: From/To pickers */}
                                                {analysisMode === 'daterange' && (
                                                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                                                        <Calendar size={14} className="text-slate-400" />
                                                        <input
                                                            type="date"
                                                            value={dateFrom}
                                                            onChange={(e) => setDateFrom(e.target.value)}
                                                            className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
                                                            title="Fecha desde"
                                                        />
                                                        <span className="text-slate-300 text-xs">→</span>
                                                        <input
                                                            type="date"
                                                            value={dateTo}
                                                            onChange={(e) => setDateTo(e.target.value)}
                                                            className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
                                                            title="Fecha hasta"
                                                        />
                                                    </div>
                                                )}

                                                {/* Coverage Days */}
                                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200" title="Días de cobertura a cubrir">
                                                    <div className="flex flex-col -space-y-1">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cobertura</span>
                                                        <select
                                                            className="bg-transparent font-bold text-slate-600 focus:outline-none cursor-pointer text-xs"
                                                            value={daysToCover}
                                                            onChange={(e) => setDaysToCover(Number(e.target.value))}
                                                        >
                                                            <option value={7}>7 días</option>
                                                            <option value={15}>15 días</option>
                                                            <option value={30}>30 días</option>
                                                            <option value={45}>45 días</option>
                                                            <option value={60}>60 días</option>
                                                            <option value={90}>90 días</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Location Selector */}
                                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                                                    <MapPin size={14} className="text-slate-400" />
                                                    <select
                                                        className="bg-transparent font-bold text-slate-600 focus:outline-none cursor-pointer max-w-[120px] truncate"
                                                        value={selectedLocation}
                                                        onChange={(e) => setSelectedLocation(e.target.value)}
                                                    >
                                                        <option value="">Todas</option>
                                                        {locations.map(loc => (
                                                            <option key={loc.id} value={loc.id}>
                                                                {loc.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Top N Limit */}
                                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                                                    <BarChart3 size={14} className="text-slate-400" />
                                                    <span className="text-slate-500 text-xs">Top:</span>
                                                    <select
                                                        className="bg-transparent font-bold text-slate-600 focus:outline-none cursor-pointer"
                                                        value={topLimit}
                                                        onChange={(e) => setTopLimit(Number(e.target.value))}
                                                    >
                                                        <option value={10}>10</option>
                                                        <option value={50}>50</option>
                                                        <option value={100}>100</option>
                                                        <option value={500}>500</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Filters Row 2: Stock Level Chips (replaces confusing slider) */}
                                            {analysisMode === 'window' && (
                                                <div className="flex gap-2 text-sm flex-wrap items-center mt-2 w-full">
                                                    {[
                                                        { label: 'Todo', value: null, color: 'slate' },
                                                        { label: '🔴 Crítico (<10%)', value: 0.1, color: 'red' },
                                                        { label: '🟠 Bajo (<30%)', value: 0.3, color: 'amber' },
                                                        { label: '🟡 Medio (<60%)', value: 0.6, color: 'yellow' },
                                                    ].map((chip) => (
                                                        <button
                                                            key={chip.label}
                                                            onClick={() => setStockFilter(stockFilter === chip.value ? null : chip.value)}
                                                            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${stockFilter === chip.value
                                                                ? chip.color === 'red' ? 'bg-red-50 border-red-200 text-red-600 ring-2 ring-red-100'
                                                                    : chip.color === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-600 ring-2 ring-amber-100'
                                                                        : chip.color === 'yellow' ? 'bg-yellow-50 border-yellow-200 text-yellow-600 ring-2 ring-yellow-100'
                                                                            : 'bg-purple-50 border-purple-200 text-purple-600 ring-2 ring-purple-100'
                                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                                }`}
                                                        >
                                                            {chip.label}
                                                        </button>
                                                    ))}

                                                    {/* Delete Draft Button (Only visible if something selected) */}
                                                    {selectedOrder && (
                                                        <button
                                                            onClick={() => {
                                                                if (confirm('¿Estás seguro de eliminar este borrador? Esta acción no se puede deshacer.')) {
                                                                    const userId = user?.id;
                                                                    if (!isValidUuid(userId)) {
                                                                        toast.error('Sesión inválida para eliminar borrador');
                                                                        return;
                                                                    }
                                                                    deletePurchaseOrderSecure({ orderId: selectedOrder.id, userId })
                                                                        .then((result) => {
                                                                            if (!result.success) {
                                                                                toast.error(result.error || 'Error al eliminar borrador');
                                                                                return;
                                                                            }
                                                                            toast.success('Borrador eliminado');
                                                                            setSelectedOrder(null);
                                                                            // Refresh?
                                                                        })
                                                                        .catch(() => toast.error('Error al eliminar borrador'));
                                                                }
                                                            }}
                                                            className="ml-auto px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                                                        >
                                                            <Trash2 size={12} />
                                                            Eliminar Borrador
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            <button
                                                data-testid="analyze-stock-btn"
                                                onClick={runIntelligentAnalysis}
                                                disabled={isAnalyzing}
                                                className="w-full sm:w-auto sm:ml-auto px-6 py-2.5 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition disabled:opacity-50 shadow-md shadow-purple-200 flex items-center justify-center gap-2 whitespace-nowrap"
                                            >
                                                {isAnalyzing ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
                                                {isAnalyzing ? 'Analizando...' : 'Analizar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>


                            <div className="flex-1 overflow-y-auto p-0 scrollbar-hide bg-slate-50/50">
                                {isAnalyzing ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                                        <div className="relative">
                                            <div className="w-16 h-16 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin"></div>
                                            <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-600" size={24} />
                                        </div>
                                        <p className="font-medium animate-pulse">Analizando demanda histórica y stock...</p>
                                    </div>
                                ) : suggestions.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                                        <div className="p-4 bg-white rounded-full shadow-sm">
                                            <Search className="text-slate-300" size={48} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-slate-600">Listo para analizar</p>
                                            <p className="text-sm">Configure los filtros o busque un producto</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[1100px] text-left border-collapse">
                                            <thead className="bg-white text-slate-500 font-bold text-xs uppercase sticky top-0 z-10 shadow-sm">
                                                <tr>
                                                    <th className="p-4 w-10">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                            checked={suggestions.length > 0 && selectedSkus.size === suggestions.length}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setSelectedSkus(new Set(suggestions.map(s => s.sku)));
                                                                else setSelectedSkus(new Set());
                                                            }}
                                                        />
                                                    </th>
                                                    <th className="p-4">Producto</th>
                                                    <th className="p-4">Proveedor</th>
                                                    <th className="p-4 text-center">Stock</th>
                                                    <th className="p-4 text-center">Análisis (Días)</th>
                                                    <th className="p-4 text-center">Cobertura (Días)</th>
                                                    <th className="p-4 text-center">Sugerido</th>
                                                    <th className="p-4 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-sm bg-white">
                                                {suggestions
                                                    .filter(item => {
                                                        // Fix NaN by defaulting
                                                        const stockPercent = item.stock_level_percent ?? 0;

                                                        // Stock Filter Logic (0-100%)
                                                        if (stockFilter !== null) {
                                                            // Item percent is 0-100 (integer)
                                                            // Stock filter is 0-1 (float)
                                                            // Convert filter to 0-100 for comparison
                                                            return stockPercent <= (stockFilter * 100);
                                                        }
                                                        return true;
                                                    })
                                                    .map((item, idx) => (
                                                        <tr key={`${item.sku}-${idx}`} className={`group hover:bg-purple-50/50 transition border-l-4 ${selectedSkus.has(item.sku) ? 'border-l-purple-500 bg-purple-50/20' : 'border-l-transparent'}`}>
                                                            <td className="p-4">
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                                    checked={selectedSkus.has(item.sku)}
                                                                    onChange={(e) => {
                                                                        const newSet = new Set(selectedSkus);
                                                                        if (e.target.checked) newSet.add(item.sku);
                                                                        else newSet.delete(item.sku);
                                                                        setSelectedSkus(newSet);
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="font-bold text-slate-800 line-clamp-1 group-hover:text-purple-700 transition-colors">{item.product_name}</div>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{item.sku}</span>
                                                                    {item.urgency === 'HIGH' && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded flex items-center gap-1"><AlertTriangle size={10} /> CRÍTICO</span>}
                                                                </div>
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="relative">
                                                                    {/* Force selection if item.supplier_id matches selectedSupplier logic handled in backend now */}
                                                                    {item.other_suppliers && item.other_suppliers.length > 1 ? (
                                                                        <div className="flex flex-col gap-1">
                                                                            <select
                                                                                className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-1.5 pr-6 appearance-none focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer truncate max-w-[140px]"
                                                                                value={item.supplier_id || ''}
                                                                                onChange={(e) => changeSupplier(item.sku, e.target.value)}
                                                                            >
                                                                                {item.other_suppliers.map(s => (
                                                                                    <option key={s.id} value={s.id}>
                                                                                        {s.name} (${s.cost || 0})
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                            <ChevronDown className="absolute right-2 top-2 pointer-events-none text-slate-400" size={12} />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-xs font-medium text-slate-600 truncate max-w-[140px]" title={item.supplier_name}>
                                                                            {item.supplier_name || 'Sin Proveedor'}
                                                                        </div>
                                                                    )}
                                                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                                                        Costo: ${(item.unit_cost || 0).toLocaleString()}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <div className="font-bold text-slate-800">{item.current_stock || 0}</div>
                                                                <div className="text-[10px] text-slate-400">Min: {item.min_stock || 0}</div>
                                                                {(item.global_stock ?? 0) > 0 && (
                                                                    <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded mt-1 inline-flex items-center gap-1 cursor-help" title={`Stock disponible en otras sucursales: ${item.global_stock}u`}>
                                                                        <ArrowLeftRight size={10} />
                                                                        {item.global_stock}u otras
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {/* Analysis Window Selector */}
                                                            <td className="p-4 text-center">
                                                                <select
                                                                    className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer text-center appearance-none"
                                                                    value={item.selected_analysis_window}
                                                                    onChange={(e) => {
                                                                        const newWindow = parseInt(e.target.value);
                                                                        const newItem = recalculateItem(item, newWindow, item.selected_coverage_days || 15);
                                                                        const newSuggestions = [...suggestions];
                                                                        newSuggestions[idx] = newItem; // Update specific item using index (safer than map in large lists)
                                                                        setSuggestions(newSuggestions);
                                                                    }}
                                                                >
                                                                    <option value={7}>7d ({item.sold_counts?.[7] || 0} u)</option>
                                                                    <option value={15}>15d ({item.sold_counts?.[15] || 0} u)</option>
                                                                    <option value={30}>30d ({item.sold_counts?.[30] || 0} u)</option>
                                                                    <option value={60}>60d ({item.sold_counts?.[60] || 0} u)</option>
                                                                    <option value={90}>90d ({item.sold_counts?.[90] || 0} u)</option>
                                                                    <option value={180}>180d ({item.sold_counts?.[180] || 0} u)</option>
                                                                    <option value={365}>365d ({item.sold_counts?.[365] || 0} u)</option>
                                                                </select>
                                                            </td>
                                                            {/* Coverage Days Selector */}
                                                            <td className="p-4 text-center">
                                                                <select
                                                                    className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer text-center appearance-none"
                                                                    value={item.selected_coverage_days}
                                                                    onChange={(e) => {
                                                                        const newCoverage = parseInt(e.target.value);
                                                                        const newItem = recalculateItem(item, item.selected_analysis_window || 30, newCoverage);
                                                                        const newSuggestions = [...suggestions];
                                                                        newSuggestions[idx] = newItem;
                                                                        setSuggestions(newSuggestions);
                                                                    }}
                                                                >
                                                                    <option value={7}>7 días</option>
                                                                    <option value={15}>15 días</option>
                                                                    <option value={30}>30 días</option>
                                                                    <option value={45}>45 días</option>
                                                                    <option value={60}>60 días</option>
                                                                    <option value={90}>90 días</option>
                                                                </select>
                                                            </td>
                                                            <td className="p-4 text-center relative">
                                                                <input
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    pattern="[0-9]*"
                                                                    className={`w-16 p-1.5 border rounded-lg font-bold text-center focus:outline-none text-sm shadow-sm ${item.action_type === 'TRANSFER' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                                                                        item.action_type === 'PARTIAL_TRANSFER' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                                                                            'border-purple-300 bg-white text-purple-700'
                                                                        }`}
                                                                    value={suggestedQtyDrafts[item.sku] ?? String(item.suggested_order_qty ?? 0)}
                                                                    data-testid={`suggested-qty-input-${item.sku}`}
                                                                    placeholder="0"
                                                                    onChange={(e) => updateSuggestedQtyDraft(item, e.target.value)}
                                                                    onBlur={() => normalizeSuggestedQtyDraftOnBlur(item)}
                                                                />
                                                                {item.action_type === 'TRANSFER' && (
                                                                    <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                                                                        📦 TRASPASO
                                                                    </div>
                                                                )}
                                                                {item.action_type === 'PARTIAL_TRANSFER' && (
                                                                    <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                                                                        📦 PARCIAL
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <button
                                                                    onClick={() => removeSuggestion(item.sku)}
                                                                    className="text-slate-300 hover:text-red-500 transition p-1 hover:bg-red-50 rounded-md"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>)}

                    {/* Tab Content: Transfers */}
                    {activeTab === 'transfers' && (
                        <TransferSuggestionsPanel
                            suggestions={suggestions.filter(s => s.action_type === 'TRANSFER' || s.action_type === 'PARTIAL_TRANSFER')}
                            targetLocationId={selectedLocation || currentLocationId || ''}
                            targetLocationName={locations?.find(l => l.id === (selectedLocation || currentLocationId))?.name || 'Sucursal Actual'}
                            defaultWarehouseId={locations?.find(l => l.id === (selectedLocation || currentLocationId))?.default_warehouse_id}
                            onTransferComplete={() => runIntelligentAnalysis()}
                            onGoBack={() => setActiveTab('suggestions')}
                        />
                    )}

                    {/* Tab Content: History */}
                    {activeTab === 'history' && (
                        <div className="flex-1 overflow-y-auto flex flex-col">
                            <SuggestionAnalysisHistoryPanel
                                locationId={selectedLocation || undefined}
                                isActive={activeTab === 'history'}
                                refreshKey={analysisHistoryRefreshKey}
                                onRestore={(entry) => {
                                    handleRestoreAnalysis(entry);
                                    setActiveTab('suggestions');
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Right: Kanban Status */}
                <div className={`${showSplitPanels ? 'flex' : 'hidden'} flex-1 flex-col overflow-hidden max-w-sm`}>
                    <SupplyKanban
                        onEditOrder={(po) => {
                            setSelectedOrder(po);
                            setIsManualOrderModalOpen(true);
                        }}
                        onReceiveOrder={(po) => {
                            setSelectedOrder(po);
                            setReceptionModalMode('RECEIVE');
                            setIsReceptionModalOpen(true);
                        }}
                        onViewOrder={(movement) => {
                            setSelectedMovement(movement);
                            setIsMovementDetailOpen(true);
                        }}
                        onFinalizeReview={(po) => {
                            setSelectedOrder(po);
                            setReceptionModalMode('REVIEW');
                            setIsReceptionModalOpen(true);
                        }}
                    />
                </div>
            </div>

            {
                isReceptionModalOpen && (
                    <PurchaseOrderReceivingModal
                        isOpen={isReceptionModalOpen}
                        mode={receptionModalMode}
                        onClose={() => {
                            setIsReceptionModalOpen(false);
                            setReceptionModalMode('RECEIVE');
                            setSelectedOrder(null);
                        }}
                        order={selectedOrder}
                        onReceive={(orderId, items) => {
                            const fallbackLocationId = selectedLocation || currentLocationId || locations[0]?.id;
                            return receivePurchaseOrder(
                                orderId,
                                items,
                                selectedOrder.destination_location_id || fallbackLocationId
                            );
                        }}
                        onFinalizeReview={(orderId, reviewNotes, items) => finalizePurchaseOrderReview(orderId, reviewNotes, items)}
                    />
                )
            }

            <MovementDetailModal
                isOpen={isMovementDetailOpen}
                onClose={() => {
                    setIsMovementDetailOpen(false);
                    setSelectedMovement(null);
                }}
                movement={selectedMovement}
            />

            <ManualOrderModal
                isOpen={isManualOrderModalOpen}
                onClose={() => {
                    setIsManualOrderModalOpen(false);
                    setSelectedOrder(null);
                }}
                initialOrder={selectedOrder}
            />
        </div >
    );
};

export default SupplyChainPage;
