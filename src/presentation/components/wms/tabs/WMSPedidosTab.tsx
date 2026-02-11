/**
 * WMSPedidosTab - Recepción de Pedidos de Proveedor
 * Proveedor → Factura → Productos → Confirmar ingreso
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    PackagePlus, FileText, Loader2, CheckCircle, Search,
    Building, Receipt, Hash, Calendar, Plus, Trash2, Minus
} from 'lucide-react';
import { WMSReportPanel } from '../WMSReportPanel';
import { usePharmaStore } from '@/presentation/store/useStore';
import { getSuppliersListSecure } from '@/actions/suppliers-v2';
import { executeStockMovementSecure } from '@/actions/wms-v2';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';

interface Supplier { id: string; business_name: string; rut?: string; }
interface OrderItem {
    id: string; sku: string; name: string;
    quantity: number; unitCost: number;
}

export const WMSPedidosTab: React.FC = () => {
    const qc = useQueryClient();
    const { inventory, currentLocationId, currentWarehouseId } = usePharmaStore();

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loadingSuppliers, setLoadingSuppliers] = useState(true);
    const [supplierId, setSupplierId] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(() => {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    });
    const [items, setItems] = useState<OrderItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showRep, setShowRep] = useState(false);

    // Cargar proveedores
    useEffect(() => {
        getSuppliersListSecure().then(r => {
            if (r.success && r.data) setSuppliers(r.data as Supplier[]);
            setLoadingSuppliers(false);
        }).catch(() => setLoadingSuppliers(false));
    }, []);

    // Buscar productos
    const filtered = searchTerm.length >= 2
        ? (() => {
            const t = searchTerm.toLowerCase();
            const map = new Map<string, typeof inventory[0]>();
            inventory.forEach(p => {
                if (p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || p.barcode?.toLowerCase().includes(t)) {
                    if (!map.has(p.sku) || p.stock_actual > (map.get(p.sku)?.stock_actual || 0))
                        map.set(p.sku, p);
                }
            });
            return Array.from(map.values()).slice(0, 10);
        })()
        : [];

    const addItem = (p: typeof inventory[0]) => {
        setItems(prev => {
            if (prev.find(i => i.sku === p.sku)) {
                return prev.map(i => i.sku === p.sku ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { id: p.id, sku: p.sku, name: p.name, quantity: 1, unitCost: 0 }];
        });
        setSearchTerm(''); setShowSearch(false);
    };

    const updateQty = (sku: string, q: number) => {
        setItems(p => p.map(i => i.sku === sku ? { ...i, quantity: Math.max(1, q) } : i));
    };

    const updateCost = (sku: string, c: number) => {
        setItems(p => p.map(i => i.sku === sku ? { ...i, unitCost: Math.max(0, c) } : i));
    };

    const removeItem = (sku: string) => setItems(p => p.filter(i => i.sku !== sku));

    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
    const totalCost = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

    const confirm = async () => {
        if (!supplierId) return toast.error('Seleccione proveedor');
        if (!invoiceNumber) return toast.error('Ingrese número de factura');
        if (!items.length) return toast.error('Agregue productos');
        setSubmitting(true);
        try {
            // Procesar cada item como ingreso de stock
            let success = true;
            for (const item of items) {
                const r = await executeStockMovementSecure({
                    productId: item.id,
                    warehouseId: currentWarehouseId || currentLocationId,
                    type: 'PURCHASE_ENTRY',
                    quantity: item.quantity,
                    reason: `Factura: ${invoiceNumber} | Proveedor: ${supplierId} | Fecha: ${invoiceDate}`,
                    userId: currentLocationId, // Server resolves from session
                });
                if (!r.success) { toast.error(`Error en ${item.sku}: ${r.error}`); success = false; break; }
            }
            if (success) {
                toast.success(`Pedido registrado: ${totalUnits} unidades ingresadas`);
                setSupplierId(''); setInvoiceNumber(''); setItems([]); setNotes('');
                await qc.invalidateQueries({ queryKey: ['inventory'] });
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', tab: 'Pedidos' },
                extra: { supplierId, invoiceNumber, itemCount: items.length }
            });
            toast.error('Error de conexión');
        }
        finally { setSubmitting(false); }
    };

    return (
        <div className="space-y-5">
            {/* Proveedor */}
            <div>
                <label className="text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                    <Building size={16} className="text-sky-500" /> Proveedor
                </label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)} disabled={loadingSuppliers}
                    className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-medium text-slate-800 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all appearance-none">
                    <option value="">{loadingSuppliers ? 'Cargando...' : 'Seleccionar proveedor...'}</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.business_name}{s.rut ? ` (${s.rut})` : ''}</option>)}
                </select>
            </div>

            {/* Factura */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                        <Receipt size={16} className="text-sky-500" /> Nº Factura
                    </label>
                    <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                        placeholder="Ej: F-001234"
                        className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all" />
                </div>
                <div>
                    <label className="text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                        <Calendar size={16} className="text-sky-500" /> Fecha Factura
                    </label>
                    <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                        className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium text-slate-800 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all" />
                </div>
            </div>

            {/* Buscar y agregar productos */}
            <div className="relative">
                <label className="text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                    <PackagePlus size={16} className="text-sky-500" /> Agregar Productos
                </label>
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setShowSearch(e.target.value.length >= 2); }}
                        onFocus={() => searchTerm.length >= 2 && setShowSearch(true)}
                        placeholder="Buscar producto por nombre o SKU..."
                        className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all" />
                </div>
                {showSearch && filtered.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {filtered.map(p => (
                            <button key={p.sku} onClick={() => addItem(p)}
                                className="w-full text-left px-4 py-2.5 hover:bg-sky-50 border-b last:border-0 border-slate-100 text-sm">
                                <span className="font-semibold text-slate-800">{p.name}</span>
                                <span className="text-xs text-slate-500 ml-2">{p.sku}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Items del pedido */}
            {items.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between">
                        <h4 className="font-bold text-slate-700 text-sm">Productos del Pedido</h4>
                        <span className="text-xs text-slate-500">{items.length} items • {totalUnits} uds</span>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                        {items.map(item => (
                            <div key={item.sku} className="px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                                    <p className="text-xs text-slate-500">{item.sku}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="text-center">
                                        <label className="text-[10px] text-slate-400 block">Cant.</label>
                                        <input type="number" value={item.quantity} min={1}
                                            onChange={e => updateQty(item.sku, parseInt(e.target.value) || 1)}
                                            className="w-16 h-8 text-center font-bold text-slate-900 border border-slate-200 rounded-lg text-sm focus:border-sky-400 outline-none" />
                                    </div>
                                    <div className="text-center">
                                        <label className="text-[10px] text-slate-400 block">Costo $</label>
                                        <input type="number" value={item.unitCost} min={0}
                                            onChange={e => updateCost(item.sku, parseInt(e.target.value) || 0)}
                                            className="w-20 h-8 text-center font-bold text-slate-900 border border-slate-200 rounded-lg text-sm focus:border-sky-400 outline-none" />
                                    </div>
                                </div>
                                <button onClick={() => removeItem(item.sku)}
                                    className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-between">
                        <span className="text-sm text-slate-600">Total estimado</span>
                        <span className="text-lg font-bold text-slate-900">${totalCost.toLocaleString('es-CL')}</span>
                    </div>
                </div>
            )}

            {/* Notas */}
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones (opcional)..." rows={2}
                className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 resize-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all" />

            {/* Acciones — sticky en móvil */}
            <div className="wms-sticky-action mt-4 pt-3 -mx-4 px-4">
                <div className="flex gap-3">
                    <button onClick={() => setShowRep(true)}
                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                        <FileText size={18} /> Reportes
                    </button>
                    <button onClick={confirm} disabled={!supplierId || !invoiceNumber || !items.length || submitting}
                        className="flex-[2] py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                        {submitting ? <><Loader2 size={18} className="animate-spin" /> Procesando...</> : <><CheckCircle size={18} /> Registrar Pedido</>}
                    </button>
                </div>
            </div>

            {showRep && <WMSReportPanel activeTab="PEDIDOS" locationId={currentLocationId} onClose={() => setShowRep(false)} />}
        </div>
    );
};

export default WMSPedidosTab;
