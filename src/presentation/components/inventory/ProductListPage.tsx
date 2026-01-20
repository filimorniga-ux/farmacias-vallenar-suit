import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { Plus, Search, Edit2, Trash2, Settings, Package, Percent } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';
import ProductFormModal from './ProductFormModal';
import ProductDeleteConfirm from './ProductDeleteConfirm';
import PriceAdjustmentModal from './PriceAdjustmentModal';

const ProductListPage: React.FC = () => {
    const { inventory } = usePharmaStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OK' | 'EXCESS'>('ALL');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<InventoryBatch | undefined>();
    const [deletingProduct, setDeletingProduct] = useState<InventoryBatch | undefined>();

    // Price Adjustment State
    const [priceAdjState, setPriceAdjState] = useState<{
        isOpen: boolean;
        mode: 'SINGLE' | 'ALL';
        product?: InventoryBatch;
    }>({ isOpen: false, mode: 'SINGLE' });

    const filteredProducts = useMemo(() => {
        return inventory.filter(product => {
            const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.sku.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesCategory = categoryFilter === 'ALL' || product.category === categoryFilter;

            let matchesStock = true;
            if (stockFilter === 'LOW') {
                matchesStock = product.stock_actual <= product.stock_min;
            } else if (stockFilter === 'OK') {
                matchesStock = product.stock_actual > product.stock_min && product.stock_actual <= product.stock_max;
            } else if (stockFilter === 'EXCESS') {
                matchesStock = product.stock_actual > product.stock_max;
            }

            return matchesSearch && matchesCategory && matchesStock;
        });
    }, [inventory, searchTerm, categoryFilter, stockFilter]);

    const categories = Array.from(new Set(inventory.map(p => p.category)));

    const getStockStatus = (product: InventoryBatch) => {
        if (product.stock_actual <= product.stock_min) {
            return { label: 'Bajo', color: 'bg-red-100 text-red-700', icon: '🔴' };
        } else if (product.stock_actual <= product.stock_max) {
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
                            <p className="text-slate-500 text-sm">{filteredProducts.length} producto(s)</p>
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
                                setEditingProduct(undefined);
                                setIsFormOpen(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition shadow-sm"
                        >
                            <Plus size={18} />
                            Nuevo Producto
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
                    {filteredProducts.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Package size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No se encontraron productos</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left p-4 font-bold text-xs text-slate-600 uppercase">Producto</th>
                                        <th className="text-left p-4 font-bold text-xs text-slate-600 uppercase">Categoría</th>
                                        <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Stock</th>
                                        <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Precio Venta</th>
                                        <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Estado</th>
                                        <th className="text-center p-4 font-bold text-xs text-slate-600 uppercase">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredProducts.map(product => {
                                        const status = getStockStatus(product);
                                        return (
                                            <tr key={product.id} className="hover:bg-slate-50 transition">
                                                <td className="p-4">
                                                    <div className="font-bold text-slate-800">{product.name}</div>
                                                    <div className="text-xs text-slate-400 font-mono">{formatSku(product.sku)}</div>
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-sm text-slate-600">{product.category}</span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="font-bold text-slate-800">{product.stock_actual}</div>
                                                    <div className="text-xs text-slate-400">
                                                        Min: {product.stock_min} | Max: {product.stock_max}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="font-bold text-emerald-600">
                                                        ${product.price_sell_unit?.toLocaleString() || 0}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.color}`}>
                                                        {status.icon} {status.label}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => setPriceAdjState({
                                                                isOpen: true,
                                                                mode: 'SINGLE',
                                                                product
                                                            })}
                                                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition"
                                                            title="Ajuste de Precio (%)"
                                                        >
                                                            <Percent size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingProduct(product);
                                                                setIsFormOpen(true);
                                                            }}
                                                            className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg transition"
                                                            title="Editar"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => { }}
                                                            className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg transition"
                                                            title="Config Auto-Reorden"
                                                        >
                                                            <Settings size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeletingProduct(product)}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
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
                    product={editingProduct}
                    onClose={() => {
                        setIsFormOpen(false);
                        setEditingProduct(undefined);
                    }}
                />
            )}

            {deletingProduct && (
                <ProductDeleteConfirm
                    product={deletingProduct}
                    onClose={() => setDeletingProduct(undefined)}
                    onConfirm={() => setDeletingProduct(undefined)}
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

const formatSku = (sku?: string) => {
    if (!sku) return '---';
    if (sku.startsWith('AUTO-') || sku.startsWith('TEMP-')) return '---';
    return sku;
};
