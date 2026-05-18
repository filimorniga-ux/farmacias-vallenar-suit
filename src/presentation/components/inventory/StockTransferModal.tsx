import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, Package, Truck, AlertTriangle, Box } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
// V2: Funciones seguras
import { getWarehousesSecure } from '@/actions/locations-v2';
import { executeTransferSecure } from '@/actions/wms-v2';
import { InventoryBatch } from '@/domain/types';
import { toast } from 'sonner';

import { useQueryClient } from '@tanstack/react-query';
import { inventoryQueryKeys } from '@/presentation/lib/inventory-query-keys';

interface StockTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    inventoryItems: InventoryBatch[];
}

const StockTransferModal: React.FC<StockTransferModalProps> = ({ isOpen, onClose, inventoryItems }) => {
    const queryClient = useQueryClient();
    const { currentWarehouseId, currentLocationId, user } = usePharmaStore();

    // State
    const [targetWarehouses, setTargetWarehouses] = useState<{ id: string, name: string }[]>([]);
    const [selectedTargetWarehouse, setSelectedTargetWarehouse] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProductSku, setSelectedProductSku] = useState<string>('');
    const [selectedBatchId, setSelectedBatchId] = useState<string>('');
    const [quantity, setQuantity] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load available warehouses for target selection
    useEffect(() => {
        if (isOpen) {
            // Load warehouses for current location (or all? usually transfers are within company)
            // Assuming transfer between warehouses in SAME location or ANY location?
            // WMS supports ANY. Let's fetch all relevant warehouses.
            // For now, fetch ALL warehouses in the system if possible, or just for current location.
            // Context implies "Transferencia entre bodegas" usually same branch, but could be Inter-Branch (Shipment).
            // WMS `executeTransfer` handles immediate logical transfer.
            // `getWarehouses` likely requires locationId. 
            // If we want to transfer to ANY warehouse, we might need a broader fetch.
            // Let's assume transfers are primarily "Intra-Branch" (Bodega Central -> Farmacia) or explicit "Inter-Branch".
            // If Inter-Branch, usually requires Shipment/Dispatch logic (transit).
            // `executeTransfer` is atomic/instant. Best for Intra-Branch.
            // So we fetch warehouses for `currentLocationId`.
            if (currentLocationId) {
                // V2: getWarehousesSecure
                getWarehousesSecure().then((res) => {
                    if (res.success && res.data) {
                        // Exclude current origin warehouse
                        setTargetWarehouses(res.data.filter((w: any) => w.id !== currentWarehouseId));
                    }
                });
            }
        }
    }, [isOpen, currentLocationId, currentWarehouseId]);

    if (!isOpen) return null;

    // Filter products for search
    // We group batches by Product to show "Product A (Total Stock)" then let user pick Batch?
    // Or just search batches? "Product A - Lote X"
    // Let's list unique products first.
    const originInventory = inventoryItems.filter(item => {
        if (item.stock_actual <= 0) return false;
        if (!currentWarehouseId) return true;
        return (item.warehouse_id || item.location_id) === currentWarehouseId;
    });

    const uniqueProducts = Array.from(new Set(originInventory.map(i => i.sku))).map(sku => {
        return originInventory.find(i => i.sku === sku)!;
    }).filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Get batches for selected product
    const availableBatches = selectedProductSku
        ? originInventory.filter(i => i.sku === selectedProductSku)
        : [];

    const selectedBatch = availableBatches.find(b => b.id === selectedBatchId);

    const handleTransfer = async () => {
        if (!selectedBatchId || !selectedTargetWarehouse || !quantity) return;

        const qtyNum = parseInt(quantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            toast.error('Cantidad inválida');
            return;
        }

        if (selectedBatch && qtyNum > selectedBatch.stock_actual) {
            toast.error('Cantidad excede stock disponible del lote');
            return;
        }

        setIsSubmitting(true);
        try {
            if (!selectedBatch) {
                toast.error('Seleccione un lote válido');
                return;
            }

            const originWarehouseId = selectedBatch.warehouse_id || currentWarehouseId;
            if (!originWarehouseId) {
                toast.error('No se pudo resolver la bodega origen');
                return;
            }

            const result = await executeTransferSecure({
                originWarehouseId,
                targetWarehouseId: selectedTargetWarehouse,
                items: [{
                    productId: selectedBatch.product_id || selectedBatch.sku,
                    quantity: qtyNum,
                    lotId: selectedBatch.id
                }],
                userId: user?.id || 'SYSTEM'
            });

            if (!result.success) {
                toast.error(result.error || 'Error en transferencia');
                return;
            }

            toast.success('Traspaso exitoso');
            await queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.root });
            onClose();
            // Reset form
            setSelectedProductSku('');
            setSelectedBatchId('');
            setQuantity('');
            setSearchTerm('');
        } catch (error) {
            console.error(error);
            toast.error('Error en transferencia');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-2 [padding-bottom:max(env(safe-area-inset-bottom),0.5rem)] [padding-top:max(env(safe-area-inset-top),0.5rem)] sm:items-center sm:px-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="stock-transfer-modal-title"
                className="flex h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[90vh]"
            >

                {/* Header */}
                <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
                    <h3 id="stock-transfer-modal-title" className="flex min-w-0 items-center gap-2 text-lg font-bold sm:text-xl">
                        <ArrowLeftRight size={20} className="shrink-0 text-cyan-400" aria-hidden="true" />
                        Transferencia de Stock
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar transferencia de stock"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">

                    {/* Warehouses */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Origen</label>
                            <div className="mt-1 flex min-w-0 items-center gap-2 font-bold text-slate-800">
                                <Box size={16} className="shrink-0 text-indigo-600" aria-hidden="true" />
                                <span className="truncate">{currentWarehouseId}</span>
                                <span className="shrink-0 text-xs text-slate-400">(Actual)</span>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="stock-transfer-target-warehouse" className="text-xs font-semibold text-slate-500 uppercase block mb-1">Destino</label>
                            <select
                                id="stock-transfer-target-warehouse"
                                className="min-h-11 w-full rounded-lg border border-slate-300 p-2.5 text-base font-medium text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                                value={selectedTargetWarehouse}
                                onChange={e => setSelectedTargetWarehouse(e.target.value)}
                            >
                                <option value="">Seleccionar Bodega...</option>
                                {targetWarehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Step 1: Select Product */}
                    <div>
                        <label htmlFor="stock-transfer-product-search" className="text-sm font-bold text-slate-700 mb-1 block">1. Buscar Producto</label>
                        {!selectedProductSku ? (
                            <div className="space-y-2">
                                <input
                                    id="stock-transfer-product-search"
                                    type="text"
                                    placeholder="Nombre o SKU..."
                                    className="min-h-11 w-full rounded-lg border border-slate-300 p-3 text-base outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg shadow-sm bg-white">
                                        {uniqueProducts.length === 0 && (
                                            <div className="p-3 text-sm text-slate-400 text-center">No se encontraron productos</div>
                                        )}
                                        {uniqueProducts.map(prod => (
                                            <button
                                                type="button"
                                                key={prod.sku}
                                                className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-slate-100 p-2.5 text-left transition-colors last:border-0 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                onClick={() => {
                                                    setSelectedProductSku(prod.sku);
                                                    setSearchTerm(''); // Clear search
                                                }}
                                            >
                                                <span className="font-medium text-slate-800 truncate">{prod.name}</span>
                                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{prod.sku}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                                <div>
                                    <p className="font-bold text-indigo-900">{originInventory.find(i => i.sku === selectedProductSku)?.name}</p>
                                    <p className="text-xs text-indigo-600">{selectedProductSku}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedProductSku(''); setSelectedBatchId(''); }}
                                    className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold text-indigo-600 underline hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                >
                                    Cambiar
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Step 2: Select Batch & Quantity */}
                    {selectedProductSku && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div>
                                <label htmlFor="stock-transfer-batch" className="text-sm font-bold text-slate-700 mb-1 block">2. Seleccionar Lote (Origen)</label>
                                <select
                                    id="stock-transfer-batch"
                                    className="min-h-11 w-full rounded-lg border border-slate-300 p-2.5 text-base font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                                    value={selectedBatchId}
                                    onChange={e => setSelectedBatchId(e.target.value)}
                                >
                                    <option value="">Seleccionar Lote...</option>
                                    {availableBatches.map(batch => (
                                        <option key={batch.id} value={batch.id}>
                                            Lote: {batch.lot_number || 'S/L'} - Venc: {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A'} - Disp: {batch.stock_actual}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                                <div className="flex-1">
                                    <label htmlFor="stock-transfer-quantity" className="text-sm font-bold text-slate-700 mb-1 block">3. Cantidad a Transferir</label>
                                    <input
                                        id="stock-transfer-quantity"
                                        type="number"
                                        min="1"
                                        max={selectedBatch?.stock_actual || 9999}
                                        className="min-h-11 w-full rounded-lg border border-slate-300 p-2.5 text-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={quantity}
                                        onChange={e => setQuantity(e.target.value)}
                                        disabled={!selectedBatchId}
                                    />
                                </div>
                                {selectedBatch && (
                                    <div className="text-sm text-slate-500 mb-3 font-medium">
                                        Máx: {selectedBatch.stock_actual}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 bg-slate-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-11 flex-1 rounded-lg py-3 font-bold text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleTransfer}
                        disabled={!selectedTargetWarehouse || !selectedBatchId || !quantity || isSubmitting}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 py-3 font-bold text-white shadow-lg shadow-cyan-600/20 transition-colors hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:shadow-none"
                    >
                        {isSubmitting ? 'Procesando…' : (
                            <>
                                <Truck size={18} aria-hidden="true" /> Confirmar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StockTransferModal;
