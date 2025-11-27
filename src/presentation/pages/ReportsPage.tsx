import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../store/useStore';
import TimeFilter, { DateRange } from '../components/bi/TimeFilter';
import { FinancialService } from '../../domain/analytics/FinancialService';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, FileText, Package, Users, Download, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const ReportsPage: React.FC = () => {
    const { salesHistory, expenses, inventory, employees } = usePharmaStore();
    const [activeTab, setActiveTab] = useState<'cash' | 'tax' | 'logistics' | 'hr'>('cash');
    const [dateRange, setDateRange] = useState<DateRange>({
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        to: new Date()
    });

    // Calculate metrics based on date range
    const metrics = useMemo(() =>
        FinancialService.calculateMetrics(salesHistory, expenses, dateRange),
        [salesHistory, expenses, dateRange]
    );

    const dailySales = useMemo(() =>
        FinancialService.getDailySales(salesHistory, dateRange),
        [salesHistory, dateRange]
    );

    const topProducts = useMemo(() =>
        FinancialService.getTopProducts(salesHistory, dateRange, 10),
        [salesHistory, dateRange]
    );

    const salesSummary = useMemo(() =>
        FinancialService.getSalesSummary(
            FinancialService.filterByDateRange(salesHistory, dateRange.from, dateRange.to)
        ),
        [salesHistory, dateRange]
    );

    const expensesSummary = useMemo(() =>
        FinancialService.getExpensesSummary(
            FinancialService.filterByDateRange(expenses, dateRange.from, dateRange.to)
        ),
        [expenses, dateRange]
    );

    const taxCompliance = useMemo(() =>
        FinancialService.getTaxCompliance(
            FinancialService.filterByDateRange(salesHistory, dateRange.from, dateRange.to),
            FinancialService.filterByDateRange(expenses, dateRange.from, dateRange.to)
        ),
        [salesHistory, expenses, dateRange]
    );

    const laborCosts = useMemo(() =>
        FinancialService.getLaborCosts(employees),
        [employees]
    );

    const inventoryValue = useMemo(() =>
        FinancialService.calculateInventoryValue(inventory),
        [inventory]
    );

    const lowStockItems = useMemo(() =>
        FinancialService.getLowStockItems(inventory),
        [inventory]
    );

    const expiringItems = useMemo(() =>
        FinancialService.getExpiringItems(inventory, 30),
        [inventory]
    );

    const handleExportPDF = async () => {
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const doc = new jsPDF();

            // Header
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('Reporte Financiero - Farmacias Vallenar', 14, 20);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Período: ${dateRange.from.toLocaleDateString('es-CL')} - ${dateRange.to.toLocaleDateString('es-CL')}`, 14, 28);
            doc.text(`Generado: ${new Date().toLocaleString('es-CL')}`, 14, 33);

            // Metrics Summary
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Resumen Financiero', 14, 45);

            const metricsData = [
                ['Ventas Totales', `$${metrics.totalSales.toLocaleString('es-CL')}`],
                ['Gastos Totales', `$${metrics.totalExpenses.toLocaleString('es-CL')}`],
                ['Utilidad Neta', `$${metrics.netProfit.toLocaleString('es-CL')}`],
                ['Margen Bruto', `${metrics.grossMargin.toFixed(2)}%`],
                ['Transacciones', metrics.transactionCount.toString()],
                ['Ticket Promedio', `$${metrics.averageTicket.toLocaleString('es-CL')}`]
            ];

            autoTable(doc, {
                startY: 50,
                head: [['Métrica', 'Valor']],
                body: metricsData,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246] }
            });

            // Top Products
            doc.addPage();
            doc.setFontSize(14);
            doc.text('Top 10 Productos', 14, 20);

            const productsData = topProducts.map(p => [
                p.name,
                p.quantity.toString(),
                `$${p.revenue.toLocaleString('es-CL')}`
            ]);

            autoTable(doc, {
                startY: 25,
                head: [['Producto', 'Cantidad', 'Ingresos']],
                body: productsData,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246] }
            });

            doc.save(`reporte-financiero-${new Date().toISOString().split('T')[0]}.pdf`);
            toast.success('Reporte PDF generado exitosamente');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Error al generar el reporte PDF');
        }
    };

    const tabs = [
        { id: 'cash' as const, label: 'Flujo de Caja', icon: DollarSign },
        { id: 'tax' as const, label: 'Tributario', icon: FileText },
        { id: 'logistics' as const, label: 'Logística', icon: Package },
        { id: 'hr' as const, label: 'RR.HH.', icon: Users }
    ];

    return (
        <div className="p-6 space-y-6 h-[calc(100vh-80px)] overflow-y-auto bg-gray-50">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <TrendingUp className="w-8 h-8 text-blue-600" />
                        Reportes & Business Intelligence
                    </h1>
                    <p className="text-gray-600 mt-1">Análisis financiero y operacional en tiempo real</p>
                </div>
                <button
                    onClick={handleExportPDF}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold shadow-lg shadow-blue-200"
                >
                    <Download className="w-5 h-5" />
                    Exportar PDF
                </button>
            </div>

            {/* Time Filter */}
            <TimeFilter onFilterChange={setDateRange} initialRange={dateRange} />

            {/* Data Source Indicator */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <div>
                    <p className="font-bold text-blue-900">Conectado a Datos Reales</p>
                    <p className="text-sm text-blue-700">
                        Mostrando {salesHistory.length} transacciones, {expenses.length} gastos, {inventory.length} productos en inventario
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="border-b border-gray-200">
                    <div className="flex gap-1 p-2">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all ${activeTab === tab.id
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

                <div className="p-6">
                    {/* Cash Flow Tab */}
                    {activeTab === 'cash' && (
                        <div className="space-y-6">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                                    <p className="text-blue-100 text-sm font-medium">Ventas Totales</p>
                                    <p className="text-3xl font-bold mt-2">${metrics.totalSales.toLocaleString('es-CL')}</p>
                                    <p className="text-blue-100 text-sm mt-2">{metrics.transactionCount} transacciones</p>
                                </div>
                                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                                    <p className="text-green-100 text-sm font-medium">Utilidad Neta</p>
                                    <p className="text-3xl font-bold mt-2">${metrics.netProfit.toLocaleString('es-CL')}</p>
                                    <p className="text-green-100 text-sm mt-2">{metrics.grossMargin.toFixed(1)}% margen</p>
                                </div>
                                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                                    <p className="text-orange-100 text-sm font-medium">Ticket Promedio</p>
                                    <p className="text-3xl font-bold mt-2">${metrics.averageTicket.toLocaleString('es-CL')}</p>
                                    <p className="text-orange-100 text-sm mt-2">Por transacción</p>
                                </div>
                            </div>

                            {/* Sales Chart */}
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Ventas Diarias</h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={dailySales}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="sales" stroke="#3B82F6" strokeWidth={2} name="Ventas ($)" />
                                        <Line type="monotone" dataKey="transactions" stroke="#10B981" strokeWidth={2} name="Transacciones" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Top Products */}
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Top 10 Productos</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200">
                                                <th className="text-left py-3 px-4 font-bold text-gray-700">#</th>
                                                <th className="text-left py-3 px-4 font-bold text-gray-700">Producto</th>
                                                <th className="text-right py-3 px-4 font-bold text-gray-700">Cantidad</th>
                                                <th className="text-right py-3 px-4 font-bold text-gray-700">Ingresos</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {topProducts.map((product, idx) => (
                                                <tr key={product.sku} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="py-3 px-4 text-gray-600">{idx + 1}</td>
                                                    <td className="py-3 px-4 font-medium text-gray-900">{product.name}</td>
                                                    <td className="py-3 px-4 text-right text-gray-600">{product.quantity}</td>
                                                    <td className="py-3 px-4 text-right font-bold text-green-600">
                                                        ${product.revenue.toLocaleString('es-CL')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tax Compliance Tab */}
                    {activeTab === 'tax' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Tax Summary */}
                                <div className="bg-white rounded-xl border border-gray-200 p-6">
                                    <h3 className="text-lg font-bold text-gray-900 mb-4">Resumen Tributario (F29)</h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between py-2 border-b border-gray-100">
                                            <span className="text-gray-600">Débito Fiscal (IVA Ventas)</span>
                                            <span className="font-bold text-gray-900">${taxCompliance.debitFiscal.toLocaleString('es-CL')}</span>
                                        </div>
                                        <div className="flex justify-between py-2 border-b border-gray-100">
                                            <span className="text-gray-600">Crédito Fiscal (IVA Compras)</span>
                                            <span className="font-bold text-green-600">${taxCompliance.creditFiscal.toLocaleString('es-CL')}</span>
                                        </div>
                                        <div className="flex justify-between py-2 border-b border-gray-100">
                                            <span className="text-gray-700 font-bold">IVA a Pagar</span>
                                            <span className="font-bold text-red-600">${taxCompliance.ivaToPay.toLocaleString('es-CL')}</span>
                                        </div>
                                        <div className="flex justify-between py-2">
                                            <span className="text-gray-600">PPM (1.5%)</span>
                                            <span className="font-bold text-orange-600">${taxCompliance.ppm.toLocaleString('es-CL')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Expenses Breakdown */}
                                <div className="bg-white rounded-xl border border-gray-200 p-6">
                                    <h3 className="text-lg font-bold text-gray-900 mb-4">Gastos por Categoría</h3>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <PieChart>
                                            <Pie
                                                data={Object.entries(expensesSummary.byCategory).map(([name, value]) => ({ name, value }))}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={(entry) => `${entry.name}: $${entry.value.toLocaleString('es-CL')}`}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {Object.keys(expensesSummary.byCategory).map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Warnings */}
                            {taxCompliance.nonDeductibleWarning > 0 && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-yellow-900">Gastos No Deducibles Detectados</p>
                                        <p className="text-sm text-yellow-700 mt-1">
                                            ${taxCompliance.nonDeductibleWarning.toLocaleString('es-CL')} en gastos no deducibles.
                                            Revisa las facturas para optimizar tu carga tributaria.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Logistics Tab */}
                    {activeTab === 'logistics' && (
                        <div className="space-y-6">
                            {/* Inventory KPIs */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                                    <p className="text-purple-100 text-sm font-medium">Valorización Inventario</p>
                                    <p className="text-3xl font-bold mt-2">${inventoryValue.toLocaleString('es-CL')}</p>
                                    <p className="text-purple-100 text-sm mt-2">{inventory.length} productos</p>
                                </div>
                                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
                                    <p className="text-red-100 text-sm font-medium">Stock Bajo</p>
                                    <p className="text-3xl font-bold mt-2">{lowStockItems.length}</p>
                                    <p className="text-red-100 text-sm mt-2">Productos críticos</p>
                                </div>
                                <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-6 text-white">
                                    <p className="text-yellow-100 text-sm font-medium">Próximos a Vencer</p>
                                    <p className="text-3xl font-bold mt-2">{expiringItems.length}</p>
                                    <p className="text-yellow-100 text-sm mt-2">En 30 días</p>
                                </div>
                            </div>

                            {/* Low Stock Alert */}
                            {lowStockItems.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-200 p-6">
                                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-red-600" />
                                        Productos con Stock Bajo
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-gray-200">
                                                    <th className="text-left py-3 px-4 font-bold text-gray-700">Producto</th>
                                                    <th className="text-right py-3 px-4 font-bold text-gray-700">Stock Actual</th>
                                                    <th className="text-right py-3 px-4 font-bold text-gray-700">Stock Mínimo</th>
                                                    <th className="text-right py-3 px-4 font-bold text-gray-700">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lowStockItems.slice(0, 10).map(item => (
                                                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                        <td className="py-3 px-4 font-medium text-gray-900">{item.name}</td>
                                                        <td className="py-3 px-4 text-right text-red-600 font-bold">{item.stock_actual}</td>
                                                        <td className="py-3 px-4 text-right text-gray-600">{item.stock_min}</td>
                                                        <td className="py-3 px-4 text-right">
                                                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                                                                Crítico
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Expiring Items */}
                            {expiringItems.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-200 p-6">
                                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                                        Productos Próximos a Vencer
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-gray-200">
                                                    <th className="text-left py-3 px-4 font-bold text-gray-700">Producto</th>
                                                    <th className="text-right py-3 px-4 font-bold text-gray-700">Stock</th>
                                                    <th className="text-right py-3 px-4 font-bold text-gray-700">Vencimiento</th>
                                                    <th className="text-right py-3 px-4 font-bold text-gray-700">Días Restantes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {expiringItems.slice(0, 10).map(item => {
                                                    const daysLeft = Math.ceil(((item.expiry_date || 0) - Date.now()) / (24 * 60 * 60 * 1000));
                                                    return (
                                                        <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                            <td className="py-3 px-4 font-medium text-gray-900">{item.name}</td>
                                                            <td className="py-3 px-4 text-right text-gray-600">{item.stock_actual}</td>
                                                            <td className="py-3 px-4 text-right text-gray-600">
                                                                {new Date(item.expiry_date || 0).toLocaleDateString('es-CL')}
                                                            </td>
                                                            <td className="py-3 px-4 text-right">
                                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${daysLeft <= 7 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                                                    }`}>
                                                                    {daysLeft} días
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* HR Tab */}
                    {activeTab === 'hr' && (
                        <div className="space-y-6">
                            {/* Labor Costs */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-6 text-white">
                                    <p className="text-indigo-100 text-sm font-medium">Sueldos Base</p>
                                    <p className="text-3xl font-bold mt-2">${laborCosts.totalSalaries.toLocaleString('es-CL')}</p>
                                    <p className="text-indigo-100 text-sm mt-2">Mensual</p>
                                </div>
                                <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl p-6 text-white">
                                    <p className="text-pink-100 text-sm font-medium">Leyes Sociales</p>
                                    <p className="text-3xl font-bold mt-2">${laborCosts.totalSocialLaws.toLocaleString('es-CL')}</p>
                                    <p className="text-pink-100 text-sm mt-2">~22% sobre base</p>
                                </div>
                                <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-6 text-white">
                                    <p className="text-cyan-100 text-sm font-medium">Costo Total</p>
                                    <p className="text-3xl font-bold mt-2">${laborCosts.totalCost.toLocaleString('es-CL')}</p>
                                    <p className="text-cyan-100 text-sm mt-2">{employees.filter(e => e.status === 'ACTIVE').length} empleados</p>
                                </div>
                            </div>

                            {/* Employee List */}
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Nómina Activa</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200">
                                                <th className="text-left py-3 px-4 font-bold text-gray-700">Empleado</th>
                                                <th className="text-left py-3 px-4 font-bold text-gray-700">Cargo</th>
                                                <th className="text-right py-3 px-4 font-bold text-gray-700">Sueldo Base</th>
                                                <th className="text-right py-3 px-4 font-bold text-gray-700">Leyes Sociales</th>
                                                <th className="text-right py-3 px-4 font-bold text-gray-700">Costo Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {employees.filter(e => e.status === 'ACTIVE').map(emp => {
                                                const salary = emp.base_salary || 0;
                                                const socialLaws = Math.round(salary * 0.22);
                                                const total = salary + socialLaws;
                                                return (
                                                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                        <td className="py-3 px-4 font-medium text-gray-900">{emp.name}</td>
                                                        <td className="py-3 px-4 text-gray-600">{emp.job_title}</td>
                                                        <td className="py-3 px-4 text-right text-gray-900">${salary.toLocaleString('es-CL')}</td>
                                                        <td className="py-3 px-4 text-right text-gray-600">${socialLaws.toLocaleString('es-CL')}</td>
                                                        <td className="py-3 px-4 text-right font-bold text-indigo-600">${total.toLocaleString('es-CL')}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportsPage;
