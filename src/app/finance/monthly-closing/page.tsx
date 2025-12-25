'use client';

import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { getClosingDataSecure, initiateClosingSecure, executeClosingSecure, reopenPeriodSecure } from '@/actions/finance-closing-v2';
import { PinModal } from '@/components/shared/PinModal';
import { toast } from 'sonner';
import {
    Calculator, CalendarDays, DollarSign, Save, Lock, Unlock,
    TrendingUp, TrendingDown, AlertCircle, CheckCircle,
    FileSpreadsheet, ArrowRight, Shield
} from 'lucide-react';

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function MonthlyClosingPage() {
    const { user } = usePharmaStore();

    // Date State
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Data State
    const [data, setData] = useState<any>({
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
    const [saving, setSaving] = useState(false);
    const [suggestions, setSuggestions] = useState({ cash: 0, card: 0 });

    // Modal states
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [showReopenModal, setShowReopenModal] = useState(false);
    const [reopenReason, setReopenReason] = useState('');

    const isClosed = data.status === 'CLOSED';
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'GERENTE_GENERAL';
    const canEdit = !isClosed;

    // Load Data Effect
    useEffect(() => {
        loadData();
    }, [selectedMonth, selectedYear]);

    const loadData = async () => {
        setLoading(true);
        const res = await getClosingDataSecure(selectedMonth, selectedYear);
        if (res.success && res.data) {
            setData(res.data);
            setSuggestions({
                cash: res.data.suggested_cash || 0,
                card: res.data.suggested_card || 0
            });
        } else {
            toast.error(res.error || 'Error cargando datos');
        }
        setLoading(false);
    };

    const handleInputChange = (field: string, value: string) => {
        if (!canEdit) return;
        const numValue = Number(value) || 0;
        setData((prev: any) => ({ ...prev, [field]: numValue }));
    };

    const handleSaveDraft = async () => {
        if (!user?.id) return;
        setSaving(true);

        const res = await initiateClosingSecure({
            month: selectedMonth,
            year: selectedYear,
            realCashIncome: data.real_cash_income || 0,
            realBankIncome: data.real_bank_income || 0,
            fixedExpenses: data.fixed_expenses || 0,
            variableExpenses: data.variable_expenses || 0,
            payrollCost: data.payroll_cost || 0,
            socialSecurityCost: data.social_security_cost || 0,
            taxCost: data.tax_cost || 0,
            notes: data.notes || '',
            userId: user.id
        });

        if (res.success) {
            toast.success('Borrador guardado');
            loadData();
        } else {
            toast.error(res.error || 'Error guardando');
        }
        setSaving(false);
    };

    const handleCloseMonth = async (pin: string): Promise<boolean> => {
        const res = await executeClosingSecure({
            month: selectedMonth,
            year: selectedYear,
            gerentePin: pin
        });

        if (res.success) {
            toast.success('Mes cerrado definitivamente');
            loadData();
            return true;
        } else {
            throw new Error(res.error || 'Error cerrando mes');
        }
    };

    const handleReopenMonth = async (pin: string): Promise<boolean> => {
        if (reopenReason.length < 20) {
            throw new Error('Razón debe tener mínimo 20 caracteres');
        }

        const res = await reopenPeriodSecure({
            month: selectedMonth,
            year: selectedYear,
            adminPin: pin,
            reason: reopenReason
        });

        if (res.success) {
            toast.success('Período reabierto');
            setReopenReason('');
            loadData();
            return true;
        } else {
            throw new Error(res.error || 'Error reabriendo período');
        }
    };

    const useSuggestedValues = () => {
        if (!canEdit) return;
        setData((prev: any) => ({
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
    if (user?.role !== 'MANAGER' && user?.role !== 'ADMIN' && user?.role !== 'GERENTE_GENERAL') {
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
                    <p className="text-slate-500 mt-1 flex items-center gap-2">
                        Conciliación de ingresos y egresos mensuales.
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            <Shield size={10} /> V2 Seguro
                        </span>
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

            {/* Status Bar */}
            <div className={`p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 ${isClosed
                ? 'bg-emerald-50 border border-emerald-200'
                : 'bg-indigo-50 border border-indigo-100'
                }`}>
                <div className="flex items-center gap-3">
                    <span className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 ${isClosed
                        ? 'bg-emerald-200 text-emerald-800'
                        : 'bg-amber-100 text-amber-700'
                        }`}>
                        {isClosed ? <Lock size={14} /> : <Unlock size={14} />}
                        {isClosed ? 'CERRADO - No editable' : 'BORRADOR - Editable'}
                    </span>
                    {data.updated_at && (
                        <span className="text-xs text-slate-500">
                            Última act: {new Date(data.updated_at).toLocaleDateString()}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {!isClosed && suggestions.cash > 0 && (
                        <button
                            onClick={useSuggestedValues}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 underline"
                        >
                            <CheckCircle size={12} /> Usar valores sugeridos
                        </button>
                    )}
                    {isClosed && isAdmin && (
                        <button
                            onClick={() => setShowReopenModal(true)}
                            className="px-4 py-2 rounded-lg font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-2 text-sm"
                        >
                            <Unlock size={14} /> Reabrir Período (ADMIN)
                        </button>
                    )}
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* LEFT: Income */}
                <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${isClosed ? 'opacity-75' : ''}`}>
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
                                    disabled={!canEdit}
                                    className="w-full pl-9 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-lg disabled:bg-slate-100 disabled:cursor-not-allowed"
                                    placeholder="0"
                                />
                            </div>
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
                                    disabled={!canEdit}
                                    className="w-full pl-9 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-lg disabled:bg-slate-100 disabled:cursor-not-allowed"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Expenses */}
                <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${isClosed ? 'opacity-75' : ''}`}>
                    <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
                        <h2 className="font-bold text-red-900 flex items-center gap-2">
                            <TrendingDown size={20} /> Egresos & Nómina
                        </h2>
                        <span className="text-red-700 font-mono font-bold">${totalExpenses.toLocaleString('es-CL')}</span>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Gastos Fijos</label>
                                <input
                                    type="number"
                                    value={data.fixed_expenses || ''}
                                    onChange={(e) => handleInputChange('fixed_expenses', e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm disabled:bg-slate-100"
                                    placeholder="Arriendo, Luz..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Gastos Variables</label>
                                <input
                                    type="number"
                                    value={data.variable_expenses || ''}
                                    onChange={(e) => handleInputChange('variable_expenses', e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm disabled:bg-slate-100"
                                    placeholder="Insumos..."
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">Nómina (Sueldos Líquidos)</label>
                            <input
                                type="number"
                                value={data.payroll_cost || ''}
                                onChange={(e) => handleInputChange('payroll_cost', e.target.value)}
                                disabled={!canEdit}
                                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono disabled:bg-slate-100"
                                placeholder="0"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Leyes Sociales</label>
                                <input
                                    type="number"
                                    value={data.social_security_cost || ''}
                                    onChange={(e) => handleInputChange('social_security_cost', e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm disabled:bg-slate-100"
                                    placeholder="Previred..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Impuestos (F29/Renta)</label>
                                <input
                                    type="number"
                                    value={data.tax_cost || ''}
                                    onChange={(e) => handleInputChange('tax_cost', e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm disabled:bg-slate-100"
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
                    {canEdit && (
                        <>
                            <button
                                onClick={handleSaveDraft}
                                disabled={saving}
                                className="px-6 py-3 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                <Save size={18} /> Guardar Borrador
                            </button>
                            <button
                                onClick={() => setShowCloseModal(true)}
                                className="px-6 py-3 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
                            >
                                <Lock size={18} /> Cerrar Mes
                            </button>
                        </>
                    )}
                    {isClosed && (
                        <div className="px-6 py-3 rounded-xl font-bold bg-emerald-600 text-white flex items-center gap-2">
                            <CheckCircle size={18} /> Mes Cerrado
                        </div>
                    )}
                </div>
            </div>

            {/* Notes Area */}
            <div className={`bg-white p-6 rounded-2xl border border-slate-200 ${isClosed ? 'opacity-75' : ''}`}>
                <label className="block font-bold text-slate-700 mb-2">Observaciones / Notas del Periodo</label>
                <textarea
                    value={data.notes || ''}
                    onChange={(e) => setData((prev: any) => ({ ...prev, notes: e.target.value }))}
                    disabled={!canEdit}
                    className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                    rows={3}
                    placeholder="Escribe aquí cualquier detalle relevante sobre este cierre..."
                />
            </div>

            {/* Close Month PIN Modal */}
            <PinModal
                isOpen={showCloseModal}
                onClose={() => setShowCloseModal(false)}
                onSubmit={handleCloseMonth}
                title="Cerrar Mes Definitivamente"
                description={`Esta acción cerrará ${MONTHS[selectedMonth - 1]} ${selectedYear} de forma permanente. Los datos no podrán editarse.`}
                requiredRole="GERENTE_GENERAL"
            />

            {/* Reopen Period Modal */}
            {showReopenModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowReopenModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
                        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <AlertCircle className="text-amber-500" /> Reabrir Período
                        </h2>
                        <p className="text-sm text-slate-600 mb-4">
                            Esta acción requiere justificación y quedará registrada en el audit log.
                        </p>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Razón de reapertura (mínimo 20 caracteres)
                            </label>
                            <textarea
                                value={reopenReason}
                                onChange={(e) => setReopenReason(e.target.value)}
                                className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                                rows={3}
                                placeholder="Explique por qué necesita reabrir este período..."
                            />
                            <div className="text-xs text-slate-400 mt-1">{reopenReason.length}/20 caracteres mínimo</div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowReopenModal(false)}
                                className="flex-1 px-4 py-3 rounded-xl font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (reopenReason.length >= 20) {
                                        setShowReopenModal(false);
                                        // Show PIN modal for reopen
                                        const pinModal = document.createElement('div');
                                        // Use separate state for reopen PIN
                                    }
                                }}
                                disabled={reopenReason.length < 20}
                                className="flex-1 px-4 py-3 rounded-xl font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PinModal
                isOpen={showReopenModal && reopenReason.length >= 20}
                onClose={() => {
                    setShowReopenModal(false);
                    setReopenReason('');
                }}
                onSubmit={handleReopenMonth}
                title="Confirmar Reapertura"
                description="Ingrese PIN de ADMIN para reabrir el período."
                requiredRole="ADMIN"
            />
        </div>
    );
}
