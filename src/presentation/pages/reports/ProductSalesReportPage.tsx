import React, { useState, useEffect } from 'react';
import {
    Calendar, MapPin, Monitor, User, Search, Filter,
    Download, TrendingUp, Package, DollarSign, FileText
} from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { useLocationStore } from '../../store/useLocationStore';
import { getProductSalesReportSecure, type ProductSalesRow, type ReportSummary } from '../../../actions/reports-v2';

export const ProductSalesReportPage: React.FC = () => {
    // Stores
    const { employees } = usePharmaStore();
    const { locations } = useLocationStore();

    // Filters State
    const [period, setPeriod] = useState('TODAY');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedLocation, setSelectedLocation] = useState('ALL');
    const [selectedTerminal, setSelectedTerminal] = useState('ALL');
    const [selectedEmployee, setSelectedEmployee] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Data State
    const [reportData, setReportData] = useState<ProductSalesRow[]>([]);
    const [summary, setSummary] = useState<ReportSummary>({ totalUnits: 0, totalAmount: 0, transactionCount: 0 });
    const [isLoading, setIsLoading] = useState(false);

    // Derived State: Available Terminals based on Location
    const availableTerminals = (() => {
        if (selectedLocation === 'ALL') return [];
        const loc = locations.find(l => l.id === selectedLocation);
        return (loc as any)?.terminals || [];
    })();


    // Fetch Report
    const fetchReport = async () => {
        setIsLoading(true);
        try {
            const res = await getProductSalesReportSecure({
                period: period as any,
                startDate: period === 'CUSTOM' ? startDate : undefined,
                endDate: period === 'CUSTOM' ? endDate : undefined,
                locationId: selectedLocation,
                terminalId: selectedTerminal,
                employeeId: selectedEmployee,
                searchQuery
            });

            if (res.success && res.data) {
                setReportData(res.data.rows);
                setSummary(res.data.summary);
            }
        } catch (error) {
            console.error('Failed to load report', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-fetch on filter changes (debounced for search)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchReport();
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [period, startDate, endDate, selectedLocation, selectedTerminal, selectedEmployee, searchQuery]);

    // Handle Period Change
    const handlePeriodChange = (val: string) => {
        setPeriod(val);
        // Reset custom dates if switching away
        if (val !== 'CUSTOM') {
            setStartDate('');
            setEndDate('');
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">

            {/* 1. Header & Filters */}
            <div className="bg-white border-b border-slate-200 p-6 flex flex-col gap-4 shrink-0 shadow-sm z-10">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <TrendingUp className="text-cyan-600" />
                            Reporte Ventas por Producto
                        </h1>
                        <p className="text-slate-500 font-medium text-sm">Analiza el rendimiento de inventario y rotación.</p>
                    </div>
                    <button
                        onClick={fetchReport}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 text-sm"
                    >
                        <Filter size={16} /> Actualizar
                    </button>
                </div>

                {/* Filters Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

                    {/* Period Selector */}
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center gap-2">
                        <Calendar size={18} className="text-slate-400 ml-2" />
                        <select
                            value={period}
                            onChange={(e) => handlePeriodChange(e.target.value)}
                            className="bg-transparent font-bold text-slate-700 outline-none w-full text-sm"
                        >
                            <option value="TODAY">📅 Hoy</option>
                            <option value="THIS_WEEK">📅 Esta Semana</option>
                            <option value="THIS_MONTH">📅 Mes Actual</option>
                            <option value="CUSTOM">⚙️ Personalizado</option>
                        </select>
                    </div>

                    {/* Location Selector */}
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center gap-2">
                        <MapPin size={18} className="text-slate-400 ml-2" />
                        <select
                            value={selectedLocation}
                            onChange={(e) => { setSelectedLocation(e.target.value); setSelectedTerminal('ALL'); }}
                            className="bg-transparent font-bold text-slate-700 outline-none w-full text-sm"
                        >
                            <option value="ALL">🏢 Todas las Sucursales</option>
                            {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Employee Selector */}
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center gap-2">
                        <User size={18} className="text-slate-400 ml-2" />
                        <select
                            value={selectedEmployee}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
                            className="bg-transparent font-bold text-slate-700 outline-none w-full text-sm"
                        >
                            <option value="ALL">👤 Todos los Vendedores</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Search Input */}
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center gap-2 focus-within:ring-2 focus-within:ring-cyan-500/20 focus-within:border-cyan-500 transition-all">
                        <Search size={18} className="text-slate-400 ml-2" />
                        <input
                            type="text"
                            placeholder="Buscar producto o SKU..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent font-bold text-slate-700 outline-none w-full text-sm placeholder:text-slate-400"
                        />
                    </div>
                </div>

                {/* Second Row Filters (Conditional) */}
                {(period === 'CUSTOM' || selectedLocation !== 'ALL') && (
                    <div className="flex flex-wrap gap-3 animate-in slide-in-from-top-2 duration-200">
                        {period === 'CUSTOM' && (
                            <>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-white border text-sm font-bold border-slate-300 rounded-lg px-3 py-2 text-slate-600 outline-none focus:border-cyan-500" />
                                <span className="text-slate-400 self-center">→</span>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-white border text-sm font-bold border-slate-300 rounded-lg px-3 py-2 text-slate-600 outline-none focus:border-cyan-500" />
                            </>
                        )}

                        {selectedLocation !== 'ALL' && (
                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center gap-2 min-w-[200px]">
                                <Monitor size={18} className="text-slate-400 ml-2" />
                                <select
                                    value={selectedTerminal}
                                    onChange={(e) => setSelectedTerminal(e.target.value)}
                                    className="bg-transparent font-bold text-slate-700 outline-none w-full text-sm"
                                >
                                    <option value="ALL">🖥️ Todas las Cajas</option>
                                    {availableTerminals.map((t: any) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 2. KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 pb-2">
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-50 flex items-center justify-center text-cyan-600">
                        <Package size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Unidades Vendidas</p>
                        <p className="text-3xl font-black text-slate-800">{summary.totalUnits.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Venta Total</p>
                        <p className="text-3xl font-black text-slate-800">${summary.totalAmount.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <FileText size={24} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Transacciones</p>
                        <p className="text-3xl font-black text-slate-800">{summary.transactionCount.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* 3. Data Table */}
            <div className="flex-1 overflow-hidden p-6 pt-2">
                <div className="bg-white border border-slate-200 rounded-3xl h-full flex flex-col shadow-sm overflow-hidden relative">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-100 bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                        <div className="col-span-5 md:col-span-4 pl-4">Producto</div>
                        <div className="col-span-3 md:col-span-2">SKU / Cat</div>
                        <div className="col-span-2 text-right">Unidades</div>
                        <div className="col-span-2 text-right">Precio Prom.</div>
                        <div className="hidden md:block md:col-span-2 text-right pr-4">Total Venta</div>
                    </div>

                    {/* Rows */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mb-4"></div>
                                <p className="font-bold">Cargando datos...</p>
                            </div>
                        ) : reportData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-300">
                                <Package size={48} className="mb-4 opacity-50" />
                                <p className="font-bold text-lg">No hay ventas registradas</p>
                                <p className="text-sm">Intenta cambiar los filtros de fecha</p>
                            </div>
                        ) : (
                            reportData.map((row) => (
                                <div key={row.product_id} className="grid grid-cols-12 gap-4 p-4 border-b border-slate-50 items-center hover:bg-slate-50 transition-colors group">
                                    <div className="col-span-5 md:col-span-4 pl-4">
                                        <p className="font-bold text-slate-800 text-sm leading-tight group-hover:text-cyan-700 transition-colors">{row.product_name}</p>
                                    </div>
                                    <div className="col-span-3 md:col-span-2">
                                        <p className="font-bold text-slate-500 text-xs">{row.sku}</p>
                                        <p className="text-[10px] bg-slate-100 text-slate-400 inline-block px-1.5 rounded uppercase mt-0.5">{row.category || 'N/A'}</p>
                                    </div>
                                    <div className="col-span-2 text-right">
                                        <span className="bg-cyan-50 text-cyan-700 px-2 py-1 rounded-lg font-black text-xs">
                                            {row.units_sold} un.
                                        </span>
                                    </div>
                                    <div className="col-span-2 text-right">
                                        <p className="font-medium text-slate-500 text-xs">${Number(row.avg_price).toLocaleString()}</p>
                                    </div>
                                    <div className="hidden md:block md:col-span-2 text-right pr-4">
                                        <p className="font-black text-slate-800 text-sm">${Number(row.total_amount).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
