'use client';

import { useState, useEffect } from 'react';
import { 
    Building2, Calendar, FileText, DollarSign, 
    AlertTriangle, CheckCircle, Edit2, X, Save 
} from 'lucide-react';
import AIConfidenceIndicator from './AIConfidenceIndicator';
import type { ParsedInvoice } from '@/actions/invoice-parser-v2';

// ============================================================================
// TIPOS
// ============================================================================

interface InvoiceValidationFormProps {
    data: ParsedInvoice | null;
    warnings?: string[];
    isEditable?: boolean;
    onDataChange?: (data: ParsedInvoice) => void;
    className?: string;
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

const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString('es-CL');
    } catch {
        return dateStr;
    }
};

// ============================================================================
// COMPONENTE
// ============================================================================

export default function InvoiceValidationForm({
    data,
    warnings = [],
    isEditable = false,
    onDataChange,
    className = '',
}: InvoiceValidationFormProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<ParsedInvoice | null>(null);
    
    useEffect(() => {
        if (data) {
            setEditData({ ...data });
        }
    }, [data]);
    
    if (!data) {
        return (
            <div className={`p-8 text-center text-gray-500 ${className}`}>
                <FileText size={48} className="mx-auto mb-3 opacity-50" />
                <p>Procese una factura para ver los datos extraídos</p>
            </div>
        );
    }
    
    const handleSaveEdit = () => {
        if (editData && onDataChange) {
            onDataChange(editData);
        }
        setIsEditing(false);
    };
    
    const handleCancelEdit = () => {
        setEditData(data ? { ...data } : null);
        setIsEditing(false);
    };
    
    return (
        <div className={`space-y-6 ${className}`}>
            {/* Header con confianza */}
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <FileText size={18} />
                    Datos Extraídos
                </h3>
                <div className="flex items-center gap-3">
                    <AIConfidenceIndicator score={data.confidence} size="md" />
                    {isEditable && !isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Editar datos"
                        >
                            <Edit2 size={16} />
                        </button>
                    )}
                </div>
            </div>
            
            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="space-y-2">
                    {warnings.map((warning, idx) => (
                        <div 
                            key={idx}
                            className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2"
                        >
                            <AlertTriangle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-yellow-800">{warning}</p>
                        </div>
                    ))}
                </div>
            )}
            
            {/* Proveedor */}
            <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                    <Building2 size={16} />
                    Proveedor
                </h4>
                <div className="space-y-2">
                    <div>
                        <span className="text-xs text-gray-400">Razón Social</span>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editData?.supplier?.name || ''}
                                onChange={(e) => setEditData(prev => prev ? {
                                    ...prev,
                                    supplier: { ...prev.supplier, name: e.target.value }
                                } : null)}
                                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                        ) : (
                            <p className="font-medium text-gray-900">{data.supplier?.name || '-'}</p>
                        )}
                    </div>
                    <div>
                        <span className="text-xs text-gray-400">RUT</span>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editData?.supplier?.rut || ''}
                                onChange={(e) => setEditData(prev => prev ? {
                                    ...prev,
                                    supplier: { ...prev.supplier, rut: e.target.value }
                                } : null)}
                                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                        ) : (
                            <p className="font-mono text-gray-700">{data.supplier?.rut || '-'}</p>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Documento */}
            <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                    <Calendar size={16} />
                    Documento
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <span className="text-xs text-gray-400">Tipo</span>
                        <p className="font-medium text-gray-900">{data.document_type || 'FACTURA'}</p>
                    </div>
                    <div>
                        <span className="text-xs text-gray-400">N° Factura</span>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editData?.invoice_number || ''}
                                onChange={(e) => setEditData(prev => prev ? {
                                    ...prev,
                                    invoice_number: e.target.value
                                } : null)}
                                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                        ) : (
                            <p className="font-mono font-medium text-gray-900">{data.invoice_number || '-'}</p>
                        )}
                    </div>
                    <div>
                        <span className="text-xs text-gray-400">Fecha Emisión</span>
                        <p className="text-gray-700">{formatDate(data.dates?.issue_date)}</p>
                    </div>
                    <div>
                        <span className="text-xs text-gray-400">Fecha Vencimiento</span>
                        <p className="text-gray-700">{formatDate(data.dates?.due_date)}</p>
                    </div>
                </div>
            </div>
            
            {/* Totales */}
            <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                    <DollarSign size={16} />
                    Totales
                </h4>
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-gray-600">Neto</span>
                        <span className="font-medium">{formatCurrency(data.totals?.net || 0)}</span>
                    </div>
                    {data.totals?.discount > 0 && (
                        <div className="flex justify-between text-green-600">
                            <span>Descuento</span>
                            <span>-{formatCurrency(data.totals.discount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-gray-600">IVA (19%)</span>
                        <span className="font-medium">{formatCurrency(data.totals?.tax || 0)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-300">
                        <span className="font-semibold text-gray-900">Total</span>
                        <span className="font-bold text-lg text-gray-900">
                            {formatCurrency(data.totals?.total || 0)}
                        </span>
                    </div>
                </div>
            </div>
            
            {/* Notas */}
            {data.notes && (
                <div className="bg-blue-50 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-700 mb-2">Observaciones</h4>
                    <p className="text-sm text-blue-800">{data.notes}</p>
                </div>
            )}
            
            {/* Edit Actions */}
            {isEditing && (
                <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                    <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <X size={16} />
                        Cancelar
                    </button>
                    <button
                        onClick={handleSaveEdit}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                    >
                        <Save size={16} />
                        Guardar Cambios
                    </button>
                </div>
            )}
        </div>
    );
}
