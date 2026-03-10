/**
 * WMSRecepcionTab - Tab de Recepción para el módulo WMS
 * 
 * Flujo: Listar envíos pendientes → Seleccionar → Escanear/Verificar productos → Confirmar recepción
 * Soporta escaneo continuo con cámara o lector USB/BT.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Truck, Package, CheckCircle, AlertTriangle, Clock, ChevronRight,
    Loader2, ShieldCheck, ArrowDown, ArrowUp, ArrowRight, FileText, X,
    Camera, ScanBarcode, CirclePlus, KeyRound, Lock, Inbox, RefreshCw, PackageCheck
} from 'lucide-react';
import { WMSReportPanel } from '../WMSReportPanel';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useLocationStore } from '@/presentation/store/useLocationStore';
import { getShipmentsSecure, processReceptionSecure } from '@/actions/wms-v2';
import { exportStockMovementsSecure } from '@/actions/inventory-export-v2';
import { validateSupervisorPin } from '@/actions/auth-v2';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import CameraScanner from '../../ui/CameraScanner';
import { useBarcodeScanner } from '@/presentation/hooks/useBarcodeScanner';

interface PendingShipment {
    id: string;
    type: string;
    status: string;
    direction?: 'INCOMING' | 'OUTGOING' | 'BOTH';
    origin_location_name?: string;
    destination_location_name?: string;
    created_by_name?: string;
    authorized_by_name?: string;
    carrier?: string;
    tracking_number?: string;
    items: Array<{
        id: string;
        sku: string;
        name: string;
        quantity: number;
        product_id?: string;
    }>;
    created_at: number;
    notes?: string;
}

interface ReceivedItem {
    itemId: string;
    sku: string;
    name: string;
    expectedQty: number;
    receivedQty: number;
    condition: 'GOOD' | 'DAMAGED';
    unexpected?: boolean;
    productId?: string;
}

interface WMSRecepcionTabProps {
    preselectedShipmentId?: string | null;
    onPreselectionHandled?: () => void;
}

interface ReportFilters {
    startDate: string;
    endDate: string;
    movementType?: string;
}

export const WMSRecepcionTab: React.FC<WMSRecepcionTabProps> = ({
    preselectedShipmentId,
    onPreselectionHandled
}) => {
    const queryClient = useQueryClient();
    const { currentLocationId } = usePharmaStore();
    const locationStoreCurrent = useLocationStore(s => s.currentLocation);
    const effectiveLocationId = currentLocationId || locationStoreCurrent?.id || '';

    // State
    const [pendingShipments, setPendingShipments] = useState<PendingShipment[]>([]);
    const [loadingShipments, setLoadingShipments] = useState(true);
    const [selectedShipment, setSelectedShipment] = useState<PendingShipment | null>(null);
    const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
    const [receptionNotes, setReceptionNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showReports, setShowReports] = useState(false);

    // ── Estado modal PIN ────────────────────────────────────────────
    const [pinOpen, setPinOpen] = useState(false);
    const [pinTarget, setPinTarget] = useState<{ itemId: string; newQty: number } | null>(null);
    const [pinValue, setPinValue] = useState('');
    const [pinError, setPinError] = useState('');
    const [pinLoading, setPinLoading] = useState(false);
    const [authorizedDiffs, setAuthorizedDiffs] = useState<Record<string, number>>({});
    const pinInputRef = useRef<HTMLInputElement>(null);

    // ── Estado escáner ──────────────────────────────────────────────
    const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
    const [scanCount, setScanCount] = useState(0);
    const [lastScanFlash, setLastScanFlash] = useState<string | null>(null);

    // Cargar envíos pendientes
    const fetchPending = useCallback(async () => {
        setLoadingShipments(true);
        try {
            const res = await getShipmentsSecure({
                locationId: effectiveLocationId || undefined,
                status: 'IN_TRANSIT',
                direction: 'INCOMING',
                page: 1,
                pageSize: 50,
            });

            if (res.success && res.data) {
                setPendingShipments(res.data.shipments as PendingShipment[]);
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', tab: 'Recepcion', action: 'fetchPending' },
                extra: { currentLocationId: effectiveLocationId }
            });
            toast.error('Error al cargar envíos');
        } finally {
            setLoadingShipments(false);
        }
    }, [effectiveLocationId]);

    useEffect(() => {
        fetchPending();
    }, [fetchPending]);

    // Seleccionar envío para recepcionar
    const handleSelectShipment = useCallback((shipment: PendingShipment) => {
        setSelectedShipment(shipment);
        // Preparar items para recepción
        setReceivedItems(
            shipment.items.map(item => ({
                itemId: item.id,
                sku: item.sku,
                name: item.name,
                expectedQty: item.quantity,
                receivedQty: 0,
                condition: 'GOOD' as const,
                productId: item.product_id,
            }))
        );
        setAuthorizedDiffs({});
        setScanCount(0);
    }, []);

    useEffect(() => {
        if (!preselectedShipmentId || loadingShipments || selectedShipment) return;

        const target = pendingShipments.find(item => item.id === preselectedShipmentId);
        if (target) {
            handleSelectShipment(target);
        } else {
            toast.warning('El envío seleccionado no está disponible para esta ubicación');
        }

        onPreselectionHandled?.();
    }, [
        preselectedShipmentId,
        pendingShipments,
        loadingShipments,
        selectedShipment,
        handleSelectShipment,
        onPreselectionHandled,
    ]);

    // Actualizar cantidad (edición libre). La autorización se valida al salir del input.
    const handleQtyChange = (itemId: string, value: string) => {
        const num = value === '' ? 0 : parseInt(value, 10);
        if (isNaN(num)) return;
        const safe = Math.max(0, num);
        setReceivedItems(prev =>
            prev.map(i => i.itemId === itemId ? { ...i, receivedQty: safe } : i)
        );
        // Si se modifica un ítem previamente autorizado, invalida esa autorización.
        setAuthorizedDiffs(prev => {
            if (!(itemId in prev)) return prev;
            const next = { ...prev };
            delete next[itemId];
            return next;
        });
    };

    // Al salir del input, si la cantidad difiere se solicita PIN.
    const handleQtyBlur = (itemId: string, value: string) => {
        const num = value === '' ? 0 : parseInt(value, 10);
        if (isNaN(num)) return;
        const safe = Math.max(0, num);

        const item = receivedItems.find(i => i.itemId === itemId);
        if (!item) return;
        if (safe === item.expectedQty) return;
        if (authorizedDiffs[itemId] === safe) return;

        setPinTarget({ itemId, newQty: safe });
        setPinValue('');
        setPinError('');
        setPinOpen(true);
        setTimeout(() => pinInputRef.current?.focus(), 100);
    };

    const closePinModal = (revert = true) => {
        if (revert && pinTarget) {
            const fallbackQty = authorizedDiffs[pinTarget.itemId];
            setReceivedItems(prev =>
                prev.map(i => {
                    if (i.itemId !== pinTarget.itemId) return i;
                    return {
                        ...i,
                        receivedQty: typeof fallbackQty === 'number' ? fallbackQty : i.expectedQty
                    };
                })
            );
        }
        setPinOpen(false);
        setPinTarget(null);
        setPinValue('');
        setPinError('');
    };

    // Confirmar PIN y aplicar cambio
    const confirmPin = async () => {
        if (!pinTarget || pinValue.length < 4) {
            setPinError('Ingrese un PIN válido (mín. 4 dígitos)');
            return;
        }
        setPinLoading(true);
        setPinError('');
        try {
            const res = await validateSupervisorPin(pinValue);
            if (res.success) {
                setReceivedItems(prev =>
                    prev.map(i => i.itemId === pinTarget.itemId ? { ...i, receivedQty: pinTarget.newQty } : i)
                );
                setAuthorizedDiffs(prev => ({ ...prev, [pinTarget.itemId]: pinTarget.newQty }));
                const authorizedBy = 'authorizedBy' in res ? res.authorizedBy?.name : undefined;
                toast.success(`Cantidad autorizada por ${authorizedBy || 'Supervisor'}`);
                closePinModal(false);
            } else {
                setPinError(res.error || 'PIN incorrecto');
                if ('vibrate' in navigator) navigator.vibrate([50, 30, 50]);
            }
        } catch {
            setPinError('Error de conexión');
        } finally {
            setPinLoading(false);
        }
    };

    // Cambiar condición
    const toggleCondition = (itemId: string) => {
        setReceivedItems(prev =>
            prev.map(item =>
                item.itemId === itemId
                    ? { ...item, condition: item.condition === 'GOOD' ? 'DAMAGED' : 'GOOD' }
                    : item
            )
        );
    };

    // Confirmar recepción
    const handleConfirmReception = async () => {
        if (!selectedShipment) return;

        const unauthorizedDiffs = receivedItems.filter(
            (item) => item.receivedQty !== item.expectedQty && authorizedDiffs[item.itemId] !== item.receivedQty
        );
        if (unauthorizedDiffs.length > 0) {
            const first = unauthorizedDiffs[0];
            setPinTarget({ itemId: first.itemId, newQty: first.receivedQty });
            setPinValue('');
            setPinError('Debe autorizar las diferencias antes de confirmar');
            setPinOpen(true);
            setTimeout(() => pinInputRef.current?.focus(), 100);
            toast.error('Hay diferencias de cantidad sin autorización');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await processReceptionSecure({
                shipmentId: selectedShipment.id,
                receivedItems: receivedItems.map(item => ({
                    itemId: item.itemId,
                    quantity: item.receivedQty,
                    condition: item.condition,
                })),
                notes: receptionNotes || undefined,
            });

            if (result.success) {
                toast.success('Recepción procesada exitosamente');
                setSelectedShipment(null);
                setReceivedItems([]);
                setReceptionNotes('');
                setAuthorizedDiffs({});
                await fetchPending();
                await queryClient.invalidateQueries({ queryKey: ['inventory'] });
            } else {
                toast.error(result.error || 'Error en recepción');
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', tab: 'Recepcion', action: 'confirmReception' },
                extra: { shipmentId: selectedShipment.id, itemCount: receivedItems.length }
            });
            toast.error('Error de conexión');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Volver a lista
    const handleBack = () => {
        setSelectedShipment(null);
        setReceivedItems([]);
        setReceptionNotes('');
        setScanCount(0);
        setLastScanFlash(null);
    };

    // ── Manejar escaneo de producto ──────────────────────────────────
    const handleScanReceived = useCallback((code: string) => {
        if (!selectedShipment) return;

        const normalizedCode = code.trim().toUpperCase();

        // Search by SKU or barcode in expected items
        const idx = receivedItems.findIndex(
            (item) => item.sku?.toUpperCase() === normalizedCode
        );

        if (idx >= 0) {
            // Found in expected items — increment +1
            setReceivedItems(prev => {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], receivedQty: updated[idx].receivedQty + 1 };
                return updated;
            });
            setScanCount(prev => prev + 1);
            setLastScanFlash(receivedItems[idx].sku);
            setTimeout(() => setLastScanFlash(null), 1200);
        } else {
            // Check if it's an already-added unexpected item
            const unexpectedIdx = receivedItems.findIndex(
                (item) => item.unexpected && item.sku?.toUpperCase() === normalizedCode
            );

            if (unexpectedIdx >= 0) {
                setReceivedItems(prev => {
                    const updated = [...prev];
                    updated[unexpectedIdx] = { ...updated[unexpectedIdx], receivedQty: updated[unexpectedIdx].receivedQty + 1 };
                    return updated;
                });
                setScanCount(prev => prev + 1);
            } else {
                // Search in store inventory by SKU
                const { inventory } = usePharmaStore.getState();
                const product = inventory.find(
                    (p) => p.sku?.toUpperCase() === normalizedCode
                );

                if (product) {
                    // Known product but not in this order — add as unexpected
                    const newItem: ReceivedItem = {
                        itemId: `unexpected-${Date.now()}`,
                        sku: product.sku,
                        name: product.name,
                        expectedQty: 0,
                        receivedQty: 1,
                        condition: 'GOOD',
                        unexpected: true,
                        productId: product.id,
                    };
                    setReceivedItems(prev => [...prev, newItem]);
                    setScanCount(prev => prev + 1);
                    toast.info(`📦 Producto inesperado agregado: ${product.name}`);
                } else {
                    // Completely unknown product
                    toast.warning(`⚠️ Código no reconocido: ${normalizedCode}`, {
                        description: 'No se encontró en el inventario ni en el pedido.',
                        duration: 4000,
                    });
                }
            }
            setLastScanFlash(normalizedCode);
            setTimeout(() => setLastScanFlash(null), 1200);
        }
    }, [selectedShipment, receivedItems]);

    // Hook for physical barcode scanners (USB/Bluetooth)
    // useBarcodeScanner doesn't support 'enabled', so we conditionally forward
    const barcodeScanProxy = useCallback((code: string) => {
        if (selectedShipment && !isCameraScannerOpen && !pinOpen) {
            handleScanReceived(code);
        }
    }, [selectedShipment, isCameraScannerOpen, pinOpen, handleScanReceived]);

    useBarcodeScanner({
        onScan: barcodeScanProxy,
    });

    const handleExportExcel = async (filters: ReportFilters) => {
        const res = await exportStockMovementsSecure({
            startDate: filters.startDate,
            endDate: filters.endDate,
            locationId: effectiveLocationId || undefined,
            movementType: filters.movementType,
            limit: 5000
        });

        if (res.success && res.data && res.filename) {
            const link = document.createElement('a');
            link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.data}`;
            link.download = res.filename;
            link.click();
        } else {
            throw new Error(res.error || 'Error al exportar');
        }
    };

    // Formatear fecha
    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleDateString('es-CL', {
            timeZone: 'America/Santiago',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    // Vista: Detalle de recepción
    if (selectedShipment) {
        const totalExpected = receivedItems.reduce((s, i) => s + i.expectedQty, 0);
        const totalReceived = receivedItems.reduce((s, i) => s + i.receivedQty, 0);
        const hasDifferences = receivedItems.some(i => i.receivedQty !== i.expectedQty || i.condition === 'DAMAGED');

        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={handleBack}
                        className="text-sm text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1"
                    >
                        ← Volver a lista
                    </button>
                    <span className="text-xs text-slate-400">
                        Envío #{selectedShipment.id.slice(0, 8)}
                    </span>
                </div>

                {/* Info del envío */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                            <Truck size={20} className="text-sky-600" />
                        </div>
                        <div>
                            <p className="font-bold text-slate-800">
                                Desde: {selectedShipment.origin_location_name || 'Origen'}
                            </p>
                            <p className="text-xs text-slate-500">
                                {selectedShipment.carrier && `${selectedShipment.carrier} • `}
                                {formatDate(selectedShipment.created_at)}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                {selectedShipment.created_by_name && (
                                    <span>Creó: <strong className="text-slate-700">{selectedShipment.created_by_name}</strong></span>
                                )}
                                {selectedShipment.authorized_by_name && (
                                    <span>Autorizó: <strong className="text-slate-700">{selectedShipment.authorized_by_name}</strong></span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Barra de Progreso + Controles Escaneo ─────── */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <ScanBarcode size={16} className="text-sky-500" />
                                Progreso: {totalReceived}/{totalExpected}
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Escanee o ajuste cantidades manualmente
                            </p>
                        </div>
                        <button
                            onClick={() => setIsCameraScannerOpen(true)}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-200 transition-all text-sm disabled:opacity-50"
                        >
                            <Camera size={16} />
                            Escanear
                        </button>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${totalReceived >= totalExpected
                                ? 'bg-emerald-500'
                                : totalReceived > 0
                                    ? 'bg-sky-500'
                                    : 'bg-slate-200'
                                }`}
                            style={{ width: `${Math.min(100, totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 0)}%` }}
                        />
                    </div>
                    {scanCount > 0 && (
                        <p className="text-xs text-slate-400 text-center">
                            {scanCount} escaneos realizados
                        </p>
                    )}
                </div>

                {/* Lista de items para recepcionar */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                        <h4 className="font-bold text-slate-700 text-sm">
                            Verificar Productos Recibidos
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {receivedItems.filter(i => i.unexpected).length > 0
                                ? `⚠️ ${receivedItems.filter(i => i.unexpected).length} producto(s) inesperado(s)`
                                : 'Ajuste cantidades o escanee productos'}
                        </p>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
                        {receivedItems.map((item) => {
                            // Semaphore logic
                            const isComplete = item.receivedQty === item.expectedQty && item.expectedQty > 0;
                            const isExcess = item.receivedQty > item.expectedQty;
                            const isMissing = item.receivedQty < item.expectedQty && !item.unexpected;
                            const isUnexpected = !!item.unexpected;
                            const isFlashing = lastScanFlash === item.sku;

                            let semaphoreColor = 'bg-slate-200'; // Not started
                            let semaphoreIcon = '⬜';
                            if (isUnexpected) { semaphoreColor = 'bg-blue-500'; semaphoreIcon = '🔵'; }
                            else if (isComplete) { semaphoreColor = 'bg-emerald-500'; semaphoreIcon = '🟢'; }
                            else if (isExcess) { semaphoreColor = 'bg-amber-400'; semaphoreIcon = '🟡'; }
                            else if (item.receivedQty > 0) { semaphoreColor = 'bg-orange-400'; semaphoreIcon = '🟠'; }

                            return (
                                <div
                                    key={item.itemId}
                                    className={`px-4 py-3 flex items-center gap-3 transition-colors duration-300 ${isFlashing ? 'bg-emerald-50' : ''
                                        } ${isUnexpected ? 'bg-blue-50/50' : ''}`}
                                >
                                    {/* Semaphore dot */}
                                    <div className={`w-3 h-3 rounded-full shrink-0 ${semaphoreColor} transition-all ${isFlashing ? 'scale-150' : ''}`}
                                        title={isUnexpected ? 'Inesperado' : isComplete ? 'Completo' : isExcess ? 'Excedente' : isMissing ? 'Faltante' : 'Sin escanear'}
                                    />

                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-800 text-sm truncate flex items-center gap-1.5">
                                            {item.name}
                                            {isUnexpected && (
                                                <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">INESPERADO</span>
                                            )}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-slate-500">{item.sku}</span>
                                            {!isUnexpected && (
                                                <span className="text-xs text-slate-400">
                                                    Esperado: <strong className="text-slate-600">{item.expectedQty}</strong>
                                                </span>
                                            )}
                                            {isExcess && (
                                                <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">
                                                    +{item.receivedQty - item.expectedQty} extra
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Input cantidad + candado PIN */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <input
                                            type="number"
                                            value={item.receivedQty}
                                            onChange={(e) => handleQtyChange(item.itemId, e.target.value)}
                                            onBlur={(e) => handleQtyBlur(item.itemId, e.target.value)}
                                            min={0}
                                            disabled={isSubmitting}
                                            className={`w-16 h-9 text-center font-bold rounded-lg border-2 outline-none transition-all text-sm bg-white text-slate-800
                                                ${isComplete
                                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                    : isExcess
                                                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                                                        : isUnexpected
                                                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                                                            : item.receivedQty > 0
                                                                ? 'border-orange-300 bg-orange-50 text-orange-700'
                                                                : 'border-slate-200'
                                                }
                                                focus:border-sky-400 focus:ring-2 focus:ring-sky-100
                                                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                                        />
                                        {!isUnexpected && (
                                            <span className="text-xs text-slate-400 font-mono w-4 text-center">/</span>
                                        )}
                                        {!isUnexpected && (
                                            <span className="text-xs font-bold text-slate-600 w-6 text-center">{item.expectedQty}</span>
                                        )}
                                        {item.receivedQty !== item.expectedQty && authorizedDiffs[item.itemId] === item.receivedQty && (
                                            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100 text-amber-600" title="Diferencia requirió PIN">
                                                <ShieldCheck size={14} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Toggle condición */}
                                    <button
                                        onClick={() => toggleCondition(item.itemId)}
                                        disabled={isSubmitting}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${item.condition === 'GOOD'
                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                                            }`}
                                    >
                                        {item.condition === 'GOOD' ? 'OK' : 'Dañado'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Resumen */}
                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                        <div className="text-sm text-slate-600">
                            Esperado: <strong>{totalExpected}</strong> → Recibido: <strong className={
                                totalReceived !== totalExpected ? 'text-amber-600' : 'text-emerald-600'
                            }>{totalReceived}</strong>
                        </div>
                        {hasDifferences && (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertTriangle size={12} />
                                Hay diferencias
                            </span>
                        )}
                    </div>
                </div>

                {/* Notas */}
                <textarea
                    value={receptionNotes}
                    onChange={(e) => setReceptionNotes(e.target.value)}
                    placeholder="Notas sobre la recepción (opcional)..."
                    rows={2}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium 
                             text-slate-800 placeholder:text-slate-400 resize-none
                             focus:border-sky-400 focus:ring-4 focus:ring-sky-100
                             disabled:bg-slate-50 outline-none transition-all"
                />

                {/* Confirmar — sticky en móvil */}
                <div className="wms-sticky-action mt-4 pt-3 -mx-4 px-4">
                    <button
                        onClick={handleConfirmReception}
                        disabled={isSubmitting}
                        className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold 
                             rounded-xl shadow-lg shadow-emerald-500/20
                             disabled:opacity-50 disabled:shadow-none
                             transition-all flex items-center justify-center gap-2 press-effect"
                    >
                        {isSubmitting ? (
                            <><Loader2 size={18} className="animate-spin" /> Procesando...</>
                        ) : (
                            <><CheckCircle size={18} /> Confirmar Recepción ({totalReceived}/{totalExpected})</>
                        )}
                    </button>
                </div>

                {/* ── Modal PIN de Gerente ──────────────────────── */}
                {pinOpen && (
                    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <KeyRound size={18} className="text-amber-500" />
                                    Autorización Requerida
                                </h3>
                                <button onClick={() => closePinModal(true)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                                    <X size={16} />
                                </button>
                            </div>
                            <p className="text-sm text-slate-500">
                                La cantidad recibida difiere de la esperada.
                                Ingrese el PIN de <strong className="text-slate-700">Gerente o Administrador</strong> para autorizar el cambio.
                            </p>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between text-sm">
                                <span className="text-amber-700">Cantidad esperada</span>
                                <strong className="text-amber-800">{pinTarget ? receivedItems.find(i => i.itemId === pinTarget.itemId)?.expectedQty : '—'}</strong>
                            </div>
                            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex justify-between text-sm">
                                <span className="text-sky-700">Nueva cantidad</span>
                                <strong className="text-sky-800">{pinTarget?.newQty}</strong>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
                                    <Lock size={12} /> PIN de Gerente/Admin
                                </label>
                                <input
                                    ref={pinInputRef}
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={8}
                                    value={pinValue}
                                    onChange={e => { setPinValue(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                                    onKeyDown={e => { if (e.key === 'Enter') confirmPin(); }}
                                    placeholder="••••"
                                    className={`w-full p-3 text-center text-2xl tracking-[0.5em] border-2 rounded-xl outline-none font-mono transition-all
                                        ${pinError ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-100'}`}
                                />
                                {pinError && (
                                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                                        <AlertTriangle size={12} /> {pinError}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => closePinModal(true)}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmPin}
                                    disabled={pinLoading || pinValue.length < 4}
                                    className="flex-[2] py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                                >
                                    {pinLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                    Autorizar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── CameraScanner overlay ──────────────────────── */}
                {isCameraScannerOpen && (
                    <CameraScanner
                        onScan={handleScanReceived}
                        onClose={() => setIsCameraScannerOpen(false)}
                        continuous
                        scanCount={scanCount}
                    />
                )}
            </div>
        );
    }

    // Vista: Lista de envíos pendientes
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                        <Inbox size={16} className="text-sky-500" />
                        Envíos Pendientes de Recibir
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {pendingShipments.length} envío{pendingShipments.length !== 1 ? 's' : ''} en tránsito
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchPending}
                        disabled={loadingShipments}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium 
                                 text-slate-600 transition-colors flex items-center gap-1.5"
                    >
                        <RefreshCw size={14} className={loadingShipments ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                    <button
                        onClick={() => setShowReports(true)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium 
                                 text-slate-600 transition-colors flex items-center gap-1.5"
                    >
                        <FileText size={14} />
                        Reportes
                    </button>
                </div>
            </div>

            {/* Lista */}
            {loadingShipments ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={28} className="animate-spin text-sky-400" />
                </div>
            ) : pendingShipments.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                    <PackageCheck size={44} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">Sin envíos pendientes</p>
                    <p className="text-sm text-slate-400 mt-1">
                        No hay envíos en tránsito hacia esta ubicación
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {pendingShipments.map((shipment) => (
                        <button
                            key={shipment.id}
                            onClick={() => handleSelectShipment(shipment)}
                            className="w-full text-left bg-white border border-slate-200 rounded-2xl p-4
                                     hover:border-sky-300 hover:shadow-md hover:shadow-sky-100/50
                                     transition-all duration-200 group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center shrink-0
                                              group-hover:bg-sky-200 transition-colors">
                                    <Package size={20} className="text-sky-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-800 text-sm">
                                        Desde: {shipment.origin_location_name || 'Origen'}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <Clock size={10} />
                                            {formatDate(shipment.created_at)}
                                        </span>
                                        <span>•</span>
                                        <span>{shipment.items.length} producto{shipment.items.length !== 1 ? 's' : ''}</span>
                                        {shipment.created_by_name && (
                                            <>
                                                <span>•</span>
                                                <span>Creó: {shipment.created_by_name}</span>
                                            </>
                                        )}
                                        {shipment.carrier && (
                                            <><span>•</span><span>{shipment.carrier}</span></>
                                        )}
                                    </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                    <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                                        En Tránsito
                                    </span>
                                    <ChevronRight size={16} className="text-slate-400 group-hover:text-sky-500 transition-colors" />
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Panel de reportes */}
            {showReports && (
                <WMSReportPanel
                    activeTab="RECEPCION"
                    locationId={effectiveLocationId}
                    onClose={() => setShowReports(false)}
                    onExportExcel={handleExportExcel}
                />
            )}
        </div>
    );
};

export default WMSRecepcionTab;
