import React, { useState } from 'react';
import { AlertTriangle, X, Lock } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { InventoryBatch } from '../../../domain/types';
import { toast } from 'sonner';
import { deleteProductSecure } from '../../../actions/delete-product';

interface ProductDeleteConfirmProps {
    product: InventoryBatch;
    onClose: () => void;
    onConfirm: () => void;
}

const ProductDeleteConfirm: React.FC<ProductDeleteConfirmProps> = ({ product, onClose, onConfirm }) => {
    const { deleteProduct, reorderConfigs, user } = usePharmaStore();
    const [isDeleting, setIsDeleting] = useState(false);
    const [pin, setPin] = useState('');

    const hasStock = product.stock_actual > 0;
    const hasReorderConfig = reorderConfigs.some(
        c => c.sku === product.sku && c.location_id === product.location_id
    );

    const handleDelete = async () => {
        if (!user?.id) {
            toast.error('Usuario no autenticado');
            return;
        }

        if (!pin || pin.length < 4) {
            toast.error('Debe ingresar un PIN de gerente válido');
            return;
        }

        setIsDeleting(true);

        try {
            // Delete from database first
            // REVERT: Use product.id to delete the specific row (Batch or Product).
            // This allows deleting duplicate batches without removing the main product.
            const targetId = product.id;
            console.log(`[DELETE] Requesting delete for ID: ${targetId} (Type: ${product.product_id ? 'Batch' : 'Product'})`);

            const result = await deleteProductSecure(targetId, user.id, pin);

            if (!result.success) {
                toast.error(result.error || 'Error al eliminar producto');
                setIsDeleting(false);
                return;
            }

            // Update local store
            deleteProduct(product.id);

            toast.success(`Producto ${product.name} eliminado correctamente`);
            onConfirm();
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Error al eliminar producto');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
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
                            Esta acción requiere autorización de Gerencia.
                        </p>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {/* Product Info */}
                        <div className="p-4 bg-slate-50 rounded-xl">
                            <p className="font-bold text-slate-800">{product.name}</p>
                            <p className="text-sm text-slate-500">SKU: {product.sku}</p>
                            <div className="flex gap-4 mt-2">
                                <span className={`text-xs px-2 py-1 rounded font-bold ${hasStock ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                                    Stock: {product.stock_actual}
                                </span>
                            </div>
                        </div>

                        {/* PIN Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Lock size={14} className="text-slate-400" />
                                PIN de Gerente General
                            </label>
                            <input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                className="w-full p-3 border border-slate-300 rounded-xl text-center text-2xl tracking-widest font-bold focus:border-red-500 focus:ring-red-500"
                                placeholder="••••"
                                maxLength={6}
                                autoFocus
                            />
                            <p className="text-xs text-slate-500 text-center">
                                Ingrese su PIN de seguridad para confirmar
                            </p>
                        </div>

                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                            <p className="text-sm font-bold text-red-800">
                                ⚠️ Esta acción no se puede deshacer
                            </p>
                            <p className="text-xs text-red-700 mt-1">
                                El producto y todos sus lotes serán eliminados permanentemente.
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
                            disabled={isDeleting || pin.length < 4}
                            className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-200"
                        >
                            {isDeleting ? 'Eliminando...' : 'Confirmar y Eliminar'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProductDeleteConfirm;
