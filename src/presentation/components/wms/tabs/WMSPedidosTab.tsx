/**
 * WMSPedidosTab v2 - Recepción de Pedidos de Proveedor
 * 
 * Mejoras v2:
 * - WMSProductScanner integrado (lector físico + cámara del celular)
 * - Modo checklist con casillas para marcar ítems recibidos
 * - Cantidades editables en todas las etapas
 * - Soporte para proveedor libre (no registrado)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    FileText, Loader2, CheckCircle, Building,
    Receipt, Calendar, ScanBarcode, ToggleLeft,
    ToggleRight, UserPlus, AlertCircle
} from 'lucide-react';
import { WMSReportPanel } from '../WMSReportPanel';
import { WMSProductScanner } from '../WMSProductScanner';
import { WMSProductCart, WMSCartItem } from '../WMSProductCart';
import { usePharmaStore } from '@/presentation/store/useStore';
import { getSuppliersListSecure } from '@/actions/suppliers-v2';
import { executeStockMovementSecure } from '@/actions/wms-v2';
import { exportStockMovementsSecure } from '@/actions/inventory-export-v2';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import { InventoryBatch } from '@/domain/types';

interface Supplier { id: string; business_name: string; rut?: string; }
interface ReportFilters {
    startDate: string;
    endDate: string;
    movementType?: string;
}

export const WMSPedidosTab: React.FC = () => {
    const qc = useQueryClient();
    const { inventory, currentLocationId, currentWarehouseId } = usePharmaStore();

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loadingSuppliers, setLoadingSuppliers] = useState(true);

    // Proveedor: registrado o libre
    const [supplierId, setSupplierId] = useState('');
    const [supplierFree, setSupplierFree] = useState(''); // Si no está registrado
    const [useFreeSupplier, setUseFreeSupplier] = useState(false);

    // Factura
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(() => {
        return new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Santiago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
    });
    const [notes, setNotes] = useState('');

    // Productos
    const [items, setItems] = useState<WMSCartItem[]>([]);

    // UI States
    const [checklistMode, setChecklistMode] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showRep, setShowRep] = useState(false);

    // Cargar proveedores
    useEffect(() => {
        getSuppliersListSecure().then(r => {
            if (r.success && r.data) setSuppliers(r.data as Supplier[]);
            setLoadingSuppliers(false);
        }).catch(() => setLoadingSuppliers(false));
    }, []);

    // Agregar producto desde el escáner
    const addProduct = useCallback((p: InventoryBatch) => {
        setItems(prev => {
            const existing = prev.find(i => i.id === p.id);
            if (existing) {
                toast.success(`+1 a ${p.name}`);
                return prev.map(i => i.id === p.id
                    ? { ...i, quantity: i.quantity + 1 }
                    : i
                );
            }
            toast.success(`${p.name} agregado`);
            return [...prev, {
                id: p.id,
                sku: p.sku,
                name: p.name,
                quantity: 1,
                maxStock: p.stock_actual,
                lotNumber: p.lot_number,
                laboratory: p.laboratory,
                checked: false,
            }];
        });
    }, []);

    // Toggle casilla en modo checklist
    const toggleCheck = useCallback((id: string, checked: boolean) => {
        if ('vibrate' in navigator) navigator.vibrate(10);
        setItems(prev => prev.map(i => i.id === id ? { ...i, checked } : i));
    }, []);

    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
    const checkedCount = items.filter(i => i.checked).length;

    const confirm = async () => {
        const proveedorValido = useFreeSupplier ? !!supplierFree.trim() : !!supplierId;
        if (!proveedorValido) return toast.error('Seleccione o ingrese un proveedor');
        if (!invoiceNumber) return toast.error('Ingrese número de factura');
        if (!items.length) return toast.error('Agregue productos');

        // En modo checklist, verificar que todos estén marcados
        if (checklistMode && checkedCount < items.length) {
            const pendientes = items.length - checkedCount;
            return toast.error(`Faltan ${pendientes} ítem${pendientes > 1 ? 's' : ''} por verificar`);
        }

        setSubmitting(true);
        try {
            let success = true;
            for (const item of items) {
                const r = await executeStockMovementSecure({
                    productId: item.id,
                    warehouseId: currentWarehouseId || currentLocationId,
                    type: 'PURCHASE_ENTRY',
                    quantity: item.quantity,
                    reason: `Factura: ${invoiceNumber} | Proveedor: ${useFreeSupplier ? supplierFree : supplierId} | Fecha: ${invoiceDate}${notes ? ` | Nota: ${notes}` : ''}`,
                    userId: currentLocationId,
                });
                if (!r.success) { toast.error(`Error en ${item.sku}: ${r.error}`); success = false; break; }
            }
            if (success) {
                toast.success(`✅ Pedido registrado: ${totalUnits} unidades ingresadas`);
                setSupplierId(''); setSupplierFree(''); setInvoiceNumber('');
                setItems([]); setNotes(''); setChecklistMode(false);
                await qc.invalidateQueries({ queryKey: ['inventory'] });
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: { module: 'WMS', tab: 'Pedidos' },
                extra: { supplierId, invoiceNumber, itemCount: items.length }
            });
            toast.error('Error de conexión');
        } finally { setSubmitting(false); }
    };

    const handleExportExcel = async (filters: ReportFilters) => {
        const res = await exportStockMovementsSecure({
            startDate: filters.startDate,
            endDate: filters.endDate,
            locationId: currentLocationId,
            movementType: filters.movementType,
            limit: 5000
        });
        if (res.success && res.data && res.filename) {
            const link = document.createElement('a');
            link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.data}`;
            link.download = res.filename;
            link.click();
        } else {
            throw new Error(res.error || 'Error al exportar');
        }
    };

    return (
        <div className="space-y-5">

            {/* Proveedor */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Building size={16} className="text-sky-500" /> Proveedor
                    </label>
                    <button
                        onClick={() => { setUseFreeSupplier(f => !f); setSupplierId(''); setSupplierFree(''); }}
                        className="flex items-center gap-1.5 text-xs text-sky-600 font-semibold hover:text-sky-700 transition-colors"
                    >
                        <UserPlus size={13} />
                        {useFreeSupplier ? 'Usar proveedor registrado' : 'Proveedor no registrado'}
                    </button>
                </div>

                {!useFreeSupplier ? (
                    <select
                        value={supplierId}
                        onChange={e => setSupplierId(e.target.value)}
                        disabled={loadingSuppliers}
                        className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl font-medium text-slate-800 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all appearance-none"
                    >
                        <option value="">{loadingSuppliers ? 'Cargando...' : 'Seleccionar proveedor...'}</option>
                        {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.business_name}{s.rut ? ` (${s.rut})` : ''}</option>
                        ))}
                    </select>
                ) : (
                    <div className="relative">
                        <UserPlus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
                        <input
                            type="text"
                            value={supplierFree}
                            onChange={e => setSupplierFree(e.target.value)}
                            placeholder="Nombre del proveedor (nuevo o externo)..."
                            className="w-full pl-10 pr-4 py-3 border-2 border-amber-200 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none transition-all"
                        />
                    </div>
                )}
            </div>

            {/* Factura */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                        <Receipt size={16} className="text-sky-500" /> Nº Factura
                    </label>
                    <input
                        type="text"
                        value={invoiceNumber}
                        onChange={e => setInvoiceNumber(e.target.value)}
                        placeholder="Ej: F-001234"
                        className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all"
                    />
                </div>
                <div>
                    <label className="text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                        <Calendar size={16} className="text-sky-500" /> Fecha
                    </label>
                    <input
                        type="date"
                        value={invoiceDate}
                        onChange={e => setInvoiceDate(e.target.value)}
                        className="w-full p-3 border-2 border-slate-200 rounded-xl font-medium text-slate-800 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all"
                    />
                </div>
            </div>

            {/* Escáner / Buscador */}
            <div>
                <label className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <ScanBarcode size={16} className="text-sky-500" /> Agregar Productos
                </label>
                <WMSProductScanner
                    inventory={inventory}
                    onProductSelected={addProduct}
                    placeholder="Escanear código de barras o buscar producto..."
                    autoFocus={false}
                />
            </div>

            {/* Lista de productos + toggle checklist */}
            {items.length > 0 && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* Toggle Modo Checklist */}
                    <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            Lista de recepción
                        </span>
                        <button
                            onClick={() => setChecklistMode(m => !m)}
                            className={`flex items-center gap-1.5 text-xs font-semibold transition-colors px-3 py-1.5 rounded-full ${checklistMode
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                        >
                            {checklistMode ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            {checklistMode ? 'Verificación activa' : 'Activar verificación'}
                        </button>
                    </div>

                    {checklistMode && checkedCount < items.length && (
                        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            <AlertCircle size={14} />
                            Marca cada ítem mientras lo recibes físicamente. Debes verificar todos para confirmar.
                        </div>
                    )}

                    <WMSProductCart
                        items={items}
                        onUpdateItem={(id, q) => setItems(p => p.map(i => i.id === id ? { ...i, quantity: q } : i))}
                        onRemoveItem={id => setItems(p => p.filter(i => i.id !== id))}
                        onToggleCheck={toggleCheck}
                        checklistMode={checklistMode}
                        checklistLabel="recibidos"
                        title="Productos del Pedido"
                        showStock={true}
                        disabled={submitting}
                    />
                </div>
            )}

            {/* Notas */}
            <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observaciones del pedido (opcional)..."
                rows={2}
                className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 resize-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-all"
            />

            {/* Acciones — sticky en móvil */}
            <div className="wms-sticky-action mt-4 pt-3 -mx-4 px-4">
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowRep(true)}
                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        <FileText size={18} /> Reportes
                    </button>
                    <button
                        onClick={confirm}
                        disabled={
                            (!supplierId && !supplierFree.trim()) ||
                            !invoiceNumber ||
                            !items.length ||
                            submitting ||
                            (checklistMode && checkedCount < items.length)
                        }
                        className="flex-[2] py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                        {submitting
                            ? <><Loader2 size={18} className="animate-spin" /> Procesando...</>
                            : <><CheckCircle size={18} /> {checklistMode ? `Confirmar Recepción (${checkedCount}/${items.length})` : 'Registrar Pedido'}</>
                        }
                    </button>
                </div>
            </div>

            {showRep && (
                <WMSReportPanel
                    activeTab="PEDIDOS"
                    locationId={currentLocationId}
                    onClose={() => setShowRep(false)}
                    onExportExcel={handleExportExcel}
                />
            )}
        </div>
    );
};

export default WMSPedidosTab;
