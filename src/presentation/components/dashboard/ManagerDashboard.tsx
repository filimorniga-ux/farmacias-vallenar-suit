import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Store, CreditCard, Banknote, ArrowRightLeft, TrendingDown,
    Monitor, User, Clock, CheckCircle2, AlertCircle, RefreshCw,
    Wallet, Users, ArrowUpRight
} from 'lucide-react';
import { getManagerRealTimeDataSecure, ManagerDashboardData, BranchDetail } from '@/actions/manager-dashboard-v2';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const REFRESH_INTERVAL = 60000; // 1 minute auto-refresh

export default function ManagerDashboard() {
    const [data, setData] = useState<ManagerDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isRefetching, setIsRefetching] = useState(false);

    const fetchData = async (branchId?: string, isBackground = false) => {
        if (!isBackground) setLoading(true);
        else setIsRefetching(true);
        setError(null);

        try {
            const res = await getManagerRealTimeDataSecure(branchId || selectedBranchId || undefined);
            if (res.success && res.data) {
                setData(res.data);
                if (res.data.selectedBranch) {
                    setSelectedBranchId(res.data.selectedBranch.locationId);
                }
                setLastUpdated(new Date());
            } else {
                setError(res.error || 'Error desconocido al cargar datos');
                if (!data) setData(null); // Keep old data if possible, or null
            }
        } catch (error: any) {
            console.error('Failed to load manager dashboard:', error);
            setError(error.message || 'Error de conexión');
        } finally {
            setLoading(false);
            setIsRefetching(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => fetchData(undefined, true), REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    const handleBranchChange = (branchId: string) => {
        setSelectedBranchId(branchId);
        fetchData(branchId);
    };

    if (loading && !data) {
        return <div className="p-8 text-center text-slate-400 animate-pulse">Cargando tablero de gerencia...</div>;
    }

    if (error && !data) {
        return (
            <div className="p-8 text-center">
                <div className="inline-block p-3 rounded-full bg-red-100 text-red-500 mb-3">
                    <AlertCircle size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-700">Error al cargar</h3>
                <p className="text-slate-500 mb-4">{error}</p>
                <button
                    onClick={() => fetchData()}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2 mx-auto"
                >
                    <RefreshCw size={16} /> Reintentar
                </button>
            </div>
        );
    }

    const branchDetail = data?.selectedBranch;

    return (
        <div className="space-y-6">
            {/* --- HEADER CONTROLS --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/50 p-4 rounded-2xl md:bg-transparent md:p-0">
                <div className="flex items-center gap-3 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto scrollbar-hide">
                    {data?.branches?.map(branch => (
                        <button
                            key={branch.id}
                            onClick={() => handleBranchChange(branch.id)}
                            className={`flex flex-col items-start px-4 py-2 rounded-xl transition-all min-w-[140px] border ${selectedBranchId === branch.id
                                ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-105'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                        >
                            <span className="text-xs font-bold uppercase opacity-70 mb-1 flex items-center gap-1">
                                <Store size={10} /> {branch.name}
                            </span>
                            <span className="text-lg font-bold">
                                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', notation: 'compact' }).format(branch.totalSales)}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto">
                    <span className="text-xs text-slate-400 font-mono">
                        Actualizado: {format(lastUpdated, 'HH:mm:ss')}
                    </span>
                    <button
                        onClick={() => fetchData()}
                        disabled={isRefetching}
                        className={`p-2 bg-white rounded-full shadow-sm border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all ${isRefetching ? 'animate-spin text-blue-600' : ''}`}
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {branchDetail && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={branchDetail.locationId}
                    className="space-y-6"
                >
                    {/* --- FINANCIAL BREAKDOWN CARDS --- */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        {/* Cash */}
                        <MetricCard
                            title="Efectivo"
                            value={branchDetail.financials.cash}
                            icon={Banknote}
                            color="text-emerald-600"
                            bg="bg-emerald-50"
                        />
                        {/* Cards */}
                        <MetricCard
                            title="Tarjetas"
                            value={branchDetail.financials.debit + branchDetail.financials.credit}
                            icon={CreditCard}
                            color="text-blue-600"
                            bg="bg-blue-50"
                        />
                        {/* Transfers */}
                        <MetricCard
                            title="Transferencias"
                            value={branchDetail.financials.transfer}
                            icon={ArrowRightLeft}
                            color="text-purple-600"
                            bg="bg-purple-50"
                        />
                        {/* Other Income */}
                        <MetricCard
                            title="Otros Ingresos"
                            value={branchDetail.financials.otherIncome}
                            icon={ArrowUpRight}
                            color="text-cyan-600"
                            bg="bg-cyan-50"
                        />
                        {/* Expenses */}
                        <MetricCard
                            title="Gastos/Salidas"
                            value={branchDetail.financials.expenses}
                            icon={TrendingDown}
                            color="text-red-500"
                            bg="bg-red-50"
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* --- TERMINALS GRID --- */}
                        <div className="lg:col-span-2 space-y-4">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <Monitor size={20} /> Terminales & Cajas
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {branchDetail.terminals.map(terminal => (
                                    <div key={terminal.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 relative overflow-hidden">
                                        {/* Status Header */}
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-bold text-slate-800">{terminal.name}</h4>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {terminal.session ? (
                                                        <span className="flex items-center gap-1 text-emerald-600">
                                                            <CheckCircle2 size={10} /> {terminal.session.userName}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-slate-400">
                                                            <AlertCircle size={10} /> Cerrada
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className={`px-2 py-1 rounded-full text-[10px] font-bold ${terminal.session ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {terminal.session ? 'ONLINE' : 'OFFLINE'}
                                            </div>
                                        </div>

                                        {/* Financial Mini-Summary */}
                                        <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-50">
                                            <div className="bg-slate-50 p-2 rounded-lg">
                                                <p className="text-[10px] text-slate-500 uppercase">Efectivo</p>
                                                <p className="font-bold text-sm text-emerald-600">
                                                    {formatCurrency(terminal.financials.cash)}
                                                </p>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded-lg">
                                                <p className="text-[10px] text-slate-500 uppercase">Total</p>
                                                <p className="font-bold text-sm text-slate-700">
                                                    {formatCurrency(terminal.financials.totalCollected)}
                                                </p>
                                            </div>
                                        </div>

                                        {terminal.session && terminal.session.startTime && (
                                            <p className="text-[10px] text-slate-400 text-right">
                                                Abierta hace {formatDistanceSecure(new Date(terminal.session.startTime))}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* --- STAFF & SHIFTS SIDEBAR --- */}
                        <div className="space-y-6">
                            {/* Staff */}
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="font-bold text-slate-700 flex items-center justify-between mb-4">
                                    <span className="flex items-center gap-2"><Users size={18} /> Personal Activo</span>
                                    <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-1 rounded-full">
                                        {branchDetail.activeStaff.length}
                                    </span>
                                </h3>
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                                    {branchDetail.activeStaff.length > 0 ? (
                                        branchDetail.activeStaff.map(staff => {
                                            // Buscar si este empleado tiene un turno de caja activo
                                            const activeShift = branchDetail.shifts.find(
                                                s => s.userName === staff.name && s.status === 'OPEN'
                                            );
                                            return (
                                                <div key={staff.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${staff.status === 'IN' ? 'bg-gradient-to-br from-emerald-400 to-teal-500' :
                                                            staff.status === 'LUNCH' ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                                                                'bg-gradient-to-br from-indigo-400 to-purple-500'
                                                        }`}>
                                                        {staff.name.charAt(0)}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-xs font-bold text-slate-700">{staff.name}</p>
                                                        <p className="text-[10px] text-slate-400">
                                                            {staff.jobTitle}
                                                            {activeShift && (
                                                                <span className="ml-1 text-cyan-600 font-bold">• {activeShift.terminalName}</span>
                                                            )}
                                                            {!activeShift && ` • ${staff.locationArea}`}
                                                        </p>
                                                    </div>
                                                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${staff.status === 'IN' ? 'text-emerald-600 bg-emerald-50' :
                                                            staff.status === 'LUNCH' ? 'text-amber-600 bg-amber-50' :
                                                                'text-slate-600 bg-slate-50'
                                                        }`}>
                                                        {staff.status === 'IN' ? 'TRABAJANDO' :
                                                            staff.status === 'LUNCH' ? 'COLACIÓN' : staff.status}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p className="text-sm text-slate-400 text-center py-4">Sin personal activo registrado</p>
                                    )}
                                </div>
                            </div>

                            {/* Shift History */}
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-4">
                                    <Clock size={18} /> Historial Turnos (Hoy)
                                </h3>
                                <div className="space-y-4 max-h-60 overflow-y-auto pr-1 relative">
                                    <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-100"></div>
                                    {branchDetail.shifts.map((shift, idx) => (
                                        <div key={shift.id} className="relative flex items-start gap-4 z-10">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 ${shift.status === 'OPEN' ? 'bg-white border-emerald-500 text-emerald-500' : 'bg-slate-100 border-slate-300 text-slate-400'
                                                }`}>
                                                <User size={14} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-700">{shift.userName}</p>
                                                <p className="text-[10px] text-slate-500">{shift.terminalName}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                                                        {format(new Date(shift.openedAt), 'HH:mm')}
                                                    </span>
                                                    {shift.closedAt ? (
                                                        <>
                                                            <span className="text-[10px] text-slate-300">➜</span>
                                                            <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                                                                {format(new Date(shift.closedAt), 'HH:mm')}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                                                            ACTIVO
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {branchDetail.shifts.length === 0 && (
                                        <p className="text-sm text-slate-400 text-center py-4">No hay turnos hoy</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

// --- SUBCOMPONENTS & UTILS ---

const MetricCard = ({ title, value, icon: Icon, color, bg }: any) => (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between h-28 group hover:shadow-md transition-all">
        <div className="flex justify-between items-start">
            <div className={`p-2 rounded-xl ${bg} ${color} group-hover:scale-110 transition-transform`}>
                <Icon size={18} />
            </div>
        </div>
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{title}</p>
            <p className="text-lg font-bold text-slate-800 leading-tight">
                {formatCurrency(value)}
            </p>
        </div>
    </div>
);

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
}

// Simple approximation for time ago
function formatDistanceSecure(date: Date) {
    const diffMs = new Date().getTime() - date.getTime();
    const diffHeures = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHeures > 0) return `${diffHeures}h ${diffMinutes}m`;
    return `${diffMinutes}m`;
}
