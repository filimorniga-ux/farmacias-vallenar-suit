import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { useCashSession } from '../../hooks/useCashSession';
import { X, DollarSign, TrendingDown, TrendingUp, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { CashMovementReason } from '../../../domain/types';
import { generateDailyBackup } from '../../../domain/logic/backupService';

interface CashControlModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CashControlModal: React.FC<CashControlModalProps> = ({ isOpen, onClose }) => {
    const { currentShift, openShift, closeShift, registerCashMovement, salesHistory, cashMovements, inventory, user } = usePharmaStore();
    const metrics = useCashSession();

    const [activeTab, setActiveTab] = useState<'MOVEMENTS' | 'CLOSING'>('MOVEMENTS');

    // Movement State
    const [movementType, setMovementType] = useState<'IN' | 'OUT'>('OUT');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState<CashMovementReason>('SUPPLIES');
    const [description, setDescription] = useState('');

    // Closing State
    const [closingAmount, setClosingAmount] = useState('');
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    // Opening State (if shift is closed)
    const [openingAmount, setOpeningAmount] = useState('');

    if (!isOpen) return null;

    // 1. OPENING SHIFT VIEW - DEPRECATED
    // Use ShiftManagementModal for opening shifts with correct context
    if (!currentShift || currentShift.status !== 'ACTIVE') {
        return null;
    }

    if (!metrics) return null;

    const handleRegisterMovement = () => {
        const val = parseInt(amount);
        if (isNaN(val) || val <= 0) {
            toast.error('Ingrese un monto válido');
            return;
        }
        if (!description) {
            toast.error('Ingrese una descripción');
            return;
        }

        registerCashMovement({
            type: movementType,
            amount: val,
            reason: reason,
            description: description,
            is_cash: true
        });

        toast.success('Movimiento registrado');
        setAmount('');
        setDescription('');
    };

    const handleCloseShift = () => {
        const val = parseInt(closingAmount);
        if (isNaN(val) || val < 0) return;

        // Trigger Backup
        try {
            generateDailyBackup(salesHistory, cashMovements, inventory);
            toast.success('✅ Respaldo de seguridad guardado en Descargas');
        } catch (error) {
            console.error('Backup failed:', error);
            toast.error('Error al generar respaldo automático');
        }

        closeShift(val, 'CURRENT_USER');
        toast.success('Turno cerrado correctamente');
        onClose();
    };

    const toggleSection = (id: string) => {
        setExpandedSection(expandedSection === id ? null : id);
    };

    const difference = (parseInt(closingAmount) || 0) - metrics.expectedCash;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">

                {/* HEADER */}
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-cyan-500/20 rounded-xl">
                            <DollarSign className="text-cyan-400" size={28} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Control de Caja</h2>
                            <p className="text-slate-400 text-sm">Turno #{currentShift.id.slice(-6)} • Iniciado {new Date(currentShift.start_time).toLocaleTimeString()}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-2 hover:bg-white/10 rounded-full transition"><X /></button>
                </div>

                {/* TABS */}
                <div className="flex border-b border-slate-200 shrink-0">
                    <button
                        onClick={() => setActiveTab('MOVEMENTS')}
                        className={`flex-1 py-4 font-bold text-sm border-b-2 transition ${activeTab === 'MOVEMENTS' ? 'border-cyan-500 text-cyan-700 bg-cyan-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                    >
                        1. MOVIMIENTOS
                    </button>
                    <button
                        onClick={() => setActiveTab('CLOSING')}
                        className={`flex-1 py-4 font-bold text-sm border-b-2 transition ${activeTab === 'CLOSING' ? 'border-cyan-500 text-cyan-700 bg-cyan-50/50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                    >
                        2. ARQUEO Y CIERRE
                    </button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto bg-slate-50 p-6">

                    {/* TAB 1: MOVEMENTS */}
                    {activeTab === 'MOVEMENTS' && (
                        <div className="max-w-2xl mx-auto">
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-1">
                                <div className="grid grid-cols-2 gap-1 mb-6 p-1 bg-slate-100 rounded-xl">
                                    <button
                                        onClick={() => { setMovementType('OUT'); setReason('SUPPLIES'); }}
                                        className={`py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition ${movementType === 'OUT' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <TrendingDown size={18} /> Registrar SALIDA
                                    </button>
                                    <button
                                        onClick={() => { setMovementType('IN'); setReason('OTHER_INCOME'); }}
                                        className={`py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition ${movementType === 'IN' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <TrendingUp size={18} /> Registrar INGRESO
                                    </button>
                                </div>

                                <div className="px-6 pb-6 space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Monto</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="number"
                                                className="w-full pl-10 p-4 bg-slate-50 border border-slate-200 rounded-xl text-2xl font-bold text-slate-800 focus:border-cyan-500 outline-none"
                                                placeholder="0"
                                                value={amount}
                                                onChange={e => setAmount(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Motivo</label>
                                        <select
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-cyan-500 outline-none"
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value as CashMovementReason)}
                                        >
                                            {movementType === 'OUT' ? (
                                                <>
                                                    <option value="SUPPLIES">Insumos / Compras</option>
                                                    <option value="SERVICES">Pago Servicios</option>
                                                    <option value="WITHDRAWAL">Retiro de Utilidades</option>
                                                    <option value="SALARY_ADVANCE">Adelanto Sueldo</option>
                                                    <option value="OTHER">Otro Egreso</option>
                                                </>
                                            ) : (
                                                <>
                                                    <option value="OTHER_INCOME">Ingreso Extra / Aporte</option>
                                                    <option value="INITIAL_FUND">Ajuste Fondo Inicial</option>
                                                </>
                                            )}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Descripción</label>
                                        <textarea
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-cyan-500 outline-none resize-none h-24"
                                            placeholder={movementType === 'OUT' ? "Ej: Compra de confort, pago de luz..." : "Ej: Aporte de sencillo, devolución..."}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                        />
                                    </div>

                                    <button
                                        onClick={handleRegisterMovement}
                                        className={`w-full py-4 font-bold text-white rounded-xl shadow-lg transition flex items-center justify-center gap-2 ${movementType === 'OUT' ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 'bg-green-500 hover:bg-green-600 shadow-green-200'}`}
                                    >
                                        {movementType === 'OUT' ? <TrendingDown /> : <TrendingUp />}
                                        {movementType === 'OUT' ? 'Confirmar Egreso' : 'Confirmar Ingreso'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: CLOSING & ARQUEO */}
                    {activeTab === 'CLOSING' && (
                        <div className="flex gap-6 h-full">
                            {/* LEFT: DETAILS (ACCORDIONS) */}
                            <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                                <h3 className="font-bold text-slate-800 mb-4">Detalle de Operaciones</h3>

                                {/* 1. CASH SALES */}
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                    <button
                                        onClick={() => toggleSection('CASH')}
                                        className="w-full p-4 flex justify-between items-center hover:bg-slate-50 transition"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-green-100 text-green-600 rounded-lg"><DollarSign size={20} /></div>
                                            <div className="text-left">
                                                <div className="font-bold text-slate-800">Ventas Efectivo</div>
                                                <div className="text-xs text-slate-500">{metrics.cashSales.count} transacciones</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-bold text-slate-800">${metrics.cashSales.total.toLocaleString()}</span>
                                            {expandedSection === 'CASH' ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                        </div>
                                    </button>
                                    {expandedSection === 'CASH' && (
                                        <div className="bg-slate-50 border-t border-slate-100 p-2 space-y-1 max-h-60 overflow-y-auto">
                                            {metrics.cashSales.items.map((sale, index) => (
                                                <div key={`${sale.id}-${index}`} className="flex justify-between text-sm p-2 hover:bg-white rounded-lg">
                                                    <span className="text-slate-500">{new Date(sale.timestamp).toLocaleTimeString()}</span>
                                                    <span className="font-medium text-slate-700">${sale.total.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 2. CARD SALES */}
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                    <button
                                        onClick={() => toggleSection('CARD')}
                                        className="w-full p-4 flex justify-between items-center hover:bg-slate-50 transition"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><DollarSign size={20} /></div>
                                            <div className="text-left">
                                                <div className="font-bold text-slate-800">Ventas Tarjeta</div>
                                                <div className="text-xs text-slate-500">{metrics.cardSales.count} transacciones</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-bold text-slate-800">${metrics.cardSales.total.toLocaleString()}</span>
                                            {expandedSection === 'CARD' ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                        </div>
                                    </button>
                                    {expandedSection === 'CARD' && (
                                        <div className="bg-slate-50 border-t border-slate-100 p-2 space-y-1 max-h-60 overflow-y-auto">
                                            {metrics.cardSales.items.map((sale, index) => (
                                                <div key={`${sale.id}-${index}`} className="flex justify-between text-sm p-2 hover:bg-white rounded-lg">
                                                    <span className="text-slate-500">{new Date(sale.timestamp).toLocaleTimeString()}</span>
                                                    <span className="font-medium text-slate-700">${sale.total.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 3. TRANSFERS */}
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                    <button
                                        onClick={() => toggleSection('TRANSFER')}
                                        className="w-full p-4 flex justify-between items-center hover:bg-slate-50 transition"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><DollarSign size={20} /></div>
                                            <div className="text-left">
                                                <div className="font-bold text-slate-800">Transferencias</div>
                                                <div className="text-xs text-slate-500">{metrics.transferSales.count} transacciones</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-bold text-slate-800">${metrics.transferSales.total.toLocaleString()}</span>
                                            {expandedSection === 'TRANSFER' ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                        </div>
                                    </button>
                                    {expandedSection === 'TRANSFER' && (
                                        <div className="bg-slate-50 border-t border-slate-100 p-2 space-y-1 max-h-60 overflow-y-auto">
                                            {metrics.transferSales.items.map((sale, index) => (
                                                <div key={`${sale.id}-${index}`} className="flex justify-between text-sm p-2 hover:bg-white rounded-lg">
                                                    <span className="text-slate-500">{new Date(sale.timestamp).toLocaleTimeString()}</span>
                                                    <span className="font-medium text-slate-700">${sale.total.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT: CASH FLOW & CLOSING */}
                            <div className="w-1/3 flex flex-col">
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-4 flex-1">
                                    <h3 className="font-bold text-slate-800 mb-4">Flujo de Efectivo</h3>

                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between text-slate-600">
                                            <span>(+) Base Inicial</span>
                                            <span className="font-medium">${metrics.initialFund.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>(+) Ventas Efectivo</span>
                                            <span className="font-medium">${metrics.cashSales.total.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-green-600">
                                            <span>(+) Otros Ingresos</span>
                                            <span className="font-bold">${metrics.otherIncomes.total.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-red-500">
                                            <span>(-) Gastos / Salidas</span>
                                            <span className="font-bold">-${metrics.expenses.total.toLocaleString()}</span>
                                        </div>

                                        <div className="pt-3 border-t-2 border-slate-100 mt-2">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-slate-800">DEBE HABER EN CAJA</span>
                                                <span className="text-xl font-bold text-slate-900">${metrics.expectedCash.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8">
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Conteo Físico Real</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="number"
                                                className={`w-full pl-10 p-4 border-2 rounded-xl text-2xl font-bold outline-none transition ${closingAmount && difference === 0 ? 'border-green-500 bg-green-50 text-green-700' :
                                                    closingAmount && difference !== 0 ? 'border-red-500 bg-red-50 text-red-700' :
                                                        'border-slate-200 bg-slate-50 text-slate-800 focus:border-cyan-500'
                                                    }`}
                                                placeholder="0"
                                                value={closingAmount}
                                                onChange={e => setClosingAmount(e.target.value)}
                                            />
                                        </div>

                                        {closingAmount && (
                                            <div className={`mt-4 p-4 rounded-xl flex items-center gap-3 ${difference === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {difference === 0 ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                                                <div>
                                                    <div className="font-bold">{difference === 0 ? 'Cuadratura Perfecta' : 'Diferencia Detectada'}</div>
                                                    <div className="text-sm">{difference > 0 ? `Sobra $${difference.toLocaleString()}` : difference < 0 ? `Falta $${Math.abs(difference).toLocaleString()}` : 'Todo en orden'}</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={handleCloseShift}
                                    disabled={!closingAmount}
                                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                >
                                    Cerrar Turno
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CashControlModal;
