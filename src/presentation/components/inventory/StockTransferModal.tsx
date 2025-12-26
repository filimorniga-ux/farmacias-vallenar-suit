import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, Package, Truck, AlertTriangle, Box } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
// V2: Funciones seguras
import { getWarehousesSecure } from '@/actions/locations-v2';
import { InventoryBatch } from '@/domain/types';
import { toast } from 'sonner';

interface StockTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const StockTransferModal: React.FC<StockTransferModalProps> = ({ isOpen, onClose }) => {
    const { inventory, transferStock, currentWarehouseId, currentLocationId } = usePharmaStore();

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
    const uniqueProducts = Array.from(new Set(inventory.map(i => i.sku))).map(sku => {
        return inventory.find(i => i.sku === sku)!;
    }).filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Get batches for selected product
    const availableBatches = selectedProductSku
        ? inventory.filter(i => i.sku === selectedProductSku && i.stock_actual > 0)
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
            await transferStock(selectedBatchId, selectedTargetWarehouse, qtyNum);
            toast.success('Transferencia realizada');
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
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <ArrowLeftRight size={20} className="text-cyan-400" />
                        Transferencia de Stock
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition">✕</button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 overflow-y-auto">

                    {/* Warehouses */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Origen</label>
                            <div className="font-bold text-slate-800 flex items-center gap-2 mt-1">
                                <Box size={16} className="text-indigo-600" />
                                {currentWarehouseId} <span className="text-xs text-slate-400">(Actual)</span>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Destino</label>
                            <select
                                className="w-full p-2.5 border border-slate-300 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
                        <label className="text-sm font-bold text-slate-700 mb-1 block">1. Buscar Producto</label>
                        {!selectedProductSku ? (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    placeholder="Nombre o SKU..."
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                                {searchTerm && (
                                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg shadow-sm bg-white">
                                        {uniqueProducts.length === 0 && (
                                            <div className="p-3 text-sm text-slate-400 text-center">No se encontraron productos</div>
                                        )}
                                        {uniqueProducts.map(prod => (
                                            <button
                                                key={prod.sku}
                                                className="w-full text-left p-2.5 hover:bg-indigo-50 border-b last:border-0 border-slate-100 transition flex justify-between items-center"
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
                                    <p className="font-bold text-indigo-900">{inventory.find(i => i.sku === selectedProductSku)?.name}</p>
                                    <p className="text-xs text-indigo-600">{selectedProductSku}</p>
                                </div>
                                <button
                                    onClick={() => { setSelectedProductSku(''); setSelectedBatchId(''); }}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline"
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
                                <label className="text-sm font-bold text-slate-700 mb-1 block">2. Seleccionar Lote (Origen)</label>
                                <select
                                    className="w-full p-2.5 border border-slate-300 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
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

                            <div className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <label className="text-sm font-bold text-slate-700 mb-1 block">3. Cantidad a Transferir</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={selectedBatch?.stock_actual || 9999}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg font-bold text-slate-900 text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
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
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleTransfer}
                        disabled={!selectedTargetWarehouse || !selectedBatchId || !quantity || isSubmitting}
                        className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg shadow-lg shadow-cyan-600/20 disabled:opacity-50 disabled:shadow-none transition flex justify-center items-center gap-2"
                    >
                        {isSubmitting ? 'Procesando...' : (
                            <>
                                <Truck size={18} /> Confirmar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StockTransferModal;
