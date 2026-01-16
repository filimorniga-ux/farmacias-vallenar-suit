'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { ConfirmAutoCreateModal, type NewProductData } from './ConfirmAutoCreateModal';
import ProductFormModal from '@/presentation/components/inventory/ProductFormModal';

// Actions
import {
    parseInvoiceDocumentSecure,
    approveInvoiceParsingSecure,
    rejectInvoiceParsingSecure,
    getInvoiceParsingSecure,
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

const reconstructInvoiceFromDb = (dbRow: any): ParsedInvoice => {
    return {
        confidence: dbRow.confidence_score,
        document_type: dbRow.document_type as any,
        invoice_number: dbRow.invoice_number,
        supplier: {
            rut: dbRow.supplier_rut,
            name: dbRow.supplier_name,
            address: dbRow.supplier_address,
            phone: dbRow.supplier_phone,
            email: dbRow.supplier_email,
            website: dbRow.supplier_website,
            activity: dbRow.supplier_activity,
            fantasy_name: dbRow.supplier_fantasy_name
        },
        dates: {
            issue_date: dbRow.issue_date,
            due_date: dbRow.due_date
        },
        totals: {
            net: Number(dbRow.net_amount),
            tax: Number(dbRow.tax_amount),
            total: Number(dbRow.total_amount),
            discount: Number(dbRow.discount_amount || 0)
        },
        items: dbRow.parsed_items || [],
        notes: dbRow.document_notes,
        message: 'Datos cargados desde registro existente'
    };
};

// ============================================================================
// COMPONENTE PRINCIPAL (EXPORTADO PARA APP.TSX)
// ============================================================================

function SmartInvoiceContent() {
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
    const [rejectReason, setRejectReason] = useState('');
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    // Estado de duplicados
    const [duplicateConflict, setDuplicateConflict] = useState<{
        duplicateId: string;
        fileBase64: string;
        fileType: 'image' | 'pdf';
        fileName: string;
    } | null>(null);

    // Estados de ubicación
    const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
    const [targetLocationId, setTargetLocationId] = useState<string>('');
    const [autoCreateProducts, setAutoCreateProducts] = useState(false);

    // Estado para modal de producto (Edición/Creación individual)
    const [showProductModal, setShowProductModal] = useState(false);
    const [productModalInitialValues, setProductModalInitialValues] = useState<any>(null);
    const [editingItem, setEditingItem] = useState<ParsedInvoiceItem | null>(null);

    const searchParams = useSearchParams();
    const editId = searchParams.get('edit');

    // Cargar para edición si viene ID en URL
    useEffect(() => {
        if (editId) {
            setPageState('processing');
            getInvoiceParsingSecure(editId).then(res => {
                if (res.success && res.data) {
                    const dbRow = res.data;
                    const reconstructed = reconstructInvoiceFromDb(dbRow);

                    setParsingId(dbRow.id);
                    setParsedData(reconstructed);
                    setItems(dbRow.parsed_items || []);

                    try {
                        const dbWarnings = dbRow.validation_warnings || [];
                        setWarnings(Array.isArray(dbWarnings) ? dbWarnings.map((w: any) => w.message || w) : []);
                    } catch (e) { }

                    setPageState('validating');
                    toast.info('Editando factura guardada');
                } else {
                    toast.error('No se pudo cargar la factura para editar');
                    setPageState('idle');
                }
            }).catch(err => {
                toast.error('Error cargando factura');
                setPageState('idle');
            });
        }
    }, [editId]);

    // Fetch locations on mount
    useEffect(() => {
        import('@/actions/get-locations-v2').then(({ getLocationsSecure }) => {
            getLocationsSecure().then(res => {
                if (res.success && res.locations) {
                    setLocations(res.locations);
                    // Default to first valid location if needed, or wait for user
                    if (res.locations.length > 0) setTargetLocationId(res.locations[0].id);
                }
            });
        });
    }, []);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    // Manejar selección de archivo
    const handleFileSelected = useCallback(async (file: File, base64: string, type: 'image' | 'pdf') => {
        setError(null);
        setDuplicateConflict(null); // Reset
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

            // Obtener locationId del usuario (simulado)
            const locationId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6';

            // Llamar al parser
            const result = await parseInvoiceDocumentSecure({
                fileBase64: base64,
                fileType: type,
                fileName: file.name,
                locationId,
            });

            if (!result.success) {
                if (result.isDuplicate && result.duplicateId) {
                    // DETECTADO DUPLICADO: Mostrar diálogo de resolución
                    setDuplicateConflict({
                        duplicateId: result.duplicateId,
                        fileBase64: base64,
                        fileType: type,
                        fileName: file.name
                    });
                    setPageState('idle'); // Volver a idle mientras decide
                    return;
                }
                throw new Error(result.error || 'Error procesando factura');
            }

            // Éxito
            processSuccessResult(result);

        } catch (err: any) {
            console.error('Parse error:', err);
            setError(getErrorMessage(err.message));
            setPageState('error');
            toast.error(getErrorMessage(err.message));
        }
    }, []);

    // Función auxiliar para procesar resultado exitoso
    const processSuccessResult = (result: any) => {
        setParsingId(result.parsingId || null);
        setParsedData(result.data || null);
        setWarnings(result.warnings || []);
        setItems(result.data?.items || []);
        setPageState('validating');
        toast.success('Factura procesada correctamente');
    };

    // Resolver Conflicto de Duplicados
    const handleResolveDuplicate = async (action: 'load' | 'reprocess') => {
        if (!duplicateConflict) return;
        setPageState('processing');

        try {
            if (action === 'load') {
                toast.info('Cargando datos previos...');
                const existing = await getInvoiceParsingSecure(duplicateConflict.duplicateId);

                if (existing.success && existing.data) {
                    const dbRow = existing.data;
                    const reconstructedData = reconstructInvoiceFromDb(dbRow);

                    setParsingId(dbRow.id);
                    setParsedData(reconstructedData);
                    setItems(dbRow.parsed_items || []);

                    try {
                        const dbWarnings = dbRow.validation_warnings || [];
                        setWarnings(Array.isArray(dbWarnings) ? dbWarnings.map((w: any) => w.message || w) : []);
                    } catch (e) { }

                    if (['PENDING', 'VALIDATED'].includes(dbRow.status)) {
                        setPageState('validating');
                    } else if (dbRow.status === 'MAPPING') {
                        setPageState('mapping');
                    } else {
                        setPageState('validating');
                        toast.info('Esta factura ya estaba completada.');
                    }
                }
            } else {
                // REPROCESS
                toast.info('Reprocesando con IA...');
                const locationId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6';

                const result = await parseInvoiceDocumentSecure({
                    fileBase64: duplicateConflict.fileBase64,
                    fileType: duplicateConflict.fileType,
                    fileName: duplicateConflict.fileName,
                    locationId,
                    allowDuplicate: true // FORCE REPROCESS
                });

                if (!result.success) throw new Error(result.error);
                processSuccessResult(result);
            }
        } catch (err: any) {
            console.error('Resolve error:', err);
            setError(getErrorMessage(err.message));
            setPageState('error');
        } finally {
            setDuplicateConflict(null);
        }
    };

    /* ... Existing code ... */

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

    // Manejar cambios manuales en items (Lote/Vencimiento)
    const handleItemChange = useCallback((originalItem: ParsedInvoiceItem, newItem: ParsedInvoiceItem) => {
        setItems(prev => prev.map(i => {
            if (i.line_number === originalItem.line_number) {
                return newItem;
            }
            return i;
        }));
    }, []);

    // Manejar click en "Crear/Editar" desde la lista
    const handleEditProduct = useCallback((item: ParsedInvoiceItem) => {
        setEditingItem(item);
        setProductModalInitialValues({
            name: item.description,
            sku: item.supplier_sku || '',
            cost: item.unit_cost,
            price: Math.round(item.unit_cost * 1.4),
            units_per_box: item.units_per_package || 1,
            dci: item.active_principle || '',
            barcode: '', // Unknown from invoice usually
        });
        setShowProductModal(true);
    }, []);

    // Callback al crear producto exitosamente
    const handleProductSuccess = useCallback((newProductId: string, productData: any) => {
        if (!editingItem) return;

        // Auto-mapear el item
        handleProductSelected(newProductId, productData.name);

        // Cerrar modal
        setShowProductModal(false);
        setEditingItem(null);
    }, [editingItem, handleProductSelected]);

    // Estado para modal de confirmación de creación
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);

    // Manejar aprobación (Paso 1: Validar si requiere confirmación)
    const handleApproveClick = useCallback(async () => {
        if (!parsingId) return;

        const unmappedCount = items.filter(i => i.mapping_status === 'UNMAPPED' || i.mapping_status === 'PENDING').length;

        // Si hay items sin mapear y está activa la opción de crear, abrir modal confirmación
        if (unmappedCount > 0 && autoCreateProducts) {
            setConfirmModalOpen(true);
            return;
        }

        // Si no, proceder directamente
        await executeApproval();
    }, [parsingId, items, mappings, autoCreateProducts, targetLocationId]);

    // Ejecutar aprobación final
    const executeApproval = async (
        newProductsData?: NewProductData[],
        extraMappings?: any[],
        supplierData?: any
    ) => {
        if (!parsingId) return;
        setPageState('approving');
        const loadingId = toast.loading('Procesando aprobación...');

        try {
            const unmappedCount = items.filter(i => i.mapping_status === 'UNMAPPED' || i.mapping_status === 'PENDING').length;

            // Combinar mapeos existentes con los nuevos del modal
            const allMappings = [...mappings, ...(extraMappings || [])];

            const result = await approveInvoiceParsingSecure({
                parsingId,
                mappings: allMappings.length > 0 ? allMappings : undefined,
                itemsData: items.map(i => ({
                    line_number: i.line_number,
                    lot_number: i.lot_number,
                    expiry_date: i.expiry_date
                })),
                skipUnmapped: unmappedCount > 0 && !autoCreateProducts && (!extraMappings || extraMappings.length === 0),
                createAccountPayable: true,
                destinationLocationId: targetLocationId || undefined,
                createMissingProducts: autoCreateProducts || (newProductsData && newProductsData.length > 0),
                newProductsData: newProductsData,
                supplierData: supplierData
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
            if (result.stockCreated) summary.push(`📦 ${result.stockCreated} movimientos de stock generados`);

            toast.info(summary.join('\n'), { duration: 5000 });
            setConfirmModalOpen(false);

        } catch (err: any) {
            console.error('Approve error:', err);
            setPageState('validating');
            toast.error(err.message || 'Error aprobando factura', { id: loadingId });
        }
    };



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
        setDuplicateConflict(null);
    }, []);

    // ========================================================================
    // RENDER
    // ========================================================================

    const isProcessing = pageState === 'processing' || pageState === 'approving';
    const showResults = pageState === 'validating' || pageState === 'mapping' || pageState === 'success' || pageState === 'approving';

    return (
        <RouteGuard allowedRoles={['ADMIN', 'QF', 'MANAGER', 'WAREHOUSE', 'GERENTE_GENERAL']}>
            <div className="min-h-screen bg-gray-50 relative">
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
                                    href="/settings"
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
                                    href="/settings"
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
                    {(pageState === 'idle' || pageState === 'processing' || showResults) && pageState !== 'success' && !duplicateConflict && (
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
                                                onItemChange={handleItemChange}
                                                onEditItem={handleEditProduct}
                                                isReadOnly={pageState === 'approving'}
                                            />
                                        </div>

                                        {/* Action Buttons */}
                                        {/* Location Selector */}
                                        {locations.length > 0 && (
                                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
                                                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                                    <List size={16} />
                                                    Bodega de Destino para Stock
                                                </label>
                                                <select
                                                    value={targetLocationId}
                                                    onChange={(e) => setTargetLocationId(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                                                >
                                                    {locations.map(loc => (
                                                        <option key={loc.id} value={loc.id}>
                                                            {loc.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                    <CheckCircle size={12} className="text-green-500" />
                                                    El stock inicial se cargará en esta ubicación.
                                                </p>
                                            </div>
                                        )}

                                        {/* Auto-Creation Checkbox */}
                                        {items.some(i => i.mapping_status !== 'MAPPED') && (
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-3">
                                                <input
                                                    type="checkbox"
                                                    id="autoCreate"
                                                    checked={autoCreateProducts}
                                                    onChange={(e) => setAutoCreateProducts(e.target.checked)}
                                                    className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                                                />
                                                <label htmlFor="autoCreate" className="text-sm">
                                                    <span className="font-semibold text-blue-900 block">
                                                        Crear automáticamente productos no vinculados
                                                    </span>
                                                    <span className="text-blue-700 block mt-0.5">
                                                        Si activas esto, la IA creará una ficha de producto básica para los items desconocidos y les cargará stock inmediatamente.
                                                    </span>
                                                </label>
                                            </div>
                                        )}

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
                                                onClick={handleApproveClick}
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

                {/* Duplicate Conflict Resolution Modal */}
                {duplicateConflict && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in-95">
                            <div className="flex items-center gap-3 mb-4 text-blue-600">
                                <Sparkles size={28} />
                                <h3 className="text-xl font-bold text-gray-900">Factura Existente</h3>
                            </div>

                            <p className="text-gray-600 mb-6 text-base">
                                Este documento <strong>ya fue procesado anteriormente</strong>. El sistema ha detectado una copia exacta en la base de datos.
                            </p>

                            <div className="grid gap-3">
                                <button
                                    onClick={() => handleResolveDuplicate('load')}
                                    className="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-all group"
                                >
                                    <div className="flex flex-col items-start">
                                        <span className="font-semibold text-gray-900">Ver datos existentes</span>
                                        <span className="text-sm text-gray-500">Cargar los datos procesados anteriormente</span>
                                    </div>
                                    <CheckCircle size={20} className="text-gray-400 group-hover:text-green-600 transition-colors" />
                                </button>

                                <button
                                    onClick={() => handleResolveDuplicate('reprocess')}
                                    className="flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all group"
                                >
                                    <div className="flex flex-col items-start">
                                        <span className="font-semibold text-blue-900">Reprocesar con IA</span>
                                        <span className="text-sm text-blue-600/80">Analizar nuevamente para mejorar los datos</span>
                                    </div>
                                    <Sparkles size={20} className="text-blue-400 group-hover:text-blue-600 transition-colors" />
                                </button>
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => setDuplicateConflict(null)}
                                    className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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

                <ConfirmAutoCreateModal
                    isOpen={confirmModalOpen}
                    onClose={() => setConfirmModalOpen(false)}
                    onConfirm={executeApproval}
                    items={items}
                    supplier={parsedData ? {
                        rut: parsedData.supplier?.rut,
                        name: parsedData.supplier?.name,
                        address: parsedData.supplier?.address,
                        phone: parsedData.supplier?.phone,
                        email: parsedData.supplier?.email,
                        website: parsedData.supplier?.website,
                        activity: parsedData.supplier?.activity,
                        fantasy_name: parsedData.supplier?.fantasy_name,
                        is_new: parsedData.supplier?.is_new
                    } : null}
                />
            </div>
        </RouteGuard >
    );
}

export default function SmartInvoicePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader size={48} className="text-purple-600 animate-spin" />
            </div>
        }>
            <SmartInvoiceContent />
        </Suspense>
    );
}
