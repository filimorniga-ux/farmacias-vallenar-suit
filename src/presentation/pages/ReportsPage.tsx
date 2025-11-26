import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../store/useStore';
import { FinancialService } from '../../domain/analytics/FinancialService';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area
} from 'recharts';
import { Download, Calendar, DollarSign, Users, Package, FileText, TrendingUp, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// --- Components ---

const KPICard = ({ title, value, subtext, icon: Icon, color }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
        <div>
            <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
            {subtext && <p className={`text-xs mt-2 ${color === 'red' ? 'text-red-500' : 'text-green-500'}`}>{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color === 'blue' ? 'bg-blue-50 text-blue-600' : color === 'green' ? 'bg-green-50 text-green-600' : 'bg-purple-50 text-purple-600'}`}>
            <Icon size={24} />
        </div>
    </div>
);

const ReportsPage: React.FC = () => {
    const { salesHistory, expenses, employees, inventory } = usePharmaStore();
    const [dateRange, setDateRange] = useState<{ start: Date, end: Date, label: string }>({
        start: new Date(new Date().setHours(0, 0, 0, 0)),
        end: new Date(new Date().setHours(23, 59, 59, 999)),
        label: 'Hoy'
    });
    const [activeTab, setActiveTab] = useState<'FINANCE' | 'TAX' | 'HR' | 'INVENTORY'>('FINANCE');

    // --- Data Aggregation ---
    const filteredSales = useMemo(() => FinancialService.filterByDateRange(salesHistory, dateRange.start, dateRange.end), [salesHistory, dateRange]);
    const filteredExpenses = useMemo(() => FinancialService.filterByDateRange(expenses, dateRange.start, dateRange.end), [expenses, dateRange]);

    const salesSummary = useMemo(() => FinancialService.getSalesSummary(filteredSales), [filteredSales]);
    const expensesSummary = useMemo(() => FinancialService.getExpensesSummary(filteredExpenses), [filteredExpenses]);
    const taxData = useMemo(() => FinancialService.getTaxCompliance(filteredSales, filteredExpenses), [filteredSales, filteredExpenses]);
    const laborData = useMemo(() => FinancialService.getLaborCosts(employees), [employees]);

    // --- Charts Data ---
    const paymentMethodsData = Object.entries(salesSummary.paymentMethods).map(([name, value]) => ({ name, value }));
    const expensesByCategoryData = Object.entries(expensesSummary.byCategory).map(([name, value]) => ({ name, value }));
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    // --- Handlers ---
    const handlePresetChange = (preset: string) => {
        const now = new Date();
        let start = new Date();
        let end = new Date();

        switch (preset) {
            case 'HOY':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'AYER':
                start.setDate(now.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end.setDate(now.getDate() - 1);
                end.setHours(23, 59, 59, 999);
                break;
            case 'ESTA_SEMANA':
                const day = now.getDay() || 7;
                if (day !== 1) start.setHours(-24 * (day - 1));
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'ESTE_MES':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
        }
        setDateRange({ start, end, label: preset });
    };

    const handleDownloadReport = () => {
        const wb = XLSX.utils.book_new();

        // 1. Libro Ventas
        const salesSheet = XLSX.utils.json_to_sheet(filteredSales.map(s => ({
            ID: s.id,
            Fecha: new Date(s.timestamp).toLocaleString(),
            Total: s.total,
            Metodo: s.payment_method,
            Vendedor: s.seller_id
        })));
        XLSX.utils.book_append_sheet(wb, salesSheet, "Libro Ventas");

        // 2. Libro Compras (Gastos)
        const expensesSheet = XLSX.utils.json_to_sheet(filteredExpenses.map(e => ({
            Descripcion: e.description,
            Monto: e.amount,
            Categoria: e.category,
            Fecha: new Date(e.date).toLocaleDateString(),
            Deducible: e.is_deductible ? 'SI' : 'NO',
            Documento: e.document_type
        })));
        XLSX.utils.book_append_sheet(wb, expensesSheet, "Gastos & Compras");

        // 3. Resumen
        const summaryData = [
            { Concepto: 'Ventas Brutas', Valor: salesSummary.grossSales },
            { Concepto: 'Ventas Netas', Valor: salesSummary.netSales },
            { Concepto: 'Gastos Totales', Valor: expensesSummary.totalExpenses },
            { Concepto: 'IVA Débito', Valor: taxData.debitFiscal },
            { Concepto: 'IVA Crédito', Valor: taxData.creditFiscal },
            { Concepto: 'A Pagar (Estimado)', Valor: taxData.ivaToPay }
        ];
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summarySheet, "Resumen Financiero");

        XLSX.writeFile(wb, `Reporte_Farmacia_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-800">
            {/* --- Header & Controls --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Centro de Inteligencia (BI)</h1>
                    <p className="text-gray-500 mt-1">Visión estratégica y control financiero total.</p>
                </div>

                <div className="flex items-center gap-3 bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
                    {['HOY', 'AYER', 'ESTA_SEMANA', 'ESTE_MES'].map(preset => (
                        <button
                            key={preset}
                            onClick={() => handlePresetChange(preset)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${dateRange.label === preset
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            {preset.replace('_', ' ')}
                        </button>
                    ))}
                    <div className="h-6 w-px bg-gray-300 mx-1"></div>
                    <button className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
                        <Calendar size={16} />
                        <span>Personalizado</span>
                    </button>
                </div>

                <button
                    onClick={handleDownloadReport}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-green-200 transition-all transform hover:-translate-y-0.5 font-semibold"
                >
                    <Download size={20} />
                    <span>Descargar Pack Mensual</span>
                </button>
            </div>

            {/* --- Tabs --- */}
            <div className="flex gap-6 border-b border-gray-200 mb-8">
                {[
                    { id: 'FINANCE', label: 'Finanzas & Cashflow', icon: DollarSign },
                    { id: 'TAX', label: 'Cumplimiento Tributario', icon: FileText },
                    { id: 'HR', label: 'RR.HH. & Dotación', icon: Users },
                    { id: 'INVENTORY', label: 'Movimientos Bodega', icon: Package },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 pb-4 px-2 text-sm font-semibold transition-all relative ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full" />
                        )}
                    </button>
                ))}
            </div>

            {/* --- Content --- */}
            <div className="space-y-8">

                {/* 1. FINANCE TAB */}
                {activeTab === 'FINANCE' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <KPICard
                                title="Ventas Brutas"
                                value={`$${salesSummary.grossSales.toLocaleString()}`}
                                subtext={`${filteredSales.length} transacciones`}
                                icon={TrendingUp}
                                color="blue"
                            />
                            <KPICard
                                title="Ventas Netas"
                                value={`$${salesSummary.netSales.toLocaleString()}`}
                                subtext="Excluye IVA"
                                icon={DollarSign}
                                color="green"
                            />
                            <KPICard
                                title="Gastos Totales"
                                value={`$${expensesSummary.totalExpenses.toLocaleString()}`}
                                subtext="Operativos + RRHH"
                                icon={AlertTriangle}
                                color="red"
                            />
                            <KPICard
                                title="EBITDA (Est.)"
                                value={`$${(salesSummary.netSales - expensesSummary.totalExpenses).toLocaleString()}`}
                                subtext="Margen Operativo"
                                icon={TrendingUp}
                                color="purple"
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Income Breakdown */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900 mb-6">Desglose de Ingresos</h3>
                                <div className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={paymentMethodsData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                fill="#8884d8"
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {paymentMethodsData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Expenses Breakdown */}
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900 mb-6">Estructura de Gastos</h3>
                                <div className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={expensesByCategoryData} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                                            <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                            <Bar dataKey="value" fill="#FF8042" radius={[0, 4, 4, 0]} barSize={30} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* 2. TAX TAB */}
                {activeTab === 'TAX' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <FileText className="text-blue-600" />
                                Simulador F29 (IVA)
                            </h3>

                            <div className="space-y-6">
                                <div className="flex justify-between items-center p-4 bg-green-50 rounded-xl border border-green-100">
                                    <div>
                                        <p className="text-sm font-medium text-green-800">Débito Fiscal (IVA Ventas)</p>
                                        <p className="text-xs text-green-600">Generado por ventas con boleta/factura</p>
                                    </div>
                                    <span className="text-2xl font-bold text-green-700">+ ${taxData.debitFiscal.toLocaleString()}</span>
                                </div>

                                <div className="flex justify-between items-center p-4 bg-red-50 rounded-xl border border-red-100">
                                    <div>
                                        <p className="text-sm font-medium text-red-800">Crédito Fiscal (IVA Compras)</p>
                                        <p className="text-xs text-red-600">Solo compras con FACTURA</p>
                                    </div>
                                    <span className="text-2xl font-bold text-red-700">- ${taxData.creditFiscal.toLocaleString()}</span>
                                </div>

                                <div className="h-px bg-gray-200 my-4"></div>

                                <div className="flex justify-between items-center p-6 bg-gray-900 rounded-xl text-white shadow-lg">
                                    <div>
                                        <p className="text-sm font-medium text-gray-400">IVA a Pagar (Estimado)</p>
                                        <p className="text-xs text-gray-500">A pagar el día 20 del mes siguiente</p>
                                    </div>
                                    <span className="text-4xl font-bold">${taxData.ivaToPay.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">PPM Estimado</h3>
                                <p className="text-sm text-gray-500 mb-4">Pago Provisional Mensual (1.5% Ventas Netas)</p>
                                <div className="text-3xl font-bold text-blue-600 mb-2">${taxData.ppm.toLocaleString()}</div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '15%' }}></div>
                                </div>
                            </div>

                            <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="text-orange-600 shrink-0" />
                                    <div>
                                        <h4 className="font-bold text-orange-800">Alerta de Gastos No Deducibles</h4>
                                        <p className="text-sm text-orange-700 mt-1">
                                            Tienes <strong>${taxData.nonDeductibleWarning.toLocaleString()}</strong> en gastos sin respaldo tributario (boletas o sin documento). Esto aumenta tu base imponible artificialmente.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. HR TAB */}
                {activeTab === 'HR' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-900 mb-6">Costo Empresa Real</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Sueldos Líquidos + Retenciones</span>
                                    <span className="font-semibold">${laborData.totalSalaries.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Aporte Patronal (SIS, Cesantía, Mutual)</span>
                                    <span className="font-semibold text-red-600">+ ${laborData.totalSocialLaws.toLocaleString()}</span>
                                </div>
                                <div className="h-px bg-gray-200"></div>
                                <div className="flex justify-between items-center text-lg font-bold">
                                    <span>Costo Total Nómina</span>
                                    <span>${laborData.totalCost.toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="mt-6 p-4 bg-blue-50 rounded-xl text-sm text-blue-700">
                                💡 El costo real de tu equipo es un <strong>~22%</strong> mayor a la suma de los sueldos imponibles.
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-900 mb-6">Dotación Activa</h3>
                            <div className="space-y-4">
                                {employees.map(emp => (
                                    <div key={emp.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold">
                                                {emp.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{emp.name}</p>
                                                <p className="text-xs text-gray-500">{emp.role}</p>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${emp.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {emp.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. INVENTORY TAB */}
                {activeTab === 'INVENTORY' && (
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center py-20">
                        <Package size={64} className="mx-auto text-gray-300 mb-4" />
                        <h3 className="text-xl font-bold text-gray-900">Análisis de Inventario en Desarrollo</h3>
                        <p className="text-gray-500 mt-2 max-w-md mx-auto">
                            Próximamente podrás ver el balance de masas, rotación de stock y análisis de mermas detallado aquí.
                        </p>
                    </div>
                )}

            </div>
        </div>
    );
};

export default ReportsPage;
