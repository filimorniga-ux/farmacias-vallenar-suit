'use client';

import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { getFinancialAccounts, getTreasuryTransactions, depositToBank, getPendingRemittances, confirmRemittance, FinancialAccount, TreasuryTransaction, Remittance } from '@/actions/treasury';
import { toast } from 'sonner';
import { Landmark, Briefcase, DollarSign, ArrowRight, ArrowDownLeft, ArrowUpRight, History, CheckCircle, Package, LayoutDashboard, FileText } from 'lucide-react';
import { TreasuryHistoryTab } from '@/presentation/components/treasury/TreasuryHistoryTab';


export default function TreasuryPage() {
    const { user, locations } = usePharmaStore();


    const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
    const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
    const [remittances, setRemittances] = useState<Remittance[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);

    // Deposit Modal State
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [activeTab, setActiveTab] = useState<'SUMMARY' | 'HISTORY'>('SUMMARY');

    // Load Data
    const loadTreasuryData = async () => {
        if (!user?.assigned_location_id) return;

        setLoading(true);
        try {
            // 1. Get Accounts
            const accRes = await getFinancialAccounts(user.assigned_location_id);
            if (accRes.success && accRes.data) {
                setAccounts(accRes.data);

                // Select Safe by default or first account
                const safe = accRes.data.find(a => a.type === 'SAFE');
                if (safe) {
                    setSelectedAccount(safe);
                    // Fetch Transactions for Safe
                    fetchTransactions(safe.id);
                }
            }

            // 2. Get Pending Remittances
            const remRes = await getPendingRemittances(user.assigned_location_id);
            if (remRes.success && remRes.data) setRemittances(remRes.data);

        } catch (error) {
            console.error(error);
            toast.error('Error cargando tesorería');
        } finally {
            setLoading(false);
        }
    };

    const fetchTransactions = async (accountId: string) => {
        const txRes = await getTreasuryTransactions(accountId);
        if (txRes.success && txRes.data) setTransactions(txRes.data);
    };

    useEffect(() => {
        loadTreasuryData();
    }, [user?.assigned_location_id]); // Reload if location changes (unlikely for user but possible)

    const handleDeposit = async () => {
        if (!selectedAccount || selectedAccount.type !== 'SAFE') return;
        if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) {
            toast.error('Monto inválido');
            return;
        }

        toast.promise(depositToBank(selectedAccount.id, Number(depositAmount), user?.id || 'sys'), {
            loading: 'Procesando depósito...',
            success: () => {
                setIsDepositModalOpen(false);
                setDepositAmount('');
                loadTreasuryData(); // Refresh all
                return 'Depósito registrado correctamente';
            },
            error: (err: any) => err.message || 'Error en depósito'
        });
    };

    const handleConfirmRemittance = async (remittanceId: string, amount: number) => {
        toast.promise(confirmRemittance(remittanceId, user?.id || 'sys'), {
            loading: 'Verificando recepción de efectivo...',
            success: () => {
                loadTreasuryData();
                return `Se ingresaron $${amount.toLocaleString('es-CL')} a Caja Fuerte`;
            },
            error: 'Error al confirmar recepción'
        });
    };

    if (!user) return <div className="p-8 text-center text-slate-500">Cargando perfil...</div>;

    // Security Check
    // if (user.role !== 'MANAGER' && user.role !== 'ADMIN') {
    //     return <div className="p-8 text-center text-red-500 font-bold">⛔ Acceso Restringido: Solo Gerentes.</div>;
    // }

    const safeAccount = accounts.find(a => a.type === 'SAFE');
    const bankAccount = accounts.find(a => a.type === 'BANK');

    const currentLocationName = locations.find(l => l.id === user.assigned_location_id)?.name || 'Sucursal desconocida';

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Briefcase className="text-slate-900" size={32} />
                        Tesorería
                    </h1>
                    <p className="text-slate-500 mt-1 flex items-center gap-1">
                        <Landmark size={14} /> Gestión de Efectivo - <span className="font-semibold text-slate-700">{currentLocationName}</span>
                    </p>
                </div>
                <div>
                    <button
                        onClick={() => loadTreasuryData()}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors"
                    >
                        Refrescar
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-gray-200 pb-1">
                <button
                    onClick={() => setActiveTab('SUMMARY')}
                    className={`flex items-center gap-2 px-4 py-2 font-bold text-sm rounded-t-lg border-b-2 transition-colors ${activeTab === 'SUMMARY'
                        ? 'border-slate-900 text-slate-900 bg-slate-50'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-gray-50'
                        }`}
                >
                    <LayoutDashboard size={16} /> Resumen
                </button>
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`flex items-center gap-2 px-4 py-2 font-bold text-sm rounded-t-lg border-b-2 transition-colors ${activeTab === 'HISTORY'
                        ? 'border-slate-900 text-slate-900 bg-slate-50'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-gray-50'
                        }`}
                >
                    <FileText size={16} /> Historial de Rendiciones
                </button>
            </div>

            {/* Summary View */}
            {activeTab === 'SUMMARY' && (
                <div className="space-y-8 animate-in slide-in-from-left-4">

                    {/* Pending Remittances Section */}
                    {remittances.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 animate-pulse-once">
                            <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2 mb-4">
                                <Package className="text-amber-600" /> Remesas Pendientes de Recepción
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {remittances.map((rem) => (
                                    <div key={rem.id} className="bg-white p-4 rounded-xl shadow-sm border border-amber-100 flex flex-col justify-between">
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold mb-1">RETIRO DE CAJA</p>
                                            <p className="text-2xl font-mono font-bold text-slate-800">
                                                ${Number(rem.amount).toLocaleString('es-CL')}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-2">
                                                Creado por: {rem.created_by.slice(0, 8)}... {/* Ideally Name */}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {new Date(rem.created_at).toLocaleString('es-CL')}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleConfirmRemittance(rem.id, Number(rem.amount))}
                                            className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
                                        >
                                            <CheckCircle size={16} /> Confirmar Recepción
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Account Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                        {/* Safe Card */}
                        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden group hover:scale-[1.01] transition-transform">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Briefcase size={100} />
                            </div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-slate-800 rounded-lg"><Briefcase size={20} className="text-amber-400" /></div>
                                <span className="font-medium text-slate-300">Caja Fuerte (Efectivo)</span>
                            </div>
                            <div className="mt-4">
                                <p className="text-4xl font-mono font-bold tracking-tight">
                                    ${Number(safeAccount?.balance || 0).toLocaleString('es-CL')}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">Disponible para depósito</p>
                            </div>

                            <div className="mt-6 pt-4 border-t border-slate-800 flex gap-2">
                                <button
                                    onClick={() => setIsDepositModalOpen(true)}
                                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Landmark size={18} /> Depositar a Banco
                                </button>
                            </div>
                        </div>

                        {/* Bank Card (Optional/Future) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-50 rounded-lg"><Landmark size={20} className="text-blue-600" /></div>
                                <span className="font-medium text-slate-500">Cuenta Banco</span>
                            </div>
                            <div className="mt-4">
                                <p className="text-4xl font-mono font-bold tracking-tight text-slate-800">
                                    ${Number(bankAccount?.balance || 0).toLocaleString('es-CL')}
                                </p>
                                <p className="text-xs text-green-600 mt-1 font-medium flex items-center gap-1">
                                    <ArrowUpRight size={12} /> Fondos Consolidados
                                </p>
                            </div>
                        </div>

                    </div>

                    {/* Transactions Section */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <History size={20} className="text-slate-400" /> Historial de Movimientos
                            </h3>
                            {selectedAccount && <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">{selectedAccount.name}</span>}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4">Fecha</th>
                                        <th className="px-6 py-4">Descripción</th>
                                        <th className="px-6 py-4 text-center">Tipo</th>
                                        <th className="px-6 py-4 text-right">Monto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {transactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                                No hay movimientos registrados
                                            </td>
                                        </tr>
                                    ) : (
                                        transactions.map((tx) => (
                                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                                                    {new Date(tx.created_at).toLocaleString('es-CL')}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-700">
                                                    {tx.description}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${tx.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                                        }`}>
                                                        {tx.type === 'IN' ? 'INGRESO' : 'EGRESO'}
                                                    </span>
                                                </td>
                                                <td className={`px-6 py-4 text-right font-mono font-bold ${tx.type === 'IN' ? 'text-emerald-600' : 'text-slate-800'
                                                    }`}>
                                                    {tx.type === 'IN' ? '+' : '-'}${Number(tx.amount).toLocaleString('es-CL')}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Deposit Modal */}
                    {isDepositModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                        <Landmark className="text-amber-500" /> Depósito Bancario
                                    </h2>
                                    <button onClick={() => setIsDepositModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                                        <span className="sr-only">Cerrar</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    </button>
                                </div>

                                <div className="p-6 space-y-6">
                                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                                        <p className="text-amber-800 text-sm font-medium mb-1">Saldo en Caja Fuerte</p>
                                        <p className="text-2xl font-mono font-bold text-amber-900">${Number(safeAccount?.balance || 0).toLocaleString('es-CL')}</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Monto a Depositar</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                type="number"
                                                autoFocus
                                                value={depositAmount}
                                                onChange={(e) => setDepositAmount(e.target.value)}
                                                className="w-full pl-10 p-4 text-xl font-mono border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                                                placeholder="0"
                                            />
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2">El monto se descontará de la Caja Fuerte y se sumará al Banco.</p>
                                    </div>

                                    <button
                                        onClick={handleDeposit}
                                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-all"
                                    >
                                        Confirmar Depósito
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            )}

            {/* History View */}
            {activeTab === 'HISTORY' && <TreasuryHistoryTab />}

        </div >
    );
}
