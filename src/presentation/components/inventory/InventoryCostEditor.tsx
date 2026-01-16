import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Check, X, DollarSign } from 'lucide-react';
import { updateBatchCostSecure } from '../../../actions/inventory-v2';
import { usePharmaStore } from '../../store/useStore';

interface InventoryCostEditorProps {
    batchId: string;
    currentCost: number;
    productName: string;
}

export const InventoryCostEditor: React.FC<InventoryCostEditorProps> = ({ batchId, currentCost, productName }) => {
    const { user, fetchInventory, currentLocationId, updateProduct } = usePharmaStore();
    const [isEditing, setIsEditing] = useState(false);

    // Internal numeric state associated with the input
    const [localCost, setLocalCost] = useState(currentCost);
    // Display string state for formatted input
    const [displayCost, setDisplayCost] = useState(currentCost.toLocaleString('es-CL'));

    const [pin, setPin] = useState('');
    const [step, setStep] = useState<'COST' | 'PIN'>('COST');
    const [isLoading, setIsLoading] = useState(false);

    // Update local state if prop changes (only when not editing to avoid overwriting user input)
    useEffect(() => {
        if (!isEditing) {
            setLocalCost(currentCost);
            setDisplayCost(currentCost.toLocaleString('es-CL'));
        }
    }, [currentCost, isEditing]);

    const handleCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Remove everything that is not a digit
        const rawValue = e.target.value.replace(/\D/g, '');

        if (rawValue === '') {
            setLocalCost(0);
            setDisplayCost('');
            return;
        }

        const numValue = parseInt(rawValue, 10);
        setLocalCost(numValue);
        setDisplayCost(numValue.toLocaleString('es-CL'));
    };

    const handleSave = async () => {
        if (!user) return;
        if (!pin) {
            toast.error('Ingrese PIN de autorización');
            return;
        }

        setIsLoading(true);
        try {
            const res = await updateBatchCostSecure({
                batchId,
                newCost: Number(localCost),
                userId: user.id,
                pin
            });

            if (res.success) {
                toast.success('Costo actualizado');
                setIsEditing(false);
                setStep('COST');
                setPin('');

                // Optimistic Update: Update store immediately
                updateProduct(batchId, {
                    cost_price: Number(localCost),
                    cost_net: Number(localCost)
                });

                // Refresh inventory data without reloading the page
                if (currentLocationId) {
                    await fetchInventory(currentLocationId);
                }
            } else {
                toast.error(res.error || 'Error al actualizar');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCostSubmit = () => {
        setStep('PIN');
    };

    if (!isEditing) {
        return (
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                    setStep('COST');
                    setPin('');
                    // Initialize editing state
                    setLocalCost(currentCost);
                    setDisplayCost(currentCost.toLocaleString('es-CL'));
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors ${currentCost === 0 || currentCost === 1000 ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'hover:bg-slate-100 text-slate-500'}`}
                title="Click para editar costo"
            >
                <span className="text-xs font-mono">
                    {currentCost === 0 || currentCost === 1000 ? 'Pendiente' : `$${currentCost.toLocaleString('es-CL')}`}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {step === 'COST' ? (
                <>
                    <div className="relative">
                        <DollarSign size={10} className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            className="w-24 pl-4 py-1 text-xs border border-cyan-500 rounded focus:outline-none font-mono"
                            value={displayCost}
                            onChange={handleCostChange}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCostSubmit();
                                if (e.key === 'Escape') setIsEditing(false);
                            }}
                        />
                    </div>
                    <button
                        onClick={handleCostSubmit}
                        className="p-1 bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200"
                        title="Continuar"
                    >
                        <Check size={12} />
                    </button>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="p-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                    >
                        <X size={12} />
                    </button>
                </>
            ) : (
                <>
                    <div className="relative">
                        <input
                            type="password"
                            autoFocus
                            placeholder="PIN Gerente"
                            className="w-24 px-2 py-1 text-xs border border-purple-500 rounded focus:outline-none"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') setStep('COST');
                            }}
                            maxLength={6}
                        />
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                        title="Confirmar"
                    >
                        {isLoading ? <span className="animate-spin">⌛</span> : <Check size={12} />}
                    </button>
                    <button
                        onClick={() => setStep('COST')}
                        className="p-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                        title="Volver"
                    >
                        <X size={12} />
                    </button>
                </>
            )}
        </div>
    );
};
