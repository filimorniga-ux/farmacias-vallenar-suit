import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import {
    Filter, AlertTriangle, Search, Plus, FileSpreadsheet,
    ChevronDown, ChevronUp, MoreHorizontal, History, RefreshCcw, Package, ScanBarcode, ArrowRightLeft, Edit, Trash2, Zap, Sparkles, Percent, Scissors
} from 'lucide-react';
import { MobileScanner } from '../../components/shared/MobileScanner';
import StockEntryModal from '../components/inventory/StockEntryModal';
import StockTransferModal from '../components/inventory/StockTransferModal';
import ProductFormModal from '../components/inventory/ProductFormModal';
import BulkImportModal from '../components/inventory/BulkImportModal';
import InventoryExportModal from '../components/inventory/InventoryExportModal';
import QuickStockModal from '../components/inventory/QuickStockModal';
import ProductDeleteConfirm from '../components/inventory/ProductDeleteConfirm';
import PriceAdjustmentModal from '../components/inventory/PriceAdjustmentModal';
import { InventoryCostEditor } from '../components/inventory/InventoryCostEditor';
import { hasPermission } from '../../domain/security/roles';
import MobileActionScroll from '../components/ui/MobileActionScroll';
import { toast } from 'sonner';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import InventorySkeleton from '../components/skeletons/InventorySkeleton';

import { useInventoryPagedQuery } from '../hooks/useInventoryPagedQuery';
import { formatSku, getEffectiveUnits } from '../../lib/utils/inventory-utils';

const getBatchTag = (batch: any): { label: string; className: string } | null => {
    const sourceSystem = String(batch?.source_system || '').toUpperCase();
    const lotNumber = String(batch?.lot_number || '').toUpperCase();

    if (sourceSystem === 'WMS_TRANSFER' || lotNumber.startsWith('TRF-')) {
        return {
            label: 'Traspaso',
            className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        };
    }

    if (sourceSystem === 'WMS_DISPATCH' || lotNumber.startsWith('DSP-')) {
        return {
            label: 'Despacho',
            className: 'bg-sky-100 text-sky-700 border-sky-200',
        };
    }

    return null;
};

// --- Internal Component for Virtualized List ---
// This ensures virtualization logic is isolated from parent re-renders
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
    canPriceAdjust: boolean;
    onPriceAdjust: (item: any) => void;
    onAddBatch: (item: any) => void;
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    refetch: () => void;
    isLoading: boolean;
    isError: boolean;
    activeLocation: any;
}

const InventoryList: React.FC<InventoryListProps> = React.memo(({
    items,
    isMobile,
    user,
    onEdit,
    onDelete,
    onQuickAdjust,
    canManageInventory,
    canDelete,

    canQuickAdjust,
    canPriceAdjust,
    onPriceAdjust,
    onAddBatch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isLoading,
    isError,
    activeLocation
}) => {
    const parentRef = useRef<HTMLDivElement>(null);

    // State for expanded rows
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = useCallback((id: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    }, []);

    // FIX: Memoize functions to prevent virtualizer thrashing
    const estimateSize = useCallback(() => isMobile ? 220 : 85, [isMobile]);
    const getScrollElement = useCallback(() => parentRef.current, []);

    const rowVirtualizer = useVirtualizer({
        count: hasNextPage ? items.length + 1 : items.length,
        getScrollElement,
        estimateSize,
        overscan: 5,
    });

    // Recalcula alturas al expandir/cerrar filas para evitar cortes de scroll al final.
    useEffect(() => {
        requestAnimationFrame(() => {
            rowVirtualizer.measure();
        });
    }, [expandedGroups, rowVirtualizer]);

    const virtualItems = rowVirtualizer.getVirtualItems();
    const lastVisibleIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

    useEffect(() => {
        if (
            lastVisibleIndex >= items.length - 1 &&
            hasNextPage &&
            !isFetchingNextPage
        ) {
            console.log('📜 Reached end of list, fetching next page...');
            // Defer update to avoid flushSync error during render/effect cycle (React 18 conflict)
            const timer = setTimeout(() => {
                fetchNextPage();
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [
        hasNextPage,
        fetchNextPage,
        items.length,
        isFetchingNextPage,
        lastVisibleIndex
    ]);

    return (
        <div
            ref={parentRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-24 md:pb-8 touch-pan-y overscroll-contain"
        >
            <div className="bg-transparent md:bg-white md:rounded-3xl md:shadow-sm md:border border-slate-200 overflow-hidden min-h-full relative">

                {/* Unified Virtualizer Container */}
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize() + (!isMobile ? 48 : 0)}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {/* Header for Desktop Table */}
                    {!isMobile && (
                        <div className="sticky top-0 z-10 bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider shadow-sm flex border-b border-slate-200 h-12 items-center">
                            <div className="px-4 w-[5%] text-center">#</div>
                            <div className="px-4 w-[25%]">Producto</div>
                            <div className="px-4 w-[20%]">Detalle</div>
                            <div className="px-4 w-[15%]">Stock Total</div>
                            <div className="px-4 w-[15%]">Lotes / Venc.</div>
                            <div className="px-4 w-[10%] text-right">Precio</div>
                            <div className="px-4 w-[10%] text-center">Acciones</div>
                        </div>
                    )}

                    {rowVirtualizer.getVirtualItems().map(virtualRow => {
                        const isLoaderRow = virtualRow.index > items.length - 1;
                        if (isLoaderRow) {
                            return (
                                <div
                                    key="loader"
                                    ref={rowVirtualizer.measureElement}
                                    data-index={virtualRow.index}
                                    className="absolute top-0 left-0 w-full flex justify-center p-4"
                                    style={{
                                        transform: `translateY(${virtualRow.start + (!isMobile ? 48 : 0)}px)`,
                                    }}
                                >
                                    <div className="flex items-center gap-2 text-indigo-600 font-bold bg-white/80 px-4 py-2 rounded-full shadow-sm">
                                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                        Cargando más productos...
                                    </div>
                                </div>
                            );
                        }

                        const item = items[virtualRow.index];
                        const isExpanded = !!expandedGroups[item.id];
                        const batchCount = item.batches?.length || 0;
                        const hasBatches = batchCount > 0;

                        // Find nearest expiry date
                        const nearestExpiryBatch = item.batches?.length
                            ? item.batches.reduce((prev: any, curr: any) => {
                                if (!curr.expiry_date) return prev;
                                if (!prev || !prev.expiry_date) return curr;
                                return new Date(curr.expiry_date) < new Date(prev.expiry_date) ? curr : prev;
                            }, null)
                            : null;

                        return (
                            <div
                                key={item.id}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                className={`absolute top-0 left-0 w-full ${!isMobile ? 'border-b border-slate-100' : 'px-1 pb-4'}`}
                                style={{
                                    transform: `translateY(${virtualRow.start + (!isMobile ? 48 : 0)}px)`, // Offset for header in desktop
                                }}
                            >
                                {isMobile ? (
                                    // MOBILE CARD VIEW (Grouped)
                                    <div
                                        className={`p-4 rounded-2xl shadow-sm border flex flex-col gap-3 h-full ${item.is_retail_lot
                                            ? 'bg-amber-50/60 border-amber-200'
                                            : 'bg-white border-slate-100'
                                            }`}
                                    >
                                        {/* Header */}
                                        <div className="flex justify-between items-start">
                                            <div onClick={() => toggleGroup(item.id)} className="flex-1">
                                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                    {item.is_retail_lot && (
                                                        <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-extrabold border border-amber-200">
                                                            AL DETAL
                                                        </span>
                                                    )}
                                                    {item.name || 'Sin Nombre'}
                                                    {hasBatches && (
                                                        <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full">
                                                            {batchCount} lotes
                                                        </span>
                                                    )}
                                                </h3>
                                                <p className="text-xs text-slate-500 font-mono">{formatSku(item.sku)}</p>
                                                <p className="text-xs text-slate-400">{item.laboratory || 'Laboratorio N/A'}</p>
                                            </div>
                                            <div className="flex gap-1 flex-wrap justify-end max-w-[100px]">
                                                {(item.registration_source === 'POS_EXPRESS' || item.is_express_entry) && (
                                                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-orange-200">
                                                        POS
                                                    </span>
                                                )}
                                                {item.is_bioequivalent && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold">BIO</span>}
                                            </div>
                                        </div>

                                        {/* Body */}
                                        <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-50">
                                            <div>
                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Stock Total</p>
                                                <p className={`text-2xl font-bold ${item.stock_actual <= (item.stock_min || 5) ? 'text-red-600' : 'text-slate-800'}`}>
                                                    {item.stock_actual || 0}
                                                </p>
                                                <p className="text-[10px] text-slate-400">Min: {item.stock_min || 5}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Precio</p>
                                                <p className="text-2xl font-bold text-slate-800">
                                                    ${(item.price || 0).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Expanded Batches (Mobile) */}
                                        {isExpanded && hasBatches && (
                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2 animate-in slide-in-from-top-2">
                                                <p className="text-xs font-bold text-slate-400 uppercase">Detalle de Lotes</p>
                                                {item.batches.map((batch: any) => (
                                                    <div key={batch.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {(() => {
                                                                const batchTag = getBatchTag(batch);
                                                                return batchTag ? (
                                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${batchTag.className}`}>
                                                                        {batchTag.label}
                                                                    </span>
                                                                ) : null;
                                                            })()}
                                                            <div>
                                                                <div className="text-xs font-bold text-slate-700">Lote: {batch.lot_number || 'S/N'}</div>
                                                                <div className={`text-[10px] flex items-center gap-1 ${batch.expiry_date && new Date(batch.expiry_date) < new Date() ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                                                                    <History size={10} />
                                                                    {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'Sin Venc.'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-bold text-slate-800">{batch.stock_actual} un.</div>
                                                            {canQuickAdjust && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        // Construct a partial item for quick adjust that targets the batch
                                                                        onQuickAdjust({ ...item, id: batch.id, stock_actual: batch.stock_actual, name: `${item.name} (Lote ${batch.lot_number})` });
                                                                    }}
                                                                    className="text-[10px] text-blue-600 font-bold hover:underline"
                                                                >
                                                                    Ajustar
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Footer Actions */}
                                        <div className="flex gap-2 mt-1">
                                            <button
                                                onClick={() => toggleGroup(item.id)}
                                                className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-colors ${isExpanded ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-500'}`}
                                            >
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                {isExpanded ? 'Ocultar' : 'Ver Lotes'}
                                            </button>

                                            {isExpanded && canManageInventory && (
                                                <button
                                                    onClick={() => onAddBatch(item)}
                                                    className="h-10 px-3 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center gap-1 font-bold text-xs"
                                                >
                                                    <Plus size={16} /> Lote
                                                </button>
                                            )}

                                            {canManageInventory && (
                                                <button
                                                    onClick={() => onEdit(item)}
                                                    className="h-10 w-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"
                                                >
                                                    <Edit size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    // DESKTOP ROW VIEW (Grouped)
                                    <div
                                        className={`transition-colors ${item.is_retail_lot
                                            ? (isExpanded ? 'bg-amber-50/80' : 'hover:bg-amber-50/70')
                                            : (isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50')
                                            }`}
                                    >
                                        {/* Master Row */}
                                        <div
                                            className="flex items-center w-full cursor-pointer"
                                            onClick={() => toggleGroup(item.id)}
                                        >
                                            <div className="px-4 w-[5%] py-4 flex justify-center">
                                                <div className={`p-1 rounded-full transition-colors ${isExpanded ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}>
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </div>
                                            </div>
                                            <div className="px-4 w-[25%] py-4">
                                                <div className="font-bold text-slate-800 text-base flex items-center gap-2">
                                                    {item.is_retail_lot && (
                                                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-extrabold border border-amber-200">
                                                            <Scissors size={10} /> AL DETAL
                                                        </span>
                                                    )}
                                                    {item.name || 'Sin Nombre'}
                                                </div>
                                                <div className="text-xs text-slate-500 font-mono mt-0.5 flex gap-2">
                                                    <span>{formatSku(item.sku)}</span>
                                                    {item.is_bioequivalent && <span className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">BIO</span>}
                                                </div>
                                            </div>
                                            <div className="px-4 w-[20%] py-4">
                                                <div className="text-sm font-bold text-slate-700">{item.laboratory || '---'}</div>
                                                <div className="text-xs text-slate-500">{item.dci || ''}</div>
                                            </div>
                                            <div className="px-4 w-[15%] py-4">
                                                <div className="flex flex-col items-start">
                                                    <span className={`text-lg font-bold ${item.stock_actual <= (item.stock_min || 5) ? 'text-red-600' : 'text-slate-800'}`}>
                                                        {item.stock_actual} un.
                                                    </span>
                                                    {hasBatches && (
                                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                                                            {batchCount} Lotes
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="px-4 w-[15%] py-4">
                                                {/* Expiry Info (Nearest) */}
                                                {nearestExpiryBatch ? (
                                                    <span className={`text-xs font-bold px-2 py-1 rounded inline-flex items-center gap-1 ${new Date(nearestExpiryBatch.expiry_date).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-green-50 text-green-700'
                                                        }`}>
                                                        {new Date(nearestExpiryBatch.expiry_date).toLocaleDateString()}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400">---</span>
                                                )}
                                            </div>
                                            <div className="px-4 w-[10%] text-right py-4">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-slate-800 text-base">${(item.price || 0).toLocaleString()}</span>
                                                    {(item.price_min && item.price_min !== item.price) && (
                                                        <span className="text-[10px] text-slate-400">
                                                            Desde ${item.price_min.toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="px-4 w-[10%] py-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    {canManageInventory && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Editar Producto Maestro"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                    )}
                                                    {canPriceAdjust && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPriceAdjust(item); }}
                                                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                            title="Ajustar Precio"
                                                        >
                                                            <div className="font-bold text-xs">$</div>
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Eliminar Producto"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Batch List */}
                                        {isExpanded && hasBatches && (
                                            <div className={`${item.is_retail_lot ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50/50 border-slate-100'} border-t pl-[5%] pr-4 py-2 animate-in slide-in-from-top-1`}>
                                                <div className="flex justify-end mb-2">
                                                    {canManageInventory && (
                                                        <button
                                                            onClick={() => onAddBatch(item)}
                                                            className="text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg shadow-sm hover:bg-cyan-700 font-bold transition-colors flex items-center gap-1"
                                                        >
                                                            <Plus size={14} /> Nuevo Lote
                                                        </button>
                                                    )}
                                                </div>
                                                <table className="w-full text-sm">
                                                    <thead className="text-xs text-slate-400 uppercase font-bold border-b border-slate-200">
                                                        <tr>
                                                            <th className="py-2 text-left pl-2">Lote</th>
                                                            <th className="py-2 text-left">Vencimiento</th>
                                                            <th className="py-2 text-right">Stock</th>
                                                            <th className="py-2 text-right">Precio</th>
                                                            <th className="py-2 text-center">Acciones</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {item.batches.map((batch: any) => (
                                                            <tr key={batch.id} className="hover:bg-indigo-50/30 transition-colors">
                                                                <td className="py-2 pl-2 font-mono text-slate-600 flex items-center gap-1.5">
                                                                    {(() => {
                                                                        const batchTag = getBatchTag(batch);
                                                                        return batchTag ? (
                                                                            <span className={`flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${batchTag.className}`}>
                                                                                {batchTag.label}
                                                                            </span>
                                                                        ) : null;
                                                                    })()}
                                                                    {batch.is_retail_lot && (
                                                                        <span className="flex items-center gap-1 bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[10px] font-bold border border-indigo-100 uppercase tracking-tighter">
                                                                            <Scissors size={10} /> DETAL
                                                                        </span>
                                                                    )}
                                                                    {batch.lot_number || 'S/N'}
                                                                </td>
                                                                <td className="py-2">
                                                                    {batch.expiry_date ? (
                                                                        <span className={`${new Date(batch.expiry_date) < new Date() ? 'text-red-600 font-bold' : 'text-slate-600'} `}>
                                                                            {new Date(batch.expiry_date).toLocaleDateString()}
                                                                        </span>
                                                                    ) : '---'}
                                                                </td>
                                                                <td className="py-2 text-right font-bold text-slate-700">{batch.stock_actual}</td>
                                                                <td className="py-2 text-right text-slate-600">${(batch.price || 0).toLocaleString()}</td>
                                                                <td className="py-2 text-center">
                                                                    {canQuickAdjust && (
                                                                        <button
                                                                            onClick={() => onQuickAdjust({ ...item, id: batch.id, stock_actual: batch.stock_actual, name: `${item.name} (Lote ${batch.lot_number})` })}
                                                                            className="text-xs bg-white border border-slate-200 px-2 py-1 rounded shadow-sm hover:border-indigo-300 hover:text-indigo-600 font-medium transition-colors"
                                                                        >
                                                                            Ajustar Stock
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {items.length === 0 && !isLoading && (
                    <div className="p-12 text-center text-slate-400">
                        <Package size={48} className="mx-auto mb-4 opacity-50" />
                        {!activeLocation ? (
                            <div className="flex flex-col items-center gap-2">
                                <p className="font-bold text-slate-600">Ninguna sucursal seleccionada</p>
                                <p>Por favor selecciona una sucursal arriba para ver el inventario.</p>
                            </div>
                        ) : isError ? (
                            <div className="flex flex-col items-center gap-2 text-red-500">
                                <AlertTriangle size={24} />
                                <p className="font-bold">Error al cargar inventario</p>
                                <button onClick={() => refetch()} className="text-sm underline hover:text-red-700">Reintentar</button>
                            </div>
                        ) : (
                            <p>No se encontraron productos con los filtros actuales.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});


const InventoryPage: React.FC = () => {
    // 1. Pagination State
    // 1. Pagination State
    // const [page, setPage] = useState(1); // Removed for Infinite Scroll
    const [limit] = useState(50);

    // 2. Filters State
    const [searchTerm, setSearchTerm] = useState('');
    // Debounce search term for query
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            // setPage(1); // Reset to page 1 on search - Handled by query key change
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const [activeTab, setActiveTab] = useState<'ALL' | 'MEDS' | 'RETAIL' | 'DETAIL' | 'CONTROLLED'>('ALL');
    const [filters, setFilters] = useState({
        coldChain: false,
        expiring: false,
        critical: false,
        incomplete: false
    });

    const { currentLocationId, setCurrentLocation, user } = usePharmaStore();
    const { locations } = useLocationStore();
    const activeLocation = locations.find(l => l.id === currentLocationId);

    // Auto-select location if none selected and locations available
    useEffect(() => {
        if (!currentLocationId && locations.length > 0) {
            const defaultLoc = locations.find(l => l.is_active) || locations[0];
            // setCurrentLocation: (id: string, warehouseId: string, name: string) => void
            setCurrentLocation(defaultLoc.id, defaultLoc.default_warehouse_id || '', defaultLoc.name);
            toast.info(`Sucursal seleccionada automáticamente: ${defaultLoc.name} `);
        }
    }, [currentLocationId, locations, setCurrentLocation]);

    // 3. New Infinite Query
    const {
        data: infiniteData,
        isLoading,
        isError,
        error,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useInventoryPagedQuery(
        currentLocationId,
        { limit },
        {
            search: debouncedSearch,
            category: activeTab,
            stockStatus: filters.critical ? 'CRITICAL' : filters.expiring ? 'EXPIRING' : 'ALL',
            incomplete: filters.incomplete
        }
    );

    useEffect(() => {
        if (isError && error) {
            console.error('Inventory Query Error:', error);
            toast.error(`Error cargando inventario: ${error.message} `);
        }
    }, [isError, error]);

    // Flatten all pages into a single array
    const inventoryData = useMemo(() => {
        return infiniteData?.pages.flatMap(page => page.data) || [];
    }, [infiniteData]);

    const meta = infiniteData?.pages[0]?.meta || { total: 0, page: 1, totalPages: 1 };

    // Reset page when filters change - Handled by query keys automatically
    // useEffect(() => setPage(1), [activeTab, filters]);

    const [isGrouped, setIsGrouped] = useState(false); // Disable grouping by default for paged view
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isQuickStockModalOpen, setIsQuickStockModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [entryInitialProduct, setEntryInitialProduct] = useState<any>(null);
    const [deletingItem, setDeletingItem] = useState<any>(null);

    // Price Adjustment State
    const [priceAdjState, setPriceAdjState] = useState<{
        isOpen: boolean;
        mode: 'SINGLE' | 'ALL';
        product?: any;
    }>({ isOpen: false, mode: 'SINGLE' });

    // Nuclear Delete State
    const [isNuclearModalOpen, setIsNuclearModalOpen] = useState(false);
    const [nuclearConfirmation, setNuclearConfirmation] = useState('');
    const [adminPin, setAdminPin] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Permissions
    const canManageInventory = hasPermission(user, 'MANAGE_INVENTORY');
    const canDelete = user?.role === 'MANAGER' || user?.role === 'ADMIN';
    const canQuickAdjust = user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'GERENTE_GENERAL';

    // Mobile Detection — mobile-first (true por defecto para evitar flash de vista desktop en Android)
    // En landscape ancho (≥768px) → vista desktop; en portrait siempre → vista mobile
    const [isMobile, setIsMobile] = useState(true);

    useEffect(() => {
        const checkMobile = () => {
            const isLandscape = window.innerWidth > window.innerHeight;
            setIsMobile(!isLandscape || window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        window.addEventListener('orientationchange', checkMobile);
        return () => {
            window.removeEventListener('resize', checkMobile);
            window.removeEventListener('orientationchange', checkMobile);
        };
    }, []);

    const handleScan = (code: string) => {
        setSearchTerm(code);
        if (navigator.vibrate) navigator.vibrate(200);
        const audio = new Audio('/beep.mp3');
        audio.play().catch(() => { });
        toast.success('Producto encontrado', { duration: 1000, icon: <ScanBarcode size={16} /> });
        setIsScannerOpen(false);
    };

    // Keyboard wedge scanner integration (USB/Bluetooth barcode guns)
    useBarcodeScanner({
        onScan: handleScan,
        minLength: 3
    });

    const getStockStatus = (item: any) => {
        if (item.stock_actual <= 0) return 'bg-red-100 text-red-700 border-red-200';
        if (item.stock_actual <= item.stock_min) return 'bg-amber-100 text-amber-700 border-amber-200';
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    };






    // ...

    if (isLoading && !infiniteData) {
        return <InventorySkeleton />;
    }


    // --- Nuclear Option ---
    const handleNuclearDelete = async () => {
        if (!activeLocation) return;
        if (nuclearConfirmation.toUpperCase() !== 'BORRAR') {
            toast.error('Escribe "BORRAR" para confirmar.');
            return;
        }

        setIsDeleting(true);
        try {
            const { clearLocationInventorySecure } = await import('../../actions/inventory-v2');
            const result = await clearLocationInventorySecure({
                locationId: activeLocation.id,
                userId: user?.id || '',
                adminPin: adminPin,
                confirmationCode: nuclearConfirmation.toUpperCase()
            });

            if (result.success) {
                toast.success(`Inventario eliminado: ${result.deletedCount} registros`);
                setIsNuclearModalOpen(false);
                setNuclearConfirmation('');
                setAdminPin('');
                // Refresh
                window.location.reload();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error('Error crítico al eliminar.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="h-dvh min-h-0 flex flex-col bg-slate-50 overflow-hidden">
            <div className="p-4 md:p-6 pb-0 shrink-0 pt-safe">
                {/* Header */}
                <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                            <Package className="text-cyan-600" /> Maestro de Inventario
                        </h1>
                        <div className="flex items-center gap-3 mt-2">
                            <p className="text-slate-500 font-medium">
                                WMS & Control de Stock
                            </p>

                            {/* Product Count Badge */}
                            <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full shadow-md">
                                <Package size={14} className="text-white" />
                                <span className="text-xs font-bold text-white">
                                    {meta.total} artículo{meta.total !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Location Selector */}
                            <div className="relative group z-20">
                                <button className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-indigo-300 transition-colors">
                                    <span className="text-sm font-bold text-indigo-700">
                                        {activeLocation ? activeLocation.name : 'Seleccionar Sucursal'}
                                    </span>
                                    <ChevronDown size={14} className="text-indigo-400 group-hover:rotate-180 transition-transform" />
                                </button>

                                {/* Dropdown (Wrapper with padding bridge) */}
                                <div className="absolute top-full left-0 pt-2 w-64 hidden group-hover:block z-50 animate-in fade-in slide-in-from-top-2">
                                    <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-2">
                                        <div className="text-xs font-bold text-slate-400 uppercase px-2 py-1 mb-1">Cambiar Sucursal</div>
                                        {locations.map(loc => (
                                            <button
                                                key={loc.id}
                                                onClick={() => setCurrentLocation(loc.id, loc.default_warehouse_id || '', '')}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${currentLocationId === loc.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                {loc.name}
                                                {currentLocationId === loc.id && <span className="w-2 h-2 rounded-full bg-indigo-500"></span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <MobileActionScroll>
                        <button
                            onClick={() => setIsTransferModalOpen(true)}
                            className="px-6 py-3 bg-white text-slate-700 font-bold rounded-full border border-slate-200 hover:bg-slate-50 transition flex items-center gap-2 whitespace-nowrap"
                        >
                            <ArrowRightLeft size={18} /> Transferir
                        </button>
                        {canManageInventory && (
                            <>
                                <button
                                    onClick={() => setIsExportModalOpen(true)}
                                    className="px-6 py-3 bg-white text-indigo-700 font-bold rounded-full border border-indigo-200 hover:bg-indigo-50 transition flex items-center gap-2 whitespace-nowrap"
                                >
                                    <FileSpreadsheet size={18} /> Exportar Kardex
                                </button>
                                <button
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="px-6 py-3 bg-white text-green-700 font-bold rounded-full border border-green-200 hover:bg-green-50 transition flex items-center gap-2 whitespace-nowrap"
                                >
                                    <FileSpreadsheet size={18} /> Importar Excel
                                </button>
                                <button
                                    onClick={() => setIsEntryModalOpen(true)}
                                    className="px-6 py-3 bg-white text-slate-700 font-bold rounded-full border border-slate-200 hover:bg-slate-50 transition flex items-center gap-2 whitespace-nowrap"
                                >
                                    <ScanBarcode size={18} /> Ingreso Rápido
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingItem(null);
                                        setIsEditModalOpen(true);
                                    }}
                                    className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-full hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 flex items-center gap-2 whitespace-nowrap"
                                >
                                    <Plus size={18} /> Crear Producto
                                </button>
                                {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'GERENTE_GENERAL') && (
                                    <button
                                        onClick={() => setPriceAdjState({ isOpen: true, mode: 'ALL' })}
                                        className="px-6 py-3 bg-purple-600 text-white font-bold rounded-full hover:bg-purple-700 transition shadow-lg shadow-purple-200 flex items-center gap-2 whitespace-nowrap"
                                    >
                                        <Percent size={18} /> Ajuste Masivo
                                    </button>
                                )}
                            </>
                        )}
                    </MobileActionScroll>
                </header>

                <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide border-b border-slate-200 mb-6 pb-1">
                    <button
                        onClick={() => setActiveTab('ALL')}
                        className={`flex-none min-w-[32%] md:min-w-0 md:flex-1 snap-center py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap px-4 ${activeTab === 'ALL' ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        🌎 TODOS
                    </button>
                    <button
                        onClick={() => setActiveTab('MEDS')}
                        className={`flex-none min-w-[45%] md:min-w-0 md:flex-1 snap-center py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap px-4 ${activeTab === 'MEDS' ? 'border-cyan-500 text-cyan-700 bg-cyan-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        💊 MEDICAMENTOS
                    </button>
                    <button
                        onClick={() => setActiveTab('RETAIL')}
                        className={`flex-none min-w-[45%] md:min-w-0 md:flex-1 snap-center py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap px-4 ${activeTab === 'RETAIL' ? 'border-pink-500 text-pink-700 bg-pink-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        🛍️ RETAIL
                    </button>
                    <button
                        onClick={() => setActiveTab('DETAIL')}
                        className={`flex-none min-w-[42%] md:min-w-0 md:flex-1 snap-center py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap px-4 ${activeTab === 'DETAIL' ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        ✂️ AL DETAL
                    </button>
                    <button
                        onClick={() => setActiveTab('CONTROLLED')}
                        className={`flex-none min-w-[45%] md:min-w-0 md:flex-1 snap-center py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap px-4 ${activeTab === 'CONTROLLED' ? 'border-purple-500 text-purple-700 bg-purple-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        🔒 CONTROLADOS
                    </button>
                </div>

                <div className="p-4 flex flex-col md:flex-row gap-4 items-stretch md:items-center bg-slate-50/50">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por SKU, Nombre, DCI..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none select-text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setFilters(f => ({ ...f, expiring: !f.expiring }))}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition ${filters.expiring ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200'}`}
                        >
                            <AlertTriangle size={14} /> Por Vencer
                        </button>
                        <button
                            onClick={() => setFilters(f => ({ ...f, critical: !f.critical }))}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition ${filters.critical ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-slate-500 border-slate-200'}`}
                        >
                            <Filter size={14} /> Stock Crítico
                        </button>
                        <button
                            onClick={() => setFilters(f => ({ ...f, incomplete: !f.incomplete }))}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition ${filters.incomplete ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-white text-slate-500 border-slate-200'}`}
                        >
                            <AlertTriangle size={14} /> Express/Caja
                        </button>
                    </div>

                    {/* Danger Zone */}
                    {(user?.role === 'ADMIN' || user?.role === 'MANAGER') && (
                        <button
                            onClick={() => setIsNuclearModalOpen(true)}
                            className="ml-auto px-4 py-2 rounded-lg text-xs font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-800 transition flex items-center gap-2"
                        >
                            <Trash2 size={14} /> Vaciar Inventario
                        </button>
                    )}
                </div>
            </div>

            {/* Data Grid (Desktop) & Cards (Mobile) */}
            <InventoryList
                key={isMobile ? 'mobile' : 'desktop'}
                items={inventoryData}
                isMobile={isMobile}
                user={user}
                onEdit={(item) => { setEditingItem(item); setIsEditModalOpen(true); }}
                onDelete={setDeletingItem}
                onQuickAdjust={(item) => { setEditingItem(item); setIsQuickStockModalOpen(true); }}
                onPriceAdjust={(item) => setPriceAdjState({ isOpen: true, mode: 'SINGLE', product: item })}
                canManageInventory={canManageInventory}
                canDelete={canDelete}
                canQuickAdjust={canQuickAdjust}
                canPriceAdjust={canQuickAdjust}
                onAddBatch={(item) => { setEntryInitialProduct(item); setIsEntryModalOpen(true); }}
                fetchNextPage={fetchNextPage}
                hasNextPage={!!hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                refetch={refetch}
                isLoading={isLoading}
                isError={isError}
                activeLocation={activeLocation}
            />



            {/* Loading Indicator for Infinite Scroll */}
            {isFetchingNextPage && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-indigo-100 flex items-center gap-2 animate-in slide-in-from-bottom-5">
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-bold text-indigo-700">Cargando...</span>
                </div>
            )}

            {/* Pagination Controls */}
            {/* Pagination Controls Removed for Infinite Scroll */}
            <div className="bg-white border-t border-slate-200 p-2 shrink-0 flex items-center justify-between text-xs text-slate-400">
                <div>
                    Total: <span className="font-bold text-slate-600">{meta.total}</span> productos
                </div>
                <div>
                    Mostrando {inventoryData.length}
                </div>
            </div>


            {/* Mobile Scanner FAB */}
            <div className="md:hidden fixed bottom-24 right-4 z-40">
                <button
                    onClick={() => setIsScannerOpen(true)}
                    className="bg-cyan-600 text-white p-4 rounded-full shadow-lg shadow-cyan-200 hover:bg-cyan-700 transition-colors"
                >
                    <ScanBarcode size={24} />
                </button>
            </div>

            {/* Mobile Scanner Overlay */}
            {
                isScannerOpen && (
                    <MobileScanner
                        onScan={handleScan}
                        onClose={() => setIsScannerOpen(false)}
                    />
                )
            }


            {/* Modals */}
            <StockEntryModal
                isOpen={isEntryModalOpen}
                onClose={() => { setIsEntryModalOpen(false); setEntryInitialProduct(null); }}
                initialProduct={entryInitialProduct}
            /><StockTransferModal isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} />
            {isEditModalOpen && (
                <ProductFormModal
                    product={editingItem}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setEditingItem(null);
                    }}
                    onSuccess={() => {
                        toast.success('Producto actualizado');
                        refetch();
                    }}
                />
            )}
            <BulkImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />

            <InventoryExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />

            <QuickStockModal isOpen={isQuickStockModalOpen} onClose={() => { setIsQuickStockModalOpen(false); setEditingItem(null); }} product={editingItem} />

            {/* Nuclear Delete Modal */}
            {
                isNuclearModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border-2 border-red-100 animate-in zoom-in-95">
                            <div className="flex flex-col items-center text-center gap-4">
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2">
                                    <AlertTriangle className="text-red-600" size={32} />
                                </div>

                                <h2 className="text-2xl font-bold text-slate-900">¿Vaciar Inventario?</h2>

                                <p className="text-slate-600">
                                    Estás a punto de eliminar <span className="font-bold text-red-600">TODO el stock</span> de la sucursal:
                                    <br />
                                    <span className="text-lg font-black text-slate-800 mt-1 block">{activeLocation?.name || 'Esta Sucursal'}</span>
                                </p>

                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 font-medium w-full text-left">
                                    <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={14} /> Advertencia:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-1 opacity-90">
                                        <li>Esta acción es irreversible.</li>
                                        <li>No afectará a otras sucursales.</li>
                                        <li>Los productos seguirán existiendo en el maestro.</li>
                                    </ul>
                                </div>

                                <div className="w-full mt-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-left">
                                        Escribe "BORRAR" para confirmar:
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border-2 border-red-200 rounded-xl focus:border-red-500 focus:outline-none font-bold text-center uppercase"
                                        placeholder="BORRAR"
                                        value={nuclearConfirmation}
                                        onChange={(e) => setNuclearConfirmation(e.target.value)}
                                    />
                                </div>

                                <div className="w-full mt-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-left">
                                        PIN de Administrador:
                                    </label>
                                    <input
                                        type="password"
                                        className="w-full p-3 border-2 border-red-200 rounded-xl focus:border-red-500 focus:outline-none font-bold text-center"
                                        placeholder="****"
                                        maxLength={6}
                                        value={adminPin}
                                        onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                                    />
                                </div>

                                <div className="flex gap-3 w-full mt-4">
                                    <button
                                        onClick={() => setIsNuclearModalOpen(false)}
                                        className="flex-1 py-3 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleNuclearDelete}
                                        disabled={nuclearConfirmation.toUpperCase() !== 'BORRAR' || adminPin.length < 4 || isDeleting}
                                        className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-200"
                                    >
                                        {isDeleting ? 'Eliminando...' : 'Sí, Vaciar Todo'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Product Delete Confirmation Modal */}
            {deletingItem && (
                <ProductDeleteConfirm
                    product={deletingItem}
                    onClose={() => setDeletingItem(null)}
                    onConfirm={() => {
                        setDeletingItem(null);
                        refetch();
                    }}
                />
            )}

            {priceAdjState.isOpen && (
                <PriceAdjustmentModal
                    mode={priceAdjState.mode}
                    productName={priceAdjState.product?.name}
                    sku={priceAdjState.product?.sku}
                    currentPrice={priceAdjState.product?.price_sell_unit || priceAdjState.product?.price}
                    onClose={() => {
                        console.log('🔄 InventoryPage: Price modal closed. Triggering refetch()...');
                        setPriceAdjState(prev => ({ ...prev, isOpen: false }));
                        refetch().then(res => {
                            // TypeScript fix: Infinite queries have pages, not a single data array
                            const count = res.data?.pages.reduce((acc, page) => acc + page.data.length, 0) || 0;
                            console.log('📦 InventoryPage: Refetch completed', res.status, count);
                        });
                    }}
                />
            )}
        </div>
    );
};

export default InventoryPage;
