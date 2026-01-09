'use client';

import { Package, CheckCircle, AlertTriangle, MinusCircle } from 'lucide-react';
import InvoiceItemRow from './InvoiceItemRow';
import type { ParsedInvoiceItem } from '@/actions/invoice-parser-v2';

// ============================================================================
// TIPOS
// ============================================================================

interface InvoiceItemsListProps {
    items: ParsedInvoiceItem[];
    onMapItem?: (item: ParsedInvoiceItem) => void;
    onSkipItem?: (item: ParsedInvoiceItem) => void;
    isReadOnly?: boolean;
    className?: string;
}

// ============================================================================
// COMPONENTE
// ============================================================================

export default function InvoiceItemsList({
    items,
    onMapItem,
    onSkipItem,
    isReadOnly = false,
    className = '',
}: InvoiceItemsListProps) {
    // Contar estados
    const mappedCount = items.filter(i => i.mapping_status === 'MAPPED').length;
    const unmappedCount = items.filter(i => i.mapping_status === 'UNMAPPED' || i.mapping_status === 'PENDING').length;
    const skippedCount = items.filter(i => i.mapping_status === 'SKIPPED').length;
    
    if (items.length === 0) {
        return (
            <div className={`text-center py-8 text-gray-500 ${className}`}>
                <Package size={48} className="mx-auto mb-3 opacity-50" />
                <p>No se encontraron items en la factura</p>
            </div>
        );
    }
    
    return (
        <div className={className}>
            {/* Header con estadísticas */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Package size={18} />
                    Items ({items.length})
                </h3>
                
                <div className="flex items-center gap-3 text-sm">
                    {mappedCount > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle size={14} />
                            {mappedCount}
                        </span>
                    )}
                    {unmappedCount > 0 && (
                        <span className="flex items-center gap-1 text-yellow-600">
                            <AlertTriangle size={14} />
                            {unmappedCount}
                        </span>
                    )}
                    {skippedCount > 0 && (
                        <span className="flex items-center gap-1 text-gray-400">
                            <MinusCircle size={14} />
                            {skippedCount}
                        </span>
                    )}
                </div>
            </div>
            
            {/* Warning si hay items sin mapear */}
            {unmappedCount > 0 && !isReadOnly && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                        <AlertTriangle size={14} className="inline mr-1" />
                        {unmappedCount} {unmappedCount === 1 ? 'producto requiere' : 'productos requieren'} vinculación manual.
                    </p>
                </div>
            )}
            
            {/* Lista de items */}
            <div className="space-y-2">
                {items.map((item, index) => (
                    <InvoiceItemRow
                        key={`${item.line_number}-${index}`}
                        item={item}
                        index={index}
                        onMapClick={onMapItem}
                        onSkipClick={onSkipItem}
                        isReadOnly={isReadOnly}
                    />
                ))}
            </div>
        </div>
    );
}
