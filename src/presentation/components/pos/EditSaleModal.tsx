'use client';

/**
 * EditSaleModal – Edición supervisada de venta
 *
 * Flujo en 4 steps:
 *   EDIT_ITEMS  → editar ítems, cantidades, precios y agregar productos
 *   PIN_AUTH    → autorización PIN de supervisor
 *   SUBMITTING  → procesando
 *   SUCCESS     → confirmación
 *
 * Requiere PIN de ADMIN / MANAGER / GERENTE_GENERAL.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Trash2, Plus, Search, AlertTriangle, CheckCircle2,
    Loader2, ChevronRight, ChevronLeft, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { editSaleSecure } from '@/actions/sales-v2';
import {
    searchProductsForEditSecure,
    ProductForEditResult,
} from '@/actions/search-actions';
import type { CashMovementView } from '@/actions/cash-management-v2';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditableItem {
    /** ID temporal en UI; no se persiste */
    _key: string;
    batch_id?: string | null;
    sku?: string;
    name: string;
    quantity: number;
    price: number;
    is_fractional?: boolean;
}

type Step = 'EDIT_ITEMS' | 'PIN_AUTH' | 'SUBMITTING' | 'SUCCESS';

interface EditSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Venta seleccionada del historial */
    sale: CashMovementView;
    /** ID de ubicación para buscar inventario de la sucursal correcta */
    locationId: string;
    /** ID del cajero que solicita la edición */
    userId: string;
    /** Callback para refrescar historial tras la edición exitosa */
    onEditComplete: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function key(): string {
    return Math.random().toString(36).slice(2);
}

function itemsFromSale(sale: CashMovementView): EditableItem[] {
    if (!sale.items || !Array.isArray(sale.items)) return [];
    return sale.items.map((item: any) => ({
        _key: key(),
        batch_id: item.batch_id ?? null,
        sku: item.sku ?? '',
        name: item.name ?? 'Producto',
        quantity: Number(item.quantity ?? item.qty ?? 1),
        price: Number(item.unit_price ?? item.price ?? 0),
        is_fractional: Boolean(item.is_fractional),
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditSaleModal({
    isOpen,
    onClose,
    sale,
    locationId,
    userId,
    onEditComplete,
}: EditSaleModalProps) {
    // ── Step ──────────────────────────────────────────────────────────────────
    const [step, setStep] = useState<Step>('EDIT_ITEMS');

    // ── Items ─────────────────────────────────────────────────────────────────
    const [items, setItems] = useState<EditableItem[]>([]);
    const originalTotal = sale.amount ? Number(sale.amount) : 0;

    // ── Reason ────────────────────────────────────────────────────────────────
    const [reason, setReason] = useState('');

    // ── Product search ────────────────────────────────────────────────────────
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<ProductForEditResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchRef = useRef<HTMLDivElement>(null);

    // ── PIN ───────────────────────────────────────────────────────────────────
    const [pin, setPin] = useState<string[]>(['', '', '', '']);
    const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

    // ── Result ────────────────────────────────────────────────────────────────
    const [newTotal, setNewTotal] = useState<number>(0);
    const [submitError, setSubmitError] = useState('');

    // ── Init / reset ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            setStep('EDIT_ITEMS');
            setItems(itemsFromSale(sale));
            setReason('');
            setSearchTerm('');
            setSearchResults([]);
            setShowDropdown(false);
            setPin(['', '', '', '']);
            setSubmitError('');
        }
    }, [isOpen, sale]);

    // ── Close dropdown on outside click ──────────────────────────────────────
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // ── Product search with debounce ──────────────────────────────────────────
    useEffect(() => {
        if (searchDebounce.current) clearTimeout(searchDebounce.current);

        if (searchTerm.trim().length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        searchDebounce.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const result = await searchProductsForEditSecure(searchTerm.trim(), locationId);
                if (result.success && result.data) {
                    setSearchResults(result.data);
                    setShowDropdown(result.data.length > 0);
                }
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => {
            if (searchDebounce.current) clearTimeout(searchDebounce.current);
        };
    }, [searchTerm, locationId]);

    // ── PIN focus on step change ──────────────────────────────────────────────
    useEffect(() => {
        if (step === 'PIN_AUTH') {
            setTimeout(() => pinRefs.current[0]?.focus(), 100);
        }
    }, [step]);

    // ─── Computed ─────────────────────────────────────────────────────────────
    const computedTotal = items.reduce((acc, i) => acc + i.quantity * i.price, 0);
    const hasChanges = (() => {
        const orig = itemsFromSale(sale);
        if (orig.length !== items.length) return true;
        return items.some((item, idx) => {
            const o = orig[idx];
            if (!o) return true;
            return (
                (item.batch_id ?? '') !== (o.batch_id ?? '') ||
                item.quantity !== o.quantity ||
                item.price !== o.price
            );
        });
    })();
    const canContinue = hasChanges && reason.trim().length >= 10 && items.length >= 1;

    // ─── Item handlers ────────────────────────────────────────────────────────
    const updateItem = useCallback((k: string, field: 'quantity' | 'price', value: number) => {
        setItems(prev => prev.map(i =>
            i._key === k ? { ...i, [field]: value } : i
        ));
    }, []);

    const removeItem = useCallback((k: string) => {
        setItems(prev => {
            if (prev.length <= 1) {
                toast.warning('La venta debe tener al menos un ítem.');
                return prev;
            }
            return prev.filter(i => i._key !== k);
        });
    }, []);

    const addProduct = useCallback((product: ProductForEditResult) => {
        setItems(prev => [
            ...prev,
            {
                _key: key(),
                batch_id: product.batch_id,
                sku: product.sku,
                name: product.name,
                quantity: 1,
                price: product.price,
            },
        ]);
        setSearchTerm('');
        setSearchResults([]);
        setShowDropdown(false);
    }, []);

    // ─── PIN handlers ─────────────────────────────────────────────────────────
    const handlePinChange = useCallback((index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const next = [...pin];
        next[index] = value.slice(-1);
        setPin(next);
        if (value && index < 3) {
            pinRefs.current[index + 1]?.focus();
        }
    }, [pin]);

    const handlePinKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            pinRefs.current[index - 1]?.focus();
        }
    }, [pin]);

    const handlePinPaste = useCallback((e: React.ClipboardEvent) => {
        const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
        if (digits.length > 0) {
            const next = [...pin];
            digits.split('').forEach((d, i) => { next[i] = d; });
            setPin(next);
            pinRefs.current[Math.min(digits.length, 3)]?.focus();
        }
        e.preventDefault();
    }, [pin]);

    const pinValue = pin.join('');

    // ─── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (pinValue.length < 4) {
            setSubmitError('Ingresa el PIN completo de 4 dígitos.');
            return;
        }

        setStep('SUBMITTING');
        setSubmitError('');

        try {
            const result = await editSaleSecure({
                saleId: sale.id,
                userId,
                supervisorPin: pinValue,
                reason: reason.trim(),
                items: items.map(i => ({
                    batch_id: i.batch_id && i.batch_id.trim() ? i.batch_id : null,
                    sku: i.sku,
                    name: i.name,
                    quantity: i.quantity,
                    price: i.price,
                    is_fractional: i.is_fractional,
                })),
            });

            if (result.success) {
                setNewTotal(result.newTotal ?? computedTotal);
                setStep('SUCCESS');
            } else {
                setSubmitError(result.error || 'Error al editar la venta.');
                setPin(['', '', '', '']);
                setStep('PIN_AUTH');
                setTimeout(() => pinRefs.current[0]?.focus(), 100);
            }
        } catch {
            setSubmitError('Error inesperado. Intente nuevamente.');
            setPin(['', '', '', '']);
            setStep('PIN_AUTH');
        }
    }, [pinValue, sale.id, userId, reason, items, computedTotal]);

    // ─── Close guard ─────────────────────────────────────────────────────────
    const handleClose = useCallback(() => {
        if (step === 'SUBMITTING') return;
        onClose();
    }, [step, onClose]);

    if (!isOpen) return null;

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

                {/* ── HEADER ────────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-6 py-4 bg-amber-50 border-b border-amber-200 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
                            <Pencil size={18} className="text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-800 text-lg">Editar Venta</h2>
                            <p className="text-xs text-slate-500">
                                Requiere autorización de supervisor
                            </p>
                        </div>
                    </div>
                    {step !== 'SUBMITTING' && (
                        <button
                            onClick={handleClose}
                            className="text-slate-400 hover:text-slate-700 transition-colors"
                        >
                            <X size={22} />
                        </button>
                    )}
                </div>

                {/* ── STEP: EDIT_ITEMS ──────────────────────────────────────── */}
                {step === 'EDIT_ITEMS' && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                            {/* DTE Warning */}
                            {sale.dte_folio && (
                                <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4">
                                    <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-amber-800 text-sm">
                                            Esta venta tiene DTE emitido (Folio {sale.dte_folio})
                                        </p>
                                        <p className="text-amber-700 text-xs mt-1">
                                            La edición corrige los registros internos pero <strong>no modifica</strong> el documento tributario emitido al SII.
                                            Si necesitas corregir el DTE, emite una Nota de Crédito.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Items table */}
                            <div>
                                <h3 className="font-bold text-slate-700 text-sm mb-3 uppercase tracking-wide">
                                    Ítems de la venta
                                </h3>

                                <div className="space-y-2">
                                    {items.map(item => (
                                        <div
                                            key={item._key}
                                            className="grid grid-cols-[1fr_90px_110px_90px_36px] gap-2 items-center p-3 bg-slate-50 rounded-xl border border-slate-200"
                                        >
                                            {/* Name */}
                                            <p className="font-semibold text-slate-800 text-sm truncate" title={item.name}>
                                                {item.name}
                                            </p>

                                            {/* Quantity */}
                                            <div className="flex flex-col items-start">
                                                <label className="text-[10px] text-slate-400 mb-0.5 font-medium">Cantidad</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={item.quantity}
                                                    onChange={e => {
                                                        const v = parseInt(e.target.value, 10);
                                                        if (!isNaN(v) && v >= 1) updateItem(item._key, 'quantity', v);
                                                    }}
                                                    className="w-full border border-slate-300 rounded-lg px-2 py-1 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                />
                                            </div>

                                            {/* Price */}
                                            <div className="flex flex-col items-start">
                                                <label className="text-[10px] text-slate-400 mb-0.5 font-medium">Precio unit.</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={item.price}
                                                    onChange={e => {
                                                        const v = parseFloat(e.target.value);
                                                        if (!isNaN(v) && v > 0) updateItem(item._key, 'price', v);
                                                    }}
                                                    className="w-full border border-slate-300 rounded-lg px-2 py-1 text-sm text-right font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                />
                                            </div>

                                            {/* Subtotal */}
                                            <p className="text-right font-bold text-slate-800 text-sm">
                                                ${(item.quantity * item.price).toLocaleString()}
                                            </p>

                                            {/* Remove */}
                                            <button
                                                onClick={() => removeItem(item._key)}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition-colors"
                                                title="Eliminar ítem"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Add product search */}
                            <div>
                                <h3 className="font-bold text-slate-700 text-sm mb-3 uppercase tracking-wide flex items-center gap-2">
                                    <Plus size={15} /> Agregar producto
                                </h3>
                                <div ref={searchRef} className="relative">
                                    <div className="flex items-center gap-2 border border-slate-300 rounded-xl px-3 py-2.5 bg-white focus-within:ring-2 focus-within:ring-amber-400">
                                        <Search size={16} className="text-slate-400 shrink-0" />
                                        <input
                                            type="text"
                                            placeholder="Buscar por nombre o SKU..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                                            className="flex-1 text-sm outline-none bg-transparent"
                                        />
                                        {isSearching && <Loader2 size={14} className="animate-spin text-slate-400" />}
                                    </div>

                                    {showDropdown && searchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-56 overflow-y-auto">
                                            {searchResults.map(product => (
                                                <button
                                                    key={product.batch_id}
                                                    onClick={() => addProduct(product)}
                                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50 transition-colors text-left border-b border-slate-100 last:border-0"
                                                >
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-sm">{product.name}</p>
                                                        <p className="text-xs text-slate-500">SKU: {product.sku} · Stock: {product.stock}</p>
                                                    </div>
                                                    <div className="text-right shrink-0 ml-4">
                                                        <p className="font-bold text-slate-800 text-sm">${product.price.toLocaleString()}</p>
                                                        {product.stock <= 0 && (
                                                            <span className="text-[10px] text-red-500 font-bold">Sin stock</span>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Reason */}
                            <div>
                                <label className="block font-bold text-slate-700 text-sm mb-2">
                                    Motivo de la corrección <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder="Ej: Cajero ingresó cantidad incorrecta de paracetamol (10 en lugar de 1)..."
                                    rows={3}
                                    className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                                />
                                <p className={`text-xs mt-1 ${reason.trim().length < 10 ? 'text-slate-400' : 'text-emerald-600 font-medium'}`}>
                                    {reason.trim().length}/10 caracteres mínimo
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
                            <div className="text-sm">
                                <span className="text-slate-500">Total anterior: </span>
                                <span className="font-bold text-slate-700 line-through">${originalTotal.toLocaleString()}</span>
                                {hasChanges && (
                                    <>
                                        <span className="mx-2 text-slate-400">→</span>
                                        <span className={`font-extrabold ${computedTotal !== originalTotal ? 'text-amber-700' : 'text-slate-700'}`}>
                                            ${computedTotal.toLocaleString()}
                                        </span>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => setStep('PIN_AUTH')}
                                disabled={!canContinue}
                                className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
                            >
                                Continuar <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP: PIN_AUTH ────────────────────────────────────────── */}
                {step === 'PIN_AUTH' && (
                    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6">
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                                <Pencil size={28} className="text-amber-600" />
                            </div>
                            <h3 className="font-bold text-slate-800 text-xl mb-1">Autorización requerida</h3>
                            <p className="text-slate-500 text-sm max-w-xs">
                                Ingresa el PIN de un <strong>Administrador</strong> o <strong>Gerente</strong> para confirmar la edición.
                            </p>
                        </div>

                        {/* Resumen del cambio */}
                        <div className="w-full max-w-sm bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm">
                            <p className="text-slate-500 mb-1">Total anterior</p>
                            <p className="font-extrabold text-slate-700 text-lg line-through">${originalTotal.toLocaleString()}</p>
                            <p className="text-slate-500 mt-2 mb-1">Nuevo total</p>
                            <p className="font-extrabold text-amber-600 text-2xl">${computedTotal.toLocaleString()}</p>
                            <p className="text-slate-500 mt-3 text-xs italic truncate">"{reason}"</p>
                        </div>

                        {/* PIN inputs */}
                        <div className="flex gap-3">
                            {pin.map((digit, idx) => (
                                <input
                                    key={idx}
                                    ref={el => { pinRefs.current[idx] = el; }}
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={e => handlePinChange(idx, e.target.value)}
                                    onKeyDown={e => handlePinKeyDown(idx, e)}
                                    onPaste={idx === 0 ? handlePinPaste : undefined}
                                    className="w-14 h-14 text-center text-2xl font-bold border-2 border-slate-300 rounded-xl focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all"
                                />
                            ))}
                        </div>

                        {submitError && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl max-w-sm w-full">
                                <AlertTriangle size={16} />
                                {submitError}
                            </div>
                        )}

                        <div className="flex gap-3 w-full max-w-sm">
                            <button
                                onClick={() => { setSubmitError(''); setStep('EDIT_ITEMS'); }}
                                className="flex-1 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors"
                            >
                                <ChevronLeft size={18} /> Volver
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={pinValue.length < 4}
                                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
                            >
                                Autorizar
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP: SUBMITTING ──────────────────────────────────────── */}
                {step === 'SUBMITTING' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
                        <Loader2 size={48} className="animate-spin text-amber-500" />
                        <p className="font-bold text-slate-700 text-lg">Aplicando corrección...</p>
                        <p className="text-slate-400 text-sm">Ajustando inventario y registrando auditoría</p>
                    </div>
                )}

                {/* ── STEP: SUCCESS ─────────────────────────────────────────── */}
                {step === 'SUCCESS' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-5 py-16 px-6">
                        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                            <CheckCircle2 size={44} className="text-emerald-600" />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-slate-800 text-xl mb-2">Venta corregida exitosamente</h3>
                            <p className="text-slate-500 text-sm">Los ítems, el inventario y la auditoría han sido actualizados.</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-8 py-4 text-center">
                            <p className="text-slate-500 text-sm mb-1">Nuevo total de la venta</p>
                            <p className="font-extrabold text-emerald-700 text-3xl">${newTotal.toLocaleString()}</p>
                        </div>
                        <button
                            onClick={onEditComplete}
                            className="px-10 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors"
                        >
                            Cerrar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
