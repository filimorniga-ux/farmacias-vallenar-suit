import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import TimeFilter, { DateRange } from '../components/bi/TimeFilter';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, FileText, Package, Users, Download, AlertTriangle, CheckCircle, RefreshCw, ArrowDown, ArrowUp, Clock, X } from 'lucide-react';
import { toast } from 'sonner';

// V2 Backend Actions - Todas las funciones seguras
import {
    getCashFlowLedgerSecure, getTaxSummarySecure, getInventoryValuationSecure,
    getDetailedFinancialSummarySecure, getLogisticsKPIsSecure, getStockMovementsDetailSecure,
    CashFlowEntry, TaxSummary, InventoryValuation, PayrollPreview, LogisticsKPIs
} from '../../actions/reports-detail-v2';
import { exportCashFlowSecure, exportPayrollSecure, exportTaxSummarySecure, exportAttendanceSecure } from '../../actions/finance-export-v2';

import { HRReportTab } from '../components/reports/HRReportTab';
import { CashReceiptsReport } from '../components/reports/CashReceiptsReport';


const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const ReportsPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentWarehouseId, currentLocationId } = usePharmaStore();
    const [activeTab, setActiveTab] = useState<'cash' | 'tax' | 'logistics' | 'hr' | 'receipts'>('cash');
    const [dateRange, setDateRange] = useState<DateRange>(() => {
        const now = new Date();
        return {
            from: new Date(now.getFullYear(), now.getMonth(), 1),
            to: new Date(now.getFullYear(), now.getMonth() + 1, 0)
        };
    });
    const [loading, setLoading] = useState(false);

    // Data States
    const [cashLedger, setCashLedger] = useState<CashFlowEntry[]>([]);
    const [summary, setSummary] = useState<any>(null); // New State
    const [taxData, setTaxData] = useState<TaxSummary | null>(null);
    const [logisticsData, setLogisticsData] = useState<InventoryValuation | null>(null);
    const [logisticsKPIs, setLogisticsKPIs] = useState<LogisticsKPIs | null>(null);
    const [payrollData, setPayrollData] = useState<PayrollPreview[]>([]);

    // Logistics Detail State
    const [activeDetailType, setActiveDetailType] = useState<'IN' | 'OUT' | null>(null);
    const [movementDetail, setMovementDetail] = useState<any[]>([]);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const handleShowDetail = async (type: 'IN' | 'OUT') => {
        if (activeDetailType === type) {
            setActiveDetailType(null); // Toggle off
            return;
        }

        setActiveDetailType(type);
        setLoadingDetail(true);
        try {
            const whId = currentWarehouseId || currentLocationId || '';
            // V2: getStockMovementsDetailSecure
            const res = await getStockMovementsDetailSecure(type, dateRange.from.toISOString(), dateRange.to.toISOString(), whId);
            if (res.success && res.data) {
                setMovementDetail(res.data);
            } else {
                toast.error(res.error || 'Error cargando detalles');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error cargando detalles');
        } finally {
            setLoadingDetail(false);
        }
    };

    // Fetch Logic
    const fetchData = useCallback(async () => {
        // If receipts tab, no need to fetch here as component handles it internally
        if (activeTab === 'receipts') return;

        setLoading(true);
        try {
            if (activeTab === 'cash') {
                const [res, summaryRes] = await Promise.all([
                    getCashFlowLedgerSecure({ startDate: dateRange.from.toISOString(), endDate: dateRange.to.toISOString() }),
                    getDetailedFinancialSummarySecure(dateRange.from.toISOString(), dateRange.to.toISOString())
                ]);

                if (res.success && res.data) {
                    setCashLedger(res.data);
                } else {
                    toast.error(res.error || 'Error cargando flujo de caja');
                }

                if (summaryRes.success && summaryRes.data) {
                    setSummary(summaryRes.data);
                } else {
                    if (!res.success) toast.error(summaryRes.error || 'Error cargando resumen financiero');
                }

            } else if (activeTab === 'tax') {
                // Format YYYY-MM
                const monthStr = `${dateRange.from.getFullYear()}-${(dateRange.from.getMonth() + 1).toString().padStart(2, '0')}`;
                const res = await getTaxSummarySecure(monthStr);

                if (res.success && res.data) {
                    setTaxData(res.data);
                } else {
                    toast.error(res.error || 'Error cargando datos tributarios');
                }

            } else if (activeTab === 'logistics') {
                const whId = currentWarehouseId || currentLocationId || ''; // Fallback
                const [res, kpiRes] = await Promise.all([
                    getInventoryValuationSecure(whId),
                    getLogisticsKPIsSecure(dateRange.from.toISOString(), dateRange.to.toISOString(), whId)
                ]);

                if (res.success && res.data) {
                    setLogisticsData(res.data as InventoryValuation);
                } else {
                    toast.error(res.error || 'Error cargando valoración de inventario');
                }

                if (kpiRes.success && kpiRes.data) {
                    setLogisticsKPIs(kpiRes.data);
                } else {
                    toast.error(kpiRes.error || 'Error cargando KPIs logísticos');
                }

            } else if (activeTab === 'hr') {
                // Note: getPayrollPreviewSecure requires PIN, skipping for now - HR tab uses HRReportTab
                setPayrollData([]);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error cargando reporte');
        } finally {
            setLoading(false);
        }
    }, [activeTab, dateRange, currentWarehouseId, currentLocationId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Export Logic
    const [isExporting, setIsExporting] = useState(false);

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const startDate = dateRange.from.toISOString().split('T')[0];
            const endDate = dateRange.to.toISOString().split('T')[0];
            const locationId = currentLocationId || undefined;

            let result: { success: boolean; data?: string; filename?: string; error?: string } = { success: false };

            // V2: Usar función específica según tab
            if (activeTab === 'cash') {
                result = await exportCashFlowSecure({ startDate, endDate, locationId });
            } else if (activeTab === 'tax') {
                const monthStr = `${dateRange.from.getFullYear()}-${(dateRange.from.getMonth() + 1).toString().padStart(2, '0')}`;
                result = await exportTaxSummarySecure(monthStr);
            } else if (activeTab === 'hr') {
                result = await exportAttendanceSecure({ startDate, endDate, locationId });
            } else if (activeTab === 'receipts') {
                toast.info('Utilice el botón de exportar dentro de la tabla de recibos.');
                setIsExporting(false);
                return;
            } else {
                // Logistics - use cash flow as fallback
                result = await exportCashFlowSecure({ startDate, endDate, locationId });
            }

            if (result.success && result.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename || 'reporte.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('Reporte Excel generado correctamente');
            } else {
                toast.error('Error al generar: ' + (result.error || 'Desconocido'));
            }
        } catch (error) {
            console.error(error);
            toast.error('Error inesperado al exportar');
        } finally {
            setIsExporting(false);
        }
    };

    // Role-based Access Control
    const userRole = usePharmaStore(state => state.user?.role);

    const allTabs = [
        { id: 'cash' as const, label: 'Flujo de Caja', icon: DollarSign, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] },
        { id: 'receipts' as const, label: 'Recibos (No Boleta)', icon: FileText, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'CAJERO'] },
        { id: 'tax' as const, label: 'Tributario', icon: FileText, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'CONTADOR'] },
        { id: 'logistics' as const, label: 'Logística', icon: Package, roles: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'WAREHOUSE', 'QF'] },
        { id: 'hr' as const, label: 'RR.HH.', icon: Users, roles: ['RRHH', 'ADMIN', 'GERENTE_GENERAL', 'MANAGER'] }
    ];

    const tabs = allTabs.filter(t => !t.roles || (userRole && t.roles.includes(userRole)));

    return (
        <div className="p-6 space-y-6 h-[calc(100vh-80px)] overflow-y-auto bg-gray-50">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <TrendingUp className="w-8 h-8 text-blue-600" />
                        Reportes de Gestión
                    </h1>
                    <p className="text-gray-600 mt-1">Auditoría detallada y cumplimiento normativo</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigate('/reports/sales-by-product')}
                        className="px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-2 font-bold shadow-sm transition-colors"
                    >
                        <Package className="w-5 h-5" />
                        Ventas por Producto
                    </button>

                    <button onClick={fetchData} className="p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition">
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting || loading}
                        className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 font-bold shadow-lg shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isExporting ? <RefreshCw className="animate-spin w-5 h-5" /> : <Download className="w-5 h-5" />}
                        Exportar Excel
                    </button>
                </div>
            </div>

            {/* Time Filter */}
            <TimeFilter onFilterChange={setDateRange} initialRange={dateRange} />

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="border-b border-gray-200">
                    <div className="flex gap-1 p-2 overflow-x-auto">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-lg'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 min-h-[400px]">
                    {loading && (
                        <div className="flex justify-center items-center h-64">
                            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    )}

                    {!loading && activeTab === 'cash' && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4">

                            {/* NEW: Financial KPI Cards */}
                            {summary && (
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Ventas Totales</p>
                                        <p className="text-2xl font-bold text-blue-600 mt-1">${summary.total_sales.toLocaleString('es-CL')}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Nómina (Sueldos)</p>
                                        <p className="text-2xl font-bold text-red-600 mt-1">${summary.total_payroll.toLocaleString('es-CL')}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Leyes Sociales</p>
                                        <p className="text-2xl font-bold text-red-500 mt-1">${summary.total_social_security.toLocaleString('es-CL')}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-orange-100 shadow-sm">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Gastos Operativos</p>
                                        <p className="text-2xl font-bold text-orange-600 mt-1">${summary.total_operational_expenses.toLocaleString('es-CL')}</p>
                                    </div>
                                    <div className={`p-4 rounded-xl border shadow-sm ${summary.net_income >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                        <p className={`text-xs font-bold uppercase ${summary.net_income >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Utilidad Neta Real</p>
                                        <p className={`text-2xl font-bold mt-1 ${summary.net_income >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>${summary.net_income.toLocaleString('es-CL')}</p>
                                    </div>
                                </div>
                            )}

                            <h3 className="text-lg font-bold text-gray-800">Cartola de Movimientos (Ingresos vs Egresos)</h3>
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                                        <tr>
                                            <th className="p-3 text-left">Fecha</th>
                                            <th className="p-3 text-left">Descripción</th>
                                            <th className="p-3 text-left">Categoría</th>
                                            <th className="p-3 text-left">Responsable</th>
                                            <th className="p-3 text-right text-green-600">Entrada</th>
                                            <th className="p-3 text-right text-red-600">Salida</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {cashLedger.map((row) => (
                                            <tr key={row.id} className="hover:bg-gray-50">
                                                <td className="p-3 font-mono text-gray-600">
                                                    {new Date(row.timestamp).toLocaleString('es-CL')}
                                                </td>
                                                <td className="p-3 font-medium text-gray-900">{row.description}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${row.category === 'SALE' ? 'bg-blue-100 text-blue-700' :
                                                        row.category === 'EXPENSE' ? 'bg-red-100 text-red-700' :
                                                            row.category === 'INCOME' ? 'bg-green-100 text-green-700' :
                                                                'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {row.category}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-gray-500">{row.user_name}</td>
                                                <td className="p-3 text-right font-mono text-green-600 font-bold">
                                                    {row.amount_in > 0 ? `$${row.amount_in.toLocaleString('es-CL')}` : '-'}
                                                </td>
                                                <td className="p-3 text-right font-mono text-red-600 font-bold">
                                                    {row.amount_out > 0 ? `$${row.amount_out.toLocaleString('es-CL')}` : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                        {cashLedger.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-8 text-center text-gray-400">
                                                    No hay movimientos registrados en este período.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'tax' && taxData && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6">
                                <h3 className="font-bold text-blue-900 text-lg">Simulacro F29 - IVA Mensual</h3>
                                <p className="text-blue-700">Período calculado: {taxData.period}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100 rounded-bl-full -mr-4 -mt-4 opacity-50" />
                                    <p className="text-gray-500 font-medium">IVA Débito (Ventas)</p>
                                    <p className="text-3xl font-bold text-gray-900 mt-2">${taxData.total_vat_debit.toLocaleString('es-CL')}</p>
                                    <p className="text-sm text-gray-400 mt-1">Neto: ${taxData.total_net_sales.toLocaleString('es-CL')}</p>
                                </div>

                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-100 rounded-bl-full -mr-4 -mt-4 opacity-50" />
                                    <p className="text-gray-500 font-medium">IVA Crédito (Compras)</p>
                                    <p className="text-3xl font-bold text-green-600 mt-2">${taxData.total_vat_credit.toLocaleString('es-CL')}</p>
                                    <p className="text-sm text-gray-400 mt-1">Neto: ${taxData.total_net_purchases.toLocaleString('es-CL')}</p>
                                </div>

                                <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-lg relative overflow-hidden text-white">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-700 rounded-bl-full -mr-4 -mt-4 opacity-50" />
                                    <p className="text-slate-400 font-medium">Impuesto a Pagar (Est.)</p>
                                    <p className="text-4xl font-bold text-white mt-2">${taxData.estimated_tax_payment.toLocaleString('es-CL')}</p>
                                    <p className="text-sm text-slate-400 mt-1">Sin considerar PPM ni multas.</p>
                                </div>
                            </div>

                            <div className="text-center text-xs text-gray-400 mt-8">
                                * Este reporte es una simulación basada en los registros del sistema. No reemplaza la contabilidad oficial.
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'logistics' && logisticsData && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">

                            {/* KPI Logistics Cards */}
                            {logisticsKPIs && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div
                                        onClick={() => handleShowDetail('IN')}
                                        className={`bg-white p-4 rounded-xl shadow-sm border border-emerald-100 cursor-pointer transition-all hover:shadow-md hover:scale-105 ${activeDetailType === 'IN' ? 'ring-2 ring-emerald-500' : ''}`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                                                <ArrowDown className="w-5 h-5" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 uppercase">Entradas</p>
                                        </div>
                                        <p className="text-2xl font-bold text-emerald-700">{logisticsKPIs.total_in}</p>
                                        <p className="text-xs text-slate-400 mt-1">Clic para ver detalle</p>
                                    </div>

                                    <div
                                        onClick={() => handleShowDetail('OUT')}
                                        className={`bg-white p-4 rounded-xl shadow-sm border border-red-100 cursor-pointer transition-all hover:shadow-md hover:scale-105 ${activeDetailType === 'OUT' ? 'ring-2 ring-red-500' : ''}`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-red-100 rounded-lg text-red-600">
                                                <ArrowUp className="w-5 h-5" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 uppercase">Salidas</p>
                                        </div>
                                        <p className="text-2xl font-bold text-red-700">{logisticsKPIs.total_out}</p>
                                        <p className="text-xs text-slate-400 mt-1">Clic para ver detalle</p>
                                    </div>

                                    <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                                <Clock className="w-5 h-5" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 uppercase">Último Movimiento</p>
                                        </div>
                                        <p className="text-lg font-bold text-slate-700 truncate">
                                            {logisticsKPIs.last_movement ? new Date(logisticsKPIs.last_movement).toLocaleDateString('es-CL') : 'Sin movimientos'}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            {logisticsKPIs.last_movement ? new Date(logisticsKPIs.last_movement).toLocaleTimeString('es-CL') : '-'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Detail Table */}
                            {activeDetailType && (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8 animate-in slide-in-from-top-4">
                                    <div className={`p-4 border-b border-gray-200 flex justify-between items-center ${activeDetailType === 'IN' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                        <h3 className={`font-bold ${activeDetailType === 'IN' ? 'text-emerald-800' : 'text-red-800'}`}>
                                            Detalle de {activeDetailType === 'IN' ? 'Entradas' : 'Salidas'}
                                        </h3>
                                        <button onClick={() => setActiveDetailType(null)} className="text-gray-400 hover:text-gray-600">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {loadingDetail ? (
                                        <div className="p-8 text-center ml-auto mr-auto flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-blue-500" /></div>
                                    ) : (
                                        <div className="overflow-x-auto max-h-96">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0">
                                                    <tr>
                                                        <th className="p-3 text-left">Fecha</th>
                                                        <th className="p-3 text-left">Tipo</th>
                                                        <th className="p-3 text-left">Producto</th>
                                                        <th className="p-3 text-right">Cant.</th>
                                                        <th className="p-3 text-left pl-6">Origen/Destino</th>
                                                        <th className="p-3 text-left">Usuario</th>
                                                        <th className="p-3 text-left">Motivo/Nota</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {movementDetail.map((mov) => (
                                                        <tr key={mov.id} className="hover:bg-gray-50">
                                                            <td className="p-3 text-gray-500 whitespace-nowrap">
                                                                {new Date(mov.timestamp).toLocaleString('es-CL')}
                                                            </td>
                                                            <td className="p-3 overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px]">
                                                                <span className="px-2 py-1 rounded-md bg-gray-100 text-xs font-bold text-gray-700">
                                                                    {mov.type}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 font-medium text-gray-800">{mov.product}</td>
                                                            <td className={`p-3 text-right font-bold ${activeDetailType === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {activeDetailType === 'IN' ? '+' : '-'}{mov.quantity}
                                                            </td>
                                                            <td className="p-3 pl-6 text-gray-500 text-xs">{(mov as any).location_context || '-'}</td>
                                                            <td className="p-3 text-gray-500 text-xs">{mov.user}</td>
                                                            <td className="p-3 text-gray-400 italic text-xs truncate max-w-xs">{mov.reason}</td>
                                                        </tr>
                                                    ))}
                                                    {movementDetail.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="p-8 text-center text-gray-400">
                                                                No se encontraron movimientos.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-5 border border-purple-200 bg-purple-50 rounded-xl">
                                    <p className="text-purple-600 font-bold uppercase text-xs">Costo Inmovilizado</p>
                                    <p className="text-3xl font-bold text-purple-900 mt-1">${logisticsData.total_cost_value.toLocaleString('es-CL')}</p>
                                </div>
                                <div className="p-5 border border-cyan-200 bg-cyan-50 rounded-xl">
                                    <p className="text-cyan-600 font-bold uppercase text-xs">Valor Venta Potencial</p>
                                    <p className="text-3xl font-bold text-cyan-900 mt-1">${logisticsData.total_sales_value.toLocaleString('es-CL')}</p>
                                </div>
                                <div className="p-5 border border-green-200 bg-green-50 rounded-xl">
                                    <p className="text-green-600 font-bold uppercase text-xs">Margen Bruto Proyectado</p>
                                    <p className="text-3xl font-bold text-green-900 mt-1">${logisticsData.potential_gross_margin.toLocaleString('es-CL')}</p>
                                </div>
                            </div>

                            <h3 className="font-bold text-gray-800 text-lg mt-8">Top 20 Productos de Alto Valor (Pareto)</h3>
                            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 font-bold">
                                        <tr>
                                            <th className="p-3 text-left">Producto</th>
                                            <th className="p-3 text-right">Stock</th>
                                            <th className="p-3 text-right">Costo Unit.</th>
                                            <th className="p-3 text-right">Valor Costo Total</th>
                                            <th className="p-3 text-right text-green-700">Valor Venta Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {logisticsData.top_products?.map((prod, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="p-3 font-medium text-gray-900">{prod.name}</td>
                                                <td className="p-3 text-right">{prod.quantity}</td>
                                                <td className="p-3 text-right text-gray-500">${prod.cost_value > 0 ? Math.round(prod.cost_value / prod.quantity).toLocaleString('es-CL') : 0}</td>
                                                <td className="p-3 text-right font-bold text-purple-700">${prod.cost_value.toLocaleString('es-CL')}</td>
                                                <td className="p-3 text-right font-bold text-green-700">${prod.sales_value.toLocaleString('es-CL')}</td>
                                            </tr>
                                        ))}
                                        {(!logisticsData.top_products || logisticsData.top_products.length === 0) && (
                                            <tr>
                                                <td colSpan={5} className="p-4 text-center text-gray-400">Sin datos de productos valorizados</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'receipts' && (
                        <CashReceiptsReport startDate={dateRange.from} endDate={dateRange.to} />
                    )}

                    {!loading && activeTab === 'hr' && (
                        <div className="space-y-8">
                            <HRReportTab dateRange={dateRange} locationId={currentLocationId || undefined} />

                            <div className="border-t border-gray-200 pt-8 animate-in slide-in-from-right-4">
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                                    <Users size={20} className="text-gray-400" />
                                    Pre-Nómina de Remuneraciones
                                </h3>

                                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-500 font-bold">
                                            <tr>
                                                <th className="p-3 text-left">RUT</th>
                                                <th className="p-3 text-left">Colaborador</th>
                                                <th className="p-3 text-left">Cargo</th>
                                                <th className="p-3 text-right">Sueldo Base</th>
                                                <th className="p-3 text-right text-red-500">AFP (11%)</th>
                                                <th className="p-3 text-right text-red-500">Salud (7%)</th>
                                                <th className="p-3 text-right bg-blue-50 font-bold text-blue-800">Líquido a Pagar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {payrollData.map((emp) => (
                                                <tr key={emp.employee_id} className="hover:bg-gray-50">
                                                    <td className="p-3 font-mono text-gray-500">{emp.rut}</td>
                                                    <td className="p-3 font-bold text-gray-800">{emp.name}</td>
                                                    <td className="p-3 text-gray-600">{emp.job_title}</td>
                                                    <td className="p-3 text-right">${emp.base_salary.toLocaleString('es-CL')}</td>
                                                    <td className="p-3 text-right text-red-600">-${emp.deductions.afp.toLocaleString('es-CL')}</td>
                                                    <td className="p-3 text-right text-red-600">-${emp.deductions.health.toLocaleString('es-CL')}</td>
                                                    <td className="p-3 text-right bg-blue-50 font-bold text-blue-800 border-l border-blue-100">
                                                        ${emp.total_liquid.toLocaleString('es-CL')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-gray-400 mt-2">
                                    * Cálculo referencial basado en sueldo base bruto. No incluye gratificaciones, bonos, horas extra ni cargas familiares.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
};

export default ReportsPage;
