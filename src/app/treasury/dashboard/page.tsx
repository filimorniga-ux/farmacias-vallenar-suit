
'use client';

import { useState, useEffect } from 'react';
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area
} from 'recharts';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react';
import { getTreasuryDashboardData } from '@/actions/treasury/get-forecast';

export default function TreasuryDashboardPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getTreasuryDashboardData()
            .then(res => {
                if (res.success) setData(res);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
        );
    }

    if (!data) return <div className="p-10">Error al cargar datos financieros.</div>;

    // Combine History and Forecast for Chart
    // History: { date, revenue, expenses }
    // Forecast: { date, projectedRevenue, projectedExpenses }
    const chartData = [
        ...data.history.map((h: any) => ({
            date: h.date,
            Ingresos: h.revenue,
            Gastos: h.expenses,
            type: 'Real'
        })),
        ...data.forecast.map((f: any) => ({
            date: f.date,
            Ingresos: f.projectedRevenue,
            Gastos: f.projectedExpenses,
            type: 'Proyección'
        }))
    ];

    return (
        <div className="min-h-screen bg-slate-50 p-8">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                        <DollarSign className="text-emerald-600 w-8 h-8" />
                        Tesorería & Flujo de Caja
                    </h1>
                    <p className="text-slate-500">Proyección financiera basada en ventas históricas e IA.</p>
                </div>
            </header>

            {/* AI Insights & KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Insights Panel */}
                <div className="col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <span>🧠 Análisis IA (CFO Virtual)</span>
                    </h2>
                    <div className="space-y-3">
                        {data.insights.map((insight: any, idx: number) => (
                            <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${insight.severity === 'HIGH' ? 'bg-red-50 border-red-200 text-red-800' :
                                    insight.severity === 'MEDIUM' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                                        'bg-emerald-50 border-emerald-200 text-emerald-800'
                                }`}>
                                {insight.severity === 'HIGH' ? <AlertTriangle className="shrink-0" /> : <CheckCircle className="shrink-0" />}
                                <div>
                                    <p className="text-sm font-medium">{insight.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* KPI Card */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 rounded-2xl shadow-lg flex flex-col justify-between">
                    <div>
                        <p className="text-blue-100 font-medium mb-1">Proyección Ingreso (30 Días)</p>
                        <h3 className="text-3xl font-bold">
                            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(
                                data.forecast.reduce((acc: number, curr: any) => acc + curr.projectedRevenue, 0)
                            )}
                        </h3>
                    </div>
                    <div className="mt-4">
                        <p className="text-blue-100 font-medium mb-1">Proyección Gastos (30 Días)</p>
                        <h3 className="text-3xl font-bold text-blue-200">
                            {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(
                                data.forecast.reduce((acc: number, curr: any) => acc + curr.projectedExpenses, 0)
                            )}
                        </h3>
                    </div>
                </div>
            </div>

            {/* Main Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-[500px]">
                <h3 className="font-bold text-slate-700 mb-6">Evolución de Flujo (Real vs Proyectado)</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis
                            dataKey="date"
                            stroke="#64748B"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(val) => val.slice(5)} // Show MM-DD
                        />
                        <YAxis stroke="#64748B" tick={{ fontSize: 12 }} tickFormatter={(val) => `$${val / 1000}k`} />
                        <Tooltip />
                        <Legend />

                        {/* Revenue */}
                        <Bar
                            dataKey="Ingresos"
                            fill="#3B82F6"
                            radius={[4, 4, 0, 0]}
                            name="Ingresos (Ventas)"
                            barSize={30}
                        />

                        {/* Expenses Line */}
                        <Line
                            type="monotone"
                            dataKey="Gastos"
                            stroke="#EF4444"
                            strokeWidth={3}
                            dot={false}
                            name="Gastos (Facturas)"
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
