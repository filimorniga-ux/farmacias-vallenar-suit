import React, { useState, useEffect, useRef } from 'react';
import { X, Scissors, Calculator } from 'lucide-react';
import { InventoryBatch, Customer } from '../../../domain/types';
import { usePharmaStore } from '../../store/useStore';
import { calculatePricePerUnit } from '../../../domain/logic/productDisplay';

interface QuickFractionModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: InventoryBatch | null;
    onConfirm: (data: { quantity: number; unitPrice: number; unitsPerBox: number }) => void;
}

const QuickFractionModal: React.FC<QuickFractionModalProps> = ({ isOpen, onClose, product, onConfirm }) => {
    const [quantity, setQuantity] = useState<string>('');
    const [userUnitsPerBox, setUserUnitsPerBox] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);
    const { currentCustomer } = usePharmaStore();

    useEffect(() => {
        if (isOpen && product) {
            setQuantity('');
            // Inicializar con lo que diga el producto, pero permitir cambiarlo
            setUserUnitsPerBox((product.units_per_box || product.unit_count || 1).toString());
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen, product]);

    if (!isOpen || !product) return null;

    const qty = parseInt(quantity) || 0;
    const divisor = parseInt(userUnitsPerBox) || 1;
    const boxPrice = product.price || 0;

    // Cálculo Dinámico con Regla de Redondeo (Business Rule)
    // "Si está bajo 50, a 50. Si es superior, a 100" -> Math.ceil(price / 50) * 50
    const rawUnitPrice = boxPrice / divisor;
    const dynamicUnitPrice = Math.ceil(rawUnitPrice / 50) * 50;
    const totalPrice = qty * dynamicUnitPrice;

    const handleConfirm = (e: React.FormEvent) => {
        e.preventDefault();
        if (qty > 0) {
            onConfirm({
                quantity: qty,
                unitPrice: dynamicUnitPrice,
                unitsPerBox: divisor
            });
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
                    <div className="mb-6 text-center">
                        <h4 className="text-lg font-bold text-slate-800 mb-1">{product.name}</h4>
                        <p className="text-slate-500 text-sm">{product.dci} - {product.laboratory}</p>
                    </div>

                    <form onSubmit={handleConfirm}>
                        <div className="flex flex-col gap-6 mb-8">
                            {/* NEW: Dynamic Divisor Input */}
                            <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl">
                                <label className="block text-center text-[10px] font-black text-amber-600 mb-1 uppercase tracking-tighter">
                                    ¿En cuántas unidades se divide la caja?
                                </label>
                                <div className="flex items-center justify-center gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-24 text-center text-2xl font-black text-amber-700 bg-transparent border-b-2 border-amber-300 focus:outline-none focus:border-amber-500"
                                        value={userUnitsPerBox}
                                        onChange={(e) => setUserUnitsPerBox(e.target.value)}
                                    />
                                    <span className="text-amber-400 font-bold">unidades</span>
                                </div>
                                <div className="text-center mt-1">
                                    <span className="text-[10px] font-bold text-amber-400">
                                        Precio Caja: ${(product.price || 0).toLocaleString()} ➔ Unidad: ${dynamicUnitPrice.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {/* Quantity to Sell */}
                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                                <label className="block text-center text-[10px] font-black text-blue-600 mb-1 uppercase tracking-tighter">
                                    ¿Cuántas unidades vendes hoy?
                                </label>
                                <div className="relative max-w-[120px] mx-auto">
                                    <input
                                        ref={inputRef}
                                        type="number"
                                        min="1"
                                        className="w-full text-center text-4xl font-black text-blue-800 border-b-2 border-blue-400 focus:outline-none focus:border-blue-600 bg-transparent placeholder-blue-200"
                                        placeholder="0"
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Calculation Preview */}
                        <div className="bg-slate-900 text-white rounded-2xl p-6 mb-8 flex items-center justify-between shadow-xl shadow-slate-200 border-b-4 border-blue-500">
                            <div className="flex items-center gap-3 text-slate-400">
                                <Calculator size={20} className="text-cyan-400" />
                                <span className="font-medium text-lg">{qty} x ${dynamicUnitPrice.toLocaleString()}</span>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-cyan-400 uppercase mb-1">Total a Cobrar</p>
                                <p className="text-3xl font-black text-white">${totalPrice.toLocaleString()}</p>
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
