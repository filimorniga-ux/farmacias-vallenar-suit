/**
 * WMSDespachoTab - Tab de Despacho para el módulo WMS
 * 
 * Flujo: Scanner/Búsqueda → Agregar a lista → Seleccionar destino → Confirmar despacho
 * Usa createDispatchSecure del backend.
 */
import React, { useState, useCallback } from 'react';
import { Truck, Send, FileText, Loader2 } from 'lucide-react';
import { DispatchWizard } from '../wizard/DispatchWizard';
import { WMSProductScanner } from '../WMSProductScanner';
import { WMSProductCart, WMSCartItem } from '../WMSProductCart';
import { WMSLocationPicker } from '../WMSLocationPicker';
import { WMSReportPanel } from '../WMSReportPanel';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useLocationStore } from '@/presentation/store/useLocationStore';
import { createDispatchSecure } from '@/actions/wms-v2';
import { InventoryBatch } from '@/domain/types';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';

export const WMSDespachoTab: React.FC = () => {
    const queryClient = useQueryClient();
    const { inventory, currentLocationId } = usePharmaStore();
    const locationStoreCurrent = useLocationStore(s => s.currentLocation);

    // State
    const [cartItems, setCartItems] = useState<WMSCartItem[]>([]);
    const [destinationId, setDestinationId] = useState('');
    const [destinationName, setDestinationName] = useState('');
    const [carrier, setCarrier] = useState('');
    const [trackingNumber, setTrackingNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showReports, setShowReports] = useState(false);

    // Wizard de Devolución
    const [wizardOpen, setWizardOpen] = useState(false);

    const pharmaLocationName = usePharmaStore(s => {
        const loc = s.locations?.find(l => l.id === s.currentLocationId);
        return loc?.name || '';
    });
    const effectiveLocationId = currentLocationId || locationStoreCurrent?.id || '';
    const currentLocationName = pharmaLocationName || locationStoreCurrent?.name || 'Sucursal Actual';

    // Agregar producto al carrito
    const handleProductSelected = useCallback((product: InventoryBatch) => {
        setCartItems(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                // Incrementar cantidad
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: Math.min(item.quantity + 1, item.maxStock) }
                        : item
                );
            }
            // Agregar nuevo
            return [...prev, {
                id: product.id,
                sku: product.sku,
                name: product.name,
                quantity: 1,
                maxStock: product.stock_actual,
                lotNumber: product.lot_number,
                expiryDate: product.expiry_date,
                laboratory: product.laboratory,
            }];
        });
    }, []);

    // Actualizar cantidad
    const handleUpdateItem = useCallback((id: string, quantity: number) => {
        setCartItems(prev => prev.map(item =>
            item.id === id ? { ...item, quantity } : item
        ));
    }, []);

    // Eliminar item
    const handleRemoveItem = useCallback((id: string) => {
        setCartItems(prev => prev.filter(item => item.id !== id));
    }, []);

    // Confirmar despacho
    const handleConfirmDispatch = async () => {
        if (cartItems.length === 0) {
            toast.error('Agregue al menos un producto');
            return;
        }
        if (!effectiveLocationId) {
            toast.error('No hay ubicación activa de origen');
            return;
        }
        if (!destinationId) {
            toast.error('Seleccione destino');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await createDispatchSecure({
                type: 'OUTBOUND',
                originLocationId: effectiveLocationId,
                destinationLocationId: destinationId,
                items: cartItems.map(item => ({
                    batchId: item.id,
                    quantity: item.quantity,
                    sku: item.sku,
                    name: item.name,
                })),
                transportData: {
                    carrier: carrier || 'Sin especificar',
                    tracking_number: trackingNumber || 'N/A',
                    package_count: 1,
                },
                notes: notes || undefined,
            });

            if (result.success) {
                toast.success('Despacho creado exitosamente');
                // Reset
                setCartItems([]);
                setDestinationId('');
                setDestinationName('');
                setCarrier('');
                setTrackingNumber('');
                setNotes('');
                // Invalidar cache
                await queryClient.invalidateQueries({ queryKey: ['inventory'] });
            } else {
                toast.error(result.error || 'Error al crear despacho');
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', tab: 'Despacho' },
                extra: { itemCount: cartItems.length, destinationId }
            });
            toast.error('Error de conexión');
        } finally {
            setIsSubmitting(false);
        }
    };

    const canSubmit = cartItems.length > 0 && destinationId && !isSubmitting;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800">Despachos y Salidas</h3>
                <button
                    onClick={() => setWizardOpen(true)}
                    className="px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-sm font-semibold hover:bg-rose-100 transition-colors flex gap-2 items-center"
                >
                    <span className="text-lg">↩️</span>
                    Iniciar Devolución a Bodega
                </button>
            </div>

            {/* Scanner */}
            <div>
                <label className="text-sm font-bold text-slate-700 mb-2 block flex items-center gap-2">
                    <Truck size={16} className="text-sky-500" />
                    Agregar Productos al Despacho
                </label>
                <WMSProductScanner
                    inventory={inventory}
                    onProductSelected={handleProductSelected}
                    placeholder="Escanear o buscar producto para despachar..."
                />
            </div>

            {/* Carrito */}
            <WMSProductCart
                items={cartItems}
                onUpdateItem={handleUpdateItem}
                onRemoveItem={handleRemoveItem}
                title="Productos a Despachar"
                disabled={isSubmitting}
            />

            {/* Destino */}
            {cartItems.length > 0 && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                    <WMSLocationPicker
                        mode="destination"
                        currentLocationId={effectiveLocationId}
                        currentLocationName={currentLocationName}
                        onDestinationChange={(id, name) => {
                            setDestinationId(id);
                            setDestinationName(name);
                        }}
                        selectedDestination={destinationId}
                    />
                </div>
            )}

            {/* Datos de transporte */}
            {cartItems.length > 0 && destinationId && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700">Datos de Transporte (Opcional)</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="text"
                            value={carrier}
                            onChange={(e) => setCarrier(e.target.value)}
                            placeholder="Transportista..."
                            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium 
                                     text-slate-800 placeholder:text-slate-400
                                     focus:border-sky-400 focus:ring-4 focus:ring-sky-100
                                     outline-none transition-all"
                        />
                        <input
                            type="text"
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                            placeholder="Nº Seguimiento..."
                            className="px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium 
                                     text-slate-800 placeholder:text-slate-400
                                     focus:border-sky-400 focus:ring-4 focus:ring-sky-100
                                     outline-none transition-all"
                        />
                    </div>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notas adicionales..."
                        rows={2}
                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium 
                                 text-slate-800 placeholder:text-slate-400 resize-none
                                 focus:border-sky-400 focus:ring-4 focus:ring-sky-100
                                 outline-none transition-all"
                    />
                </div>
            )}

            {/* Botones de acción — sticky en móvil */}
            <div className="wms-sticky-action mt-4 pt-3 -mx-4 px-4">
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowReports(true)}
                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold 
                             rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <FileText size={18} />
                        Ver Reportes
                    </button>
                    <button
                        onClick={handleConfirmDispatch}
                        disabled={!canSubmit}
                        className="flex-[2] py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold 
                             rounded-xl shadow-lg shadow-sky-500/20
                             disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed
                             transition-all flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <><Loader2 size={18} className="animate-spin" /> Procesando...</>
                        ) : (
                            <><Send size={18} /> Confirmar Despacho</>
                        )}
                    </button>
                </div>
            </div>

            {/* Panel de reportes */}
            {showReports && (
                <WMSReportPanel
                    activeTab="DESPACHO"
                    locationId={effectiveLocationId}
                    onClose={() => setShowReports(false)}
                />
            )}

            {/* Wizard de Devolución (Modal o Componente superpuesto) */}
            {wizardOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <span className="text-xl">📦</span>
                                Asistente de Devolución
                            </h3>
                            <button
                                onClick={() => setWizardOpen(false)}
                                className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-0">
                            <DispatchWizard onClose={() => setWizardOpen(false)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WMSDespachoTab;
