import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { ArrowRightLeft, MapPin, Box, Search } from 'lucide-react';
import { InventoryBatch } from '../../../domain/types';

interface StockTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const StockTransferModal: React.FC<StockTransferModalProps> = ({ isOpen, onClose }) => {
    const { inventory, transferStock } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<InventoryBatch | null>(null);
    const [qty, setQty] = useState('');
    const [targetLocation, setTargetLocation] = useState('SUCURSAL_CENTRO');

    if (!isOpen) return null;

    const filteredInventory = inventory.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.sku.includes(searchTerm)
    );

    const handleTransfer = () => {
        if (selectedProduct && qty) {
            transferStock(selectedProduct.id, targetLocation as any, parseInt(qty));
            onClose();
            setSearchTerm('');
            setSelectedProduct(null);
            setQty('');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-900 p-6 border-b border-slate-800 text-white">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <ArrowRightLeft className="text-purple-400" /> Transferencia de Stock
                    </h3>
                </div>

                <div className="p-6 space-y-6">
                    {/* 1. Select Product */}
                    {!selectedProduct ? (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">1. Buscar Producto (Origen)</label>
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Nombre o SKU..."
                                    className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="h-48 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50 p-2 space-y-2">
                                {filteredInventory.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedProduct(item)}
                                        className="p-3 bg-white rounded-lg border border-slate-200 hover:border-purple-400 cursor-pointer transition flex justify-between items-center"
                                    >
                                        <div>
                                            <p className="font-bold text-sm text-slate-800">{item.name}</p>
                                            <p className="text-xs text-slate-500">{item.location_id}</p>
                                        </div>
                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">Stock: {item.stock_actual}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex justify-between items-center">
                            <div>
                                <h4 className="font-bold text-purple-900">{selectedProduct.name}</h4>
                                <p className="text-xs text-purple-700">Origen: {selectedProduct.location_id}</p>
                            </div>
                            <button onClick={() => setSelectedProduct(null)} className="text-xs font-bold text-purple-500 hover:text-purple-700">CAMBIAR</button>
                        </div>
                    )}

                    {/* 2. Transfer Details */}
                    {selectedProduct && (
                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Destino</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <select
                                        className="w-full pl-9 pr-3 py-3 border-2 border-slate-200 rounded-xl focus:border-purple-500 focus:outline-none appearance-none bg-white"
                                        value={targetLocation}
                                        onChange={(e) => setTargetLocation(e.target.value)}
                                    >
                                        <option value="SUCURSAL_CENTRO">Sucursal Centro</option>
                                        <option value="SUCURSAL_NORTE">Sucursal Norte</option>
                                        <option value="BODEGA_CENTRAL">Bodega Central</option>
                                        <option value="KIOSCO">Kiosco</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Cantidad</label>
                                <div className="relative">
                                    <Box className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="number"
                                        className="w-full pl-9 pr-3 py-3 border-2 border-slate-200 rounded-xl focus:border-purple-500 focus:outline-none"
                                        max={selectedProduct.stock_actual}
                                        value={qty}
                                        onChange={(e) => setQty(e.target.value)}
                                    />
                                </div>
                                <p className="text-[10px] text-right text-slate-400 mt-1">Máx: {selectedProduct.stock_actual}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <button onClick={onClose} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition">Cancelar</button>
                        <button
                            onClick={handleTransfer}
                            disabled={!selectedProduct || !qty || parseInt(qty) > (selectedProduct?.stock_actual || 0)}
                            className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition shadow-lg shadow-purple-200 disabled:opacity-50"
                        >
                            Transferir
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StockTransferModal;
