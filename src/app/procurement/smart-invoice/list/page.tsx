'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import RouteGuard from '@/components/auth/RouteGuard';
import { 
    ArrowLeft, Plus, RefreshCw, Search, Filter, 
    Calendar, Eye, CheckCircle, XCircle, RotateCw,
    FileText, Building2, DollarSign, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

// Components
import { InvoiceStatusBadge, AIConfidenceIndicator } from '@/components/invoice';

// Actions
import { 
    getPendingParsingsSecure, 
    approveInvoiceParsingSecure,
    rejectInvoiceParsingSecure,
    getInvoiceParsingSecure,
    type InvoiceParsing 
} from '@/actions/invoice-parser-v2';

// ============================================================================
// TIPOS
// ============================================================================

type StatusFilter = 'ALL' | 'PENDING' | 'VALIDATED' | 'MAPPING' | 'COMPLETED' | 'PARTIAL' | 'ERROR' | 'REJECTED';

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (amount: number | null) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
    }).format(amount);
};

const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString('es-CL');
    } catch {
        return dateStr;
    }
};

const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes} min`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days} días`;
    return formatDate(dateStr);
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function InvoiceListPage() {
    // Estados
    const [parsings, setParsings] = useState<InvoiceParsing[]>([]);
    const [filteredParsings, setFilteredParsings] = useState<InvoiceParsing[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Filtros
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    
    // Detalle
    const [selectedParsing, setSelectedParsing] = useState<any | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    
    // ========================================================================
    // CARGAR DATOS
    // ========================================================================
    
    const loadParsings = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            const result = await getPendingParsingsSecure();
            
            if (!result.success) {
                throw new Error(result.error || 'Error cargando facturas');
            }
            
            setParsings(result.data || []);
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    useEffect(() => {
        loadParsings();
    }, [loadParsings]);
    
    // ========================================================================
    // FILTRAR DATOS
    // ========================================================================
    
    useEffect(() => {
        let filtered = [...parsings];
        
        // Filtro por estado
        if (statusFilter !== 'ALL') {
            filtered = filtered.filter(p => p.status === statusFilter);
        }
        
        // Filtro por búsqueda
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                p.supplier_name?.toLowerCase().includes(term) ||
                p.supplier_rut?.toLowerCase().includes(term) ||
                p.invoice_number?.toLowerCase().includes(term)
            );
        }
        
        // Filtro por fecha
        if (dateFrom) {
            filtered = filtered.filter(p => p.created_at >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter(p => p.created_at <= dateTo + 'T23:59:59');
        }
        
        setFilteredParsings(filtered);
    }, [parsings, statusFilter, searchTerm, dateFrom, dateTo]);
    
    // ========================================================================
    // HANDLERS
    // ========================================================================
    
    const handleViewDetail = async (parsing: InvoiceParsing) => {
        setIsDetailOpen(true);
        setIsLoadingDetail(true);
        
        try {
            const result = await getInvoiceParsingSecure(parsing.id);
            if (result.success) {
                setSelectedParsing(result.data);
            } else {
                toast.error(result.error || 'Error cargando detalle');
            }
        } catch (err: any) {
            toast.error('Error cargando detalle');
        } finally {
            setIsLoadingDetail(false);
        }
    };
    
    const handleQuickApprove = async (parsing: InvoiceParsing) => {
        if (!confirm('¿Aprobar esta factura sin revisar los items?')) return;
        
        const loadingId = toast.loading('Aprobando...');
        
        try {
            const result = await approveInvoiceParsingSecure({
                parsingId: parsing.id,
                skipUnmapped: true,
                createAccountPayable: true,
            });
            
            if (result.success) {
                toast.success('Factura aprobada', { id: loadingId });
                loadParsings();
            } else {
                toast.error(result.error || 'Error aprobando', { id: loadingId });
            }
        } catch (err: any) {
            toast.error('Error aprobando factura', { id: loadingId });
        }
    };
    
    const handleQuickReject = async (parsing: InvoiceParsing) => {
        const reason = prompt('Motivo del rechazo (mínimo 5 caracteres):');
        if (!reason || reason.length < 5) {
            toast.error('Motivo muy corto');
            return;
        }
        
        const loadingId = toast.loading('Rechazando...');
        
        try {
            const result = await rejectInvoiceParsingSecure(parsing.id, reason);
            
            if (result.success) {
                toast.success('Factura rechazada', { id: loadingId });
                loadParsings();
            } else {
                toast.error(result.error || 'Error rechazando', { id: loadingId });
            }
        } catch (err: any) {
            toast.error('Error rechazando factura', { id: loadingId });
        }
    };
    
    // ========================================================================
    // RENDER
    // ========================================================================
    
    return (
        <RouteGuard allowedRoles={['ADMIN', 'QF']}>
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                    <div className="max-w-7xl mx-auto px-4 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Link 
                                    href="/procurement/smart-invoice" 
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <ArrowLeft size={20} />
                                </Link>
                                <div>
                                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                        <FileText className="text-purple-600" />
                                        Historial de Facturas
                                    </h1>
                                    <p className="text-sm text-gray-500">
                                        {filteredParsings.length} facturas encontradas
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={loadParsings}
                                    disabled={isLoading}
                                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                                    title="Actualizar"
                                >
                                    <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                                </button>
                                <Link
                                    href="/procurement/smart-invoice"
                                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                                >
                                    <Plus size={18} />
                                    <span className="hidden sm:inline">Nueva Factura</span>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Filters */}
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <div className="flex flex-col lg:flex-row gap-4">
                            {/* Search */}
                            <div className="flex-1">
                                <div className="relative">
                                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Buscar por proveedor, RUT o N° factura..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    />
                                </div>
                            </div>
                            
                            {/* Status Filter */}
                            <div className="flex items-center gap-2">
                                <Filter size={18} className="text-gray-400" />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                >
                                    <option value="ALL">Todos los estados</option>
                                    <option value="PENDING">Pendientes</option>
                                    <option value="VALIDATED">Validados</option>
                                    <option value="MAPPING">En mapeo</option>
                                    <option value="COMPLETED">Completados</option>
                                    <option value="PARTIAL">Parciales</option>
                                    <option value="ERROR">Con error</option>
                                    <option value="REJECTED">Rechazados</option>
                                </select>
                            </div>
                            
                            {/* Date Filters */}
                            <div className="flex items-center gap-2">
                                <Calendar size={18} className="text-gray-400" />
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                />
                                <span className="text-gray-400">-</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Table */}
                <div className="max-w-7xl mx-auto px-4 pb-8">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        {isLoading ? (
                            <div className="p-8 text-center">
                                <RefreshCw size={32} className="mx-auto text-gray-400 animate-spin mb-4" />
                                <p className="text-gray-500">Cargando facturas...</p>
                            </div>
                        ) : error ? (
                            <div className="p-8 text-center">
                                <XCircle size={32} className="mx-auto text-red-400 mb-4" />
                                <p className="text-red-600">{error}</p>
                                <button
                                    onClick={loadParsings}
                                    className="mt-4 text-purple-600 hover:text-purple-700"
                                >
                                    Reintentar
                                </button>
                            </div>
                        ) : filteredParsings.length === 0 ? (
                            <div className="p-8 text-center">
                                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                                <p className="text-gray-500">No hay facturas que mostrar</p>
                                <Link
                                    href="/procurement/smart-invoice"
                                    className="mt-4 inline-flex items-center gap-2 text-purple-600 hover:text-purple-700"
                                >
                                    <Plus size={18} />
                                    Procesar primera factura
                                </Link>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Proveedor
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                N° Factura
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Fecha
                                            </th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Total
                                            </th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Confianza
                                            </th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Items
                                            </th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Estado
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Procesado
                                            </th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Acciones
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {filteredParsings.map((parsing) => (
                                            <tr key={parsing.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-4">
                                                    <div>
                                                        <p className="font-medium text-gray-900 truncate max-w-[200px]" title={parsing.supplier_name || undefined}>
                                                            {parsing.supplier_name || '-'}
                                                        </p>
                                                        <p className="text-sm text-gray-500 font-mono">
                                                            {parsing.supplier_rut || '-'}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="font-mono text-sm">
                                                        {parsing.invoice_number || '-'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-sm text-gray-600">
                                                    {formatDate(parsing.issue_date)}
                                                </td>
                                                <td className="px-4 py-4 text-right font-medium">
                                                    {formatCurrency(parsing.total_amount)}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex justify-center">
                                                        <AIConfidenceIndicator 
                                                            score={parsing.confidence_score} 
                                                            size="sm"
                                                            showLabel={false}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-1 text-sm">
                                                        <span className="text-green-600">{parsing.mapped_items}</span>
                                                        <span className="text-gray-400">/</span>
                                                        <span>{parsing.total_items}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex justify-center">
                                                        <InvoiceStatusBadge status={parsing.status} size="sm" />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-sm text-gray-500">
                                                    {formatRelativeTime(parsing.created_at)}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => handleViewDetail(parsing)}
                                                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                                            title="Ver detalle"
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                        
                                                        {['PENDING', 'VALIDATED', 'MAPPING'].includes(parsing.status) && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleQuickApprove(parsing)}
                                                                    className="p-1.5 text-green-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                                                    title="Aprobar"
                                                                >
                                                                    <CheckCircle size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleQuickReject(parsing)}
                                                                    className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                    title="Rechazar"
                                                                >
                                                                    <XCircle size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                        
                                                        {parsing.status === 'ERROR' && (
                                                            <Link
                                                                href={`/procurement/smart-invoice?retry=${parsing.id}`}
                                                                className="p-1.5 text-purple-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                                                title="Reprocesar"
                                                            >
                                                                <RotateCw size={16} />
                                                            </Link>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Detail Sheet */}
                {isDetailOpen && (
                    <div className="fixed inset-0 z-50 flex justify-end">
                        <div 
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsDetailOpen(false)}
                        />
                        <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
                            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                                <h2 className="font-semibold text-gray-900">Detalle de Factura</h2>
                                <button
                                    onClick={() => setIsDetailOpen(false)}
                                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <XCircle size={20} />
                                </button>
                            </div>
                            
                            {isLoadingDetail ? (
                                <div className="p-8 text-center">
                                    <RefreshCw size={32} className="mx-auto text-gray-400 animate-spin" />
                                </div>
                            ) : selectedParsing ? (
                                <div className="p-4 space-y-4">
                                    {/* Status */}
                                    <div className="flex items-center justify-between">
                                        <InvoiceStatusBadge status={selectedParsing.status} />
                                        <AIConfidenceIndicator score={selectedParsing.confidence_score} />
                                    </div>
                                    
                                    {/* Proveedor */}
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h3 className="text-sm font-medium text-gray-500 flex items-center gap-2 mb-2">
                                            <Building2 size={16} />
                                            Proveedor
                                        </h3>
                                        <p className="font-medium text-gray-900">{selectedParsing.supplier_name || '-'}</p>
                                        <p className="text-sm text-gray-500 font-mono">{selectedParsing.supplier_rut || '-'}</p>
                                    </div>
                                    
                                    {/* Documento */}
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h3 className="text-sm font-medium text-gray-500 flex items-center gap-2 mb-2">
                                            <FileText size={16} />
                                            Documento
                                        </h3>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <span className="text-gray-400">Tipo:</span>
                                                <p className="font-medium">{selectedParsing.document_type}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">N°:</span>
                                                <p className="font-medium font-mono">{selectedParsing.invoice_number || '-'}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Emisión:</span>
                                                <p>{formatDate(selectedParsing.issue_date)}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Vencimiento:</span>
                                                <p>{formatDate(selectedParsing.due_date)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Totales */}
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h3 className="text-sm font-medium text-gray-500 flex items-center gap-2 mb-2">
                                            <DollarSign size={16} />
                                            Totales
                                        </h3>
                                        <div className="space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Neto</span>
                                                <span>{formatCurrency(selectedParsing.net_amount)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">IVA</span>
                                                <span>{formatCurrency(selectedParsing.tax_amount)}</span>
                                            </div>
                                            <div className="flex justify-between pt-2 border-t border-gray-300 font-semibold">
                                                <span>Total</span>
                                                <span>{formatCurrency(selectedParsing.total_amount)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* IA Info */}
                                    <div className="bg-purple-50 rounded-lg p-4">
                                        <h3 className="text-sm font-medium text-purple-700 flex items-center gap-2 mb-2">
                                            <Sparkles size={16} />
                                            Procesamiento IA
                                        </h3>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <span className="text-purple-400">Proveedor:</span>
                                                <p className="font-medium text-purple-900">{selectedParsing.ai_provider}</p>
                                            </div>
                                            <div>
                                                <span className="text-purple-400">Modelo:</span>
                                                <p className="font-medium text-purple-900">{selectedParsing.ai_model}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-purple-400">Tiempo:</span>
                                                <p className="font-medium text-purple-900">
                                                    {selectedParsing.processing_time_ms 
                                                        ? `${(selectedParsing.processing_time_ms / 1000).toFixed(1)}s` 
                                                        : '-'
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Items Summary */}
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h3 className="text-sm font-medium text-gray-500 mb-2">Items</h3>
                                        <div className="flex items-center gap-4">
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-gray-900">{selectedParsing.total_items}</p>
                                                <p className="text-xs text-gray-500">Total</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-green-600">{selectedParsing.mapped_items}</p>
                                                <p className="text-xs text-gray-500">Mapeados</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-yellow-600">{selectedParsing.unmapped_items}</p>
                                                <p className="text-xs text-gray-500">Sin mapear</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Error */}
                                    {selectedParsing.error_message && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                            <h3 className="text-sm font-medium text-red-700 mb-1">Error</h3>
                                            <p className="text-sm text-red-600">{selectedParsing.error_message}</p>
                                        </div>
                                    )}
                                    
                                    {/* Rejection */}
                                    {selectedParsing.rejection_reason && (
                                        <div className="bg-gray-100 rounded-lg p-4">
                                            <h3 className="text-sm font-medium text-gray-700 mb-1">Motivo de rechazo</h3>
                                            <p className="text-sm text-gray-600">{selectedParsing.rejection_reason}</p>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>
        </RouteGuard>
    );
}
