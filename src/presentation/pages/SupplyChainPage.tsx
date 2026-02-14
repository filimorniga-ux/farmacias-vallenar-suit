import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { AutoOrderSuggestion } from '../../domain/types';
import { Package, Truck, CheckCircle, AlertCircle, Plus, Calendar, TrendingUp, RefreshCw, AlertTriangle, Zap, DollarSign, Trash2, Filter, Calculator, MapPin } from 'lucide-react';
import { PurchaseOrderReceivingModal } from '../components/scm/PurchaseOrderReceivingModal';
import ManualOrderModal from '../components/supply/ManualOrderModal';
import { useNotificationStore } from '../store/useNotificationStore';
import { toast } from 'sonner';
import { generateRestockSuggestionSecure } from '../../actions/procurement-v2';
import { deletePurchaseOrderSecure } from '../../actions/supply-v2';

const SupplyChainPage: React.FC = () => {
    const { inventory, suppliers, purchaseOrders, addPurchaseOrder, receivePurchaseOrder, generateSuggestedPOs, locations, fetchLocations, currentLocationId } = usePharmaStore();


    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<string>(''); // New Location State

    // Intelligent Ordering State
    const [suggestions, setSuggestions] = useState<AutoOrderSuggestion[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // New Filters & Settings
    const [analysisWindow, setAnalysisWindow] = useState(30);
    const [daysToCover, setDaysToCover] = useState(15);
    const [stockFilter, setStockFilter] = useState<number | null>(null); // null = Todos
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

    // Initial Analysis & Alert
    // Run analysis on mount
    // Load locations on mount
    useEffect(() => {
        usePharmaStore.getState().syncData();
        fetchLocations();
    }, []);

    // Load initial location if available
    useEffect(() => {
        if (currentLocationId && !selectedLocation) {
            setSelectedLocation(currentLocationId);
        }
    }, [currentLocationId]);

    const runIntelligentAnalysis = async () => {
        setIsAnalyzing(true);
        setSuggestions([]);

        try {
            // Using Secure Server Action for Robust Analysis
            const result = await generateRestockSuggestionSecure(
                selectedSupplier || undefined,
                daysToCover,
                analysisWindow,
                selectedLocation || undefined,
                stockFilter || undefined
            );

            if (!result.success || !result.data) {
                toast.error(result.error || 'Error al analizar demanda');
                setIsAnalyzing(false);
                return;
            }

            setSuggestions(result.data);

            // Auto-select ALL by default
            const allSkus = new Set(result.data.map((s: any) => s.sku));
            setSelectedSkus(allSkus);

            toast.success(`Análisis completado. ${result.data.length} sugerencias encontradas.`);

            // Notify if critical
            const criticalCount = result.data.filter((s: any) => s.urgency === 'HIGH').length;
            if (criticalCount > 0) {

                // Server Action Notification
                const { createNotificationSecure } = await import('../../actions/notifications-v2');
                await createNotificationSecure({
                    type: 'STOCK_CRITICAL',
                    severity: 'CRITICAL',
                    title: 'Stock Crítico Detectado',
                    message: `${criticalCount} producto(s) requieren atención urgente`,
                    metadata: { roleTarget: 'MANAGER', locationId: selectedLocation || 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6' }
                });
            }

        } catch (error) {
            console.error('Error in analysis:', error);
            toast.error('Error inesperado al analizar stock');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const updateSuggestion = (sku: string, field: keyof AutoOrderSuggestion, value: any) => {
        setSuggestions(items =>
            items.map(item => item.sku === sku ? { ...item, [field]: value } : item)
        );
    };

    const removeSuggestion = (sku: string) => {
        setSuggestions(items => items.filter(i => i.sku !== sku));
    };

    const handleGenerateOrders = () => {
        if (suggestions.length === 0) {
            toast.error('No hay sugerencias para generar');
            return;
        }

        // Filter only selected items
        const selectedItems = suggestions.filter(s => selectedSkus.has(s.sku));

        if (selectedItems.length === 0) {
            toast.error('Seleccione al menos un producto');
            return;
        }

        // Use intelligent ordering service to generate POs
        const pos = generateSuggestedPOs(selectedItems);

        // Add all generated POs to store
        pos.forEach(po => addPurchaseOrder(po));

        toast.success(`${pos.length} orden(es) generada(s) como borrador`);
        setSuggestions([]); // Clear suggestions after generation
    };

    // Calculate summary stats
    const stats = {
        critical: suggestions.filter(s => s.urgency === 'HIGH').length,
        low: suggestions.filter(s => s.urgency === 'MEDIUM').length,
        totalCost: suggestions.reduce((sum, s) => sum + (s.estimated_cost || 0), 0),
        suppliers: new Set(suggestions.map(s => s.supplier_id)).size
    };

    const KanbanColumn = ({ title, status, color, icon: Icon }: any) => {
        const orders = purchaseOrders.filter(po => po.status === status);

        return (
            <div className="flex-1 min-w-[300px] bg-slate-100 rounded-3xl p-4 flex flex-col h-full">
                <div className={`flex items-center gap-2 mb-4 px-2 ${color}`}>
                    <Icon size={20} />
                    <h3 className="font-bold text-slate-700">{title}</h3>
                    <span className="ml-auto bg-white/50 px-2 py-1 rounded-full text-xs font-bold">{orders.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3">
                    {orders.map(po => (
                        <div
                            key={po.id}
                            className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all cursor-pointer relative group"
                        >
                            <div
                                onClick={() => {
                                    if (status === 'DRAFT') {
                                        setSelectedOrder(po);
                                        setIsManualOrderModalOpen(true);
                                    }
                                }}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-mono text-slate-400">{po.id.slice(0, 8)}...</span>
                                    <span className="text-xs font-bold text-slate-600">{new Date(po.created_at).toLocaleDateString()}</span>
                                </div>
                                <h4 className="font-bold text-slate-800 mb-1">{suppliers.find(s => s.id === po.supplier_id)?.fantasy_name || 'Proveedor Desconocido'}</h4>
                                <p className="text-sm text-slate-500 mb-3">{po.items.length} Items</p>
                            </div>

                            {status === 'DRAFT' && (
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!confirm('¿Eliminar borrador?')) return;

                                        const { deletePurchaseOrderSecure } = await import('../../actions/procurement-v2');
                                        const useStore = await import('../store/useStore');
                                        const user = useStore.usePharmaStore.getState().user;

                                        const res = await deletePurchaseOrderSecure({
                                            orderId: po.id,
                                            userId: user?.id || 'SYSTEM'
                                        });

                                        if (res.success) {
                                            useStore.usePharmaStore.getState().removePurchaseOrder(po.id);
                                            toast.success('Borrador eliminado');
                                        } else {
                                            toast.error(res.error || 'Error al eliminar');
                                        }
                                    }}
                                    className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                                    title="Eliminar borrador"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}

                            {status === 'SENT' && (
                                <button
                                    onClick={() => { setSelectedOrder(po); setIsReceptionModalOpen(true); }}
                                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                                >
                                    RECEPCIONAR
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div data-testid="supply-chain-page" className="h-dvh p-4 md:p-6 pb-safe bg-slate-50 flex flex-col overflow-hidden">
            <header className="mb-4 md:mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        <Truck className="text-cyan-600" /> Cadena de Suministro
                    </h1>
                    <p className="text-slate-500">Gestión Inteligente de Abastecimiento</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            setSelectedOrder(null);
                            setIsManualOrderModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition"
                    >
                        <Plus size={20} /> Nueva Orden Manual
                    </button>
                </div>
            </header>

            <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
                {/* Left: Predictive Analysis */}
                <div className="flex-[2] bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                    <TrendingUp size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">Predicción de Demanda</h2>
                                    <p className="text-xs text-slate-500">IA basada en historial de ventas</p>
                                </div>
                            </div>

                            <button
                                data-testid="analyze-stock-btn"
                                onClick={runIntelligentAnalysis}
                                disabled={isAnalyzing}
                                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50 shadow-lg shadow-purple-200"
                            >
                                <Zap size={20} />
                                {isAnalyzing ? 'Analizando...' : '⚡ Analizar Stock (IA)'}
                            </button>
                        </div>

                        {/* Filters Bar */}
                        <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">

                            {/* Analysis Window */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                    <Calendar size={12} /> Historia (Ventas)
                                </label>
                                <select
                                    className="p-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    value={analysisWindow}
                                    onChange={(e) => setAnalysisWindow(Number(e.target.value))}
                                >
                                    <option value={7}>Última Semana</option>
                                    <option value={15}>Últimos 15 Días</option>
                                    <option value={30}>Último Mes</option>
                                    <option value={90}>Último Trimestre</option>
                                    <option value={180}>Último Semestre</option>
                                    <option value={365}>Último Año</option>
                                </select>
                            </div>

                            {/* Days To Cover */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                    <Calculator size={12} /> Proyectar Para
                                </label>
                                <select
                                    className="p-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    value={daysToCover}
                                    onChange={(e) => setDaysToCover(Number(e.target.value))}
                                >
                                    <option value={7}>1 Semana</option>
                                    <option value={15}>15 Días</option>
                                    <option value={30}>1 Mes</option>
                                    <option value={45}>45 Días</option>
                                    <option value={60}>2 Meses</option>
                                    <option value={90}>3 Meses</option>
                                </select>
                            </div>

                            {/* Stock Filter Level */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                    <Filter size={12} /> Nivel de Stock Base
                                </label>
                                <select
                                    className="p-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    value={stockFilter === null ? 'ALL' : stockFilter}
                                    onChange={(e) => setStockFilter(e.target.value === 'ALL' ? null : Number(e.target.value))}
                                >
                                    <option value="ALL">Mostrar Todos</option>
                                    <option value={10}>Menos del 10%</option>
                                    <option value={20}>Menos del 20%</option>
                                    <option value={30}>Menos del 30%</option>
                                    <option value={40}>Menos del 40%</option>
                                    <option value={50}>Menos del 50%</option>
                                    <option value={60}>Menos del 60%</option>
                                    <option value={70}>Menos del 70%</option>
                                    <option value={80}>Menos del 80%</option>
                                    <option value={90}>Menos del 90%</option>
                                    <option value={100}>Menos del 100% (Todo)</option>
                                </select>
                            </div>

                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 touch-pan-y overscroll-contain">
                        <div className="overflow-x-auto touch-pan-x">
                            {isAnalyzing ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <RefreshCw className="animate-spin mb-4" size={48} />
                                    <p>Analizando patrones de consumo...</p>
                                </div>
                            ) : suggestions.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <CheckCircle className="mb-4 text-emerald-200" size={64} />
                                    <p>Todo en orden. No se requieren compras urgentes.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase sticky top-0 z-10">
                                        <tr>
                                            <th className="p-4 w-10">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                    checked={suggestions.length > 0 && selectedSkus.size === suggestions.length}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedSkus(new Set(suggestions.map(s => s.sku)));
                                                        } else {
                                                            setSelectedSkus(new Set());
                                                        }
                                                    }}
                                                />
                                            </th>
                                            <th className="p-4">Producto</th>
                                            <th className="p-4">Stock</th>
                                            <th className="p-4">Nivel %</th>
                                            <th className="p-4">Venta ({analysisWindow}d)</th>
                                            <th className="p-4">Cobertura</th>
                                            <th className="p-4">Sugerencia</th>
                                            <th className="p-4 text-center">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {suggestions
                                            .filter(item => stockFilter === null || (item.stock_level_percent ?? 0) <= stockFilter)
                                            .map((item, idx) => (
                                                <tr key={`${item.sku}-${idx}`} className={`hover:bg-slate-50 transition border-l-4 ${selectedSkus.has(item.sku) ? 'border-l-purple-500 bg-purple-50/30' : 'border-l-transparent'}`}>
                                                    <td className="p-4">
                                                        <input
                                                            type="checkbox"
                                                            className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
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
                                                        <div className="font-bold text-slate-800">{item.product_name}</div>
                                                        <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-slate-800">{item.current_stock} un.</div>
                                                        <div className="text-xs text-slate-400">Max: {item.max_stock}</div>
                                                    </td>
                                                    <td className="p-4 w-32">
                                                        <div className="w-full bg-slate-200 rounded-full h-2.5 mb-1">
                                                            <div
                                                                className={`h-2.5 rounded-full ${(item.stock_level_percent ?? 0) < 20 ? 'bg-red-500' :
                                                                    (item.stock_level_percent ?? 0) < 50 ? 'bg-amber-500' :
                                                                        'bg-emerald-500'
                                                                    }`}
                                                                style={{ width: `${Math.min(100, item.stock_level_percent ?? 0)}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-600">
                                                            {item.stock_level_percent}%
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-slate-500">
                                                        {Math.round(item.daily_avg_sales * analysisWindow)} un/{analysisWindow}d
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            {item.days_until_stockout <= 5 ? (
                                                                <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-bold text-xs flex items-center gap-1.5">
                                                                    🔴 {item.days_until_stockout.toFixed(1)} d
                                                                </span>
                                                            ) : item.days_until_stockout <= 15 ? (
                                                                <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-bold text-xs flex items-center gap-1.5">
                                                                    🟡 {item.days_until_stockout.toFixed(1)} d
                                                                </span>
                                                            ) : (
                                                                <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg font-bold text-xs flex items-center gap-1.5">
                                                                    🟢 {item.days_until_stockout > 900 ? '∞' : item.days_until_stockout.toFixed(1)} d
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                className={`w-20 p-2 border rounded-lg font-bold text-center focus:outline-none border-purple-300 bg-purple-50 text-purple-700`}
                                                                value={item.suggested_order_qty}
                                                                onChange={(e) => updateSuggestion(item.sku, 'suggested_order_qty', parseInt(e.target.value))}
                                                            />
                                                            <span className="text-xs text-slate-400">cajas</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <button
                                                            onClick={() => removeSuggestion(item.sku)}
                                                            className="text-slate-400 hover:text-red-500 transition"
                                                        >
                                                            <AlertTriangle size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {suggestions.length > 0 && (
                        <div className="sticky bottom-0 p-6 border-t-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 shadow-lg">
                            <div className="flex justify-between items-center mb-3">
                                <div className="space-y-1">
                                    <p className="text-lg font-bold text-slate-800">
                                        📦 Se generarán <span className="text-purple-600">{suggestions.filter(s => selectedSkus.has(s.sku)).length}</span> orden(es) para <span className="text-indigo-600">{stats.suppliers}</span> proveedor(es)
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        💰 Costo estimado: <span className="text-xl font-bold text-emerald-600">${stats.totalCost.toLocaleString()}</span>
                                    </p>
                                    {stats.critical > 0 && (
                                        <p className="text-sm text-red-600 font-bold">
                                            ⚠️ {stats.critical} producto(s) crítico(s) (&lt; 5 días)
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleGenerateOrders}
                                        disabled={selectedSkus.size === 0}
                                        className="px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-bold hover:from-cyan-700 hover:to-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl shadow-cyan-300 text-lg"
                                    >
                                        🚀 Generar Borradores
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Kanban Status */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    <KanbanColumn title="Borrador" status="DRAFT" color="text-slate-600" icon={Package} />
                    <KanbanColumn title="Enviado" status="SENT" color="text-blue-600" icon={Truck} />
                </div>
            </div>

            {isReceptionModalOpen && (
                <PurchaseOrderReceivingModal
                    isOpen={isReceptionModalOpen}
                    onClose={() => setIsReceptionModalOpen(false)}
                    order={selectedOrder}
                    onReceive={(orderId, items) => {
                        return receivePurchaseOrder(
                            orderId,
                            items,
                            selectedOrder.destination_location_id || 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6'
                        );
                    }}
                />
            )}

            <ManualOrderModal
                isOpen={isManualOrderModalOpen}
                onClose={() => {
                    setIsManualOrderModalOpen(false);
                    setSelectedOrder(null);
                }}
                initialOrder={selectedOrder}
            />
        </div>
    );
};

export default SupplyChainPage;
