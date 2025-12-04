import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { InventoryBatch } from '../../../domain/types';
import { toast } from 'sonner';

interface ProductDeleteConfirmProps {
    product: InventoryBatch;
    onClose: () => void;
    onConfirm: () => void;
}

const ProductDeleteConfirm: React.FC<ProductDeleteConfirmProps> = ({ product, onClose, onConfirm }) => {
    const { deleteProduct, reorderConfigs } = usePharmaStore();

    const hasStock = product.stock_actual > 0;
    const hasReorderConfig = reorderConfigs.some(
        c => c.sku === product.sku && c.location_id === product.location_id
    );

    const handleDelete = () => {
        deleteProduct(product.id);
        toast.success(`Producto ${product.name} eliminado`);
        onConfirm();
        onClose();
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-200">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                <AlertTriangle size={24} />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">
                                Confirmar Eliminación
                            </h2>
                        </div>
                        <p className="text-slate-600 text-sm">
                            ¿Estás seguro de eliminar este producto?
                        </p>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {/* Product Info */}
                        <div className="p-4 bg-slate-50 rounded-xl">
                            <p className="font-bold text-slate-800">{product.name}</p>
                            <p className="text-sm text-slate-500">SKU: {product.sku}</p>
                            <p className="text-sm text-slate-500">Ubicación: {product.location_id}</p>
                        </div>

                        {/* Warnings */}
                        {hasStock && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                <p className="text-sm font-bold text-amber-800 flex items-center gap-2">
                                    <AlertTriangle size={16} />
                                    Stock Existente
                                </p>
                                <p className="text-sm text-amber-700 mt-1">
                                    Este producto tiene {product.stock_actual} unidades en stock.
                                </p>
                            </div>
                        )}

                        {hasReorderConfig && (
                            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                                <p className="text-sm font-bold text-purple-800 flex items-center gap-2">
                                    <AlertTriangle size={16} />
                                    Configuración Auto-Reorden Activa
                                </p>
                                <p className="text-sm text-purple-700 mt-1">
                                    Este producto tiene configuración de auto-ordenamiento.
                                </p>
                            </div>
                        )}

                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                            <p className="text-sm font-bold text-red-800">
                                ⚠️ Esta acción no se puede deshacer
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                                El producto será eliminado permanentemente del inventario local.
                            </p>
                            <p className="text-xs text-red-600 mt-2">
                                TODO: Sync to Tiger Cloud will remove from database
                            </p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleDelete}
                            className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition"
                        >
                            Eliminar Producto
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProductDeleteConfirm;
