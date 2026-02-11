import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { Plus, Search, Edit2, Trash2, Settings, Package, Percent } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';
import { formatSku } from '../../../lib/utils/inventory-utils';
import ProductFormModal from './ProductFormModal';
import ProductDeleteConfirm from './ProductDeleteConfirm';
import PriceAdjustmentModal from './PriceAdjustmentModal';
import { fractionateBatchSecure } from '../../../actions/inventory-v2';
import { toast } from 'sonner';
import { Scissors } from 'lucide-react';

const ProductListPage: React.FC = () => {
    const { inventory, user, syncData } = usePharmaStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OK' | 'EXCESS'>('ALL');
    const [isFormOpen, setIsFormOpen] = useState(false);

    // State for expanded rows (by Product Group Key)
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    // Selection states
    const [editingBatch, setEditingBatch] = useState<InventoryBatch | undefined>();
    const [deletingBatch, setDeletingBatch] = useState<InventoryBatch | undefined>();
    const [isFractionating, setIsFractionating] = useState(false);

    // Price Adjustment State
    const [priceAdjState, setPriceAdjState] = useState<{
        isOpen: boolean;
        mode: 'SINGLE' | 'ALL';
        product?: InventoryBatch;
    }>({ isOpen: false, mode: 'SINGLE' });

    // 1. Group Inventory Logic
    const groupedInventory = useMemo(() => {
        const groups: Record<string, {
            key: string;
            product_id?: string;
            sku: string;
            name: string;
            category: string;
            batches: InventoryBatch[];
            totalStock: number;
            stockMin: number;
            stockMax: number;
            priceMin: number;
            priceMax: number;
        }> = {};

        inventory.forEach(batch => {
            // Grouping Key: Prefer product_id, fallback to SKU, fallback to Name
            const key = batch.product_id || batch.sku || batch.name;

            if (!groups[key]) {
                groups[key] = {
                    key,
                    product_id: batch.product_id,
                    sku: batch.sku,
                    name: batch.name,
                    category: batch.category,
                    batches: [],
                    totalStock: 0,
                    stockMin: 0,
                    stockMax: 0,
                    priceMin: Infinity,
                    priceMax: -Infinity
                };
            }

            const group = groups[key];
            group.batches.push(batch);
            group.totalStock += batch.stock_actual;
            group.stockMin = Math.max(group.stockMin, batch.stock_min); // Take max requirement? or sum? Usually per product settings are unified.
            group.stockMax = Math.max(group.stockMax, batch.stock_max);

            // Track price range
            if (batch.price_sell_unit < group.priceMin) group.priceMin = batch.price_sell_unit;
            if (batch.price_sell_unit > group.priceMax) group.priceMax = batch.price_sell_unit;
        });

        return Object.values(groups);
    }, [inventory]);

    // 2. Filter Grouped Products
    const filteredGroups = useMemo(() => {
        return groupedInventory.filter(group => {
            const matchesSearch = group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                group.sku.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesCategory = categoryFilter === 'ALL' || group.category === categoryFilter;

            let matchesStock = true;
            if (stockFilter === 'LOW') {
                matchesStock = group.totalStock <= group.stockMin;
            } else if (stockFilter === 'OK') {
                matchesStock = group.totalStock > group.stockMin && group.totalStock <= group.stockMax;
            } else if (stockFilter === 'EXCESS') {
                matchesStock = group.totalStock > group.stockMax;
            }

            return matchesSearch && matchesCategory && matchesStock;
        });
    }, [groupedInventory, searchTerm, categoryFilter, stockFilter]);

    const categories = useMemo(() => Array.from(new Set(inventory.map(p => p.category))), [inventory]);

    const toggleRow = (key: string) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        setExpandedRows(newSet);
    };

    const getStockStatus = (actual: number, min: number, max: number) => {
        if (actual <= min) {
            return { label: 'Bajo', color: 'bg-red-100 text-red-700', icon: '🔴' };
        } else if (actual <= max) {
            return { label: 'OK', color: 'bg-emerald-100 text-emerald-700', icon: '🟢' };
        } else {
            return { label: 'Exceso', color: 'bg-amber-100 text-amber-700', icon: '🟡' };
        }
    };

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-100 text-cyan-600 rounded-lg">
                            <Package size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Gestión de Productos</h1>
                            <p className="text-slate-500 text-sm">{filteredGroups.length} producto(s) maestro(s)</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPriceAdjState({ isOpen: true, mode: 'ALL' })}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition shadow-sm"
                        >
                            <Percent size={18} />
                            Ajuste Masivo
                        </button>
                        <button
                            onClick={() => {
                                setEditingBatch(undefined);
                                setIsFormOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition shadow-sm"
                        >
                            <Plus size={18} />
                            Nuevo Lote
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o SKU..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                            />
                        </div>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                        >
                            <option value="ALL">Todas las categorías</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <select
                            value={stockFilter}
                            onChange={(e) => setStockFilter(e.target.value as any)}
                            className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:border-cyan-500"
                        >
                            <option value="ALL">Todos los stocks</option>
                            <option value="LOW">Stock Bajo</option>
                            <option value="OK">Stock Normal</option>
                            <option value="EXCESS">Stock Excesivo</option>
                        </select>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    {filteredGroups.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Package size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No se encontraron productos</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="w-10 p-4"></th>
                                        <th className="text-left p-4 font-bold text-xs text-slate-600 uppercase">Producto</th>
                                        <th className="text-left p-4 font-bold text-xs text-slate-600 uppercase">Categoría</th>
                                        <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Stock Total</th>
                                        <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Precio</th>
                                        <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Estado Global</th>
                                        <th className="text-right p-4 font-bold text-xs text-slate-600 uppercase">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredGroups.map(group => {
                                        const status = getStockStatus(group.totalStock, group.stockMin, group.stockMax);
                                        const isExpanded = expandedRows.has(group.key);
                                        const hasMultipleBatches = group.batches.length > 0;

                                        // Use the first batch as representative for actions (temporary/legacy compact)
                                        const masterBatch = group.batches[0];

                                        return (
                                            <React.Fragment key={group.key}>
                                                {/* MASTER ROW */}
                                                <tr
                                                    className={`hover:bg-slate-50 transition cursor-pointer ${isExpanded ? 'bg-slate-50' : ''}`}
                                                    onClick={() => toggleRow(group.key)}
                                                >
                                                    <td className="p-4 text-center">
                                                        <div className={`transition-transform duration-200 text-slate-400 ${isExpanded ? 'rotate-90' : ''}`}>
                                                            ▶
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-slate-800">{group.name}</div>
                                                        <div className="text-xs text-slate-400 font-mono flex gap-2">
                                                            <span>SKU: {formatSku(group.sku)}</span>
                                                            <span className="bg-slate-100 px-1 rounded text-slate-500">{group.batches.length} Lotes</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className="text-sm text-slate-600">{group.category}</span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <div className="font-bold text-slate-800 text-lg">{group.totalStock}</div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className="font-bold text-emerald-600">
                                                            {group.priceMin === group.priceMax
                                                                ? `$${group.priceMin.toLocaleString()}`
                                                                : `$${group.priceMin.toLocaleString()} - $${group.priceMax.toLocaleString()}`
                                                            }
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.color}`}>
                                                            {status.icon} {status.label}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => setPriceAdjState({
                                                                    isOpen: true,
                                                                    mode: 'SINGLE',
                                                                    product: masterBatch // TODO: Should apply to group/product_id
                                                                })}
                                                                className="p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition"
                                                                title="Ajuste de Precio"
                                                            >
                                                                <Percent size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* DETAILS ROW (Batches) */}
                                                {isExpanded && (
                                                    <tr className="bg-slate-50/50">
                                                        <td colSpan={7} className="p-0">
                                                            <div className="py-2 pl-14 pr-4 border-l-4 border-cyan-500 ml-6 my-2 bg-white rounded-r-lg shadow-inner">
                                                                <table className="w-full text-sm">
                                                                    <thead className="text-xs text-slate-400 border-b border-slate-100">
                                                                        <tr>
                                                                            <th className="text-left pb-2 pl-2">Lote / Serie</th>
                                                                            <th className="text-left pb-2">Vencimiento</th>
                                                                            <th className="text-center pb-2">Stock</th>
                                                                            <th className="text-center pb-2">Ubicación</th>
                                                                            <th className="text-right pb-2 pr-2">Acciones</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {group.batches.map(batch => (
                                                                            <React.Fragment key={batch.id}>
                                                                                <tr className="hover:bg-slate-50">
                                                                                    <td className="py-3 pl-2 font-mono text-slate-600">{batch.lot_number || '---'}</td>
                                                                                    <td className="py-3 text-slate-600">
                                                                                        {batch.expiry_date
                                                                                            ? new Date(batch.expiry_date).toLocaleDateString()
                                                                                            : '---'}
                                                                                    </td>
                                                                                    <td className="py-3 text-center font-bold text-slate-700">{batch.stock_actual}</td>
                                                                                    <td className="py-3 text-center text-slate-500">{batch.aisle || 'Bodega'}</td>
                                                                                    <td className="py-3 text-right pr-2">
                                                                                        <div className="flex justify-end gap-2">
                                                                                            {batch.units_per_box && batch.units_per_box > 1 && (
                                                                                                <button
                                                                                                    onClick={async () => {
                                                                                                        if (!user?.id) return toast.error('Usuario no autenticado');
                                                                                                        if (isFractionating) return;

                                                                                                        if (!confirm(`¿Está seguro de abrir una caja de ${batch.name}? Se descontará 1 caja y se sumarán ${batch.units_per_box} unidades al stock suelto.`)) return;

                                                                                                        setIsFractionating(true);
                                                                                                        const res = await fractionateBatchSecure({ batchId: batch.id, userId: user.id });
                                                                                                        setIsFractionating(false);

                                                                                                        if (res.success) {
                                                                                                            toast.success('Caja abierta correctamente');
                                                                                                            syncData({ force: true });
                                                                                                        } else {
                                                                                                            toast.error(res.error || 'Error al fraccionar');
                                                                                                        }
                                                                                                    }}
                                                                                                    disabled={isFractionating || batch.stock_actual <= 0}
                                                                                                    className="p-1 px-2 text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200 text-xs flex items-center gap-1"
                                                                                                    title="Fraccionar (Abrir Caja)"
                                                                                                >
                                                                                                    <Scissors size={12} />
                                                                                                    Fraccionar
                                                                                                </button>
                                                                                            )}
                                                                                            <button
                                                                                                onClick={() => {
                                                                                                    setEditingBatch(batch);
                                                                                                    setIsFormOpen(true);
                                                                                                }}
                                                                                                className="p-1 px-2 text-cyan-600 hover:bg-cyan-50 rounded border border-cyan-200 text-xs"
                                                                                            >
                                                                                                Editar
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => setDeletingBatch(batch)}
                                                                                                className="p-1 px-2 text-red-600 hover:bg-red-50 rounded border border-red-200 text-xs"
                                                                                            >
                                                                                                Eliminar
                                                                                            </button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                                {batch.units_stock_actual && batch.units_stock_actual > 0 ? (
                                                                                    <tr className="bg-blue-50/50 border-l-4 border-l-blue-400">
                                                                                        <td className="py-2 pl-4 text-xs font-bold text-blue-600">
                                                                                            STOCK FRACCIONADO (UNIDADES)
                                                                                        </td>
                                                                                        <td colSpan={2}></td>
                                                                                        <td className="py-2 text-center text-xs text-slate-500">
                                                                                            1 Caja = {batch.units_per_box} unid.
                                                                                        </td>
                                                                                        <td className="py-2 text-center font-bold text-blue-700">
                                                                                            {batch.units_stock_actual} unid.
                                                                                        </td>
                                                                                        <td colSpan={2}></td>
                                                                                    </tr>
                                                                                ) : null}
                                                                            </React.Fragment>))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {isFormOpen && (
                <ProductFormModal
                    product={editingBatch}
                    onClose={() => {
                        setIsFormOpen(false);
                        setEditingBatch(undefined);
                    }}
                />
            )}

            {deletingBatch && (
                <ProductDeleteConfirm
                    product={deletingBatch}
                    onClose={() => setDeletingBatch(undefined)}
                    onConfirm={() => setDeletingBatch(undefined)}
                />
            )}

            {priceAdjState.isOpen && (
                <PriceAdjustmentModal
                    mode={priceAdjState.mode}
                    productName={priceAdjState.product?.name}
                    sku={priceAdjState.product?.sku}
                    currentPrice={priceAdjState.product?.price_sell_unit}
                    onClose={() => setPriceAdjState(prev => ({ ...prev, isOpen: false }))}
                />
            )}
        </div>
    );
};

export default ProductListPage;
