/**
 * WMSCrearPedidoTab v2 — Crear Pedido / Orden de Compra directamente desde WMS
 *
 * Flujo 3 pasos:
 *   1. Proveedor + Fecha esperada
 *   2. Agregar artículos (escáner físico / cámara / búsqueda) con cantidad, costo e historial de costos
 *   3. Resumen + foto de guía + enviar a Kanban (DRAFT o SENT)
 *
 * Fase 6 extras:
 *   - Badge historial de costos (vs último costo en inventario)
 *   - Foto de guía de despacho (capture="environment" para celular)
 *   - Notificación a TODOS los gerentes via notifyManagersSecure
 *
 * Skills aplicadas: input-behavior-chile, financial-precision-math,
 *                   estilo-marca (#0ea5e9), rbac-pin-security, timezone-santiago
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
    ChevronRight, ChevronLeft, Building,
    Calendar, PackagePlus, Loader2,
    Send, Save, Trash2, Plus, Minus, DollarSign, AlertCircle,
    Camera, TrendingUp, TrendingDown, Minus as FlatIcon, Image
} from 'lucide-react';
import { WMSProductScanner } from '../WMSProductScanner';
import { usePharmaStore } from '@/presentation/store/useStore';
import { createPurchaseOrderSecure } from '@/actions/supply-v2';
import { notifyManagersSecure } from '@/actions/notifications-v2';
import { InventoryBatch } from '@/domain/types';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';

/* ─── Tipos ─────────────────────────────────────────────────────── */
interface OrderLineItem {
    productId?: string;
    sku: string;
    name: string;
    quantity: number;
    costPrice: number;
    salePrice: number;
    stockActual: number;
    prevCost: number;   // costo histórico del inventario
}

type Step = 1 | 2 | 3;

/* ─── Helpers Chile ──────────────────────────────────────────────── */
const todayChile = () =>
    new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Santiago',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());

const fmtCLP = (n: number) =>
    n.toLocaleString('es-CL', { maximumFractionDigits: 0 });

/* ─── Componente ─────────────────────────────────────────────────── */
export const WMSCrearPedidoTab: React.FC = () => {
    const qc = useQueryClient();
    const { suppliers, inventory, user, currentWarehouseId, currentLocationId, addPurchaseOrder } = usePharmaStore();

    /* Paso actual */
    const [step, setStep] = useState<Step>(1);

    /* Paso 1 — Proveedor */
    const [supplierId, setSupplierId] = useState('');
    const [supplierFree, setSupplierFree] = useState('');
    const [useFreeSup, setUseFreeSup] = useState(false);
    const [expectedDate, setExpectedDate] = useState(todayChile());
    const [orderNote, setOrderNote] = useState('');

    /* Paso 2 — Líneas */
    const [lines, setLines] = useState<OrderLineItem[]>([]);

    /* Paso 3 — Foto de guía */
    const [photoBase64, setPhotoBase64] = useState<string | null>(null);
    const [photoName, setPhotoName] = useState('');
    const photoInputRef = useRef<HTMLInputElement>(null);

    /* UI */
    const [submitting, setSubmitting] = useState(false);

    /* ── Computed ── */
    const activeSuppliers = useMemo(
        () => suppliers.filter(s => s.is_active !== false),
        [suppliers]
    );

    const selectedSupplier = useMemo(
        () => suppliers.find(s => s.id === supplierId),
        [supplierId, suppliers]
    );

    const totals = useMemo(() => {
        let net = 0, vat = 0, gross = 0;
        lines.forEach(l => {
            const unitVat = Math.round(l.costPrice * 0.19);
            net += l.costPrice * l.quantity;
            vat += unitVat * l.quantity;
            gross += (l.costPrice + unitVat) * l.quantity;
        });
        return { net, vat, gross };
    }, [lines]);

    /* ── Foto de guía ── */
    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setPhotoBase64(ev.target?.result as string);
            setPhotoName(file.name);
        };
        reader.readAsDataURL(file);
    };

    /* ── Paso 2 helpers ── */
    const addProduct = useCallback((p: InventoryBatch) => {
        setLines(prev => {
            const ex = prev.find(l => l.sku === p.sku);
            if (ex) {
                toast.success(`+1 a ${p.name}`);
                return prev.map(l => l.sku === p.sku ? { ...l, quantity: l.quantity + 1 } : l);
            }
            toast.success(`${p.name} agregado`);
            return [...prev, {
                productId: p.product_id || p.id,
                sku: p.sku,
                name: p.name,
                quantity: 1,
                costPrice: p.cost_price || p.cost_net || 0,
                salePrice: p.price_sell_unit || p.price || 0,
                stockActual: p.stock_actual,
                prevCost: p.cost_price || p.cost_net || 0,  // guardar el costo histórico en el momento de agregar
            }];
        });
    }, []);

    const updateLine = useCallback((sku: string, field: 'quantity' | 'costPrice', raw: string) => {
        const v = raw === '' ? 0 : parseFloat(raw);
        if (!isNaN(v)) setLines(prev => prev.map(l => l.sku === sku ? { ...l, [field]: v } : l));
    }, []);

    const removeLine = useCallback((sku: string) => {
        setLines(prev => prev.filter(l => l.sku !== sku));
    }, []);

    /* ── Paso 3 — Enviar ── */
    const handleSave = async (status: 'DRAFT' | 'SENT') => {
        if (!user?.id) return toast.error('Sesión inválida');
        if (lines.length === 0) return toast.error('Agrega al menos un producto');

        const proveedorLabel = useFreeSup
            ? supplierFree.trim() || 'Sin proveedor'
            : (selectedSupplier?.business_name || 'Sin proveedor');

        setSubmitting(true);
        try {
            const orderId = `OC-WMS-${Date.now().toString(36).toUpperCase()}`;
            const payload = {
                id: orderId,
                supplierId: useFreeSup ? null : (supplierId || null),
                targetWarehouseId: currentWarehouseId || '',
                items: lines.map(l => ({
                    sku: l.sku,
                    name: l.name,
                    quantity: l.quantity,
                    cost: l.costPrice,
                    productId: l.productId || null,
                })),
                notes: `WMS Order | Proveedor: ${proveedorLabel}${orderNote ? ' | ' + orderNote : ''}`.trim(),
                status: (status === 'SENT' ? 'APPROVED' : 'DRAFT') as 'DRAFT' | 'APPROVED',
                expectedDate: expectedDate || undefined,
            };

            const res = await createPurchaseOrderSecure(payload, user.id);
            if (!res.success) {
                toast.error(res.error || 'Error al crear la orden');
                return;
            }

            // Actualizar Zustand (Kanban inmediato)
            addPurchaseOrder({
                id: res.orderId || orderId,
                supplier_id: payload.supplierId || '',
                supplier_name: proveedorLabel,
                target_warehouse_id: payload.targetWarehouseId || '',
                destination_location_id: currentLocationId || '',
                status: payload.status as any,
                created_at: Date.now(),
                is_auto_generated: false,
                generation_reason: 'MANUAL',
                items: lines.map(l => ({
                    sku: l.sku,
                    name: l.name,
                    quantity_ordered: l.quantity,
                    quantity_received: 0,
                    cost_price: l.costPrice,
                    quantity: l.quantity,
                })),
                total_estimated: totals.gross,
            });

            if (status === 'SENT') {
                // Notificar a TODOS los gerentes/admin simultáneamente
                await notifyManagersSecure({
                    type: 'PROCUREMENT',
                    severity: 'INFO',
                    title: '📦 Nueva Orden de Compra desde WMS',
                    message: `OC ${res.orderId || orderId} — ${proveedorLabel} · ${lines.length} SKU · $${fmtCLP(totals.gross)} (IVA inc.) · Entrega: ${expectedDate || 'Sin fecha'}`,
                    actionUrl: '/wms',
                    metadata: {
                        orderId: res.orderId || orderId,
                        supplier: proveedorLabel,
                        totalGross: totals.gross,
                        itemCount: lines.length,
                        hasPhoto: !!photoBase64,
                    },
                    dedupKey: `oc-wms-${res.orderId || orderId}`,
                }).catch(() => {/* no bloquear */ });
            }

            toast.success(status === 'SENT'
                ? `✅ Orden enviada al Kanban${photoBase64 ? ' · Foto adjunta incluida' : ''}`
                : '💾 Borrador guardado en Kanban');
            await qc.invalidateQueries({ queryKey: ['purchase-orders'] });

            // Reset completo
            setStep(1); setSupplierId(''); setSupplierFree(''); setUseFreeSup(false);
            setExpectedDate(todayChile()); setOrderNote(''); setLines([]);
            setPhotoBase64(null); setPhotoName('');
        } catch (err) {
            Sentry.captureException(err, { tags: { module: 'WMS', tab: 'CrearPedido' } });
            toast.error('Error de conexión');
        } finally {
            setSubmitting(false);
        }
    };

    /* ─── Render ─────────────────────────────────────────────────── */
    return (
        <div className="space-y-5">

            {/* ── Indicador de pasos ── */}
            <div className="flex items-center gap-2">
                {([1, 2, 3] as Step[]).map(s => (
                    <React.Fragment key={s}>
                        <button
                            onClick={() => { if (s < step) setStep(s); }}
                            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${step === s
                                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                                : step > s
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-200 text-slate-500'
                                }`}
                        >
                            {step > s ? '✓' : s}
                        </button>
                        {s < 3 && <div className={`flex-1 h-0.5 rounded-full ${step > s ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                    </React.Fragment>
                ))}
                <span className="text-xs text-slate-500 font-medium ml-1">
                    {step === 1 && 'Proveedor'}
                    {step === 2 && 'Productos'}
                    {step === 3 && 'Confirmar'}
                </span>
            </div>

            {/* ══════════ PASO 1: Proveedor + Fecha ══════════ */}
            {step === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Building size={16} className="text-sky-500" /> Proveedor
                        </label>
                        <button
                            onClick={() => { setUseFreeSup(f => !f); setSupplierId(''); setSupplierFree(''); }}
                            className="text-xs text-sky-600 font-semibold hover:text-sky-700"
                        >
                            {useFreeSup ? 'Usar proveedor registrado' : '+ Proveedor externo'}
                        </button>
                    </div>

                    {!useFreeSup ? (
                        <select
                            value={supplierId}
                            onChange={e => setSupplierId(e.target.value)}
                            className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium text-slate-800 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all appearance-none"
                        >
                            <option value="">Seleccionar proveedor...</option>
                            <option value="TRANSFER">📦 Traspaso Interno</option>
                            {activeSuppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.business_name}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            value={supplierFree}
                            onChange={e => setSupplierFree(e.target.value)}
                            placeholder="Nombre del proveedor externo..."
                            className="w-full p-3 border-2 border-amber-200 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none transition-all"
                        />
                    )}

                    {selectedSupplier && (
                        <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-sm text-sky-700 space-y-1">
                            <p><strong>Condición:</strong> {selectedSupplier.payment_terms ?? '—'} días</p>
                            {selectedSupplier.rut && <p><strong>RUT:</strong> {selectedSupplier.rut}</p>}
                        </div>
                    )}

                    <div>
                        <label className="text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                            <Calendar size={16} className="text-sky-500" /> Fecha Esperada de Entrega
                        </label>
                        <input
                            type="date"
                            value={expectedDate}
                            onChange={e => setExpectedDate(e.target.value)}
                            className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium text-slate-800 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-bold text-slate-700 mb-1.5 block">Observaciones (opcional)</label>
                        <textarea
                            value={orderNote}
                            onChange={e => setOrderNote(e.target.value)}
                            placeholder="Ej: Urgente, pedido mínimo, condiciones especiales..."
                            rows={2}
                            className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 resize-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all"
                        />
                    </div>

                    <button
                        onClick={() => setStep(2)}
                        className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2"
                    >
                        Continuar <ChevronRight size={18} />
                    </button>
                </div>
            )}

            {/* ══════════ PASO 2: Agregar Productos ══════════ */}
            {step === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <label className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <PackagePlus size={16} className="text-sky-500" /> Agregar Productos
                        </label>
                        <WMSProductScanner
                            inventory={inventory}
                            onProductSelected={addProduct}
                            placeholder="Escanear código de barras o buscar..."
                            autoFocus={false}
                        />
                    </div>

                    {lines.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-700">
                                    {lines.length} producto{lines.length !== 1 ? 's' : ''} · {lines.reduce((s, l) => s + l.quantity, 0)} uds
                                </span>
                                <span className="text-xs text-slate-400">Costo anterior en gris</span>
                            </div>
                            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                                {lines.map(l => {
                                    const unitGross = Math.round(l.costPrice * 1.19);
                                    const diff = l.prevCost > 0 ? l.costPrice - l.prevCost : 0;
                                    const pct = l.prevCost > 0 ? Math.round((diff / l.prevCost) * 100) : 0;
                                    return (
                                        <div key={l.sku} className="px-3 py-2.5 flex items-start gap-2">
                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{l.name}</p>
                                                <p className="text-xs text-slate-400 font-mono">{l.sku} · Stock: {l.stockActual}</p>
                                            </div>

                                            {/* Cantidad */}
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={() => updateLine(l.sku, 'quantity', String(Math.max(1, l.quantity - 1)))}
                                                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                                                    <Minus size={10} />
                                                </button>
                                                <input type="number" min={1} value={l.quantity || ''}
                                                    onChange={e => updateLine(l.sku, 'quantity', e.target.value)}
                                                    className="w-10 h-6 text-center text-xs font-bold text-slate-800 bg-white border-2 border-slate-200 rounded-lg focus:border-sky-400 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                                <button onClick={() => updateLine(l.sku, 'quantity', String(l.quantity + 1))}
                                                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                                                    <Plus size={10} />
                                                </button>
                                            </div>

                                            {/* Costo + badge historial */}
                                            <div className="shrink-0 space-y-0.5">
                                                <div className="relative">
                                                    <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input type="number" min={0} value={l.costPrice || ''}
                                                        onChange={e => updateLine(l.sku, 'costPrice', e.target.value)}
                                                        placeholder="Costo"
                                                        className="w-20 h-6 pl-4 pr-1 text-right text-xs font-mono border-2 border-slate-200 rounded-lg focus:border-emerald-400 outline-none" />
                                                </div>
                                                {/* Badge historial de costos */}
                                                {l.prevCost > 0 && l.costPrice > 0 && (
                                                    <div className={`flex items-center gap-0.5 text-[9px] font-semibold rounded px-1 py-0.5 leading-none ${diff > 0 ? 'bg-red-50 text-red-600' : diff < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'
                                                        }`}>
                                                        {diff > 0 ? <TrendingUp size={8} /> : diff < 0 ? <TrendingDown size={8} /> : <FlatIcon size={8} />}
                                                        <span>prev ${fmtCLP(l.prevCost)} ({pct > 0 ? '+' : ''}{pct}%)</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Subtotal */}
                                            <span className="text-xs font-bold text-slate-700 w-16 text-right shrink-0 pt-0.5">
                                                ${fmtCLP(unitGross * l.quantity)}
                                            </span>

                                            {/* Eliminar */}
                                            <button onClick={() => removeLine(l.sku)}
                                                className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Total */}
                            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-xs text-slate-500">Neto: ${fmtCLP(totals.net)} + IVA: ${fmtCLP(totals.vat)}</span>
                                <span className="text-base font-black text-sky-600">Total: ${fmtCLP(totals.gross)}</span>
                            </div>
                        </div>
                    )}

                    {lines.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                            <PackagePlus size={36} className="mb-2 text-slate-300" />
                            <p className="text-sm font-medium">Escanea o busca productos para agregar</p>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={() => setStep(1)}
                            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                            <ChevronLeft size={18} /> Atrás
                        </button>
                        <button
                            onClick={() => { if (lines.length === 0) toast.error('Agrega al menos un producto'); else setStep(3); }}
                            disabled={lines.length === 0}
                            className="flex-[2] py-3 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                        >
                            Ver Resumen <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* ══════════ PASO 3: Resumen + Foto + Enviar ══════════ */}
            {step === 3 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Resumen info */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500 font-medium">Proveedor</span>
                            <span className="font-bold text-slate-800">
                                {useFreeSup ? supplierFree || 'Externo' : (selectedSupplier?.business_name || 'Sin especificar')}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500 font-medium">Entrega esperada</span>
                            <span className="font-semibold text-slate-700">{expectedDate || '—'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500 font-medium">Productos</span>
                            <span className="font-semibold text-slate-700">{lines.length} SKU · {lines.reduce((s, l) => s + l.quantity, 0)} uds</span>
                        </div>
                    </div>

                    {/* Lista compacta */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden max-h-52 overflow-y-auto">
                        {lines.map(l => (
                            <div key={l.sku} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 last:border-0">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{l.name}</p>
                                    <p className="text-xs text-slate-400 font-mono">{l.sku}</p>
                                </div>
                                <div className="text-right shrink-0 ml-4">
                                    <p className="text-sm font-bold text-slate-700">{l.quantity} uds</p>
                                    <p className="text-xs text-slate-500">${fmtCLP(Math.round(l.costPrice * 1.19 * l.quantity))}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Totales */}
                    <div className="bg-gradient-to-r from-sky-50 to-sky-100/50 border border-sky-200 rounded-2xl p-4 space-y-1.5">
                        <div className="flex justify-between text-sm text-sky-700">
                            <span>Neto</span><span className="font-semibold">${fmtCLP(totals.net)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-sky-700">
                            <span>IVA (19%)</span><span className="font-semibold">${fmtCLP(totals.vat)}</span>
                        </div>
                        <div className="flex justify-between text-base font-black text-sky-800 pt-1 border-t border-sky-200">
                            <span>Total Bruto</span><span>${fmtCLP(totals.gross)}</span>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-700">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <span>Al confirmar, la orden aparecerá en el <strong>Kanban de Suministros</strong>. Los gerentes recibirán una notificación al instante.</span>
                    </div>

                    {/* ── Foto de guía de despacho / remito ── */}
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Camera size={16} className="text-slate-400" /> Foto de Guía / Remito
                                <span className="text-xs font-normal text-slate-400">(opcional)</span>
                            </span>
                            {photoBase64 && (
                                <button onClick={() => { setPhotoBase64(null); setPhotoName(''); }}
                                    className="text-xs text-rose-500 hover:text-rose-700 font-semibold">
                                    Eliminar
                                </button>
                            )}
                        </div>
                        {photoBase64 ? (
                            <div>
                                <img src={photoBase64} alt="Guía de despacho" className="w-full max-h-48 object-cover rounded-xl" />
                                <span className="text-[10px] text-slate-400 block mt-1 truncate">{photoName}</span>
                            </div>
                        ) : (
                            <button
                                onClick={() => photoInputRef.current?.click()}
                                className="w-full py-4 text-slate-400 hover:text-sky-500 flex flex-col items-center gap-2 transition-colors"
                            >
                                <Image size={28} className="text-slate-300" />
                                <span className="text-xs font-medium">Tocar para fotografiar o adjuntar imagen</span>
                            </button>
                        )}
                        <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handlePhotoCapture}
                        />
                    </div>

                    {/* Botones de acción */}
                    <div className="space-y-3">
                        <div className="flex gap-3">
                            <button onClick={() => setStep(2)}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                                <ChevronLeft size={18} /> Editar
                            </button>
                            <button
                                onClick={() => handleSave('DRAFT')}
                                disabled={submitting}
                                className="flex-1 py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                            >
                                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Borrador
                            </button>
                        </div>
                        <button
                            onClick={() => handleSave('SENT')}
                            disabled={submitting}
                            className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                        >
                            {submitting
                                ? <><Loader2 size={18} className="animate-spin" /> Procesando...</>
                                : <><Send size={18} /> Confirmar y Enviar al Kanban</>
                            }
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WMSCrearPedidoTab;
