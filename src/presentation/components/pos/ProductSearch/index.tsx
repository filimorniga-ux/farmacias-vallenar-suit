/**
 * ProductSearch Component
 * 
 * Modular product search panel for POS system
 * Features: search input, virtualized results, keyboard navigation
 * 
 * @version 1.0.0
 */

'use client';

import React, { useRef } from 'react';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import { Search, ScanBarcode, Scissors, CornerDownLeft } from 'lucide-react';
import { InventoryBatch } from '../../../../domain/types';
import { useProductSearch } from '../../../hooks/useProductSearch';

interface ProductSearchProps {
    onProductSelect?: (product: InventoryBatch) => void;
    onScannerOpen?: () => void;
    onFractionSelect?: (product: InventoryBatch) => void;
    className?: string;
}

export function ProductSearch({
    onProductSelect,
    onScannerOpen,
    onFractionSelect,
    className = ''
}: ProductSearchProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    const {
        searchTerm,
        setSearchTerm,
        selectedIndex,
        filteredInventory,
        handleKeyDown,
        selectProduct,
        searchInputRef
    } = useProductSearch({
        onProductSelect
    });

    // Virtualizer for performance with large lists
    const rowVirtualizer = useVirtualizer({
        count: filteredInventory.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 100,
        overscan: 5,
    });

    // Sync scroll with keyboard selection
    React.useEffect(() => {
        if (filteredInventory.length > 0 && rowVirtualizer) {
            try {
                rowVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
            } catch (e) {
                // Ignore scroll errors
            }
        }
    }, [selectedIndex, filteredInventory.length, rowVirtualizer]);

    return (
        <div className={`bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden ${className}`}>
            {/* Search Header */}
            <div className="p-4 md:p-6 border-b border-slate-100">
                <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={24} />
                        <input
                            type="text"
                            ref={searchInputRef}
                            placeholder="Buscar o Escanear (COT-...)"
                            className="w-full pl-12 pr-12 py-4 bg-white rounded-2xl border-2 border-slate-100 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 outline-none transition-all text-lg font-medium shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        {onScannerOpen && (
                            <button
                                onClick={onScannerOpen}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 md:hidden p-2 text-slate-400 hover:text-cyan-600"
                                aria-label="Abrir escáner"
                            >
                                <ScanBarcode size={24} />
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-xs text-slate-400 mt-2 text-center hidden md:block">
                    Escanee producto o cotización
                </p>
            </div>

            {/* Results List */}
            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4"
            >
                {searchTerm ? (
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                            contain: 'strict'
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
                            const item = filteredInventory[virtualRow.index];
                            const isSelected = virtualRow.index === selectedIndex;

                            return (
                                <ProductSearchItem
                                    key={virtualRow.key}
                                    item={item}
                                    isSelected={isSelected}
                                    virtualRow={virtualRow}
                                    measureElement={rowVirtualizer.measureElement}
                                    onClick={() => selectProduct(virtualRow.index)}
                                    onFractionClick={onFractionSelect ? () => onFractionSelect(item) : undefined}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <EmptySearchState />
                )}
            </div>
        </div>
    );
}

// Sub-component: Search Result Item
interface ProductSearchItemProps {
    item: InventoryBatch;
    isSelected: boolean;
    virtualRow: VirtualItem;
    measureElement: (el: HTMLElement | null) => void;
    onClick: () => void;
    onFractionClick?: () => void;
}

function ProductSearchItem({
    item,
    isSelected,
    virtualRow,
    measureElement,
    onClick,
    onFractionClick
}: ProductSearchItemProps) {
    return (
        <div
            data-index={virtualRow.index}
            ref={measureElement}
            className={`absolute top-0 left-0 w-full p-2 transition-all duration-75 ${
                isSelected
                    ? 'bg-amber-50 border-l-4 border-amber-500 shadow-sm z-10 scale-[1.01]'
                    : 'hover:bg-slate-50 border-l-4 border-transparent'
            }`}
            style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
            }}
            onClick={onClick}
        >
            <div
                className={`p-3 rounded-xl border transition-all group h-full cursor-pointer relative ${
                    isSelected
                        ? 'bg-cyan-50 border-cyan-500 shadow-md ring-2 ring-cyan-200 z-10 scale-[1.02]'
                        : 'bg-white border-slate-100 hover:border-cyan-200'
                }`}
            >
                <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-cyan-600">
                    {item.name}
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mb-1">{item.dci}</p>
                <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">
                        ${(item.price || 0).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                        {isSelected && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-600 animate-pulse bg-cyan-100 px-2 py-0.5 rounded-full">
                                <CornerDownLeft size={12} /> ENTER
                            </span>
                        )}
                        {item.is_fractionable && onFractionClick && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onFractionClick();
                                }}
                                className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                                title="Venta Fraccionada"
                                aria-label="Venta Fraccionada"
                            >
                                <Scissors size={16} />
                            </button>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            item.stock_actual > 0 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : 'bg-red-100 text-red-700'
                        }`}>
                            Stock: {item.stock_actual}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Sub-component: Empty State
function EmptySearchState() {
    return (
        <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50">
            <Search size={48} className="mb-4" />
            <p className="text-sm font-bold">Escriba para buscar</p>
        </div>
    );
}

export default ProductSearch;
