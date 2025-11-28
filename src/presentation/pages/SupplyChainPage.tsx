import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { PurchasingAgent } from '../../domain/logic/purchasingAgent';
import { Package, Truck, CheckCircle, AlertCircle, Plus, Calendar, TrendingUp, Save, RefreshCw, AlertTriangle } from 'lucide-react';
import BlindReceptionModal from '../components/scm/BlindReceptionModal';
import ManualOrderModal from '../components/supply/ManualOrderModal';
import { useNotificationStore } from '../store/useNotificationStore';
import { toast } from 'sonner';

type AnalysisPeriod = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_TRIMESTER' | 'LAST_SEMESTER' | 'LAST_YEAR';

const SupplyChainPage: React.FC = () => {
    const { inventory, suppliers, purchaseOrders, addPurchaseOrder, receivePurchaseOrder } = usePharmaStore();
    const { pushNotification } = useNotificationStore();

    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    // Predictive State
    const [analysisPeriod, setAnalysisPeriod] = useState<AnalysisPeriod>('LAST_30_DAYS');
    const [suggestedItems, setSuggestedItems] = useState<any[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Initial Analysis & Alert
    useEffect(() => {
        runAnalysis();
    }, [analysisPeriod]);

    const runAnalysis = () => {
        setIsAnalyzing(true);
        setTimeout(() => {
            const suggestions = PurchasingAgent.generateSuggestions(inventory, suppliers, analysisPeriod);

            // Flatten suggestions for the editable table
            const flatItems = suggestions.flatMap(po =>
                po.items.map(item => ({
                    ...item,
                    supplier_id: po.supplier_id,
                    supplier_name: suppliers.find(s => s.id === po.supplier_id)?.fantasy_name || 'Desconocido'
                }))
            );

            setSuggestedItems(flatItems);
            setIsAnalyzing(false);

            // Check for critical stock to trigger notification
            const criticalCount = flatItems.filter(i => (i as any).status === 'CRITICAL').length;
            if (criticalCount > 0) {
                pushNotification({
                    title: 'Stock Crítico Detectado',
                    message: `La IA ha detectado ${criticalCount} productos en nivel crítico. Revise el abastecimiento.`,
                    type: 'CRITICAL',
                    roleTarget: 'MANAGER'
                });
            }
        }, 600); // Fake delay for "AI Processing" effect
    };

    const updateQuantity = (sku: string, newQty: number) => {
        setSuggestedItems(items =>
            items.map(item => item.sku === sku ? { ...item, quantity: newQty } : item)
        );
    };

    const generateOrders = () => {
        if (suggestedItems.length === 0) return;

        // Group back by supplier
        const ordersBySupplier: { [key: string]: any[] } = {};
        suggestedItems.forEach(item => {
            if (!ordersBySupplier[item.supplier_id]) {
                ordersBySupplier[item.supplier_id] = [];
            }
            ordersBySupplier[item.supplier_id].push(item);
        });

        // Create Purchase Orders
        Object.keys(ordersBySupplier).forEach(supplierId => {
            const items = ordersBySupplier[supplierId];
            addPurchaseOrder({
                id: `PO-${Date.now()}-${supplierId.substring(0, 3)}`,
                supplier_id: supplierId,
                created_at: Date.now(),
                status: 'DRAFT',
                items: items.map(i => ({
                    sku: i.sku,
                    name: i.name,
                    quantity: i.quantity,
                    cost_price: i.cost_price
                })),
                total_estimated: items.reduce((acc, i) => acc + (i.cost_price * i.quantity), 0)
            });
        });

        toast.success(`${Object.keys(ordersBySupplier).length} Órdenes Generadas`);
        setSuggestedItems([]); // Clear suggestions
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
                        <div key={po.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all cursor-pointer">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono text-slate-400">{po.id}</span>
                                <span className="text-xs font-bold text-slate-600">{new Date(po.created_at).toLocaleDateString()}</span>
                            </div>
                            <h4 className="font-bold text-slate-800 mb-1">{suppliers.find(s => s.id === po.supplier_id)?.fantasy_name || 'Proveedor Desconocido'}</h4>
                            <p className="text-sm text-slate-500 mb-3">{po.items.length} Items</p>

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
        <div className="h-screen p-6 bg-slate-50 flex flex-col overflow-hidden">
            <header className="mb-8 flex justify-between items-center flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        <Truck className="text-cyan-600" /> Cadena de Suministro
                    </h1>
                    <p className="text-slate-500">Gestión Inteligente de Abastecimiento</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsManualOrderModalOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition"
                    >
                        <Plus size={20} /> Nueva Orden Manual
                    </button>
                </div>
            </header>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Left: Predictive Analysis */}
                <div className="flex-[2] bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                <TrendingUp size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Predicción de Demanda</h2>
                                <p className="text-xs text-slate-500">IA basada en historial de ventas</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                            <Calendar size={16} className="text-slate-400 ml-2" />
                            <select
                                className="bg-transparent text-sm font-bold text-slate-700 p-2 outline-none cursor-pointer"
                                value={analysisPeriod}
                                onChange={(e) => setAnalysisPeriod(e.target.value as AnalysisPeriod)}
                            >
                                <option value="LAST_7_DAYS">Tendencia Corta (7 días)</option>
                                <option value="LAST_30_DAYS">Tendencia Media (30 días)</option>
                                <option value="LAST_TRIMESTER">Tendencia Larga (Trimestre)</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0">
                        {isAnalyzing ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <RefreshCw className="animate-spin mb-4" size={48} />
                                <p>Analizando patrones de consumo...</p>
                            </div>
                        ) : suggestedItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <CheckCircle className="mb-4 text-emerald-200" size={64} />
                                <p>Todo en orden. No se requieren compras urgentes.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4">Producto</th>
                                        <th className="p-4">Stock</th>
                                        <th className="p-4">Venta (30d)</th>
                                        <th className="p-4">Cobertura</th>
                                        <th className="p-4">Sugerencia</th>
                                        <th className="p-4 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {suggestedItems.map((item, idx) => (
                                        <tr key={`${item.sku}-${idx}`} className="hover:bg-slate-50 transition">
                                            <td className="p-4">
                                                <div className="font-bold text-slate-800">{item.name}</div>
                                                <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-bold text-slate-800">{item.current_stock} un.</div>
                                            </td>
                                            <td className="p-4 text-slate-500">
                                                {(parseFloat(item.velocity) * 30).toFixed(0)} un/mes
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${item.status === 'CRITICAL' ? 'bg-red-500' :
                                                        item.status === 'LOW' ? 'bg-amber-500' :
                                                            item.status === 'EXCESS' ? 'bg-emerald-500' : 'bg-slate-300'
                                                        }`} />
                                                    <span className={`font-bold ${item.status === 'CRITICAL' ? 'text-red-600' :
                                                        item.status === 'LOW' ? 'text-amber-600' :
                                                            item.status === 'EXCESS' ? 'text-emerald-600' : 'text-slate-600'
                                                        }`}>
                                                        {item.coverage > 900 ? '∞' : item.coverage} días
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        className={`w-20 p-2 border rounded-lg font-bold text-center focus:outline-none ${item.quantity > 0 ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-400'
                                                            }`}
                                                        value={item.quantity}
                                                        onChange={(e) => updateQuantity(item.sku, parseInt(e.target.value))}
                                                    />
                                                    <span className="text-xs text-slate-400">cajas</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => setSuggestedItems(items => items.filter(i => i.sku !== item.sku))}
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

                    {suggestedItems.length > 0 && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                            <p className="text-sm text-slate-500">
                                Se generarán <strong>{new Set(suggestedItems.map(i => i.supplier_id)).size}</strong> órdenes de compra.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={generateOrders}
                                    disabled={suggestedItems.length === 0}
                                    className="px-4 py-2 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-cyan-200"
                                >
                                    <RefreshCw size={18} /> Generar Órdenes (IA)
                                </button>
                                <button
                                    onClick={() => setIsManualOrderModalOpen(true)}
                                    className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition flex items-center gap-2"
                                >
                                    <Plus size={18} /> Nueva Orden Manual
                                </button>
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
                <BlindReceptionModal
                    isOpen={isReceptionModalOpen}
                    onClose={() => setIsReceptionModalOpen(false)}
                    order={selectedOrder}
                    onReceive={(order, items) => {
                        receivePurchaseOrder(order.id, items.map(i => ({ sku: i.sku, received_qty: i.receivedQty })));
                        setIsReceptionModalOpen(false);
                    }}
                />
            )}

            <ManualOrderModal
                isOpen={isManualOrderModalOpen}
                onClose={() => setIsManualOrderModalOpen(false)}
            />
        </div>
    );
};

export default SupplyChainPage;
