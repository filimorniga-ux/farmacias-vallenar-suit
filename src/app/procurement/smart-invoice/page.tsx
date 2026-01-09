'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import RouteGuard from '@/components/auth/RouteGuard';
import { 
    ArrowLeft, Sparkles, FileText, List, CheckCircle, 
    XCircle, AlertTriangle, Loader, HelpCircle, Settings
} from 'lucide-react';
import { toast } from 'sonner';

// Components
import {
    InvoiceUploader,
    InvoiceViewer,
    InvoiceValidationForm,
    InvoiceItemsList,
    ProductMappingDialog,
} from '@/components/invoice';

// Actions
import {
    parseInvoiceDocumentSecure,
    approveInvoiceParsingSecure,
    rejectInvoiceParsingSecure,
    type ParsedInvoice,
    type ParsedInvoiceItem,
} from '@/actions/invoice-parser-v2';
import { checkAIConfiguredSecure } from '@/actions/config-v2';

// ============================================================================
// TIPOS
// ============================================================================

type PageState = 'idle' | 'uploading' | 'processing' | 'validating' | 'mapping' | 'approving' | 'success' | 'error';

interface MappingEntry {
    supplierSku: string;
    productId: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const ERROR_MESSAGES: Record<string, string> = {
    'No autenticado': 'Su sesión ha expirado. Por favor, inicie sesión nuevamente.',
    'Configure su API Key': 'No hay API Key configurada. Vaya a Ajustes → IA.',
    'Límite mensual': 'Se alcanzó el límite mensual de procesamiento. Contacte al administrador.',
    'Archivo muy grande': 'El archivo excede el límite de 10MB. Comprima la imagen.',
    'INVALID_DOCUMENT': 'El documento no parece ser una factura chilena válida.',
};

const getErrorMessage = (error: string): string => {
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
        if (error.includes(key)) return message;
    }
    return error || 'Ocurrió un error inesperado. Intente nuevamente.';
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function SmartInvoicePage() {
    const router = useRouter();
    
    // Estados principales
    const [pageState, setPageState] = useState<PageState>('idle');
    const [parsingId, setParsingId] = useState<string | null>(null);
    const [parsedData, setParsedData] = useState<ParsedInvoice | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    
    // Estados de archivo
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [fileType, setFileType] = useState<'image' | 'pdf'>('image');
    const [fileName, setFileName] = useState<string | null>(null);
    
    // Estados de mapeo
    const [items, setItems] = useState<ParsedInvoiceItem[]>([]);
    const [mappings, setMappings] = useState<MappingEntry[]>([]);
    const [mappingItem, setMappingItem] = useState<ParsedInvoiceItem | null>(null);
    const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
    
    // Estado de rechazo
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    
    // ========================================================================
    // HANDLERS
    // ========================================================================
    
    // Manejar selección de archivo
    const handleFileSelected = useCallback(async (file: File, base64: string, type: 'image' | 'pdf') => {
        setError(null);
        setFileUrl(URL.createObjectURL(file));
        setFileType(type);
        setFileName(file.name);
        setPageState('processing');
        
        try {
            // Verificar si la IA está configurada
            const aiCheck = await checkAIConfiguredSecure();
            if (!aiCheck.configured) {
                throw new Error(aiCheck.error || 'Configure su API Key de IA primero');
            }
            
            // Obtener locationId del usuario (simulado, debería venir de la sesión)
            // En producción esto vendría del header x-user-location
            const locationId = '00000000-0000-0000-0000-000000000001'; // Placeholder
            
            // Llamar al parser
            const result = await parseInvoiceDocumentSecure({
                fileBase64: base64,
                fileType: type,
                fileName: file.name,
                locationId,
            });
            
            if (!result.success) {
                if (result.isDuplicate) {
                    throw new Error(`Esta factura ya fue procesada. ID: ${result.duplicateId}`);
                }
                throw new Error(result.error || 'Error procesando factura');
            }
            
            // Éxito
            setParsingId(result.parsingId || null);
            setParsedData(result.data || null);
            setWarnings(result.warnings || []);
            setItems(result.data?.items || []);
            setPageState('validating');
            
            toast.success('Factura procesada correctamente');
            
        } catch (err: any) {
            console.error('Parse error:', err);
            setError(getErrorMessage(err.message));
            setPageState('error');
            toast.error(getErrorMessage(err.message));
        }
    }, []);
    
    // Manejar mapeo de producto
    const handleMapItem = useCallback((item: ParsedInvoiceItem) => {
        setMappingItem(item);
        setIsMappingDialogOpen(true);
    }, []);
    
    // Manejar selección de producto en mapeo
    const handleProductSelected = useCallback((productId: string, productName: string) => {
        if (!mappingItem) return;
        
        // Actualizar items localmente
        setItems(prev => prev.map(item => {
            if (item.supplier_sku === mappingItem.supplier_sku && item.line_number === mappingItem.line_number) {
                return {
                    ...item,
                    mapped_product_id: productId,
                    mapped_product_name: productName,
                    mapping_status: 'MAPPED' as const,
                };
            }
            return item;
        }));
        
        // Agregar a mappings
        if (mappingItem.supplier_sku) {
            const sku = mappingItem.supplier_sku; // Capturar para type narrowing
            setMappings(prev => {
                const existing = prev.find(m => m.supplierSku === sku);
                if (existing) {
                    return prev.map(m => m.supplierSku === sku 
                        ? { ...m, productId } 
                        : m
                    );
                }
                return [...prev, { supplierSku: sku, productId }];
            });
        }
        
        setIsMappingDialogOpen(false);
        setMappingItem(null);
        toast.success(`Producto vinculado: ${productName}`);
    }, [mappingItem]);
    
    // Manejar omitir item
    const handleSkipItem = useCallback((item: ParsedInvoiceItem) => {
        setItems(prev => prev.map(i => {
            if (i.supplier_sku === item.supplier_sku && i.line_number === item.line_number) {
                return { ...i, mapping_status: 'SKIPPED' as const };
            }
            return i;
        }));
        toast.info('Item omitido');
    }, []);
    
    // Manejar aprobación
    const handleApprove = useCallback(async () => {
        if (!parsingId) return;
        
        setPageState('approving');
        const loadingId = toast.loading('Procesando aprobación...');
        
        try {
            const unmappedCount = items.filter(i => i.mapping_status === 'UNMAPPED' || i.mapping_status === 'PENDING').length;
            
            const result = await approveInvoiceParsingSecure({
                parsingId,
                mappings: mappings.length > 0 ? mappings : undefined,
                skipUnmapped: unmappedCount > 0,
                createAccountPayable: true,
            });
            
            if (!result.success) {
                throw new Error(result.error || 'Error aprobando factura');
            }
            
            setPageState('success');
            toast.success('Factura aprobada y procesada', { id: loadingId });
            
            // Mostrar resumen
            const summary = [];
            if (result.supplierCreated) summary.push('✓ Proveedor creado');
            if (result.accountPayableId) summary.push('✓ Cuenta por pagar creada');
            summary.push(`✓ ${result.mappedCount || 0} productos vinculados`);
            if (result.unmappedCount && result.unmappedCount > 0) {
                summary.push(`⚠ ${result.unmappedCount} items sin vincular`);
            }
            
            toast.info(summary.join('\n'), { duration: 5000 });
            
        } catch (err: any) {
            console.error('Approve error:', err);
            setPageState('validating');
            toast.error(err.message || 'Error aprobando factura', { id: loadingId });
        }
    }, [parsingId, items, mappings]);
    
    // Manejar rechazo
    const handleReject = useCallback(async () => {
        if (!parsingId || rejectReason.length < 5) {
            toast.error('Ingrese un motivo de rechazo (mínimo 5 caracteres)');
            return;
        }
        
        const loadingId = toast.loading('Rechazando factura...');
        
        try {
            const result = await rejectInvoiceParsingSecure(parsingId, rejectReason);
            
            if (!result.success) {
                throw new Error(result.error || 'Error rechazando factura');
            }
            
            toast.success('Factura rechazada', { id: loadingId });
            setIsRejectDialogOpen(false);
            handleReset();
            
        } catch (err: any) {
            toast.error(err.message || 'Error rechazando factura', { id: loadingId });
        }
    }, [parsingId, rejectReason]);
    
    // Resetear estado
    const handleReset = useCallback(() => {
        setPageState('idle');
        setParsingId(null);
        setParsedData(null);
        setWarnings([]);
        setError(null);
        setFileUrl(null);
        setFileName(null);
        setItems([]);
        setMappings([]);
        setRejectReason('');
    }, []);
    
    // ========================================================================
    // RENDER
    // ========================================================================
    
    const isProcessing = pageState === 'processing' || pageState === 'approving';
    const showResults = pageState === 'validating' || pageState === 'mapping' || pageState === 'success' || pageState === 'approving';
    
    return (
        <RouteGuard allowedRoles={['ADMIN', 'QF']}>
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                    <div className="max-w-7xl mx-auto px-4 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Link 
                                    href="/procurement" 
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <ArrowLeft size={20} />
                                </Link>
                                <div>
                                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                        <Sparkles className="text-purple-600" />
                                        Smart Invoice Parser
                                    </h1>
                                    <p className="text-sm text-gray-500">
                                        Procese facturas con inteligencia artificial
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <Link
                                    href="/procurement/smart-invoice/list"
                                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <List size={18} />
                                    <span className="hidden sm:inline">Historial</span>
                                </Link>
                                <Link
                                    href="/settings/ai"
                                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <Settings size={18} />
                                    <span className="hidden sm:inline">Configurar IA</span>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Main Content */}
                <div className="max-w-7xl mx-auto px-4 py-6">
                    {/* Success State */}
                    {pageState === 'success' && (
                        <div className="max-w-md mx-auto text-center py-12">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle size={32} className="text-green-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                ¡Factura Procesada!
                            </h2>
                            <p className="text-gray-600 mb-6">
                                La factura ha sido aprobada y se creó la cuenta por pagar correspondiente.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    onClick={handleReset}
                                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                                >
                                    Procesar otra factura
                                </button>
                                <Link
                                    href="/procurement/smart-invoice/list"
                                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Ver historial
                                </Link>
                            </div>
                        </div>
                    )}
                    
                    {/* Error State */}
                    {pageState === 'error' && (
                        <div className="max-w-md mx-auto text-center py-12">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <XCircle size={32} className="text-red-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                Error al Procesar
                            </h2>
                            <p className="text-gray-600 mb-2">{error}</p>
                            {error?.includes('API Key') && (
                                <Link
                                    href="/settings/ai"
                                    className="text-purple-600 hover:text-purple-700 text-sm"
                                >
                                    Ir a configuración de IA →
                                </Link>
                            )}
                            <div className="mt-6">
                                <button
                                    onClick={handleReset}
                                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                                >
                                    Intentar de nuevo
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* Upload / Processing / Validating States */}
                    {(pageState === 'idle' || pageState === 'processing' || showResults) && pageState !== 'success' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Panel - Document Viewer */}
                            <div className="space-y-4">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                                        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                            <FileText size={18} />
                                            Documento
                                        </h2>
                                    </div>
                                    
                                    {!fileUrl ? (
                                        <div className="p-4">
                                            <InvoiceUploader
                                                onFileSelected={handleFileSelected}
                                                isProcessing={isProcessing}
                                            />
                                        </div>
                                    ) : (
                                        <InvoiceViewer
                                            fileUrl={fileUrl}
                                            fileType={fileType}
                                            fileName={fileName || undefined}
                                            className="h-[500px]"
                                        />
                                    )}
                                </div>
                                
                                {/* Change file button */}
                                {fileUrl && !isProcessing && (
                                    <button
                                        onClick={handleReset}
                                        className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        Cambiar archivo
                                    </button>
                                )}
                            </div>
                            
                            {/* Right Panel - Data & Items */}
                            <div className="space-y-4">
                                {/* Processing Indicator */}
                                {pageState === 'processing' && (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                                        <Loader size={48} className="mx-auto text-purple-600 animate-spin mb-4" />
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                            Analizando con IA...
                                        </h3>
                                        <p className="text-gray-500">
                                            Esto puede tardar 10-30 segundos
                                        </p>
                                    </div>
                                )}
                                
                                {/* Idle State - Instructions */}
                                {pageState === 'idle' && (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                        <div className="text-center">
                                            <HelpCircle size={48} className="mx-auto text-gray-300 mb-4" />
                                            <h3 className="font-semibold text-gray-900 mb-2">
                                                ¿Cómo funciona?
                                            </h3>
                                            <ol className="text-left text-sm text-gray-600 space-y-2 mt-4">
                                                <li className="flex gap-2">
                                                    <span className="font-bold text-purple-600">1.</span>
                                                    Suba una foto o PDF de la factura
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="font-bold text-purple-600">2.</span>
                                                    La IA extraerá los datos automáticamente
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="font-bold text-purple-600">3.</span>
                                                    Vincule los productos que no se reconozcan
                                                </li>
                                                <li className="flex gap-2">
                                                    <span className="font-bold text-purple-600">4.</span>
                                                    Apruebe y se creará la cuenta por pagar
                                                </li>
                                            </ol>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Validation Form */}
                                {showResults && parsedData && (
                                    <>
                                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                            <InvoiceValidationForm
                                                data={parsedData}
                                                warnings={warnings}
                                                isEditable={true}
                                                onDataChange={(data) => setParsedData(data)}
                                            />
                                        </div>
                                        
                                        {/* Items List */}
                                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                                            <InvoiceItemsList
                                                items={items}
                                                onMapItem={handleMapItem}
                                                onSkipItem={handleSkipItem}
                                                isReadOnly={pageState === 'approving'}
                                            />
                                        </div>
                                        
                                        {/* Action Buttons */}
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <button
                                                onClick={() => setIsRejectDialogOpen(true)}
                                                disabled={isProcessing}
                                                className="flex-1 px-6 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                <XCircle size={18} />
                                                Rechazar
                                            </button>
                                            <button
                                                onClick={handleApprove}
                                                disabled={isProcessing}
                                                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {pageState === 'approving' ? (
                                                    <Loader size={18} className="animate-spin" />
                                                ) : (
                                                    <CheckCircle size={18} />
                                                )}
                                                Aprobar y Procesar
                                            </button>
                                        </div>
                                        
                                        {/* Unmapped warning */}
                                        {items.filter(i => i.mapping_status === 'UNMAPPED' || i.mapping_status === 'PENDING').length > 0 && (
                                            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                                                <AlertTriangle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                                                <p className="text-sm text-yellow-800">
                                                    Hay productos sin vincular. Al aprobar, estos quedarán registrados 
                                                    pero no se actualizará el inventario para ellos.
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Product Mapping Dialog */}
                <ProductMappingDialog
                    isOpen={isMappingDialogOpen}
                    onClose={() => {
                        setIsMappingDialogOpen(false);
                        setMappingItem(null);
                    }}
                    item={mappingItem}
                    onProductSelected={handleProductSelected}
                    onSkip={() => {
                        if (mappingItem) handleSkipItem(mappingItem);
                        setIsMappingDialogOpen(false);
                        setMappingItem(null);
                    }}
                />
                
                {/* Reject Dialog */}
                {isRejectDialogOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center">
                        <div 
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsRejectDialogOpen(false)}
                        />
                        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                Rechazar Factura
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Ingrese el motivo del rechazo (mínimo 5 caracteres):
                            </p>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Ej: Datos incorrectos, factura duplicada, etc."
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                            />
                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => setIsRejectDialogOpen(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleReject}
                                    disabled={rejectReason.length < 5}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Confirmar Rechazo
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </RouteGuard>
    );
}
