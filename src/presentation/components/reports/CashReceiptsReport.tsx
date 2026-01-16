'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Calendar, Download, FileText, Search, Loader,
    ChevronLeft, ChevronRight, DollarSign, User, X, Eye
} from 'lucide-react';
import { getCashReceipts, getReceiptDetails, CashReceipt, ReceiptDetailItem } from '@/actions/analytics/cash-receipts';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface CashReceiptsReportProps {
    startDate: Date;
    endDate: Date;
}

export function CashReceiptsReport({ startDate, endDate }: CashReceiptsReportProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<CashReceipt[]>([]);

    // Detail Modal State
    const [selectedReceipt, setSelectedReceipt] = useState<CashReceipt | null>(null);
    const [detailItems, setDetailItems] = useState<ReceiptDetailItem[]>([]);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    async function fetchData() {
        setLoading(true);
        try {
            const res = await getCashReceipts({
                startDate,
                endDate
            });

            if (res.success && res.data) {
                setData(res.data);
            } else {
                toast.error(res.error || 'Error cargando datos');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    }

    async function handleRowClick(receipt: CashReceipt) {
        setSelectedReceipt(receipt);
        setLoadingDetail(true);
        try {
            const res = await getReceiptDetails(receipt.id);
            if (res.success && res.data) {
                setDetailItems(res.data);
            } else {
                toast.error(res.error || 'Error cargando detalle');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar detalle');
        } finally {
            setLoadingDetail(false);
        }
    }

    function handleExportExcel() {
        if (data.length === 0) {
            toast.info('No hay datos para exportar');
            return;
        }

        const wb = XLSX.utils.book_new();
        const wsData = data.map(item => ({
            'ID Venta': item.id,
            'Fecha': format(new Date(item.timestamp), 'dd/MM/yyyy HH:mm'),
            'Cajero': item.user_name,
            'Items': item.items_summary,
            'Cantidad Items': item.items_count,
            'Total': item.total_amount,
            'Estado': item.status
        }));

        const ws = XLSX.utils.json_to_sheet(wsData);

        // Add column widths
        const wscols = [
            { wch: 36 }, // ID
            { wch: 20 }, // Fecha
            { wch: 25 }, // Cajero
            { wch: 50 }, // Items
            { wch: 10 }, // Qty
            { wch: 15 }, // Total
            { wch: 15 }  // Estado
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "Recibos");
        const startStr = startDate ? format(startDate, 'yyyy-MM-dd') : 'inicio';
        const endStr = endDate ? format(endDate, 'yyyy-MM-dd') : 'fin';
        XLSX.writeFile(wb, `Recibos_Caja_${startStr}_${endStr}.xlsx`);
        toast.success('Excel descargado');
    }

    const totalAmount = data.reduce((sum, item) => sum + item.total_amount, 0);

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <FileText size={20} className="text-blue-600" />
                        Reporte de Recibos y Comprobantes
                    </h3>
                </div>

                <div className="flex items-center gap-4">
                    <div className="bg-purple-50 text-purple-700 px-4 py-2 rounded-lg text-sm font-bold">
                        Total Periodo: ${totalAmount.toLocaleString('es-CL')}
                    </div>
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                        <Download size={16} />
                        Excel
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cajero</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Resumen Items</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Ver</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        <Loader className="mx-auto animate-spin mb-2" size={24} />
                                        Cargando datos...
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        No hay recibos registrados en este período
                                    </td>
                                </tr>
                            ) : (
                                data.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-blue-50 transition-colors cursor-pointer group"
                                        onClick={() => handleRowClick(item)}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {format(new Date(item.timestamp), 'dd MMM HH:mm', { locale: es })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="text-gray-400" />
                                                {item.user_name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs" title={item.items_summary}>
                                            {item.items_summary || <span className="text-gray-400 italic">Sin detalle</span>}
                                            {item.items_count > 1 && <span className="text-xs text-gray-400 ml-1">({item.items_count} items)</span>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                                            ${item.total_amount.toLocaleString('es-CL')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                item.status === 'VOIDED' ? 'bg-red-100 text-red-700' :
                                                    'bg-gray-100 text-gray-700'
                                                }`}>
                                                {item.status === 'COMPLETED' ? 'Pagado' : item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center text-gray-400 group-hover:text-blue-500">
                                            <Eye size={18} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedReceipt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">Detalle de Recibo</h3>
                                <p className="text-sm text-gray-500">
                                    {format(new Date(selectedReceipt.timestamp), "dd 'de' MMMM, yyyy - HH:mm", { locale: es })}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedReceipt(null)}
                                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            {loadingDetail ? (
                                <div className="py-12 flex flex-col items-center justify-center text-gray-500">
                                    <Loader className="animate-spin mb-3 text-blue-500" size={32} />
                                    <p>Cargando detalle...</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Info Card */}
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <p className="text-gray-500 text-xs uppercase font-bold">Cajero</p>
                                            <p className="font-medium text-gray-800">{selectedReceipt.user_name}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <p className="text-gray-500 text-xs uppercase font-bold">Estado</p>
                                            <p className={`font-medium ${selectedReceipt.status === 'COMPLETED' ? 'text-green-600' : 'text-red-600'
                                                }`}>
                                                {selectedReceipt.status === 'COMPLETED' ? 'Pagado' : selectedReceipt.status}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Items Table */}
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                            <tr>
                                                <th className="py-2 px-3 text-left">Producto</th>
                                                <th className="py-2 px-3 text-right">Cant.</th>
                                                <th className="py-2 px-3 text-right">Precio Unit.</th>
                                                <th className="py-2 px-3 text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {detailItems.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="py-3 px-3 text-gray-800">{item.name}</td>
                                                    <td className="py-3 px-3 text-right text-gray-600">{item.quantity}</td>
                                                    <td className="py-3 px-3 text-right text-gray-500">${item.price.toLocaleString('es-CL')}</td>
                                                    <td className="py-3 px-3 text-right font-medium text-gray-900">${item.total.toLocaleString('es-CL')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="border-t border-gray-200">
                                            <tr>
                                                <td colSpan={3} className="py-4 px-3 text-right font-bold text-gray-900 text-lg">Total</td>
                                                <td className="py-4 px-3 text-right font-bold text-blue-600 text-lg">
                                                    ${selectedReceipt.total_amount.toLocaleString('es-CL')}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
