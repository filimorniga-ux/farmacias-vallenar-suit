
'use client';

import React, { useState, useEffect } from 'react';
import { X, Printer, Search, FileText, Calendar, Filter, ShoppingCart, ArrowDownToLine } from 'lucide-react';
import { getQuotesSecure, getQuoteDetailsSecure } from '@/actions/quotes-v2';
import { toast } from 'sonner';
import { usePharmaStore } from '../../store/useStore';
import { formatChileDate, getChileDate } from '@/lib/utils';

interface QuoteHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Generate printable HTML with inline styles
function generatePrintHTML(quote: any): string {
    const itemsHTML = quote.items?.map((item: any) => `
        <div style="margin-bottom: 8px;">
            <div style="text-transform: uppercase;">${item.product_name || item.name || 'Producto'}</div>
            <div style="display: flex; justify-content: space-between;">
                <span>${item.quantity} x $${Number(item.unit_price).toLocaleString('es-CL')}</span>
                <span>$${Number(item.subtotal).toLocaleString('es-CL')}</span>
            </div>
            ${item.discount > 0 ? `<div style="font-size: 10px; font-style: italic; text-align: right;">(Desc. -$${Number(item.subtotal * (item.discount / 100)).toLocaleString('es-CL')})</div>` : ''}
        </div>
    `).join('') || '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Cotización ${quote.code}</title>
    <style>
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.3;
            color: #000;
            background: #fff;
            width: 80mm;
            padding: 10px;
        }
        .header { text-align: center; margin-bottom: 15px; }
        .title { font-size: 16px; font-weight: bold; text-transform: uppercase; }
        .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
        .quote-code { font-size: 14px; font-weight: bold; }
        .customer { margin-bottom: 15px; }
        .items { margin-bottom: 15px; }
        .items-header { display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 8px; }
        .totals { border-top: 1px dashed #000; padding-top: 8px; margin-bottom: 15px; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .total-final { font-size: 14px; font-weight: bold; margin-top: 8px; }
        .footer { text-align: center; font-size: 10px; }
        .footer-bold { font-weight: bold; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Farmacias Vallenar</div>
        <div style="font-size: 10px;">${quote.location_address || 'Casa Matriz'}</div>
        <div class="divider"></div>
        <div class="quote-code">COTIZACIÓN</div>
        <div class="quote-code">${quote.code}</div>
        <div style="font-size: 10px; margin-top: 4px;">${formatChileDate(quote.created_at)}</div>
    </div>

    <div class="customer">
        <div><strong>Cliente:</strong> ${quote.customer_name || 'Particular'}</div>
        ${quote.customer_phone ? `<div><strong>Fono:</strong> ${quote.customer_phone}</div>` : ''}
        <div><strong>Vendedor:</strong> ${quote.creator_name || 'Sistema'}</div>
    </div>

    <div class="items">
        <div class="items-header">
            <span>DESC</span>
            <span>TOT</span>
        </div>
        ${itemsHTML}
    </div>

    <div class="totals">
        <div class="total-row">
            <span>Subtotal:</span>
            <span>$${Number(quote.subtotal || quote.total).toLocaleString('es-CL')}</span>
        </div>
        <div class="total-row">
            <span>Descuento:</span>
            <span>-$${Number(quote.discount || 0).toLocaleString('es-CL')}</span>
        </div>
        <div class="total-row total-final">
            <span>TOTAL:</span>
            <span>$${Number(quote.total).toLocaleString('es-CL')}</span>
        </div>
    </div>

    <div class="footer">
        <div style="font-weight: bold; margin-bottom: 4px;">Válido hasta: ${formatChileDate(quote.valid_until, { hour: undefined, minute: undefined })}</div>
        <div>Precios sujetos a cambio sin previo aviso.</div>
        <div>Stock sujeto a disponibilidad al momento de la compra.</div>
        <div class="footer-bold">*** GRACIAS POR SU PREFERENCIA ***</div>
    </div>

    <script>
        window.onload = function() { 
            window.print(); 
            // Close after print dialog is handled (user prints or cancels)
            window.onafterprint = function() { window.close(); };
        };
    </script>
</body>
</html>
    `;
}

export default function QuoteHistoryModal({ isOpen, onClose }: QuoteHistoryModalProps) {
    const [quotes, setQuotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [filters, setFilters] = useState({
        page: 1,
        pageSize: 50,
        status: undefined as 'PENDING' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED' | undefined,
        startDate: (() => {
            const d = getChileDate();
            d.setHours(0, 0, 0, 0);
            return d;
        })(), // Default to Today 00:00:00
        endDate: undefined as Date | undefined,
        searchCode: '', // New Search Field
    });

    // Viewing Details
    const [viewQuote, setViewQuote] = useState<any>(null);
    const { retrieveQuote } = usePharmaStore();

    const loadQuotes = async () => {
        setLoading(true);
        const res = await getQuotesSecure(filters);
        if (res.success && res.data) {
            setQuotes(res.data);
        } else {
            toast.error(res.error || 'Error cargando historial');
        }
        setLoading(false);
    };

    useEffect(() => {
        if (isOpen) loadQuotes();
    }, [isOpen]); // Removed filters from dep array to avoid auto-spam, explicit 'Filtrar' click or Enter needed for text inputs

    const onViewDetails = async (quoteId: string) => {
        setLoadingDetails(true);
        const res = await getQuoteDetailsSecure(quoteId);
        if (res.success && res.data) {
            setViewQuote(res.data);
        } else {
            toast.error(res.error || 'Error al obtener detalles');
        }
        setLoadingDetails(false);
    };

    // Print using window.open() - More reliable than react-to-print for receipts
    const handlePrintCurrent = () => {
        if (!viewQuote) return;

        const printWindow = window.open('', '_blank', 'width=320,height=600');
        if (printWindow) {
            printWindow.document.write(generatePrintHTML(viewQuote));
            printWindow.document.close();
        } else {
            toast.error('No se pudo abrir la ventana de impresión. Verifique que los pop-ups estén habilitados.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">

            {/* MAIN LIST MODAL */}
            {!viewQuote && (
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="text-blue-600" />
                                Historial de Cotizaciones
                            </h2>
                            <p className="text-sm text-slate-500">Gestión centralizada de cotizaciones</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <X size={24} className="text-slate-500" />
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="p-4 border-b border-slate-100 flex gap-4 items-center bg-white flex-wrap">
                        {/* Date Range */}
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                            <Calendar size={16} className="text-slate-400" />
                            <input
                                type="date"
                                className="bg-transparent outline-none text-sm text-slate-600"
                                value={filters.startDate ? filters.startDate.toISOString().split('T')[0] : ''}
                                onChange={(e) => setFilters({ ...filters, startDate: e.target.value ? new Date(e.target.value + 'T00:00:00') : new Date() })}
                            />
                            <span className="text-slate-300">-</span>
                            <input
                                type="date"
                                className="bg-transparent outline-none text-sm text-slate-600"
                                value={filters.endDate ? filters.endDate.toISOString().split('T')[0] : ''}
                                onChange={(e) => setFilters({ ...filters, endDate: e.target.value ? new Date(e.target.value + 'T23:59:59') : undefined })}
                            />
                        </div>

                        {/* Search Input */}
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 flex-1 max-w-md">
                            <Search size={16} className="text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por código..."
                                className="bg-transparent outline-none text-sm text-slate-700 w-full placeholder:text-slate-400"
                                value={filters.searchCode}
                                onChange={(e) => setFilters({ ...filters, searchCode: e.target.value })}
                                onKeyDown={(e) => e.key === 'Enter' && loadQuotes()}
                            />
                        </div>

                        <button
                            onClick={() => loadQuotes()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 shadow-sm shadow-blue-200"
                        >
                            <Filter size={16} /> Filtrar
                        </button>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto p-4 bg-slate-50 relative">
                        {loadingDetails && (
                            <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                <div className="text-blue-600 font-bold animate-pulse">Cargando detalles...</div>
                            </div>
                        )}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4">Código</th>
                                        <th className="px-6 py-4">Fecha</th>
                                        <th className="px-6 py-4">Cliente</th>
                                        <th className="px-6 py-4">Vendedor</th>
                                        <th className="px-6 py-4 text-right">Total</th>
                                        <th className="px-6 py-4 text-center">Estado</th>
                                        <th className="px-6 py-4 text-center">Ver</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-slate-400">Cargando...</td>
                                        </tr>
                                    ) : quotes.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-slate-400">No se encontraron cotizaciones</td>
                                        </tr>
                                    ) : (
                                        quotes.map((q) => (
                                            <tr
                                                key={q.id}
                                                onClick={() => onViewDetails(q.id)}
                                                className="hover:bg-blue-50 cursor-pointer transition-colors"
                                            >
                                                <td className="px-6 py-4 font-mono font-bold text-slate-700">{q.code}</td>
                                                <td className="px-6 py-4 text-slate-600">
                                                    {formatChileDate(q.created_at, { hour: undefined, minute: undefined })}
                                                    <span className="text-xs text-slate-400 block">{formatChileDate(q.created_at, { day: undefined, month: undefined, year: undefined })}</span>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-800">
                                                    {q.customer_name || 'Particular'}
                                                </td>
                                                <td className="px-6 py-4 text-slate-600">{q.creator_name}</td>
                                                <td className="px-6 py-4 text-right font-bold text-slate-800">${Number(q.total).toLocaleString('es-CL')}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                                                        ${q.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                                                            q.status === 'CONVERTED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}
                                                    `}>
                                                        {q.status === 'PENDING' ? 'Pendiente' : q.status === 'CONVERTED' ? 'Vendida' : q.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center text-slate-400">
                                                    <Search size={18} />
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center text-sm text-slate-500">
                        <div>
                            Mostrando {quotes.length} resultados
                        </div>
                    </div>
                </div>
            )}

            {/* DETAILS MODAL OVERLAY */}
            {viewQuote && (
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="text-blue-600" />
                                Detalle Cotización
                            </h2>
                            <p className="font-mono text-sm text-slate-500">{viewQuote.code}</p>
                        </div>
                        <button onClick={() => setViewQuote(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <X size={24} className="text-slate-500" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 overflow-y-auto max-h-[60vh]">
                        {/* Info Grid */}
                        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                            <div>
                                <label className="text-slate-500 block text-xs uppercase font-bold">Cliente</label>
                                <div className="font-medium">{viewQuote.customer_name || 'Particular'}</div>
                                {viewQuote.customer_phone && <div className="text-slate-400 text-xs">{viewQuote.customer_phone}</div>}
                            </div>
                            <div>
                                <label className="text-slate-500 block text-xs uppercase font-bold">Vendedor</label>
                                <div className="font-medium">{viewQuote.creator_name}</div>
                            </div>
                            <div>
                                <label className="text-slate-500 block text-xs uppercase font-bold">Fecha</label>
                                <div className="font-medium">{formatChileDate(viewQuote.created_at)}</div>
                            </div>
                            <div>
                                <label className="text-slate-500 block text-xs uppercase font-bold">Total</label>
                                <div className="font-bold text-blue-600 text-lg">${Number(viewQuote.total).toLocaleString('es-CL')}</div>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                                    <tr>
                                        <th className="px-4 py-2">Producto</th>
                                        <th className="px-4 py-2 text-center">Cant.</th>
                                        <th className="px-4 py-2 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {viewQuote.items?.map((item: any, i: number) => (
                                        <tr key={i}>
                                            <td className="px-4 py-2">
                                                <div className="font-medium text-slate-700">{item.product_name || item.name}</div>
                                                <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                                            </td>
                                            <td className="px-4 py-2 text-center">{item.quantity}</td>
                                            <td className="px-4 py-2 text-right font-medium">${Number(item.subtotal).toLocaleString('es-CL')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button
                            onClick={() => setViewQuote(null)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={handlePrintCurrent}
                            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-blue-200 shadow-lg"
                        >
                            <Printer size={18} /> Imprimir Ticket
                        </button>
                        <button
                            onClick={async () => {
                                if (viewQuote) {
                                    const success = await retrieveQuote(viewQuote.id);
                                    if (success) {
                                        setViewQuote(null);
                                        onClose();
                                    }
                                }
                            }}
                            className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-emerald-200 shadow-lg"
                        >
                            <ShoppingCart size={18} /> Cargar al Carrito
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
