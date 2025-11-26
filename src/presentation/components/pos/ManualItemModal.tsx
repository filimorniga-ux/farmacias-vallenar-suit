import React, { useState } from 'react';
import { PlusCircle, DollarSign, Package } from 'lucide-react';

interface ManualItemModalProps {
    isOpen: boolean;
    onConfirm: (data: { description: string, price: number, quantity: number }) => void;
    onClose: () => void;
}

const ManualItemModal: React.FC<ManualItemModalProps> = ({ isOpen, onConfirm, onClose }) => {
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [quantity, setQuantity] = useState('1');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (description && price) {
            onConfirm({
                description,
                price: parseInt(price),
                quantity: parseInt(quantity)
            });
            // Reset
            setDescription('');
            setPrice('');
            setQuantity('1');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-900 p-4 border-b border-slate-800 text-white">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <PlusCircle className="text-cyan-400" /> Ítem Manual / Vario
                    </h3>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Descripción</label>
                        <input
                            type="text"
                            autoFocus
                            className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                            placeholder="Ej: Servicio Inyectable"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Precio Unit.</label>
                            <div className="relative">
                                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="number"
                                    className="w-full pl-8 pr-3 py-3 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                    placeholder="0"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Cantidad</label>
                            <div className="relative">
                                <Package size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="number"
                                    className="w-full pl-8 pr-3 py-3 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg shadow-cyan-200"
                        >
                            Agregar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ManualItemModal;
