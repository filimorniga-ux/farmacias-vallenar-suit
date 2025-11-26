import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { Scan, PackagePlus, Save, X, Search, AlertTriangle } from 'lucide-react';
import { InventoryBatch, DrugCategory, SaleCondition } from '../../../domain/types';

interface StockEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const StockEntryModal: React.FC<StockEntryModalProps> = ({ isOpen, onClose }) => {
    const { inventory, addStock, addNewProduct } = usePharmaStore();
    const [mode, setMode] = useState<'SCAN' | 'NEW'>('SCAN');
    const [skuInput, setSkuInput] = useState('');
    const [foundProduct, setFoundProduct] = useState<InventoryBatch | null>(null);

    // Form States
    const [qty, setQty] = useState('');
    const [expiry, setExpiry] = useState('');
    const [newProduct, setNewProduct] = useState<Partial<InventoryBatch>>({
        category: 'MEDICAMENTO',
        condition: 'VD',
        is_bioequivalent: false,
        allows_commission: false,
        location_id: 'BODEGA_CENTRAL'
    });

    if (!isOpen) return null;

    const handleScan = () => {
        const product = inventory.find(i => i.sku === skuInput);
        if (product) {
            setFoundProduct(product);
            setMode('SCAN');
        } else {
            setFoundProduct(null);
            setNewProduct(prev => ({ ...prev, sku: skuInput }));
            setMode('NEW');
        }
    };

    const handleQuickEntry = () => {
        if (foundProduct && qty && expiry) {
            addStock(foundProduct.id, parseInt(qty), new Date(expiry).getTime());
            onClose();
            reset();
        }
    };

    const handleNewProductSubmit = () => {
        if (newProduct.name && newProduct.sku && qty) {
            addNewProduct({
                ...newProduct,
                stock_actual: parseInt(qty),
                expiry_date: new Date(expiry).getTime(),
                active_ingredients: [], // Default
                stock_min: 10,
                stock_max: 100,
                cost_price: 0 // Default
            } as InventoryBatch);
            onClose();
            reset();
        }
    };

    const reset = () => {
        setSkuInput('');
        setFoundProduct(null);
        setQty('');
        setExpiry('');
        setMode('SCAN');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-900 p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {mode === 'SCAN' ? <Scan className="text-cyan-400" /> : <PackagePlus className="text-emerald-400" />}
                        {mode === 'SCAN' ? 'Recepción Rápida' : 'Alta de Producto Nuevo'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
                </div>

                <div className="p-6">
                    {/* Search Bar */}
                    <div className="flex gap-2 mb-6">
                        <div className="relative flex-1">
                            <Scan className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Escanear Código de Barras / SKU..."
                                className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none font-mono text-lg"
                                value={skuInput}
                                onChange={(e) => setSkuInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                            />
                        </div>
                        <button
                            onClick={handleScan}
                            className="bg-slate-100 text-slate-600 px-4 rounded-xl font-bold hover:bg-slate-200"
                        >
                            <Search />
                        </button>
                    </div>

                    {mode === 'SCAN' && foundProduct && (
                        <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-4 mb-6 flex items-start gap-4">
                            <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm">💊</div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-lg">{foundProduct.name}</h4>
                                <p className="text-slate-500 text-sm">{foundProduct.dci}</p>
                                <div className="flex gap-2 mt-2">
                                    <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-cyan-200 text-cyan-700">Stock: {foundProduct.stock_actual}</span>
                                    <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-cyan-200 text-cyan-700">{foundProduct.location_id}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {mode === 'SCAN' && foundProduct && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Cantidad a Ingresar</label>
                                <input
                                    type="number"
                                    className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none text-xl font-bold"
                                    value={qty}
                                    onChange={(e) => setQty(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Vencimiento</label>
                                <input
                                    type="date"
                                    className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                    value={expiry}
                                    onChange={(e) => setExpiry(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={handleQuickEntry}
                                className="col-span-2 py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 mt-2"
                            >
                                INGRESAR STOCK
                            </button>
                        </div>
                    )}

                    {mode === 'NEW' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-center gap-2 text-amber-700 text-sm mb-4">
                                <AlertTriangle size={16} />
                                Producto no encontrado. Complete la ficha para dar de alta.
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Comercial</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={newProduct.name || ''}
                                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Principio Activo (DCI)</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={newProduct.dci || ''}
                                        onChange={(e) => setNewProduct({ ...newProduct, dci: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Laboratorio</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={newProduct.laboratory || ''}
                                        onChange={(e) => setNewProduct({ ...newProduct, laboratory: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                                    <select
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={newProduct.category}
                                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value as DrugCategory })}
                                    >
                                        <option value="MEDICAMENTO">Medicamento</option>
                                        <option value="INSUMO_MEDICO">Insumo Médico</option>
                                        <option value="COSMETICO">Cosmético</option>
                                        <option value="SUPLEMENTO">Suplemento</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Condición Venta</label>
                                    <select
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={newProduct.condition}
                                        onChange={(e) => setNewProduct({ ...newProduct, condition: e.target.value as SaleCondition })}
                                    >
                                        <option value="VD">Venta Directa</option>
                                        <option value="R">Receta Simple</option>
                                        <option value="RR">Receta Retenida</option>
                                        <option value="RCH">Receta Cheque</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Precio Venta</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={newProduct.price || ''}
                                        onChange={(e) => setNewProduct({ ...newProduct, price: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Ubicación</label>
                                    <select
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={newProduct.location_id}
                                        onChange={(e) => setNewProduct({ ...newProduct, location_id: e.target.value as any })}
                                    >
                                        <option value="BODEGA_CENTRAL">Bodega Central</option>
                                        <option value="SUCURSAL_CENTRO">Sucursal Centro</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Cantidad Inicial</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border border-slate-300 rounded-lg font-bold"
                                        value={qty}
                                        onChange={(e) => setQty(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Vencimiento</label>
                                    <input
                                        type="date"
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={expiry}
                                        onChange={(e) => setExpiry(e.target.value)}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleNewProductSubmit}
                                className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
                            >
                                CREAR PRODUCTO
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StockEntryModal;
