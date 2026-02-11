/**
 * WMSTransferenciaTab - Transferencia entre bodegas/sucursales
 * Scanner → Carrito → Origen↔Destino → PIN si necesario → Confirmar
 */
import React, { useState, useCallback } from 'react';
import { ArrowLeftRight, Send, FileText, Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { WMSProductScanner } from '../WMSProductScanner';
import { WMSProductCart, WMSCartItem } from '../WMSProductCart';
import { WMSLocationPicker } from '../WMSLocationPicker';
import { WMSReportPanel } from '../WMSReportPanel';
import { usePharmaStore } from '@/presentation/store/useStore';
import { executeTransferSecure } from '@/actions/wms-v2';
import { InventoryBatch } from '@/domain/types';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';

const PIN_THRESHOLD = 100;

export const WMSTransferenciaTab: React.FC = () => {
    const qc = useQueryClient();
    const { inventory, currentLocationId, currentWarehouseId } = usePharmaStore();
    const user = usePharmaStore(s => s.user);
    const locName = usePharmaStore(s => s.locations?.find(l => l.id === s.currentLocationId)?.name || 'Actual');

    const [cart, setCart] = useState<WMSCartItem[]>([]);
    const [originId, setOriginId] = useState(currentWarehouseId || currentLocationId);
    const [destId, setDestId] = useState('');
    const [notes, setNotes] = useState('');
    const [pin, setPin] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showRep, setShowRep] = useState(false);

    const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
    const needsPin = totalQty >= PIN_THRESHOLD;

    const addProduct = useCallback((p: InventoryBatch) => {
        setCart(prev => {
            const ex = prev.find(i => i.id === p.id);
            if (ex) return prev.map(i => i.id === p.id ? { ...i, quantity: Math.min(i.quantity + 1, i.maxStock) } : i);
            return [...prev, { id: p.id, sku: p.sku, name: p.name, quantity: 1, maxStock: p.stock_actual, lotNumber: p.lot_number, laboratory: p.laboratory }];
        });
    }, []);

    const confirm = async () => {
        if (!cart.length) return toast.error('Agregue productos');
        if (!destId) return toast.error('Seleccione destino');
        if (needsPin && pin.length < 4) return toast.error('PIN requerido');
        setSubmitting(true);
        try {
            const r = await executeTransferSecure({
                originWarehouseId: originId, targetWarehouseId: destId,
                items: cart.map(i => ({ productId: i.sku, quantity: i.quantity, lotId: i.id })),
                userId: user?.id || '', notes, supervisorPin: needsPin ? pin : undefined,
            });
            if (r.success) {
                toast.success('Transferencia exitosa');
                setCart([]); setDestId(''); setNotes(''); setPin('');
                await qc.invalidateQueries({ queryKey: ['inventory'] });
            } else toast.error(r.error || 'Error');
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', tab: 'Transferencia' },
                extra: { itemCount: cart.length, originId, destId, totalQty }
            });
            toast.error('Error de conexión');
        }
        finally { setSubmitting(false); }
    };

    return (
        <div className="space-y-6">
            <div>
                <label className="text-sm font-bold text-slate-700 mb-2 block flex items-center gap-2">
                    <ArrowLeftRight size={16} className="text-sky-500" /> Productos para Transferir
                </label>
                <WMSProductScanner inventory={inventory} onProductSelected={addProduct} placeholder="Escanear o buscar producto..." />
            </div>
            <WMSProductCart items={cart} onUpdateItem={(id, q) => setCart(p => p.map(i => i.id === id ? { ...i, quantity: q } : i))} onRemoveItem={id => setCart(p => p.filter(i => i.id !== id))} title="Productos a Transferir" disabled={submitting} />
            {cart.length > 0 && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <WMSLocationPicker mode="both" currentLocationId={currentLocationId} currentLocationName={locName}
                        onOriginChange={(id) => setOriginId(id)} onDestinationChange={(id) => setDestId(id)}
                        selectedOrigin={originId} selectedDestination={destId} />
                </div>
            )}
            {cart.length > 0 && destId && (
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)..." rows={2}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 resize-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all" />
            )}
            {needsPin && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 animate-in fade-in">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck size={16} className="text-amber-600" />
                        <span className="text-sm font-bold text-amber-800">PIN requerido ({totalQty} uds ≥{PIN_THRESHOLD})</span>
                    </div>
                    <div className="relative">
                        <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
                        <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                            placeholder="PIN supervisor..." className="w-full pl-10 pr-4 py-2.5 border-2 border-amber-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-amber-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none transition-all" />
                    </div>
                </div>
            )}
            <div className="wms-sticky-action mt-4 pt-3 -mx-4 px-4">
                <div className="flex gap-3">
                    <button onClick={() => setShowRep(true)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                        <FileText size={18} /> Reportes
                    </button>
                    <button onClick={confirm} disabled={!cart.length || !destId || submitting || (needsPin && pin.length < 4)}
                        className="flex-[2] py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                        {submitting ? <><Loader2 size={18} className="animate-spin" /> Procesando...</> : <><ArrowLeftRight size={18} /> Confirmar Transferencia</>}
                    </button>
                </div>
            </div>
            {showRep && <WMSReportPanel activeTab="TRANSFERENCIA" locationId={currentLocationId} onClose={() => setShowRep(false)} />}
        </div>
    );
};

export default WMSTransferenciaTab;
