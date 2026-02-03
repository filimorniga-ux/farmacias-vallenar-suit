'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePharmaStore } from '@/presentation/store/useStore';
import {
    addClosingEntry,
    deleteClosingEntry,
    executeClosingSecure,
    getClosingDataSecure,
    initiateClosingSecure,
    reopenPeriodSecure,
} from '@/actions/finance-closing-v2';
import { PinModal } from '@/components/shared/PinModal';
import { toast } from 'sonner';
import {
    AlertCircle,
    CalendarDays,
    CheckCircle,
    DollarSign,
    FileSpreadsheet,
    FolderPlus,
    Lock,
    Plus,
    Save,
    Shield,
    Trash2,
    TrendingDown,
    TrendingUp,
    Unlock,
} from 'lucide-react';

const MONTHS = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
];

const INCOME_CATEGORIES = [
    { key: 'CASH', label: 'Efectivo Recaudado', helper: 'Ingresos en caja', placeholder: 'Monto en efectivo' },
    { key: 'TRANSFER_IN', label: 'Transferencias Recibidas', helper: 'Depósitos / transfer', placeholder: 'Cuenta/Banco' },
    { key: 'CARD_INSTALLMENT', label: 'Abonos Ventas con Tarjeta', helper: 'Abonos pos o gateway', placeholder: 'Referencia abono' },
] as const;

const EXPENSE_CATEGORIES = [
    { key: 'DAILY_EXPENSE', label: 'Gastos Diarios', helper: 'Caja chica, insumos', placeholder: 'Detalle' },
    { key: 'TRANSFER_OUT', label: 'Transferencias Realizadas', helper: 'Pagos a terceros', placeholder: 'Proveedor / motivo' },
    { key: 'PAYROLL', label: 'Pago de Nóminas', helper: 'Sueldos del mes', placeholder: 'Resumen nómina' },
    { key: 'FIXED_EXPENSE', label: 'Gastos Fijos', helper: 'Arriendo, luz, etc.', placeholder: 'Concepto' },
    { key: 'TAX', label: 'Impuestos', helper: 'F29 / Renta', placeholder: 'Detalle impuesto' },
    { key: 'OWNER_WITHDRAWAL', label: 'Retiros del Dueño', helper: 'Giros personales', placeholder: 'Detalle retiro' },
] as const;

type EntryCategory =
    | (typeof INCOME_CATEGORIES)[number]['key']
    | (typeof EXPENSE_CATEGORIES)[number]['key'];

type EntryFormState = Record<EntryCategory, { date: string; amount: string; description: string }>;

type EntryRow = {
    id: string;
    category: EntryCategory;
    reference_date: string;
    amount: number;
    description?: string | null;
    created_by_name?: string;
};

type TotalsState = {
    incomes: { cash: number; transfer: number; card: number; total: number };
    expenses: { daily: number; transferOut: number; payroll: number; fixed: number; tax: number; owner: number; total: number };
    netResult: number;
};

const emptyTotals: TotalsState = {
    incomes: { cash: 0, transfer: 0, card: 0, total: 0 },
    expenses: { daily: 0, transferOut: 0, payroll: 0, fixed: 0, tax: 0, owner: 0, total: 0 },
    netResult: 0,
};

const pad = (value: number) => value.toString().padStart(2, '0');
const defaultDate = (year: number, month: number) => `${year}-${pad(month)}-01`;

const buildEmptyEntries = () =>
    [...INCOME_CATEGORIES.map((c) => c.key), ...EXPENSE_CATEGORIES.map((c) => c.key)].reduce(
        (acc, key) => ({ ...acc, [key]: [] as EntryRow[] }),
        {} as Record<EntryCategory, EntryRow[]>,
    );

const buildFormState = (year: number, month: number): EntryFormState => {
    const baseDate = defaultDate(year, month);
    return [...INCOME_CATEGORIES.map((c) => c.key), ...EXPENSE_CATEGORIES.map((c) => c.key)].reduce(
        (acc, key) => ({ ...acc, [key]: { date: baseDate, amount: '', description: '' } }),
        {} as EntryFormState,
    );
};

export default function MonthlyClosingPage() {
    const { user } = usePharmaStore();

    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const [data, setData] = useState<{
        status: 'DRAFT' | 'CLOSED';
        notes: string;
        totals: TotalsState;
        entries: Record<EntryCategory, EntryRow[]>;
        updated_at?: string | null;
    }>({
        status: 'DRAFT',
        notes: '',
        totals: emptyTotals,
        entries: buildEmptyEntries(),
        updated_at: null,
    });

    const [activeIncomeTab, setActiveIncomeTab] = useState<EntryCategory>('CASH');
    const [activeExpenseTab, setActiveExpenseTab] = useState<EntryCategory>('DAILY_EXPENSE');
    const [forms, setForms] = useState<EntryFormState>(() => buildFormState(selectedYear, selectedMonth));

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [entryWorking, setEntryWorking] = useState<string | null>(null);

    const [showCloseModal, setShowCloseModal] = useState(false);
    const [showReopenModal, setShowReopenModal] = useState(false);
    const [showReopenPin, setShowReopenPin] = useState(false);
    const [reopenReason, setReopenReason] = useState('');

    const isClosed = data.status === 'CLOSED';
    const isAdmin =
        user?.role === 'ADMIN' || user?.role === 'GERENTE_GENERAL' || user?.role === 'MANAGER';
    const canEdit = !isClosed;

    const incomeTotals = data.totals?.incomes || emptyTotals.incomes;
    const expenseTotals = data.totals?.expenses || emptyTotals.expenses;
    const netResult = data.totals?.netResult ?? 0;

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await getClosingDataSecure(selectedMonth, selectedYear);
        if (res.success && res.data) {
            setData({
                status: res.data.status,
                notes: res.data.notes || '',
                totals: res.data.totals || emptyTotals,
                entries: { ...buildEmptyEntries(), ...(res.data.entries || {}) },
                updated_at: res.data.updated_at,
            });
        } else {
            toast.error(res.error || 'Error cargando datos');
        }
        setLoading(false);
    }, [selectedMonth, selectedYear]);

    useEffect(() => {
        loadData();
    }, [selectedMonth, selectedYear, loadData]);

    const handleInputChange = (category: EntryCategory, field: 'date' | 'amount' | 'description', value: string) => {
        if (!canEdit) return;
        setForms((prev) => ({ ...prev, [category]: { ...prev[category], [field]: value } }));
    };

    const validateDateBelongsToPeriod = (date: string) => {
        if (!date) return false;
        const [year, month] = date.split('-').map(Number);
        return year === selectedYear && month === selectedMonth;
    };

    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const m = Number(e.target.value);
        setSelectedMonth(m);
        setForms(buildFormState(selectedYear, m));
    };

    const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const y = Number(e.target.value);
        setSelectedYear(y);
        setForms(buildFormState(y, selectedMonth));
    };

    const handleAddEntry = async (category: EntryCategory) => {
        if (!user?.id) {
            toast.error('Usuario no autenticado');
            return;
        }
        const form = forms[category];
        if (!form.amount || Number(form.amount) <= 0) {
            toast.error('Ingresa un monto válido');
            return;
        }
        if (!form.date) {
            toast.error('Selecciona una fecha');
            return;
        }
        if (!validateDateBelongsToPeriod(form.date)) {
            toast.error('La fecha debe estar dentro del mes seleccionado');
            return;
        }

        setEntryWorking(category);
        const res = await addClosingEntry({
            month: selectedMonth,
            year: selectedYear,
            category,
            referenceDate: form.date,
            amount: Number(form.amount),
            description: form.description?.trim() || undefined,
            userId: user.id,
        });
        setEntryWorking(null);

        if (res.success) {
            toast.success('Movimiento agregado');
            setForms((prev) => ({ ...prev, [category]: { ...prev[category], amount: '', description: '' } }));
            loadData();
        } else {
            toast.error(res.error || 'No se pudo agregar el movimiento');
        }
    };

    const handleDeleteEntry = async (entry: EntryRow) => {
        if (!user?.id) return;
        setEntryWorking(entry.id);
        const res = await deleteClosingEntry(entry.id, selectedMonth, selectedYear, user.id);
        setEntryWorking(null);

        if (res.success) {
            toast.success('Movimiento eliminado');
            loadData();
        } else {
            toast.error(res.error || 'No se pudo eliminar');
        }
    };

    const handleSaveDraft = async () => {
        if (!user?.id) return;
        setSaving(true);

        const res = await initiateClosingSecure({
            month: selectedMonth,
            year: selectedYear,
            notes: data.notes || '',
            userId: user.id,
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
            gerentePin: pin,
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
            reason: reopenReason,
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

    const formattedNet = useMemo(() => netResult.toLocaleString('es-CL'), [netResult]);

    if (user?.role !== 'MANAGER' && user?.role !== 'ADMIN' && user?.role !== 'GERENTE_GENERAL') {
        return (
            <div className="p-8 text-center text-red-500 font-bold">
                ⛔ Acceso Restringido: Solo Gerencia.
            </div>
        );
    }

    const renderEntries = (category: EntryCategory) => {
        const list = data.entries?.[category] || [];
        if (list.length === 0) {
            return <div className="text-sm text-slate-400">Sin movimientos aún.</div>;
        }

        return (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {list.map((entry) => (
                    <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 bg-slate-50"
                    >
                        <div className="space-y-0.5">
                            <div className="font-medium text-slate-700">
                                {new Date(entry.reference_date).toLocaleDateString('es-CL')}
                            </div>
                            {entry.description && (
                                <div className="text-xs text-slate-500">{entry.description}</div>
                            )}
                            <div className="text-[11px] text-slate-400">
                                Registrado por {entry.created_by_name || 'N/D'}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="font-mono font-bold text-emerald-600">
                                ${entry.amount.toLocaleString('es-CL')}
                            </div>
                            {canEdit && (
                                <button
                                    onClick={() => handleDeleteEntry(entry)}
                                    disabled={entryWorking === entry.id}
                                    className="text-slate-400 hover:text-red-500 disabled:opacity-50"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderTabs = (
        categories: typeof INCOME_CATEGORIES | typeof EXPENSE_CATEGORIES,
        activeTab: EntryCategory,
        setActiveTab: (cat: EntryCategory) => void,
        totalsMap: Record<string, number>,
    ) => (
        <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
                <button
                    key={cat.key}
                    onClick={() => setActiveTab(cat.key)}
                    className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 whitespace-nowrap ${activeTab === cat.key
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                >
                    <span>{cat.label}</span>
                    <span className="font-mono text-xs opacity-80">
                        ${Math.round(totalsMap[cat.key] || 0).toLocaleString('es-CL')}
                    </span>
                </button>
            ))}
        </div>
    );

    const incomeTotalsMap: Record<string, number> = {
        CASH: incomeTotals.cash,
        TRANSFER_IN: incomeTotals.transfer,
        CARD_INSTALLMENT: incomeTotals.card,
    };

    const expenseTotalsMap: Record<string, number> = {
        DAILY_EXPENSE: expenseTotals.daily,
        TRANSFER_OUT: expenseTotals.transferOut,
        PAYROLL: expenseTotals.payroll,
        FIXED_EXPENSE: expenseTotals.fixed,
        TAX: expenseTotals.tax,
        OWNER_WITHDRAWAL: expenseTotals.owner,
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <FileSpreadsheet className="text-indigo-600" size={32} />
                        Cierre Mensual Financiero
                    </h1>
                    <p className="text-slate-500 mt-1 flex items-center gap-2">
                        Conciliación manual de ingresos y egresos mensuales.
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            <Shield size={10} /> V2 Seguro
                        </span>
                    </p>
                </div>

                <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
                    <select
                        value={selectedMonth}
                        onChange={handleMonthChange}
                        className="bg-transparent font-bold text-slate-700 p-2 rounded-lg outline-none cursor-pointer hover:bg-slate-50"
                    >
                        {MONTHS.map((m, i) => (
                            <option key={i} value={i + 1}>
                                {m}
                            </option>
                        ))}
                    </select>
                    <div className="w-px bg-slate-200 mx-2 my-1"></div>
                    <select
                        value={selectedYear}
                        onChange={handleYearChange}
                        className="bg-transparent font-bold text-slate-700 p-2 rounded-lg outline-none cursor-pointer hover:bg-slate-50"
                    >
                        {[2024, 2025, 2026].map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div
                className={`p-4 rounded-xl flex flex-col md:flex-row justify-between items-center gap-4 ${isClosed ? 'bg-emerald-50 border border-emerald-200' : 'bg-indigo-50 border border-indigo-100'
                    }`}
            >
                <div className="flex items-center gap-3">
                    <span
                        className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 ${isClosed ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-100 text-amber-700'
                            }`}
                    >
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* INGRESOS PANEL */}
                <div className={`group bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/10 ${isClosed ? 'opacity-75 grayscale-[0.2]' : ''}`}>
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-8 py-6 border-b border-emerald-100/50 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500 rounded-xl text-white shadow-lg shadow-emerald-200">
                                <TrendingUp size={22} />
                            </div>
                            <h2 className="font-bold text-emerald-900 text-xl tracking-tight">
                                Ingresos Reales
                            </h2>
                        </div>
                        <div className="text-right">
                            <div className="text-emerald-700 font-mono font-black text-2xl tracking-tighter">
                                ${incomeTotals.total.toLocaleString('es-CL')}
                            </div>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-600/60">Total Recaudado</div>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {renderTabs(INCOME_CATEGORIES, activeIncomeTab, setActiveIncomeTab, incomeTotalsMap)}

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                                    Fecha del movimiento
                                </label>
                                <input
                                    type="date"
                                    value={forms[activeIncomeTab].date}
                                    onChange={(e) => handleInputChange(activeIncomeTab, 'date', e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all disabled:opacity-50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                                    Monto
                                </label>
                                <div className="relative group/input">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                    <input
                                        type="number"
                                        value={forms[activeIncomeTab].amount}
                                        onChange={(e) => handleInputChange(activeIncomeTab, 'amount', e.target.value)}
                                        disabled={!canEdit}
                                        className="w-full pl-8 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none font-mono text-xl font-bold transition-all disabled:opacity-50"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Descripción / referencia</label>
                            <input
                                type="text"
                                value={forms[activeIncomeTab].description}
                                onChange={(e) => handleInputChange(activeIncomeTab, 'description', e.target.value)}
                                disabled={!canEdit}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all disabled:opacity-50"
                                placeholder={
                                    INCOME_CATEGORIES.find((c) => c.key === activeIncomeTab)?.placeholder || ''
                                }
                            />
                        </div>

                        <div className="flex justify-between items-center bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50">
                            <div className="text-xs text-emerald-800 font-medium flex items-center gap-2">
                                <AlertCircle size={14} className="text-emerald-500" />
                                {INCOME_CATEGORIES.find((c) => c.key === activeIncomeTab)?.helper}
                            </div>
                            {canEdit && (
                                <button
                                    onClick={() => handleAddEntry(activeIncomeTab)}
                                    disabled={entryWorking !== null}
                                    className="px-6 py-3 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <Plus size={18} /> Agregar
                                </button>
                            )}
                        </div>

                        <div className="pt-2">{renderEntries(activeIncomeTab)}</div>
                    </div>
                </div>

                {/* EGRESOS PANEL */}
                <div className={`group bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-rose-500/10 ${isClosed ? 'opacity-75 grayscale-[0.2]' : ''}`}>
                    <div className="bg-gradient-to-r from-rose-50 to-orange-50 px-8 py-6 border-b border-rose-100/50 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-500 rounded-xl text-white shadow-lg shadow-rose-200">
                                <TrendingDown size={22} />
                            </div>
                            <h2 className="font-bold text-rose-900 text-xl tracking-tight">
                                Egresos & Nómina
                            </h2>
                        </div>
                        <div className="text-right">
                            <div className="text-rose-700 font-mono font-black text-2xl tracking-tighter">
                                ${expenseTotals.total.toLocaleString('es-CL')}
                            </div>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-rose-600/60">Total Egresos</div>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {renderTabs(EXPENSE_CATEGORIES, activeExpenseTab, setActiveExpenseTab, expenseTotalsMap)}

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                                    Fecha del gasto
                                </label>
                                <input
                                    type="date"
                                    value={forms[activeExpenseTab].date}
                                    onChange={(e) => handleInputChange(activeExpenseTab, 'date', e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all disabled:opacity-50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
                                    Monto
                                </label>
                                <div className="relative group/input">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                    <input
                                        type="number"
                                        value={forms[activeExpenseTab].amount}
                                        onChange={(e) => handleInputChange(activeExpenseTab, 'amount', e.target.value)}
                                        disabled={!canEdit}
                                        className="w-full pl-8 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none font-mono text-xl font-bold transition-all disabled:opacity-50"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Descripción / referencia</label>
                            <input
                                type="text"
                                value={forms[activeExpenseTab].description}
                                onChange={(e) => handleInputChange(activeExpenseTab, 'description', e.target.value)}
                                disabled={!canEdit}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all disabled:opacity-50"
                                placeholder={
                                    EXPENSE_CATEGORIES.find((c) => c.key === activeExpenseTab)?.placeholder || ''
                                }
                            />
                        </div>

                        <div className="flex justify-between items-center bg-rose-50/50 p-4 rounded-2xl border border-rose-100/50">
                            <div className="text-xs text-rose-800 font-medium flex items-center gap-2">
                                <AlertCircle size={14} className="text-rose-500" />
                                {EXPENSE_CATEGORIES.find((c) => c.key === activeExpenseTab)?.helper}
                            </div>
                            {canEdit && (
                                <button
                                    onClick={() => handleAddEntry(activeExpenseTab)}
                                    disabled={entryWorking !== null}
                                    className="px-6 py-3 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <Plus size={18} /> Agregar
                                </button>
                            )}
                        </div>

                        <div className="pt-2">{renderEntries(activeExpenseTab)}</div>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 overflow-hidden relative text-white rounded-[32px] shadow-2xl p-10 flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full -ml-20 -mb-20"></div>

                <div className="relative space-y-3">
                    <h3 className="text-slate-400 font-black mb-1 uppercase text-xs tracking-[0.2em]">
                        Resultado Neto Mensual
                    </h3>
                    <div className={`text-6xl font-mono font-black tracking-tighter ${netResult >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${formattedNet}
                    </div>
                    <div className="flex gap-6 pt-2">
                        <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Ingresos</div>
                            <div className="text-emerald-400/80 font-mono font-bold">${incomeTotals.total.toLocaleString('es-CL')}</div>
                        </div>
                        <div className="w-px bg-slate-800 self-stretch my-1"></div>
                        <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Egresos</div>
                            <div className="text-rose-400/80 font-mono font-bold">${expenseTotals.total.toLocaleString('es-CL')}</div>
                        </div>
                    </div>
                </div>

                <div className="relative flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                    {canEdit && (
                        <>
                            <button
                                onClick={handleSaveDraft}
                                disabled={saving}
                                className="px-8 py-4 rounded-2xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                <Save size={20} /> Guardar Borrador
                            </button>
                            <button
                                onClick={() => setShowCloseModal(true)}
                                disabled={incomeTotals.total === 0 && expenseTotals.total === 0}
                                className="px-8 py-4 rounded-2xl font-black bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xl shadow-indigo-600/40 border border-indigo-400/30 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                <Lock size={20} /> CERRAR MES
                            </button>
                        </>
                    )}
                    {isClosed && (
                        <div className="px-10 py-5 rounded-2xl font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-3">
                            <div className="p-1 bg-emerald-500 rounded-full text-slate-900">
                                <CheckCircle size={16} />
                            </div>
                            MES FINALIZADO
                        </div>
                    )}
                </div>
            </div>

            <div className={`group bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm transition-all hover:shadow-md ${isClosed ? 'opacity-75' : ''}`}>
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <FolderPlus size={20} />
                    </div>
                    <label className="font-black text-slate-800 tracking-tight">Observaciones del Periodo</label>
                </div>
                <textarea
                    value={data.notes || ''}
                    onChange={(e) => setData((prev) => ({ ...prev, notes: e.target.value }))}
                    disabled={!canEdit}
                    className="w-full p-6 bg-slate-50 border border-slate-200 rounded-[24px] focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-50 disabled:cursor-not-allowed resize-none"
                    rows={4}
                    placeholder="Registra cualquier detalle relevante sobre ingresos/egresos manuales..."
                />
            </div>

            <PinModal
                isOpen={showCloseModal}
                onClose={() => setShowCloseModal(false)}
                onSubmit={handleCloseMonth}
                title="Cerrar Mes Definitivamente"
                description={`Esta acción cerrará ${MONTHS[selectedMonth - 1]} ${selectedYear} de forma permanente. Los datos no podrán editarse.`}
                requiredRole="GERENTE_GENERAL"
            />

            {showReopenModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                        onClick={() => setShowReopenModal(false)}
                    />
                    <div className="relative bg-white rounded-[32px] shadow-2xl p-8 w-full max-w-md space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center space-y-2">
                            <div className="p-3 bg-amber-100 rounded-2xl text-amber-600 mb-2">
                                <AlertCircle size={32} />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Reabrir Período</h2>
                            <p className="text-slate-500 text-sm">
                                Esta acción requiere justificación obligatoria y será auditada.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">
                                Razón de reapertura
                            </label>
                            <textarea
                                value={reopenReason}
                                onChange={(e) => setReopenReason(e.target.value)}
                                className="w-full p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all resize-none"
                                rows={4}
                                placeholder="Explique por qué necesita reabrir este período..."
                            />
                            <div className={`text-[10px] font-bold mt-1 text-right ${reopenReason.length < 20 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {reopenReason.length}/20 caracteres mínimo
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    setShowReopenModal(false);
                                    setReopenReason('');
                                }}
                                className="flex-1 px-4 py-4 rounded-2xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (reopenReason.length >= 20) {
                                        setShowReopenModal(false);
                                        setShowReopenPin(true);
                                    }
                                }}
                                disabled={reopenReason.length < 20}
                                className="flex-1 px-4 py-4 rounded-2xl font-black bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all disabled:opacity-50"
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PinModal
                isOpen={showReopenPin}
                onClose={() => {
                    setShowReopenPin(false);
                    setShowReopenModal(false);
                }}
                onSubmit={handleReopenMonth}
                title="PIN de Autorización"
                description="Se requiere PIN de ADMIN para confirmar la reapertura."
                requiredRole="ADMIN"
            />

            {loading && (
                <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-white border border-slate-200 shadow-2xl rounded-[24px] px-8 py-6 flex flex-col items-center gap-4 animate-in zoom-in-95">
                        <div className="relative w-12 h-12">
                            <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                        </div>
                        <div className="text-slate-900 font-black tracking-tight">Sincronizando finanzas...</div>
                    </div>
                </div>
            )}
        </div>
    );
}
