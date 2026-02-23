import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle, Calendar, Package } from 'lucide-react';
import { PurchaseOrder } from '../../../domain/types';
import { toast } from 'sonner';
import { getHistoryItemDetailsSecure } from '@/actions/supply-v2';

interface PurchaseOrderReceivingModalProps {
    isOpen: boolean;
    order: PurchaseOrder | null;
    onReceive: (orderId: string, receivedItems: { sku: string; receivedQty: number; lotNumber?: string; expiryDate?: number }[]) => void;
    onClose: () => void;
}

interface ItemReceptionState {
    sku: string;
    name: string;
    expectedQty: number;
    receivedQty: number;
    lotNumber: string;
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

function mapToReceptionState(item: Record<string, unknown>): ItemReceptionState | null {
    const sku = typeof item.sku === 'string' ? item.sku : '';
    if (!sku) return null;
    const expectedQty = normalizeQty(item);
    const name = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : 'Producto';

    return {
        sku,
        name,
        expectedQty,
        receivedQty: expectedQty, // Pre-fill with expected
        lotNumber: '',
        expiryDate: ''
    };
}

export const PurchaseOrderReceivingModal: React.FC<PurchaseOrderReceivingModalProps> = ({ isOpen, order, onReceive, onClose }) => {
    const [items, setItems] = useState<ItemReceptionState[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingItems, setIsLoadingItems] = useState(false);

    useEffect(() => {
        if (!order) {
            setItems([]);
            return;
        }

        let isCancelled = false;
        const bootstrapItems = async () => {
            const payloadItems = resolveOrderItemRecords(order)
                .map(mapToReceptionState)
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
                    .map(mapToReceptionState)
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
    }, [order]);

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

        // Validate
        const invalidItems = items.filter(i => i.receivedQty > 0 && (!i.lotNumber || !i.expiryDate));
        if (invalidItems.length > 0) {
            toast.warning('Por favor ingrese Lote y Vencimiento para todos los ítems recibidos');
            return;
        }

        setIsSubmitting(true);
        try {
            const formattedItems = items.map(i => ({
                sku: i.sku,
                receivedQty: Number(i.receivedQty),
                lotNumber: i.lotNumber,
                expiryDate: i.expiryDate ? new Date(i.expiryDate).getTime() : undefined
            }));

            await onReceive(order.id, formattedItems);
            // onReceive in parent (SupplyChainPage) handles the store call and toasts
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Error al procesar la recepción');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalExpected = items.reduce((sum, i) => sum + i.expectedQty, 0);
    const totalReceived = items.reduce((sum, i) => sum + Number(i.receivedQty || 0), 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-900 p-5 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <Truck size={24} className="text-emerald-400" />
                            Recepción de Orden #{order.id.slice(0, 8)}
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">
                            Proveedor: {order.supplier_name || order.supplier_id || '-'} • Bodega Destino: {order.destination_location_id || order.location_id || '-'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition bg-slate-800 p-2 rounded-lg hover:bg-slate-700">✕</button>
                </div>

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
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || isLoadingItems || totalReceived === 0 || items.length === 0}
                        className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:shadow-none transition flex items-center gap-2"
                    >
                        {isSubmitting ? 'Procesando...' : (
                            <>
                                <CheckCircle size={20} /> Confirmar Recepción
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
