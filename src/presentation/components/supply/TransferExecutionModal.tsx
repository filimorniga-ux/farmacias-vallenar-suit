import React, { useState } from 'react';
import { ArrowRight, Package, X, Loader2, CheckCircle, AlertTriangle, MapPin } from 'lucide-react';
import { createPurchaseOrderSecure } from '@/actions/supply-v2';
import { toast } from 'sonner';

interface TransferItem {
    sku: string;
    product_name: string;
    quantity: number;
    source_location_id: string;
    source_location_name: string;
}

interface TransferExecutionModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: TransferItem[];
    targetLocationId: string;
    targetLocationName: string;
    targetWarehouseId?: string;
    userId?: string;
    onSuccess: () => void;
}

const TransferExecutionModal: React.FC<TransferExecutionModalProps> = ({
    isOpen,
    onClose,
    items,
    targetLocationId,
    targetLocationName,
    targetWarehouseId,
    userId,
    onSuccess
}) => {
    const [editableItems, setEditableItems] = useState<TransferItem[]>(items);
    const [reason, setReason] = useState('Traspaso sugerido por Motor MRP');
    const [isExecuting, setIsExecuting] = useState(false);

    // Update editable items when props change (re-opening modal with different selection)
    React.useEffect(() => {
        setEditableItems(items);
        setIsExecuting(false);
    }, [items, isOpen]);

    // Group items by source location
    const groupedBySource = editableItems.reduce((acc, item) => {
        const key = item.source_location_id;
        if (!acc[key]) {
            acc[key] = {
                location_name: item.source_location_name,
                location_id: item.source_location_id,
                items: []
            };
        }
        acc[key].items.push(item);
        return acc;
    }, {} as Record<string, { location_name: string; location_id: string; items: TransferItem[] }>);

    const handleExecute = async () => {
        if (!targetWarehouseId) {
            toast.error('No se encontró bodega destino para crear la solicitud');
            return;
        }

        if (!userId) {
            toast.error('Sesión inválida. Reingrese para crear solicitud');
            return;
        }

        setIsExecuting(true);

        try {
            const results: Array<{ success: boolean; source: string; orderId?: string; error?: string }> = [];

            for (const [sourceId, group] of Object.entries(groupedBySource)) {
                const validItems = group.items.filter(item => item.quantity > 0);
                if (validItems.length === 0) continue;

                const requestNotes =
                    `[TRANSFER_REQUEST] ${reason} | ORIGEN:${group.location_name}(${sourceId}) | DESTINO:${targetLocationName}(${targetLocationId})`;

                const result = await createPurchaseOrderSecure({
                    supplierId: 'TRANSFER',
                    targetWarehouseId,
                    status: 'DRAFT',
                    notes: requestNotes,
                    items: validItems.map((item) => ({
                        sku: item.sku,
                        name: item.product_name,
                        quantity: item.quantity,
                        cost: 0,
                        productId: null
                    }))
                }, userId);

                results.push({
                    success: result.success,
                    source: group.location_name,
                    orderId: result.orderId,
                    error: result.error
                });
            }

            const successes = results.filter(r => r.success);
            const failures = results.filter(r => !r.success);

            if (successes.length > 0) {
                toast.success(`✅ ${successes.length} solicitud(es) de traspaso creadas (estado: solicitada)`);
            }
            if (failures.length > 0) {
                failures.forEach(f => toast.error(`❌ Error desde ${f.source}: ${f.error}`));
            }

            if (successes.length > 0) {
                onSuccess();
                onClose();
            }
        } catch (err: any) {
            toast.error(`Error: ${err.message || 'Error inesperado'}`);
        } finally {
            setIsExecuting(false);
        }
    };

    const updateQuantity = (sku: string, newQty: number) => {
        setEditableItems(prev =>
            prev.map(item =>
                item.sku === sku ? { ...item, quantity: Math.max(1, newQty) } : item
            )
        );
    };

    const removeItem = (sku: string) => {
        setEditableItems(prev => prev.filter(item => item.sku !== sku));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-xl">
                                <Package size={24} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">Confirmar Traspaso</h2>
                                <p className="text-emerald-100 text-sm">{editableItems.length} producto(s) para solicitar traslado</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Transfer Groups by Source */}
                    {Object.entries(groupedBySource).map(([sourceId, group]) => (
                        <div key={sourceId} className="border border-slate-200 rounded-xl overflow-hidden">
                            {/* Source → Destination Header */}
                            <div className="bg-slate-50 p-3 flex items-center gap-3 border-b border-slate-200">
                                <div className="flex items-center gap-2 text-sm">
                                    <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg font-bold">
                                        <MapPin size={14} />
                                        {group.location_name}
                                    </div>
                                    <ArrowRight size={16} className="text-slate-400" />
                                    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg font-bold">
                                        <MapPin size={14} />
                                        {targetLocationName}
                                    </div>
                                </div>
                            </div>

                            {/* Items Table */}
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/50 text-xs text-slate-500 uppercase">
                                    <tr>
                                        <th className="p-2.5 text-left">Producto</th>
                                        <th className="p-2.5 text-center w-24">Cantidad</th>
                                        <th className="p-2.5 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {group.items.map((item) => (
                                        <tr key={item.sku} className="hover:bg-slate-50 transition">
                                            <td className="p-2.5">
                                                <div className="font-medium text-slate-800 line-clamp-1">{item.product_name}</div>
                                                <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>
                                            </td>
                                            <td className="p-2.5 text-center">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    className="w-16 p-1 border border-emerald-300 rounded-lg text-center font-bold text-emerald-700 bg-emerald-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                                    value={item.quantity}
                                                    onChange={(e) => updateQuantity(item.sku, parseInt(e.target.value) || 1)}
                                                />
                                            </td>
                                            <td className="p-2.5">
                                                <button
                                                    onClick={() => removeItem(item.sku)}
                                                    className="text-slate-300 hover:text-red-500 transition p-1"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}

                    {/* Reason */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Motivo de la solicitud</label>
                        <input
                            type="text"
                            className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ej: Reabastecimiento sugerido por MRP / quiebre de stock"
                        />
                    </div>

                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-800">
                        Se creará una solicitud en <span className="font-bold">Borradores</span>.
                        Luego el flujo es: <span className="font-bold">Aprobar</span> → <span className="font-bold">Marcar enviada</span> → <span className="font-bold">Recepcionar</span>.
                    </div>

                    {/* Warning */}
                    {editableItems.length === 0 && (
                        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-xl">
                            <AlertTriangle size={16} />
                            <span className="text-sm font-medium">No hay items para traspasar</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 p-4 flex items-center justify-between bg-slate-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl transition font-medium text-sm"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleExecute}
                        disabled={isExecuting || editableItems.length === 0}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200"
                    >
                        {isExecuting ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Creando...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={18} />
                                Crear Solicitud
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TransferExecutionModal;
