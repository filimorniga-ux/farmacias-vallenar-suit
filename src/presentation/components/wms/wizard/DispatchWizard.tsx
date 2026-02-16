import React, { useState, useEffect } from 'react';
import { Send, Trash2, Box, Info, X } from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { WMSProductScanner } from '../WMSProductScanner';
import { InventoryBatch } from '@/domain/types';
import { createReturnSecure } from '@/actions/wms-v2';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useLocationStore } from '@/presentation/store/useLocationStore';

interface ReturnItem {
    id: string; // pseudo-id or real product id
    sku: string;
    name: string;
    quantity: number;
    condition: 'GOOD' | 'DAMAGED' | 'EXPIRED' | 'NEAR_EXPIRY' | 'MISSING';
    notes?: string;
    maxStock: number;
}

interface DispatchWizardProps {
    onClose: () => void;
}

export const DispatchWizard: React.FC<DispatchWizardProps> = ({ onClose }) => {
    const queryClient = useQueryClient();
    const inventory = usePharmaStore(s => s.inventory);
    const currentLocationId = usePharmaStore(s => s.currentLocationId);
    const locationStoreCurrent = useLocationStore(s => s.currentLocation);
    const effectiveLocationId = currentLocationId || locationStoreCurrent?.id || '';

    const [items, setItems] = useState<ReturnItem[]>([]);
    const [warehouseId, setWarehouseId] = useState(''); // Main warehouse ID (usually fixed or selectable)
    const [warehouses, setWarehouses] = useState<{ id: string, name: string }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [generalNotes, setGeneralNotes] = useState('');

    // Load available warehouses (destinations)
    useEffect(() => {
        // In a real scenario, fetch warehouses. For now, let's mock or use a known server action if available.
        // Or filter from usePharmaStore locations if they are loaded.
        // Assuming we want to return to a "Bodega Central".
        const loadWarehouses = async () => {
            // TODO: Replace with real fetch if needed.
            // For now, let's try to find locations of type 'WAREHOUSE' from store or hardcode for demo.
            // If store doesn't have all locations, we might need an action.
            // Let's assume the user knows the ID or we show a simple selector if available.
            // Fallback: Fetch via API/Action
            try {
                const { getLocationsSecure } = await import('@/actions/locations-v2');
                const result = await getLocationsSecure();
                if (result.success && result.data) {
                    const whs = result.data.filter((l: any) => l.type === 'WAREHOUSE');
                    setWarehouses(whs);
                    if (whs.length > 0) setWarehouseId(whs[0].id);
                }
            } catch (e) {
                console.error('Error loading warehouses', e);
            }
        };
        loadWarehouses();
    }, []);

    const handleProductSelected = (product: InventoryBatch) => {
        setItems(prev => {
            const existing = prev.find(i => i.sku === product.sku && i.condition === 'GOOD');
            if (existing) {
                return prev.map(i => i.sku === product.sku && i.condition === 'GOOD'
                    ? { ...i, quantity: Math.min(i.quantity + 1, i.maxStock) }
                    : i
                );
            }
            return [...prev, {
                id: product.id,
                sku: product.sku,
                name: product.name,
                quantity: 1,
                condition: 'GOOD', // Default
                maxStock: product.stock_actual,
                notes: ''
            }];
        });
        toast.success('Producto agregado');
    };

    const updateItem = (index: number, field: keyof ReturnItem, value: any) => {
        setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
    };

    const removeItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (items.length === 0) return toast.error('Agregue productos');
        if (!warehouseId) return toast.error('Seleccione bodega de destino');

        setIsSubmitting(true);
        try {
            const result = await createReturnSecure({
                originLocationId: effectiveLocationId,
                destinationLocationId: warehouseId,
                items: items.map(i => ({
                    sku: i.sku,
                    quantity: i.quantity,
                    condition: i.condition,
                    notes: i.notes
                })),
                notes: generalNotes
            });

            if (result.success) {
                toast.success('Devolución creada exitosamente');
                queryClient.invalidateQueries({ queryKey: ['inventory'] });
                onClose();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error('Error creando devolución');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* 1. Selección de Destino */}
            <div className="p-4 bg-white border-b border-slate-100">
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Bodega de Destino</label>
                <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm font-medium"
                >
                    <option value="">Seleccione una bodega...</option>
                    {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                </select>
            </div>

            {/* 2. Scanner */}
            <div className="p-4 bg-white border-b border-slate-100">
                <WMSProductScanner
                    inventory={inventory}
                    onProductSelected={handleProductSelected}
                    placeholder="Escanear producto para devolver..."
                />
            </div>

            {/* 3. Lista de Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                        <Box size={48} className="mx-auto mb-2 opacity-50" />
                        <p>No hay productos en la devolución</p>
                    </div>
                ) : (
                    items.map((item, index) => (
                        <div key={`${item.sku}-${index}`} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm">{item.name}</h4>
                                    <span className="text-xs text-slate-500 font-mono">{item.sku}</span>
                                </div>
                                <button onClick={() => removeItem(index)} className="text-rose-400 hover:text-rose-600 p-1">
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Cantidad</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={item.maxStock}
                                        value={item.quantity}
                                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                        className="w-full p-1.5 border border-slate-200 rounded text-sm font-bold text-center"
                                    />
                                    <span className="text-[10px] text-slate-400">Max: {item.maxStock}</span>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Condición</label>
                                    <select
                                        value={item.condition}
                                        onChange={(e) => updateItem(index, 'condition', e.target.value)}
                                        className={`w-full p-1.5 border rounded text-xs font-bold
                                            ${item.condition === 'GOOD' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                item.condition === 'DAMAGED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                    item.condition === 'EXPIRED' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                        'bg-slate-50 text-slate-700 border-slate-200'}
                                        `}
                                    >
                                        <option value="GOOD">Buen Estado</option>
                                        <option value="DAMAGED">Dañado</option>
                                        <option value="EXPIRED">Vencido</option>
                                        <option value="NEAR_EXPIRY">Por Vencer</option>
                                        <option value="MISSING">Perdido</option>
                                    </select>
                                </div>
                            </div>
                            <input
                                type="text"
                                placeholder="Observaciones (opcional)"
                                value={item.notes || ''}
                                onChange={(e) => updateItem(index, 'notes', e.target.value)}
                                className="w-full text-xs p-2 border border-slate-100 rounded-lg bg-slate-50 focus:bg-white transition-colors"
                            />
                        </div>
                    ))
                )}
            </div>

            {/* 4. Footer acciones */}
            <div className="p-4 bg-white border-t border-slate-100">
                <div className="mb-3">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1">Nota General</label>
                    <textarea
                        value={generalNotes}
                        onChange={e => setGeneralNotes(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm resize-none h-16"
                        placeholder="Razón de la devolución..."
                    />
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || items.length === 0}
                    className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                    {isSubmitting ? 'Procesando...' : (
                        <>
                            <Send size={18} /> Confirmar Devolución ({items.length})
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
