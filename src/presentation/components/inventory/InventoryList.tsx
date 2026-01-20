import React, { useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    Sparkles, Zap, Edit, Trash2, Package
} from 'lucide-react';
import { InventoryCostEditor } from './InventoryCostEditor';
import { formatSku, getEffectiveUnits } from '../../../lib/utils/inventory-utils';
import { hasPermission } from '../../../domain/security/roles';

interface InventoryListProps {
    items: any[];
    isMobile: boolean;
    user: any;
    onEdit: (item: any) => void;
    onDelete: (item: any) => void;
    onQuickAdjust: (item: any) => void;
    canManageInventory: boolean;
    canDelete: boolean;
    canQuickAdjust: boolean;
}

export const InventoryList: React.FC<InventoryListProps> = ({
    items,
    isMobile,
    user,
    onEdit,
    onDelete,
    onQuickAdjust,
    canManageInventory,
    canDelete,
    canQuickAdjust
}) => {
    const parentRef = useRef<HTMLDivElement>(null);

    // FIX: Memoize functions to prevent virtualizer thrashing
    const estimateSize = useCallback(() => isMobile ? 220 : 60, [isMobile]);
    const getScrollElement = useCallback(() => parentRef.current, []);

    const rowVirtualizer = useVirtualizer({
        count: items.length,
        getScrollElement,
        estimateSize,
        overscan: 5,
    });

    return (
        <div
            ref={parentRef}
            className="flex-1 overflow-y-auto px-6 pb-20"
        >
            <div className="bg-transparent md:bg-white md:rounded-3xl md:shadow-sm md:border border-slate-200 overflow-hidden min-h-full relative">

                {/* Unified Virtualizer Container */}
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {/* Header for Desktop Table */}
                    {!isMobile && (
                        <div className="sticky top-0 z-10 bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider shadow-sm flex border-b border-slate-200">
                            <div className="p-4 w-[30%]">Producto</div>
                            <div className="p-4 w-[20%]">Detalle</div>
                            <div className="p-4 w-[15%]">Atributos</div>
                            <div className="p-4 w-[15%]">Stock</div>
                            <div className="p-4 w-[10%] text-right">Precio</div>
                            <div className="p-4 w-[10%] text-center">Acciones</div>
                        </div>
                    )}

                    {rowVirtualizer.getVirtualItems().map(virtualRow => {
                        const item = items[virtualRow.index];

                        return (
                            <div
                                key={item.id}
                                data-index={virtualRow.index}
                                className={`absolute top-0 left-0 w-full ${!isMobile ? 'hover:bg-slate-50 transition group border-b border-slate-100' : 'px-1 pb-4'}`}
                                style={{
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start + (!isMobile ? 48 : 0)}px)`, // Offset for header in desktop
                                }}
                            >
                                {isMobile ? (
                                    // MOBILE CARD VIEW (Safe Rendering)
                                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 h-full">
                                        {/* Header */}
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-slate-800 text-lg">{item.name || 'Sin Nombre'}</h3>
                                                <p className="text-xs text-slate-500 font-mono">{formatSku(item.sku)}</p>
                                                <p className="text-xs text-slate-400">{item.laboratory || 'Laboratorio N/A'}</p>
                                            </div>
                                            <div className="flex gap-1 flex-wrap justify-end max-w-[100px]">
                                                {item.source_system === 'AI_PARSER' && (
                                                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                                        <Sparkles size={8} /> IA
                                                    </span>
                                                )}
                                                {item.is_bioequivalent && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold">BIO</span>}
                                                {item.storage_condition === 'REFRIGERADO' && <span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded-lg text-[10px] font-bold">FRIO</span>}
                                                {['R', 'RR', 'RCH'].includes(item.condition) && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-[10px] font-bold">RET</span>}
                                            </div>
                                        </div>

                                        {/* Body */}
                                        <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-50">
                                            <div>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Stock</p>
                                                <p className={`text-2xl font-bold ${item.stock_actual <= (item.stock_min || 5) ? 'text-red-600' : 'text-slate-800'}`}>
                                                    {item.stock_actual || 0}
                                                </p>
                                                <p className="text-[10px] text-slate-400">Min: {item.stock_min || 5}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Precio</p>
                                                <p className="text-2xl font-bold text-slate-800">
                                                    ${(item.price_sell_box || item.price || 0).toLocaleString()}
                                                </p>
                                                <p className="text-[10px] text-slate-400">
                                                    Unit: ${Math.round((item.price_sell_box || item.price || 0) / getEffectiveUnits(item)).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Footer Actions */}
                                        <div className="flex gap-3 mt-1">
                                            {canQuickAdjust && (
                                                <button
                                                    onClick={() => onQuickAdjust(item)}
                                                    className="flex-1 h-12 bg-green-50 text-green-600 font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                                >
                                                    <Zap size={20} /> Ajuste
                                                </button>
                                            )}
                                            {canManageInventory && (
                                                <button
                                                    onClick={() => onEdit(item)}
                                                    className="flex-1 h-12 bg-blue-50 text-blue-600 font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                                >
                                                    <Edit size={20} /> Editar
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    onClick={() => onDelete(item)}
                                                    className="h-12 w-12 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    // DESKTOP ROW VIEW
                                    <div className="flex items-center w-full">
                                        <div className="p-4 w-[30%]">
                                            <div className="font-bold text-slate-800 text-lg">{item.name || 'Sin Nombre'}</div>
                                            <div className="text-sm text-slate-500 font-bold">{item.dci || ''}</div>
                                            <div className="text-xs text-slate-400 font-mono mt-1">{formatSku(item.sku)}</div>
                                        </div>
                                        <div className="p-4 w-[20%]">
                                            <div className="text-sm font-bold text-slate-700">{item.laboratory || '---'}</div>
                                            <div className="text-xs text-slate-500 font-mono">{item.isp_register || 'SIN REGISTRO'}</div>
                                            <div className="text-xs text-slate-400 mt-1">{item.format || ''} x{getEffectiveUnits(item)}</div>
                                        </div>
                                        <div className="p-4 w-[15%]">
                                            <div className="flex gap-1 flex-wrap mb-1">
                                                {item.source_system === 'AI_PARSER' && (
                                                    <span title="Creado/Abastecido por IA" className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200 flex items-center gap-1">
                                                        <Sparkles size={10} /> IA
                                                    </span>
                                                )}
                                                {item.is_bioequivalent && <span title="Bioequivalente" className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200">BIO</span>}
                                                {item.storage_condition === 'REFRIGERADO' && <span title="Cadena de Frío" className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded-lg text-xs font-bold border border-cyan-200">FRIO</span>}
                                                {['R', 'RR', 'RCH'].includes(item.condition) && <span title="Receta Retenida" className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold border border-purple-200">RET</span>}
                                            </div>
                                            {item.created_at && (
                                                <div className="text-[10px] text-slate-400 font-medium mt-1">
                                                    <span className="block text-slate-300 uppercase text-[9px] leading-tight mb-0.5">Ult. Ingreso</span>
                                                    {new Date(item.created_at).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 w-[15%]">
                                            <div className="flex flex-col items-start">
                                                <span className={`text-lg font-bold ${item.stock_actual <= (item.stock_min || 5) ? 'text-red-600' : 'text-slate-800'}`}>
                                                    {item.stock_actual} un.
                                                </span>
                                                <span className={`text-xs font-bold ${item.stock_actual <= (item.stock_min || 5) ? 'text-red-500' : 'text-slate-400'}`}>
                                                    Min: {item.stock_min || 5}
                                                </span>
                                                <span className={`text-xs mt-1 px-1.5 py-0.5 rounded ${item.expiry_date && new Date(item.expiry_date).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    Vence: {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '---'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-4 w-[10%] text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="font-bold text-slate-800 text-lg">${(item.price_sell_box || item.price || 0).toLocaleString()}</span>
                                                <span className="text-xs font-bold text-slate-400">
                                                    (${Math.round((item.price_sell_box || item.price || 0) / getEffectiveUnits(item)).toLocaleString()} / un)
                                                </span>
                                                {(user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'GERENTE_GENERAL') && (
                                                    <div className="flex justify-end mt-1">
                                                        <InventoryCostEditor
                                                            batchId={item.id}
                                                            currentCost={item.cost_price || item.cost_net || 0}
                                                            productName={item.name}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4 w-[10%]">
                                            <div className="flex items-center justify-center gap-1">
                                                {canQuickAdjust && (
                                                    <button
                                                        onClick={() => onQuickAdjust(item)}
                                                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                        title="Ajuste Rápido de Stock"
                                                    >
                                                        <Zap size={16} />
                                                    </button>
                                                )}
                                                {canManageInventory && (
                                                    <button
                                                        onClick={() => onEdit(item)}
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Editar Producto"
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button
                                                        onClick={() => onDelete(item)}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Eliminar Producto"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {items.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                        <Package size={48} className="mx-auto mb-4 opacity-50" />
                        <p>No se encontraron productos con los filtros actuales.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
