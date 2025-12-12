'use client';

import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { getClosingData, saveClosing, MonthlyClosingData } from '@/actions/finance-closing';
import { toast } from 'sonner';
import {
    Calculator, CalendarDays, DollarSign, Save, Lock,
    TrendingUp, TrendingDown, AlertCircle, CheckCircle,
    FileSpreadsheet, ArrowRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function MonthlyClosingPage() {
    const { user } = usePharmaStore();
    // const router = useRouter(); // Currently unused in this implementation but good to have

    // Date State
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // 1-12
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Data State
    const [data, setData] = useState<MonthlyClosingData>({
        month: selectedMonth,
        year: selectedYear,
        real_cash_income: 0,
        real_bank_income: 0,
        fixed_expenses: 0,
        variable_expenses: 0,
        payroll_cost: 0,
        social_security_cost: 0,
        tax_cost: 0,
        status: 'DRAFT',
        notes: ''
    });

    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState({ cash: 0, card: 0 });

    // Load Data Effect
    useEffect(() => {
        loadData();
    }, [selectedMonth, selectedYear]);

    const loadData = async () => {
        setLoading(true);
        const res = await getClosingData(selectedMonth, selectedYear);
        if (res.success && res.data) {
            setData(res.data);
            setSuggestions({
                cash: res.data.suggested_cash || 0,
                card: res.data.suggested_card || 0
            });
        } else {
            toast.error('Error cargando datos');
        }
        setLoading(false);
    };

    const handleInputChange = (field: keyof MonthlyClosingData, value: string) => {
        const numValue = Number(value) || 0;
        setData(prev => ({ ...prev, [field]: numValue }));
    };

    const handleSave = async (status: 'DRAFT' | 'CLOSED') => {
        if (status === 'CLOSED') {
            if (!confirm('¿Estás seguro de cerrar definitivamente este mes? Una vez cerrado, no se recomienda editar.')) return;
        }

        const toastId = toast.loading('Guardando...');

        try {
            const res = await saveClosing({ ...data, status }, user?.id || 'sys');
            if (res.success) {
                toast.success(status === 'CLOSED' ? 'Mes Cerrado Exitosamente' : 'Borrador Guardado', { id: toastId });
                loadData(); // Reload to refresh suggestions/updates
            } else {
                toast.error(res.error || 'Error guardando', { id: toastId });
            }
        } catch (error) {
            toast.error('Error de conexión', { id: toastId });
        }
    };

    const useSuggestedValues = () => {
        setData(prev => ({
            ...prev,
            real_cash_income: suggestions.cash,
            real_bank_income: suggestions.card
        }));
        toast.info('Valores sugeridos aplicados');
    };

    // Derived Calculations
    const totalIncome = (data.real_cash_income || 0) + (data.real_bank_income || 0);
    const totalExpenses = (data.fixed_expenses || 0) + (data.variable_expenses || 0) + (data.payroll_cost || 0) + (data.social_security_cost || 0) + (data.tax_cost || 0);
    const netResult = totalIncome - totalExpenses;
    const isPositive = netResult >= 0;

    // Permissions
    if (user?.role !== 'MANAGER' && user?.role !== 'ADMIN') {
        return <div className="p-8 text-center text-red-500 font-bold">⛔ Acceso Restringido: Solo Gerencia.</div>;
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <FileSpreadsheet className="text-indigo-600" size={32} />
                        Cierre Mensual Financiero
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Conciliación de ingresos y egresos mensuales.
                    </p>
                </div>

                {/* Month Selector */}
                <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        className="bg-transparent font-bold text-slate-700 p-2 rounded-lg outline-none cursor-pointer hover:bg-slate-50"
                    >
                        {MONTHS.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                        ))}
                    </select>
                    <div className="w-px bg-slate-200 mx-2 my-1"></div>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="bg-transparent font-bold text-slate-700 p-2 rounded-lg outline-none cursor-pointer hover:bg-slate-50"
                    >
                        {[2024, 2025, 2026].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Status & Hints */}
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${data.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {data.status === 'CLOSED' ? 'CERRADO' : 'BORRADOR'}
                    </span>
                    {data.updated_at && (
                        <span className="text-xs text-indigo-400">
                            Última act: {new Date().toLocaleDateString()}
                        </span>
                    )}
                </div>
                {data.status !== 'CLOSED' && suggestions.cash > 0 && (
                    <button
                        onClick={useSuggestedValues}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 underline"
                    >
                        <CheckCircle size={12} /> Usar valores sugeridos del sistema
                    </button>
                )}
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* LEFT: Income */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex justify-between items-center">
                        <h2 className="font-bold text-emerald-900 flex items-center gap-2">
                            <TrendingUp size={20} /> Ingresos Reales
                        </h2>
                        <span className="text-emerald-700 font-mono font-bold">${totalIncome.toLocaleString('es-CL')}</span>
                    </div>

                    <div className="p-6 space-y-6">

                        {/* Cash Income */}
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-slate-700">1. Efectivo Recaudado</label>
                                <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                    Sugerido: ${suggestions.cash.toLocaleString('es-CL')}
                                </span>
                            </div>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="number"
                                    value={data.real_cash_income || ''}
                                    onChange={(e) => handleInputChange('real_cash_income', e.target.value)}
                                    className="w-full pl-9 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-lg"
                                    placeholder="0"
                                />
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Total ingresado físicamente a Caja Fuerte.</p>
                        </div>

                        {/* Bank Income */}
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-slate-700">2. Abonos Banco / Tarjetas</label>
                                <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                    Sugerido: ${suggestions.card.toLocaleString('es-CL')}
                                </span>
                            </div>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="number"
                                    value={data.real_bank_income || ''}
                                    onChange={(e) => handleInputChange('real_bank_income', e.target.value)}
                                    className="w-full pl-9 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-lg"
                                    placeholder="0"
                                />
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Transbank, MercadoPago, Transferencias.</p>
                        </div>

                    </div>
                </div>

                {/* RIGHT: Expenses */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
                        <h2 className="font-bold text-red-900 flex items-center gap-2">
                            <TrendingDown size={20} /> Egresos & Nómina
                        </h2>
                        <span className="text-red-700 font-mono font-bold">${totalExpenses.toLocaleString('es-CL')}</span>
                    </div>

                    <div className="p-6 space-y-4">

                        {/* Fixed Expenses */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Gastos Fijos</label>
                                <input
                                    type="number"
                                    value={data.fixed_expenses || ''}
                                    onChange={(e) => handleInputChange('fixed_expenses', e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm"
                                    placeholder="Arriendo, Luz..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Gastos Variables</label>
                                <input
                                    type="number"
                                    value={data.variable_expenses || ''}
                                    onChange={(e) => handleInputChange('variable_expenses', e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm"
                                    placeholder="Insumos, Mantención..."
                                />
                            </div>
                        </div>

                        {/* Payroll */}
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Nómina (Sueldos Líquidos)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    type="number"
                                    value={data.payroll_cost || ''}
                                    onChange={(e) => handleInputChange('payroll_cost', e.target.value)}
                                    className="w-full pl-7 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono"
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {/* Social Sec & Taxes */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Leyes Sociales</label>
                                <input
                                    type="number"
                                    value={data.social_security_cost || ''}
                                    onChange={(e) => handleInputChange('social_security_cost', e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm"
                                    placeholder="Previred..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Impuestos (F29/Renta)</label>
                                <input
                                    type="number"
                                    value={data.tax_cost || ''}
                                    onChange={(e) => handleInputChange('tax_cost', e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm"
                                    placeholder="SII..."
                                />
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            {/* Footer Result */}
            <div className="bg-slate-900 text-white rounded-2xl shadow-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h3 className="text-slate-400 font-bold mb-1 uppercase text-sm tracking-wider">Resultado Neto (Utilidad)</h3>
                    <div className={`text-5xl font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${netResult.toLocaleString('es-CL')}
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={() => handleSave('DRAFT')}
                        className="px-6 py-3 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-2"
                    >
                        <Save size={18} /> Guardar Borrador
                    </button>
                    <button
                        onClick={() => handleSave('CLOSED')}
                        className="px-6 py-3 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
                    >
                        <Lock size={18} /> Cerrar Mes
                    </button>
                </div>
            </div>

            {/* Notes Area */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200">
                <label className="block font-bold text-slate-700 mb-2">Observaciones / Notas del Periodo</label>
                <textarea
                    value={data.notes || ''}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    rows={3}
                    placeholder="Escribe aquí cualquier detalle relevante sobre este cierre..."
                />
            </div>

        </div>
    );
}
