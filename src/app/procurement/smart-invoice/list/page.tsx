'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import RouteGuard from '@/components/auth/RouteGuard';
import {
    ArrowLeft, Plus, RefreshCw, Search, Filter,
    Calendar, Eye, CheckCircle, XCircle, RotateCw,
    FileText, Building2, DollarSign, Sparkles, ImageOff, Trash2, Edit,
    ChevronDown, Package, AlertCircle
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
    deleteInvoiceParsingSecure,
    type InvoiceParsing
} from '@/actions/invoice-parser-v2';
import { useLocationStore } from '@/presentation/store/useLocationStore';
import { Store } from 'lucide-react';
import ProductFormModal from '@/presentation/components/inventory/ProductFormModal';
import { getProductByIdSecure } from '@/actions/products-v2';

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
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filtros y Paginación
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1); // Reset to page 1 on new search
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Detalle
    const [selectedParsing, setSelectedParsing] = useState<any | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [showItemsDetail, setShowItemsDetail] = useState(false);

    // Approval Modal
    const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
    const [parsingToApprove, setParsingToApprove] = useState<InvoiceParsing | null>(null);
    const [targetLocationId, setTargetLocationId] = useState<string>('');
    const [isApproving, setIsApproving] = useState(false);

    // Edit Product State
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [isLoadingProduct, setIsLoadingProduct] = useState(false);

    // Store
    const { locations, fetchLocations } = useLocationStore();

    useEffect(() => {
        fetchLocations();
    }, [fetchLocations]);

    // ========================================================================
    // CARGAR DATOS (Servidor)
    // ========================================================================
    const loadParsings = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await getPendingParsingsSecure({
                page: currentPage,
                pageSize,
                searchTerm: debouncedSearch,
                status: statusFilter,
                dateFrom,
                dateTo
            });

            if (!result.success) {
                throw new Error(result.error || 'Error cargando facturas');
            }

            setParsings(result.data || []);
            setTotalCount(result.totalCount || 0);
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, debouncedSearch, statusFilter, dateFrom, dateTo]);

    useEffect(() => {
        loadParsings();
    }, [loadParsings]);

    const totalPages = Math.ceil(totalCount / pageSize);

    // ========================================================================
    // FILTRAR DATOS
    // ========================================================================

    // Eliminamos el filtrado en cliente, ya que ahora ocurre en el servidor
    // a través del efecto de carga de datos.
    const handleFilterChange = (updates: any) => {
        if (updates.statusFilter !== undefined) {
            setStatusFilter(updates.statusFilter);
            setCurrentPage(1);
        }
        if (updates.dateFrom !== undefined) {
            setDateFrom(updates.dateFrom);
            setCurrentPage(1);
        }
        if (updates.dateTo !== undefined) {
            setDateTo(updates.dateTo);
            setCurrentPage(1);
        }
    };

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const handleCloseDetail = () => {
        setIsDetailOpen(false);
        setSelectedParsing(null);
        setShowItemsDetail(false); // Reset items view
    };

    const handleEditProduct = async (productId: string) => {
        setIsLoadingProduct(true);
        try {
            const res = await getProductByIdSecure(productId);
            if (res.success) {
                setEditingProduct(res.data);
            } else {
                toast.error(res.error || 'Error al cargar producto');
            }
        } catch (err: any) {
            console.error(err);
            toast.error(`Error: ${err.message || 'Error desconocido al cargar producto'}`);
        } finally {
            setIsLoadingProduct(false);
        }
    };
    const fetchDetail = async (id: string) => {
        try {
            const result = await getInvoiceParsingSecure(id);
            if (result.success) {
                setSelectedParsing(result.data);
            }
        } catch (error) {
            console.error('Error refreshing details:', error);
        }
    };

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

    const handleQuickApprove = (parsing: InvoiceParsing) => {
        setParsingToApprove(parsing);
        // Default to parsing location if available in list, otherwise first location or empty
        setTargetLocationId(parsing.location_id || locations[0]?.id || '');
        setIsApproveModalOpen(true);
    };

    const handleConfirmApprove = async () => {
        if (!parsingToApprove || !targetLocationId) return;

        setIsApproving(true);
        const loadingId = toast.loading('Aprobando...');

        try {
            const result = await approveInvoiceParsingSecure({
                parsingId: parsingToApprove.id,
                skipUnmapped: true,
                createAccountPayable: true,
                destinationLocationId: targetLocationId,
            });

            if (result.success) {
                toast.success('Factura aprobada exitosamente', { id: loadingId });
                loadParsings();
                setIsApproveModalOpen(false);
                setParsingToApprove(null);
            } else {
                toast.error(result.error || 'Error aprobando', { id: loadingId });
            }
        } catch (err: any) {
            toast.error('Error aprobando factura', { id: loadingId });
        } finally {
            setIsApproving(false);
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

    const handleDelete = async (parsing: InvoiceParsing) => {
        if (!confirm(`¿Está seguro de eliminar esta factura? nº ${parsing.invoice_number || 'S/N'}`)) return;

        const loadingId = toast.loading('Eliminando...');

        try {
            const result = await deleteInvoiceParsingSecure(parsing.id);
            if (result.success) {
                toast.success('Registro eliminado', { id: loadingId });
                loadParsings();
            } else {
                toast.error(result.error || 'No se pudo eliminar', { id: loadingId });
            }
        } catch (err: any) {
            toast.error('Error eliminando registro', { id: loadingId });
        }
    };

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <RouteGuard allowedRoles={['ADMIN', 'QF', 'MANAGER', 'GERENTE_GENERAL', 'WAREHOUSE']}>
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
                                        {totalCount} facturas encontradas
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
                                        placeholder="Buscar por proveedor, RUT, N° factura o fecha..."
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
                        ) : parsings.length === 0 ? (
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
                                        {parsings.map((parsing) => (
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

                                                        {['PENDING', 'VALIDATED', 'MAPPING', 'REJECTED', 'PARTIAL'].includes(parsing.status) && (
                                                            <Link
                                                                href={`/procurement/smart-invoice?edit=${parsing.id}`}
                                                                className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                title="Editar / Completar"
                                                            >
                                                                <Edit size={16} />
                                                            </Link>
                                                        )}

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
                                                                    className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                                    title="Rechazar"
                                                                >
                                                                    <XCircle size={16} />
                                                                </button>
                                                            </>
                                                        )}

                                                        <button
                                                            onClick={() => handleDelete(parsing)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>

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

                        {/* Pagination Footer */}
                        {!isLoading && totalPages > 1 && (
                            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                                <div className="flex-1 flex justify-between sm:hidden">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Siguiente
                                    </button>
                                </div>
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm text-gray-700">
                                            Mostrando <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> a <span className="font-medium">{Math.min(currentPage * pageSize, totalCount)}</span> de{' '}
                                            <span className="font-medium">{totalCount}</span> resultados
                                        </p>
                                    </div>
                                    <div>
                                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                            <button
                                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                disabled={currentPage === 1}
                                                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                <ArrowLeft size={16} />
                                            </button>

                                            {/* Page numbers (simplified) */}
                                            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                                                const pageNum = i + 1;
                                                // TODO: Improved logic for many pages
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => setCurrentPage(pageNum)}
                                                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === pageNum
                                                            ? 'z-10 bg-purple-50 border-purple-500 text-purple-600'
                                                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            })}

                                            <button
                                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                                disabled={currentPage === totalPages}
                                                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                <ArrowLeft size={16} className="rotate-180" />
                                            </button>
                                        </nav>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Detail Sheet */}
                {isDetailOpen && (
                    <div className="fixed inset-0 z-50 flex justify-end">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={handleCloseDetail}
                        />
                        <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto">
                            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                                <h2 className="font-semibold text-gray-900">Detalle de Factura</h2>
                                <button
                                    onClick={handleCloseDetail}
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
                                    {/* Image Display */}
                                    {selectedParsing.original_file_base64 ? (
                                        <div className="relative w-full h-[600px] border rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={`data:${selectedParsing.original_file_type || 'image/jpeg'};base64,${selectedParsing.original_file_base64}`}
                                                alt="Documento Original"
                                                className="max-w-full max-h-full object-contain"
                                            />
                                        </div>
                                    ) : (
                                        <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center text-gray-500 min-h-[400px]">
                                            <ImageOff size={48} className="mb-2 opacity-50" />
                                            <p className="font-medium">Imagen no disponible</p>
                                            <p className="text-xs max-w-[200px]">El almacenamiento de imágenes para facturas históricas no está habilitado.</p>
                                        </div>
                                    )}

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

                                    {/* Items Summary - Expandable */}
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <button
                                            onClick={() => setShowItemsDetail(!showItemsDetail)}
                                            className="w-full flex items-center justify-between text-sm font-medium text-gray-700 mb-2 hover:text-gray-900"
                                        >
                                            <span className="flex items-center gap-2">
                                                <Package size={16} />
                                                Items ({selectedParsing.total_items})
                                            </span>
                                            <ChevronDown size={16} className={`transition-transform ${showItemsDetail ? 'rotate-180' : ''}`} />
                                        </button>

                                        {/* Quick Stats */}
                                        <div className="flex items-center gap-4 mb-3">
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

                                        {/* Expanded Items Detail */}
                                        {showItemsDetail && selectedParsing.parsed_items && (
                                            <div className="border-t border-gray-200 pt-3 mt-3 space-y-2 max-h-[300px] overflow-y-auto">
                                                {(Array.isArray(selectedParsing.parsed_items)
                                                    ? selectedParsing.parsed_items
                                                    : JSON.parse(selectedParsing.parsed_items || '[]')
                                                ).map((item: any, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        className={`p-2 rounded-lg border text-sm ${item.mapping_status === 'MAPPED'
                                                            ? 'bg-green-50 border-green-200'
                                                            : item.mapping_status === 'SKIPPED'
                                                                ? 'bg-gray-50 border-gray-200 opacity-60'
                                                                : 'bg-yellow-50 border-yellow-200'
                                                            }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-medium text-gray-900 truncate" title={item.description}>
                                                                    {item.description || item.mapped_product_name || 'Sin nombre'}
                                                                </p>
                                                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                                                    <span>Cant: {item.quantity}</span>
                                                                    <span>•</span>
                                                                    <span>{formatCurrency(item.unit_cost)}</span>
                                                                    {item.supplier_sku && (
                                                                        <>
                                                                            <span>•</span>
                                                                            <span className="font-mono">{item.supplier_sku}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-1 items-end ml-4">
                                                                <InvoiceStatusBadge status={item.mapping_status} />
                                                                {item.mapped_product_id && (
                                                                    <button
                                                                        onClick={() => handleEditProduct(item.mapped_product_id)}
                                                                        className="text-xs flex items-center gap-1 text-cyan-600 hover:text-cyan-800 transition-colors mt-1 hover:underline disabled:opacity-50"
                                                                        disabled={isLoadingProduct}
                                                                    >
                                                                        <Edit size={12} />
                                                                        {isLoadingProduct ? 'Cargando...' : 'Editar ficha de producto'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
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

                                    {/* Action Footer for Detail View */}
                                    <div className="pt-6 flex gap-2">
                                        {['PENDING', 'VALIDATED', 'MAPPING', 'REJECTED', 'PARTIAL'].includes(selectedParsing.status) && (
                                            <Link
                                                href={`/procurement/smart-invoice?edit=${selectedParsing.id}`}
                                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Edit size={18} />
                                                Editar Factura
                                            </Link>
                                        )}
                                        <button
                                            onClick={() => {
                                                handleDelete(selectedParsing);
                                                setIsDetailOpen(false);
                                            }}
                                            className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Trash2 size={18} />
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                {/* Approve Modal */}
                {isApproveModalOpen && parsingToApprove && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => !isApproving && setIsApproveModalOpen(false)}
                        />
                        {/* ... existing modal content ... */}
                        <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <CheckCircle className="text-green-600" size={24} />
                                Aprobar Factura
                            </h3>

                            <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Proveedor:</span>
                                    <span className="font-medium">{parsingToApprove.supplier_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Factura:</span>
                                    <span className="font-mono">{parsingToApprove.invoice_number}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Total:</span>
                                    <span className="font-medium">{formatCurrency(parsingToApprove.total_amount)}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Destino del Inventario (Sucursal/Bodega)
                                </label>
                                <div className="relative">
                                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <select
                                        value={targetLocationId}
                                        onChange={(e) => setTargetLocationId(e.target.value)}
                                        disabled={isApproving}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 appearance-none bg-white"
                                    >
                                        <option value="" disabled>Seleccionar sucursal...</option>
                                        {locations.map(loc => (
                                            <option key={loc.id} value={loc.id}>
                                                {loc.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <p className="text-xs text-gray-500">
                                    El stock de los {parsingToApprove.mapped_items} productos mapeados se cargará a esta ubicación.
                                    Si la sucursal tiene múltiples bodegas, se usará la predeterminada.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setIsApproveModalOpen(false)}
                                    disabled={isApproving}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmApprove}
                                    disabled={!targetLocationId || isApproving}
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {isApproving ? (
                                        <>
                                            <RefreshCw size={18} className="animate-spin" />
                                            Aprobando...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={18} />
                                            Confirmar Aprobación
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Product Edit Modal */}
                {editingProduct && (
                    <ProductFormModal
                        product={editingProduct}
                        onClose={() => setEditingProduct(null)}
                        onSuccess={() => {
                            setEditingProduct(null);
                            loadParsings(); // Refresh list to reflect potential name changes
                            if (selectedParsing) fetchDetail(selectedParsing.id); // Refresh detail
                            toast.success('Producto actualizado');
                        }}
                    />
                )}

            </div>
        </RouteGuard>
    );
}
