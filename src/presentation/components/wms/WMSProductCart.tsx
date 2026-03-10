/**
 * WMSProductCart - Lista editable de productos seleccionados para operación WMS
 * 
 * Permite editar cantidades con botones +/- y campo manual.
 * checklistMode: agrega casillas de verificación para marcar ítems procesados.
 * Sigue skill input-behavior-chile: permite vacío temporal, valida onBlur.
 */
import React, { useState, useCallback } from 'react';
import { Trash2, Plus, Minus, Package, AlertTriangle, Square, CheckCircle2 } from 'lucide-react';

export interface WMSCartItem {
    id: string;           // ID del batch/producto
    sku: string;
    name: string;
    quantity: number;      // Cantidad a mover
    maxStock: number;      // Stock disponible (para validación)
    lotNumber?: string;
    expiryDate?: number;
    laboratory?: string;
    checked?: boolean;     // ✅ NUEVO: Para modo checklist
}

interface WMSProductCartProps {
    /** Items en el carrito */
    items: WMSCartItem[];
    /** Callback cuando cambia un item */
    onUpdateItem: (id: string, quantity: number) => void;
    /** Callback cuando se elimina un item */
    onRemoveItem: (id: string) => void;
    /** ✅ NUEVO: Callback cuando se marca/desmarca un ítem en modo checklist */
    onToggleCheck?: (id: string, checked: boolean) => void;
    /** Título del carrito */
    title?: string;
    /** Mostrar stock disponible */
    showStock?: boolean;
    /** Deshabilitar edición */
    disabled?: boolean;
    /** Límite máximo de items */
    maxItems?: number;
    /** ✅ NUEVO: Modo checklist para marcar ítems confirmados */
    checklistMode?: boolean;
    /** ✅ NUEVO: Texto para el contador en modo checklist */
    checklistLabel?: string;
}

export const WMSProductCart: React.FC<WMSProductCartProps> = ({
    items,
    onUpdateItem,
    onRemoveItem,
    onToggleCheck,
    title = 'Productos',
    showStock = true,
    disabled = false,
    maxItems,
    checklistMode = false,
    checklistLabel = 'verificados',
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
            onUpdateItem(id, 1);
        } else {
            const num = parseInt(raw, 10);
            if (isNaN(num) || num <= 0) {
                onUpdateItem(id, 1);
            } else if (num > maxStock && maxStock > 0) {
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
        if (max <= 0 || current < max) onUpdateItem(id, current + 1);
    }, [onUpdateItem]);

    const decrementQty = useCallback((id: string, current: number) => {
        if (current > 1) onUpdateItem(id, current - 1);
    }, [onUpdateItem]);

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const checkedcount = checklistMode ? items.filter(i => i.checked).length : 0;
    const allChecked = checklistMode && items.length > 0 && checkedcount === items.length;

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
                    <span className="font-bold text-slate-700">{totalItems} uds</span>
                    {checklistMode && (
                        <>
                            <span className="w-px h-3 bg-slate-300" />
                            <span className={`font-bold ${allChecked ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {checkedcount}/{items.length} {checklistLabel}
                            </span>
                        </>
                    )}
                </div>
                {maxItems && (
                    <span className={`text-xs font-medium ${items.length >= maxItems ? 'text-amber-600' : 'text-slate-400'}`}>
                        {items.length}/{maxItems}
                    </span>
                )}
            </div>

            {/* Barra de progreso en modo checklist */}
            {checklistMode && items.length > 0 && (
                <div className="h-1.5 w-full bg-slate-100">
                    <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${(checkedcount / items.length) * 100}%` }}
                    />
                </div>
            )}

            {/* Items */}
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto wms-content-scroll">
                {items.map((item) => {
                    const editValue = editingValues[item.id];
                    const displayValue = editValue !== undefined ? editValue : item.quantity.toString();
                    const isOverStock = item.maxStock > 0 && item.quantity > item.maxStock;
                    const isChecked = checklistMode && !!item.checked;

                    return (
                        <div
                            key={item.id}
                            className={`px-3 py-3 flex items-center gap-2.5 transition-all ${isChecked
                                    ? 'bg-emerald-50 border-l-4 border-emerald-400'
                                    : isOverStock
                                        ? 'bg-red-50'
                                        : 'hover:bg-slate-50'
                                }`}
                        >
                            {/* ✅ Casilla de verificación (solo en modo checklist) */}
                            {checklistMode && (
                                <button
                                    onClick={() => onToggleCheck?.(item.id, !isChecked)}
                                    disabled={disabled}
                                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all press-effect touch-target ${isChecked
                                            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200'
                                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                        }`}
                                    title={isChecked ? 'Desmarcar' : 'Marcar como verificado'}
                                >
                                    {isChecked
                                        ? <CheckCircle2 size={20} />
                                        : <Square size={18} />
                                    }
                                </button>
                            )}

                            {/* Info del producto */}
                            <div className={`flex-1 min-w-0 ${isChecked ? 'opacity-70' : ''}`}>
                                <p className={`font-semibold text-slate-800 text-sm truncate ${isChecked ? 'line-through decoration-emerald-500' : ''}`}>
                                    {item.name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-xs text-slate-500">{item.sku}</span>
                                    {item.lotNumber && (
                                        <span className="text-xs text-slate-400">
                                            Lote: {item.lotNumber}
                                        </span>
                                    )}
                                    {showStock && (
                                        <span className={`text-xs font-medium ${item.maxStock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
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
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => decrementQty(item.id, item.quantity)}
                                    disabled={disabled || item.quantity <= 1}
                                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 
                                             flex items-center justify-center text-slate-600
                                             disabled:opacity-30 disabled:cursor-not-allowed
                                             transition-colors press-effect touch-target"
                                >
                                    <Minus size={14} />
                                </button>

                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={displayValue}
                                    onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                    onBlur={() => handleQuantityBlur(item.id, item.maxStock)}
                                    disabled={disabled}
                                    className="w-12 h-9 text-center font-bold text-slate-900 
                                             border border-slate-200 rounded-xl text-sm
                                             focus:border-sky-400 focus:ring-2 focus:ring-sky-100
                                             disabled:bg-slate-50
                                             outline-none transition-all"
                                />

                                <button
                                    onClick={() => incrementQty(item.id, item.quantity, item.maxStock)}
                                    disabled={disabled || (item.maxStock > 0 && item.quantity >= item.maxStock)}
                                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 
                                             flex items-center justify-center text-slate-600
                                             disabled:opacity-30 disabled:cursor-not-allowed
                                             transition-colors press-effect touch-target"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>

                            {/* Botón eliminar */}
                            <button
                                onClick={() => {
                                    if ('vibrate' in navigator) navigator.vibrate(15);
                                    onRemoveItem(item.id);
                                }}
                                disabled={disabled}
                                className="w-9 h-9 rounded-xl hover:bg-red-50 
                                         flex items-center justify-center text-slate-400 
                                         hover:text-red-500 disabled:opacity-30
                                         transition-colors shrink-0 press-effect touch-target"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Footer resumen */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">
                        {checklistMode ? `Verificados: ${checkedcount}/${items.length}` : 'Total a mover'}
                    </span>
                    <span className={`text-lg font-bold ${checklistMode && allChecked ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {totalItems} unidades
                        {checklistMode && allChecked && (
                            <span className="ml-2 text-xs text-emerald-600">✓ Completo</span>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default WMSProductCart;
