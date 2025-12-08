'use client';

import React, { useState, useEffect } from 'react';
import { Location, Terminal } from '@/domain/types';
import { getFinancialMetrics, FinancialMetrics } from '@/actions/dashboard';
import { getTerminalsByLocation } from '@/actions/terminals';
import { TrendingUp, DollarSign, CreditCard, ArrowDownCircle, ArrowUpCircle, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
    initialLocations: Location[];
}

export default function AnalyticsDashboard({ initialLocations }: Props) {
    // State
    const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
        from: new Date().toISOString().split('T')[0], // Today
        to: new Date().toISOString().split('T')[0]
    });
    const [selectedLocationId, setSelectedLocationId] = useState<string>('');
    const [selectedTerminalId, setSelectedTerminalId] = useState<string>('');

    const [terminals, setTerminals] = useState<Terminal[]>([]);
    const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
    const [loading, setLoading] = useState(false);

    // Fetch Terminals when Location Changes
    useEffect(() => {
        if (selectedLocationId) {
            getTerminalsByLocation(selectedLocationId).then(res => {
                if (res.success && res.data) setTerminals(res.data);
                else setTerminals([]);
            });
            setSelectedTerminalId('');
        } else {
            setTerminals([]);
            setSelectedTerminalId('');
        }
    }, [selectedLocationId]);

    // Fetch Metrics
    useEffect(() => {
        const fetchMetrics = async () => {
            setLoading(true);
            try {
                // Construct Date Objects (Start of day / End of day)
                const fromDate = new Date(dateRange.from);
                fromDate.setHours(0, 0, 0, 0);

                const toDate = new Date(dateRange.to);
                toDate.setHours(23, 59, 59, 999);

                const data = await getFinancialMetrics(
                    { from: fromDate, to: toDate },
                    selectedLocationId || undefined,
                    selectedTerminalId || undefined
                );
                setMetrics(data);
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
    }, [dateRange, selectedLocationId, selectedTerminalId]);

    // Formatters
    const fmtMoney = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);

    if (!metrics) return <div className="p-10 text-center">Cargando Dashboard...</div>;

    const { summary, by_payment_method, breakdown } = metrics;

    return (
        <div className="space-y-6">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
                <div className="flex items-center gap-2 text-slate-500 mr-2">
                    <Filter size={20} /> <span className="font-semibold">Filtros</span>
                </div>

                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
                    <input
                        type="date"
                        value={dateRange.from}
                        onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                        className="p-2 border rounded-lg text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
                    <input
                        type="date"
                        value={dateRange.to}
                        onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                        className="p-2 border rounded-lg text-sm"
                    />
                </div>

                <div className="w-px h-8 bg-slate-200 mx-2"></div>

                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Sucursal</label>
                    <select
                        value={selectedLocationId}
                        onChange={e => setSelectedLocationId(e.target.value)}
                        className="p-2 border rounded-lg text-sm min-w-[150px]"
                    >
                        <option value="">Todas las Sucursales</option>
                        {initialLocations.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                </div>

                {selectedLocationId && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Caja / Terminal</label>
                        <select
                            value={selectedTerminalId}
                            onChange={e => setSelectedTerminalId(e.target.value)}
                            className="p-2 border rounded-lg text-sm min-w-[150px]"
                        >
                            <option value="">Todas las Cajas</option>
                            {terminals.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Ventas Brutas"
                    value={fmtMoney(summary.total_sales)}
                    sub={`${summary.sales_count} transacciones`}
                    icon={<TrendingUp className="text-emerald-500" />}
                    bg="bg-emerald-50"
                />
                <KPICard
                    title="Flujo de Caja Neto"
                    value={fmtMoney(summary.net_cash_flow)}
                    sub="Disponible Real"
                    icon={<DollarSign className="text-blue-500" />}
                    bg="bg-blue-50"
                />
                <KPICard
                    title="Ingresos Efectivo"
                    value={fmtMoney(by_payment_method.cash + summary.total_income_other)}
                    sub={`Base: ${fmtMoney(summary.base_cash)}`}
                    icon={<ArrowUpCircle className="text-cyan-500" />}
                    bg="bg-cyan-50"
                />
                <KPICard
                    title="Gastos / Retiros"
                    value={fmtMoney(summary.total_expenses)}
                    sub="Salidas de caja"
                    icon={<ArrowDownCircle className="text-rose-500" />}
                    bg="bg-rose-50"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Payment Methods */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><CreditCard size={18} /> Medios de Pago</h3>
                    <div className="space-y-3">
                        <PaymentRow label="Efectivo" amount={by_payment_method.cash} total={summary.total_sales} color="bg-emerald-500" />
                        <PaymentRow label="Débito" amount={by_payment_method.debit} total={summary.total_sales} color="bg-blue-500" />
                        <PaymentRow label="Crédito" amount={by_payment_method.credit} total={summary.total_sales} color="bg-indigo-500" />
                        <PaymentRow label="Transferencia" amount={by_payment_method.transfer} total={summary.total_sales} color="bg-purple-500" />
                    </div>
                </div>

                {/* Breakdown Table */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <h3 className="font-bold text-slate-800 mb-4">
                        {selectedLocationId ? (selectedTerminalId ? 'Detalle de Ventas' : 'Rendimiento por Caja') : 'Rendimiento por Sucursal'}
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="p-3 rounded-l-lg">Nombre</th>
                                    <th className="p-3 text-right">Total Ventas</th>
                                    <th className="p-3 rounded-r-lg text-right">% del Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {breakdown.length === 0 ? (
                                    <tr><td colSpan={3} className="p-4 text-center text-slate-400">Sin datos para mostrar</td></tr>
                                ) : breakdown.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-3 font-medium text-slate-700">{item.name}</td>
                                        <td className="p-3 text-right font-mono">{fmtMoney(item.total)}</td>
                                        <td className="p-3 text-right text-slate-400">
                                            {summary.total_sales > 0 ? ((item.total / summary.total_sales) * 100).toFixed(1) + '%' : '0%'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KPICard({ title, value, sub, icon, bg }: any) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform scale-150`}>
                {icon}
            </div>
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${bg} bg-opacity-50`}>{icon}</div>
                <span className="text-sm font-medium text-slate-500">{title}</span>
            </div>
            <div>
                <div className="text-2xl font-bold text-slate-900">{value}</div>
                <div className="text-xs text-slate-400 mt-1">{sub}</div>
            </div>
        </div>
    );
}

function PaymentRow({ label, amount, total, color }: any) {
    const percent = total > 0 ? (amount / total) * 100 : 0;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-sm">
                <span className="text-slate-600">{label}</span>
                <span className="font-medium">{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount)}</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${percent}%` }}></div>
            </div>
        </div>
    );
}
