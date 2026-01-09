'use client';

import { CheckCircle, AlertTriangle, MinusCircle, Search } from 'lucide-react';
import type { ParsedInvoiceItem } from '@/actions/invoice-parser-v2';

// ============================================================================
// TIPOS
// ============================================================================

interface InvoiceItemRowProps {
    item: ParsedInvoiceItem;
    index: number;
    onMapClick?: (item: ParsedInvoiceItem) => void;
    onSkipClick?: (item: ParsedInvoiceItem) => void;
    isReadOnly?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
    }).format(amount);
};

// ============================================================================
// COMPONENTE
// ============================================================================

export default function InvoiceItemRow({
    item,
    index,
    onMapClick,
    onSkipClick,
    isReadOnly = false,
}: InvoiceItemRowProps) {
    const getStatusIcon = () => {
        switch (item.mapping_status) {
            case 'MAPPED':
                return <CheckCircle size={18} className="text-green-500" />;
            case 'UNMAPPED':
                return <AlertTriangle size={18} className="text-yellow-500" />;
            case 'SKIPPED':
                return <MinusCircle size={18} className="text-gray-400" />;
            default:
                return <AlertTriangle size={18} className="text-yellow-500" />;
        }
    };
    
    const getRowStyle = () => {
        switch (item.mapping_status) {
            case 'MAPPED':
                return 'bg-green-50 border-green-200';
            case 'UNMAPPED':
                return 'bg-yellow-50 border-yellow-200';
            case 'SKIPPED':
                return 'bg-gray-50 border-gray-200 opacity-60';
            default:
                return 'bg-white border-gray-200';
        }
    };
    
    return (
        <div className={`p-3 rounded-lg border ${getRowStyle()} transition-colors`}>
            <div className="flex items-start gap-3">
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon()}
                </div>
                
                {/* Main Content */}
                <div className="flex-1 min-w-0">
                    {/* Description */}
                    <p className="font-medium text-gray-900 truncate" title={item.description}>
                        {item.description}
                    </p>
                    
                    {/* Details Row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                        {item.supplier_sku && (
                            <span className="flex items-center gap-1">
                                <span className="text-gray-400">SKU:</span>
                                <code className="bg-gray-100 px-1 rounded text-xs">
                                    {item.supplier_sku}
                                </code>
                            </span>
                        )}
                        <span>
                            <span className="text-gray-400">Cant:</span> {item.quantity}
                        </span>
                        <span>
                            <span className="text-gray-400">P.Unit:</span> {formatCurrency(item.unit_cost)}
                        </span>
                        <span className="font-medium text-gray-700">
                            {formatCurrency(item.total_cost)}
                        </span>
                    </div>
                    
                    {/* Mapped Product Info */}
                    {item.mapping_status === 'MAPPED' && item.mapped_product_name && (
                        <p className="mt-1 text-sm text-green-700 flex items-center gap-1">
                            <CheckCircle size={12} />
                            Vinculado a: <span className="font-medium">{item.mapped_product_name}</span>
                        </p>
                    )}
                    
                    {/* Skipped Message */}
                    {item.mapping_status === 'SKIPPED' && (
                        <p className="mt-1 text-sm text-gray-500 italic">
                            Item omitido
                        </p>
                    )}
                </div>
                
                {/* Actions */}
                {!isReadOnly && item.mapping_status === 'UNMAPPED' && (
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <button
                            onClick={() => onMapClick?.(item)}
                            className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors flex items-center gap-1"
                        >
                            <Search size={14} />
                            Mapear
                        </button>
                        <button
                            onClick={() => onSkipClick?.(item)}
                            className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:bg-gray-100 transition-colors"
                        >
                            Omitir
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
