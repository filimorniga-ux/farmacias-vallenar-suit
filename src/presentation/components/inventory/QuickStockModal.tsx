
import React, { useState, useEffect } from 'react';
import { X, Zap, Save, Loader2, Minus, Plus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { quickStockAdjustSecure } from '../../../actions/inventory-v2';
import { usePharmaStore } from '../../store/useStore';

interface QuickStockModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: any | null;
}

const QuickStockModal: React.FC<QuickStockModalProps> = ({ isOpen, onClose, product }) => {
    const [adjustment, setAdjustment] = useState<number>(0);
    const [reason, setReason] = useState<string>('');
    const [pin, setPin] = useState<string>('');
    const [mode, setMode] = useState<'ADD' | 'REMOVE'>('ADD');
    const [isLoading, setIsLoading] = useState(false);
    const { fetchInventory, user, updateStock } = usePharmaStore();

    useEffect(() => {
        if (isOpen) {
            setAdjustment(0);
            setReason('');
            setPin('');
            setMode('ADD');
        }
    }, [isOpen]);

    if (!isOpen || !product) return null;

    const handleAdjust = async () => {
        if (adjustment <= 0) {
            toast.warning('La cantidad debe ser mayor a cero.');
            return;
        }

        if (!pin || pin.length < 4) {
            toast.warning('Ingrese un PIN válido de 4 dígitos.');
            return;
        }

        setIsLoading(true);
        const finalAdjustment = mode === 'REMOVE' ? -adjustment : adjustment;
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

        try {
            let result = null;

            if (!isOffline) {
                result = await quickStockAdjustSecure({
                    batchId: product.id,
                    adjustment: finalAdjustment,
                    reason: reason || (mode === 'ADD' ? 'Entrada rápida' : 'Salida rápida'),
                    pin: pin
                });

                if (result.success) {
                    console.log('✅ Adjust Success. Server says new stock:', result.newQuantity);
                    toast.success(`Stock ajustado correctamente`);

                    // Optimistic Update Confirmed
                    updateStock(product.id, finalAdjustment);

                    // Background Sync
                    fetchInventory();
                    onClose();
                    return;
                } else {
                    if (result.error?.includes('Network') || result.error?.includes('fetch')) {
                        throw new Error(result.error);
                    }
                    toast.error(result.error || 'Ocurrió un error desconocido.');
                    return;
                }
            } else {
                throw new Error('Offline Mode Trigger');
            }

        } catch (error) {
            console.error('Moving to Offline Fallback', error);

            // OFFLINE FALLBACK
            if (user?.id) {
                import('../../../lib/store/outboxStore').then(({ useOutboxStore }) => {
                    useOutboxStore.getState().addToOutbox(
                        'STOCK_ADJUST',
                        {
                            batchId: product.id,
                            adjustment: finalAdjustment,
                            reason: reason || (mode === 'ADD' ? 'Entrada rápida' : 'Salida rápida'),
                            userId: user.id || 'SYSTEM',
                            authorizationPin: pin
                        }
                    );
                });

                // Optimistic Local Update
                updateStock(product.id, finalAdjustment);

                toast.warning('Ajuste guardado localmente', {
                    description: 'Se sincronizará cuando recupere conexión.'
                });
                onClose();
            } else {
                toast.error('Error de conexión y sin sesión local.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const currentStock = product.stock_actual || 0;
    const finalAdjustment = mode === 'REMOVE' ? -adjustment : adjustment;
    const newStock = currentStock + finalAdjustment;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-3xl">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Zap className="text-amber-500 fill-amber-500" />
                            Ajuste Rápido
                        </h2>
                        <p className="text-slate-500 text-sm truncate max-w-xs">{product.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-8 space-y-6">

                    {/* Tabs */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setMode('ADD')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'ADD' ? 'bg-white shadow text-green-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            AGREGAR (+)
                        </button>
                        <button
                            onClick={() => setMode('REMOVE')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'REMOVE' ? 'bg-white shadow text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            QUITAR (-)
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Actual</p>
                            <p className="text-3xl font-black text-slate-800">{currentStock}</p>
                        </div>
                        <div className={`rounded-2xl p-2 transition-all ${newStock !== currentStock ? (mode === 'ADD' ? 'bg-green-50' : 'bg-red-50') : 'bg-slate-50'}`}>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nuevo</p>
                            <p className={`text-3xl font-black transition-colors ${newStock !== currentStock ? (mode === 'ADD' ? 'text-green-600' : 'text-red-600') : 'text-slate-800'}`}>
                                {newStock}
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cantidad</label>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setAdjustment(adj => Math.max(0, adj - 1))} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition"><Minus size={20} /></button>
                            <input
                                type="number"
                                className={`w-full p-4 border-2 rounded-2xl font-bold text-2xl text-center focus:outline-none transition-colors 
                                    ${mode === 'ADD' ? 'border-slate-200 focus:border-green-500 text-green-600' : 'border-slate-200 focus:border-red-500 text-red-600'}`}
                                value={adjustment}
                                onChange={(e) => setAdjustment(Math.max(0, parseInt(e.target.value) || 0))}
                                min="0"
                            />
                            <button onClick={() => setAdjustment(adj => adj + 1)} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition"><Plus size={20} /></button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">PIN de Gerente</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="password"
                                className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:border-amber-500 focus:outline-none font-bold tracking-widest text-slate-700"
                                placeholder="****"
                                maxLength={4}
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Motivo (Opcional)</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-slate-200 rounded-xl focus:border-slate-400 focus:outline-none text-sm"
                            placeholder="Ej: Ajuste rápido..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-3xl">
                    <button
                        onClick={handleAdjust}
                        disabled={isLoading || adjustment === 0 || pin.length < 4}
                        className={`w-full px-6 py-4 text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed
                            ${mode === 'ADD' ? 'bg-green-600 hover:bg-green-700 shadow-green-200' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        {mode === 'ADD' ? 'Confirmar Entrada' : 'Confirmar Salida'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickStockModal;
