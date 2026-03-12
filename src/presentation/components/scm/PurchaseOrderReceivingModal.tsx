import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle, Calendar, Package } from 'lucide-react';
import { PurchaseOrder } from '../../../domain/types';
import { toast } from 'sonner';
import { getHistoryItemDetailsSecure } from '@/actions/supply-v2';

interface PurchaseOrderReceivingModalProps {
    isOpen: boolean;
    order: PurchaseOrder | null;
    onReceive: (orderId: string, receivedItems: { sku: string; receivedQty: number; lotNumber?: string; expiryDate?: number }[]) => void;
    onFinalizeReview?: (orderId: string, reviewNotes?: string, receivedItems?: { sku: string; receivedQty: number; lotNumber?: string; expiryDate?: number }[]) => Promise<void> | void;
    mode?: 'RECEIVE' | 'VIEW' | 'REVIEW';
    onClose: () => void;
}

interface ItemReceptionState {
    sku: string;
    name: string;
    expectedQty: number;
    receivedQty: number;
    lotNumber: string;
    barcode?: string;
    expiryDate: string; // YYYY-MM-DD
}

function normalizeQty(item: Record<string, unknown>): number {
    const raw = item.quantity_ordered ?? item.quantity ?? 0;
    const normalized = Number(raw);
    return Number.isFinite(normalized) ? normalized : 0;
}

function resolveOrderItemRecords(order: PurchaseOrder | null): Record<string, unknown>[] {
    if (!order) return [];
    const source = order as unknown as Record<string, unknown>;
    const candidates: unknown[] = [
        source.items,
        source.order_items,
        source.line_items,
        source.items_detail,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
        }
    }

    return [];
}

function mapToReceptionState(item: Record<string, unknown>, mode: 'RECEIVE' | 'VIEW' | 'REVIEW'): ItemReceptionState | null {
    const sku = typeof item.sku === 'string' ? item.sku : '';
    if (!sku) return null;
    const expectedQty = normalizeQty(item);
    const name = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : 'Producto';
    const receivedRaw = item.quantity_received ?? item.received_qty ?? expectedQty;
    const receivedQty = Number.isFinite(Number(receivedRaw)) ? Number(receivedRaw) : expectedQty;
    const lotNumber = typeof item.lot_number === 'string' ? item.lot_number : '';
    const expiryDateRaw = item.expiry_date;
    const parsedExpiry = expiryDateRaw ? new Date(String(expiryDateRaw)) : null;
    const expiryDate = parsedExpiry && !Number.isNaN(parsedExpiry.getTime())
        ? parsedExpiry.toISOString().slice(0, 10)
        : '';
    const barcode = typeof item.barcode === 'string' ? item.barcode : (typeof item.gtin === 'string' ? item.gtin : undefined);

    return {
        sku,
        name,
        expectedQty,
        // En modo recepción se parte en 0 para soportar flujo "scan +1" continuo con pistola.
        receivedQty: mode === 'RECEIVE' ? 0 : receivedQty,
        lotNumber,
        barcode,
        expiryDate
    };
}

export const PurchaseOrderReceivingModal: React.FC<PurchaseOrderReceivingModalProps> = ({
    isOpen,
    order,
    onReceive,
    onFinalizeReview,
    mode = 'RECEIVE',
    onClose
}) => {
    const [items, setItems] = useState<ItemReceptionState[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [reviewNotes, setReviewNotes] = useState('');
    const [scanInput, setScanInput] = useState('');

    // --- Audio Feedback for Scanner ---
    const playScannerBeep = (type: 'success' | 'error') => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            if (type === 'success') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.1);
            } else {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, ctx.currentTime);
                osc.frequency.setValueAtTime(150, ctx.currentTime + 0.2);
                gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            }
        } catch (e) {
            console.error('AudioContext error:', e);
        }
    };

    const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && scanInput.trim()) {
            e.preventDefault();
            const code = scanInput.trim().toLowerCase();
            
            // Find item by SKU or Barcode
            const itemIndex = items.findIndex(item => 
                item.sku.toLowerCase() === code || 
                item.barcode?.toLowerCase() === code
            );

            if (itemIndex >= 0) {
                const item = items[itemIndex];
                if (item.receivedQty < item.expectedQty || mode !== 'RECEIVE') {
                    // Valid scan, increment quantity
                    const newItems = [...items];
                    newItems[itemIndex] = { 
                        ...item, 
                        receivedQty: Number(item.receivedQty) + 1 
                    };
                    setItems(newItems);
                    playScannerBeep('success');
                    toast.success(`+1 ${item.name}`, { duration: 1500 });
                } else {
                    playScannerBeep('error');
                    toast.warning(`Ya recepcionaste la cantidad esperada de ${item.name}`);
                }
            } else {
                // Item not in order
                playScannerBeep('error');
                toast.error(`El código ${code} no pertenece a esta orden.`);
            }
            
            setScanInput(''); // Clear for next scan
        }
    };

    useEffect(() => {
        if (!order) {
            setItems([]);
            setReviewNotes('');
            setIsLoadingItems(false);
            return;
        }

        setReviewNotes('');
        let isCancelled = false;
        const bootstrapItems = async () => {
            const payloadItems = resolveOrderItemRecords(order)
                .map((item) => mapToReceptionState(item, mode))
                .filter((item): item is ItemReceptionState => item !== null);

            if (payloadItems.length > 0) {
                if (!isCancelled) setItems(payloadItems);
                return;
            }

            setIsLoadingItems(true);
            try {
                const details = await getHistoryItemDetailsSecure(String(order.id), 'PO');
                const detailItems = (details.success && Array.isArray(details.data) ? details.data : [])
                    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
                    .map((item) => mapToReceptionState(item, mode))
                    .filter((item): item is ItemReceptionState => item !== null);

                if (!isCancelled) {
                    setItems(detailItems);
                }
            } catch {
                if (!isCancelled) {
                    setItems([]);
                }
            } finally {
                if (!isCancelled) setIsLoadingItems(false);
            }
        };

        void bootstrapItems();
        return () => {
            isCancelled = true;
        };
    }, [order, mode]);

    if (!isOpen || !order) return null;

    const handleItemChange = (index: number, field: keyof ItemReceptionState, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const handleSubmit = async () => {
        if (items.length === 0) {
            toast.warning('La orden no tiene ítems disponibles para recepcionar');
            return;
        }

        if (mode === 'RECEIVE') {
            // Validate
            const invalidItems = items.filter(i => i.receivedQty > 0 && (!i.lotNumber || !i.expiryDate));
            if (invalidItems.length > 0) {
                toast.warning('Por favor ingrese Lote y Vencimiento para todos los ítems recibidos');
                return;
            }
        }

        setIsSubmitting(true);
        try {
            if (mode === 'RECEIVE') {
                const formattedItems = items.map(i => ({
                    sku: i.sku,
                    receivedQty: Number(i.receivedQty),
                    lotNumber: i.lotNumber,
                    expiryDate: i.expiryDate ? new Date(i.expiryDate).getTime() : undefined
                }));

                await onReceive(order.id, formattedItems);
                // onReceive in parent handles store/action and toasts
                onClose();
                return;
            }

            if (mode === 'REVIEW') {
                if (!onFinalizeReview) {
                    toast.error('No se configuró la acción de cierre de revisión');
                    return;
                }
                const formattedItems = items.map(i => ({
                    sku: i.sku,
                    receivedQty: Number(i.receivedQty),
                    lotNumber: i.lotNumber,
                    expiryDate: i.expiryDate ? new Date(i.expiryDate).getTime() : undefined
                }));
                await onFinalizeReview(order.id, reviewNotes, formattedItems);
                onClose();
            }
        } catch (error) {
            console.error(error);
            toast.error(mode === 'REVIEW' ? 'Error al finalizar la revisión' : 'Error al procesar la recepción');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalExpected = items.reduce((sum, i) => sum + i.expectedQty, 0);
    const totalReceived = items.reduce((sum, i) => sum + Number(i.receivedQty || 0), 0);

    const isReadOnly = mode === 'VIEW' || mode === 'REVIEW';
    const modalTitle = mode === 'VIEW'
        ? `Detalle de Orden #${order.id.slice(0, 8)}`
        : mode === 'REVIEW'
            ? `Revisión Final #${order.id.slice(0, 8)}`
            : `Recepción de Orden #${order.id.slice(0, 8)}`;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-900 p-5 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Truck size={24} className="text-emerald-400" />
                            {modalTitle}
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">
                            Proveedor: {order.supplier_name || order.supplier_id || '-'} • Bodega Destino: {order.destination_location_id || order.location_id || '-'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition bg-slate-800 p-2 rounded-lg hover:bg-slate-700">✕</button>
                </div>

                {/* Scanner Interface */}
                {mode === 'RECEIVE' && (
                    <div className="bg-slate-50 border-b border-slate-200 p-4 shrink-0 flex items-center gap-3">
                        <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                                <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                                <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                                <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                                <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                                <line x1="7" y1="8" x2="7" y2="16"></line>
                                <line x1="12" y1="8" x2="12" y2="16"></line>
                                <line x1="17" y1="8" x2="17" y2="16"></line>
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Escanea el código de barras o SKU del producto aquí..."
                            className="flex-1 p-3 text-lg border-2 border-indigo-100 rounded-lg outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 font-mono shadow-sm"
                            value={scanInput}
                            onChange={(e) => setScanInput(e.target.value)}
                            onKeyDown={handleBarcodeScan}
                            autoFocus
                            disabled={isReadOnly}
                        />
                    </div>
                )}

                {/* Body */}
                <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                    <table className="w-full text-left bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                        <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold">
                            <tr>
                                <th className="p-4 w-1/3">Producto</th>
                                <th className="p-4 text-center">Esperado</th>
                                <th className="p-4 text-center w-24">Recibido</th>
                                <th className="p-4 w-32">Lote (Opcional)</th>
                                <th className="p-4 w-32">Vencimiento</th>
                                <th className="p-4 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoadingItems && (
                                <tr>
                                    <td colSpan={6} className="p-6 text-center text-sm text-slate-500">
                                        Cargando ítems de la orden...
                                    </td>
                                </tr>
                            )}
                            {!isLoadingItems && items.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-6 text-center text-sm text-slate-500">
                                        Esta orden no tiene ítems disponibles.
                                    </td>
                                </tr>
                            )}
                            {items.map((item, idx) => {
                                const isMismatch = item.receivedQty !== item.expectedQty;

                                return (
                                    <tr key={item.sku} className="hover:bg-slate-50 transition">
                                        <td className="p-4">
                                            <div className="font-bold text-slate-800">{item.name}</div>
                                            <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                                        </td>
                                        <td className="p-4 text-center font-medium text-slate-600">
                                            {item.expectedQty}
                                        </td>
                                        <td className="p-4">
                                            <input
                                                type="number"
                                                min="0"
                                                className={`w-full p-2 border rounded-lg font-bold text-center outline-none focus:ring-2 ${isMismatch ? 'border-amber-300 bg-amber-50 text-amber-700 focus:ring-amber-500' : 'border-slate-200 focus:ring-indigo-500'}`}
                                                value={item.receivedQty}
                                                onChange={(e) => handleItemChange(idx, 'receivedQty', Number(e.target.value))}
                                                disabled={isReadOnly}
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <Package size={16} className="text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Lote..."
                                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                                                    value={item.lotNumber}
                                                    onChange={(e) => handleItemChange(idx, 'lotNumber', e.target.value)}
                                                    disabled={isReadOnly}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={16} className="text-slate-400" />
                                                <input
                                                    type="date"
                                                    className="w-full p-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                                                    value={item.expiryDate}
                                                    onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                                                    disabled={isReadOnly}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            {item.receivedQty > 0 && (
                                                <CheckCircle size={20} className="text-emerald-500 mx-auto" />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Summary */}
                    <div className="mt-6 flex justify-end items-center gap-6 p-4 bg-white rounded-lg border border-slate-200">
                        <div className="text-right">
                            <p className="text-sm text-slate-500">Total Esperado</p>
                            <p className="text-xl font-bold text-slate-700">{totalExpected}</p>
                        </div>
                        <div className="h-10 w-px bg-slate-200"></div>
                        <div className="text-right">
                            <p className="text-sm text-slate-500">Total Recibido</p>
                            <p className={`text-xl font-bold ${totalReceived !== totalExpected ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {totalReceived}
                            </p>
                        </div>
                    </div>

                    {mode === 'REVIEW' && (
                        <div className="mt-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                                Notas de revisión / observaciones
                            </label>
                            <textarea
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder="Ej: Llegaron 2 cajas dañadas / recepción parcial conforme..."
                                className="w-full min-h-[88px] p-3 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition"
                    >
                        Cancelar
                    </button>
                    {mode !== 'VIEW' && (
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || isLoadingItems || totalReceived === 0 || items.length === 0}
                            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:shadow-none transition flex items-center gap-2"
                        >
                            {isSubmitting
                                ? 'Procesando...'
                                : mode === 'REVIEW'
                                    ? <><CheckCircle size={20} /> Verificar y Cerrar</>
                                    : <><CheckCircle size={20} /> Confirmar Recepción</>
                            }
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
