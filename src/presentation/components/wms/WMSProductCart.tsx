/**
 * WMSProductCart - Lista editable de productos seleccionados para operación WMS
 * 
 * Permite editar cantidades con botones +/- y campo manual.
 * Sigue skill input-behavior-chile: permite vacío temporal, valida onBlur.
 */
import React, { useState, useCallback } from 'react';
import { Trash2, Plus, Minus, Package, AlertTriangle } from 'lucide-react';

export interface WMSCartItem {
    id: string;           // ID del batch/producto
    sku: string;
    name: string;
    quantity: number;      // Cantidad a mover
    maxStock: number;      // Stock disponible (para validación)
    lotNumber?: string;
    expiryDate?: number;
    laboratory?: string;
}

interface WMSProductCartProps {
    /** Items en el carrito */
    items: WMSCartItem[];
    /** Callback cuando cambia un item */
    onUpdateItem: (id: string, quantity: number) => void;
    /** Callback cuando se elimina un item */
    onRemoveItem: (id: string) => void;
    /** Título del carrito */
    title?: string;
    /** Mostrar stock disponible */
    showStock?: boolean;
    /** Deshabilitar edición */
    disabled?: boolean;
    /** Límite máximo de items */
    maxItems?: number;
}

export const WMSProductCart: React.FC<WMSProductCartProps> = ({
    items,
    onUpdateItem,
    onRemoveItem,
    title = 'Productos',
    showStock = true,
    disabled = false,
    maxItems,
}) => {
    // Estado temporal para inputs vacíos (input-behavior-chile)
    const [editingValues, setEditingValues] = useState<Record<string, string>>({});

    const handleQuantityChange = useCallback((id: string, value: string) => {
        // Permitir vacío temporal (skill input-behavior-chile)
        setEditingValues(prev => ({ ...prev, [id]: value }));
    }, []);

    const handleQuantityBlur = useCallback((id: string, maxStock: number) => {
        const raw = editingValues[id];
        if (raw === undefined || raw === '') {
            // Si quedó vacío, restaurar a 1
            onUpdateItem(id, 1);
        } else {
            const num = parseInt(raw, 10);
            if (isNaN(num) || num <= 0) {
                onUpdateItem(id, 1);
            } else if (num > maxStock) {
                onUpdateItem(id, maxStock);
            } else {
                onUpdateItem(id, num);
            }
        }
        setEditingValues(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, [editingValues, onUpdateItem]);

    const incrementQty = useCallback((id: string, current: number, max: number) => {
        if (current < max) onUpdateItem(id, current + 1);
    }, [onUpdateItem]);

    const decrementQty = useCallback((id: string, current: number) => {
        if (current > 1) onUpdateItem(id, current - 1);
    }, [onUpdateItem]);

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    if (items.length === 0) {
        return (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Package size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">Sin productos</p>
                <p className="text-sm text-slate-400 mt-1">
                    Escanee o busque productos para agregarlos
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h4 className="font-bold text-slate-700 text-sm">
                    {title}
                </h4>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{items.length} producto{items.length !== 1 ? 's' : ''}</span>
                    <span className="w-px h-3 bg-slate-300" />
                    <span className="font-bold text-slate-700">{totalItems} unidades</span>
                </div>
                {maxItems && (
                    <span className={`text-xs font-medium ${items.length >= maxItems ? 'text-amber-600' : 'text-slate-400'
                        }`}>
                        {items.length}/{maxItems}
                    </span>
                )}
            </div>

            {/* Items */}
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto wms-content-scroll">
                {items.map((item) => {
                    const editValue = editingValues[item.id];
                    const displayValue = editValue !== undefined ? editValue : item.quantity.toString();
                    const isOverStock = item.quantity > item.maxStock;

                    return (
                        <div
                            key={item.id}
                            className={`px-4 py-3 flex items-center gap-3 transition-colors ${isOverStock ? 'bg-red-50' : 'hover:bg-slate-50'
                                }`}
                        >
                            {/* Info del producto */}
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 text-sm truncate">
                                    {item.name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-slate-500">{item.sku}</span>
                                    {item.lotNumber && (
                                        <span className="text-xs text-slate-400">
                                            Lote: {item.lotNumber}
                                        </span>
                                    )}
                                    {showStock && (
                                        <span className={`text-xs font-medium ${item.maxStock > 0 ? 'text-emerald-600' : 'text-red-500'
                                            }`}>
                                            Stock: {item.maxStock}
                                        </span>
                                    )}
                                </div>
                                {isOverStock && (
                                    <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                                        <AlertTriangle size={12} />
                                        Excede stock disponible
                                    </div>
                                )}
                            </div>

                            {/* Controles de cantidad */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={() => decrementQty(item.id, item.quantity)}
                                    disabled={disabled || item.quantity <= 1}
                                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 
                                             flex items-center justify-center text-slate-600
                                             disabled:opacity-30 disabled:cursor-not-allowed
                                             transition-colors press-effect touch-target"
                                >
                                    <Minus size={16} />
                                </button>

                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={displayValue}
                                    onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                    onBlur={() => handleQuantityBlur(item.id, item.maxStock)}
                                    disabled={disabled}
                                    className="w-14 h-10 text-center font-bold text-slate-900 
                                             border border-slate-200 rounded-xl text-base
                                             focus:border-sky-400 focus:ring-2 focus:ring-sky-100
                                             disabled:bg-slate-50
                                             outline-none transition-all"
                                />

                                <button
                                    onClick={() => incrementQty(item.id, item.quantity, item.maxStock)}
                                    disabled={disabled || item.quantity >= item.maxStock}
                                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 
                                             flex items-center justify-center text-slate-600
                                             disabled:opacity-30 disabled:cursor-not-allowed
                                             transition-colors press-effect touch-target"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>

                            {/* Botón eliminar */}
                            <button
                                onClick={() => {
                                    if ('vibrate' in navigator) navigator.vibrate(15);
                                    onRemoveItem(item.id);
                                }}
                                disabled={disabled}
                                className="w-10 h-10 rounded-xl hover:bg-red-50 
                                         flex items-center justify-center text-slate-400 
                                         hover:text-red-500 disabled:opacity-30
                                         transition-colors shrink-0 press-effect touch-target"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Footer resumen */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Total a mover</span>
                    <span className="text-lg font-bold text-slate-900">
                        {totalItems} unidades
                    </span>
                </div>
            </div>
        </div>
    );
};

export default WMSProductCart;
