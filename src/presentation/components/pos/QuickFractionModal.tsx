import React, { useState, useEffect, useRef } from 'react';
import { X, Scissors, Calculator } from 'lucide-react';
import { InventoryBatch, Customer } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';

interface QuickFractionModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: InventoryBatch | null;
    onConfirm: (quantity: number) => void;
}

const QuickFractionModal: React.FC<QuickFractionModalProps> = ({ isOpen, onClose, product, onConfirm }) => {
    const [quantity, setQuantity] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);
    const { currentCustomer } = usePharmaStore();

    useEffect(() => {
        if (isOpen) {
            setQuantity('');
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    if (!isOpen || !product) return null;

    const qty = parseInt(quantity) || 0;
    const unitPrice = product.fractional_price || Math.ceil(product.price / (product.units_per_box || 1));
    const totalPrice = qty * unitPrice;

    const handleConfirm = (e: React.FormEvent) => {
        e.preventDefault();
        if (qty > 0) {
            onConfirm(qty);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 text-white flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl">
                            <Scissors size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">Venta Fraccionada</h3>
                            <p className="text-blue-100 text-sm font-medium">Art. 19 A - Venta por Unidad</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-8">
                    {/* Product Info */}
                    <div className="mb-8 text-center">
                        <h4 className="text-lg font-bold text-slate-800 mb-1">{product.name}</h4>
                        <p className="text-slate-500 text-sm mb-4">{product.dci} - {product.laboratory}</p>

                        <div className="flex flex-col gap-2 items-center">
                            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-bold text-sm border border-blue-100">
                                <span>Precio Unitario: ${unitPrice.toLocaleString()} / un</span>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                    Cajas: {product.stock_actual}
                                </div>
                                <div className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter">
                                    Unidades Sueltas: {product.units_stock_actual || 0}
                                </div>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleConfirm}>
                        <div className="mb-8">
                            <label className="block text-center text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider">
                                ¿Cuántas unidades?
                            </label>
                            <div className="relative max-w-[200px] mx-auto">
                                <input
                                    ref={inputRef}
                                    type="number"
                                    min="1"
                                    className="w-full text-center text-5xl font-black text-slate-800 border-b-4 border-blue-500 focus:outline-none focus:border-cyan-400 py-2 bg-transparent placeholder-slate-200"
                                    placeholder="0"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Calculation Preview */}
                        <div className="bg-slate-50 rounded-2xl p-6 mb-8 flex items-center justify-between border border-slate-100">
                            <div className="flex items-center gap-3 text-slate-400">
                                <Calculator size={20} />
                                <span className="font-medium text-lg">{qty} x ${unitPrice.toLocaleString()}</span>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total a Cobrar</p>
                                <p className="text-3xl font-black text-slate-900">${totalPrice.toLocaleString()}</p>
                            </div>
                        </div>

                        {/* Customer Info (Read Only) */}
                        {currentCustomer ? (
                            <div className="mb-6 bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center gap-3 text-emerald-700 text-sm font-bold">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                Cliente: {currentCustomer.fullName}
                            </div>
                        ) : (
                            <div className="mb-6 bg-slate-50 border border-slate-100 p-3 rounded-xl text-center text-slate-400 text-xs">
                                Sin cliente asignado (Venta Genérica)
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={qty <= 0}
                            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                        >
                            <Scissors size={20} />
                            Agregar al Carrito
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default QuickFractionModal;
