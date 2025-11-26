import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, Camera, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Lock } from 'lucide-react';
import { CashMovementReason } from '../../../domain/types';

interface CashManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CashManagementModal: React.FC<CashManagementModalProps> = ({ isOpen, onClose }) => {
    const { currentShift, openShift, closeShift, registerCashMovement, getShiftMetrics } = usePharmaStore();
    const [activeTab, setActiveTab] = useState<'OPENING' | 'EXPENSE' | 'CLOSING'>('OPENING');

    // Opening State
    const [openingAmount, setOpeningAmount] = useState('');

    // Expense State
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseReason, setExpenseReason] = useState<CashMovementReason>('SUPPLIES');
    const [expenseDescription, setExpenseDescription] = useState('');
    const [expenseEvidence, setExpenseEvidence] = useState<string | null>(null);

    // Closing State
    const [closingAmount, setClosingAmount] = useState('');
    const [metrics, setMetrics] = useState<any>(null);

    useEffect(() => {
        if (isOpen) {
            if (!currentShift || currentShift.status === 'CLOSED') {
                setActiveTab('OPENING');
            } else {
                setActiveTab('EXPENSE'); // Default to expense if open
                setMetrics(getShiftMetrics());
            }
        }
    }, [isOpen, currentShift]);

    useEffect(() => {
        if (currentShift?.status === 'OPEN') {
            const interval = setInterval(() => {
                setMetrics(getShiftMetrics());
            }, 1000); // Update metrics every second
            return () => clearInterval(interval);
        }
    }, [currentShift]);


    const handleOpenShift = () => {
        const amount = parseInt(openingAmount);
        if (isNaN(amount) || amount < 0) return;
        openShift(amount);
        setActiveTab('EXPENSE');
    };

    const handleRegisterExpense = () => {
        const amount = parseInt(expenseAmount);
        if (isNaN(amount) || amount <= 0) return;
        if (!expenseEvidence && expenseDescription.length < 10) return; // Validation rule

        registerCashMovement({
            type: 'OUT',
            amount,
            reason: expenseReason,
            description: expenseDescription,
            evidence_url: expenseEvidence || undefined,
            is_cash: true
        });

        // Reset form
        setExpenseAmount('');
        setExpenseDescription('');
        setExpenseEvidence(null);
        alert('Gasto registrado correctamente');
    };

    const handleCloseShift = () => {
        const amount = parseInt(closingAmount);
        if (isNaN(amount) || amount < 0) return;

        if (window.confirm('¿Estás seguro de cerrar la caja? Esta acción no se puede deshacer.')) {
            closeShift(amount);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <DollarSign className="text-blue-600" />
                                Gestión de Caja
                            </h2>
                            <p className="text-sm text-slate-500">
                                {currentShift?.status === 'OPEN' ? `Turno Abierto - Inicio: ${new Date(currentShift.start_time).toLocaleTimeString()}` : 'Turno Cerrado'}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Tabs (Only visible if shift is open) */}
                    {currentShift?.status === 'OPEN' && (
                        <div className="flex border-b border-gray-100">
                            <button
                                onClick={() => setActiveTab('EXPENSE')}
                                className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeTab === 'EXPENSE' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                Registrar Salida/Gasto
                            </button>
                            <button
                                onClick={() => setActiveTab('CLOSING')}
                                className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeTab === 'CLOSING' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                Arqueo y Cierre
                            </button>
                        </div>
                    )}

                    {/* Content */}
                    <div className="p-6 overflow-y-auto flex-1">

                        {/* A. OPENING */}
                        {activeTab === 'OPENING' && (
                            <div className="text-center py-8">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                                    <Lock size={40} />
                                </div>
                                <h3 className="text-2xl font-bold text-slate-800 mb-2">Apertura de Caja</h3>
                                <p className="text-slate-500 mb-8">Ingresa el monto de dinero sencillo con el que inicias el turno.</p>

                                <div className="max-w-xs mx-auto">
                                    <label className="block text-sm font-medium text-slate-700 mb-2 text-left">Monto Inicial</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">$</span>
                                        <input
                                            type="number"
                                            value={openingAmount}
                                            onChange={(e) => setOpeningAmount(e.target.value)}
                                            className="w-full pl-8 pr-4 py-4 text-2xl font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            placeholder="0"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        onClick={handleOpenShift}
                                        disabled={!openingAmount}
                                        className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        Abrir Caja
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* B. EXPENSE */}
                        {activeTab === 'EXPENSE' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Monto a Retirar</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                            <input
                                                type="number"
                                                value={expenseAmount}
                                                onChange={(e) => setExpenseAmount(e.target.value)}
                                                className="w-full pl-8 pr-4 py-3 text-lg font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Motivo</label>
                                        <select
                                            value={expenseReason}
                                            onChange={(e) => setExpenseReason(e.target.value as CashMovementReason)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="SUPPLIES">Insumos / Gastos Menores</option>
                                            <option value="SERVICES">Pago Servicios</option>
                                            <option value="WITHDRAWAL">Retiro de Utilidades</option>
                                            <option value="OTHER">Otro</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Descripción / Justificación</label>
                                    <textarea
                                        value={expenseDescription}
                                        onChange={(e) => setExpenseDescription(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                                        placeholder="Detalla el gasto (mínimo 10 caracteres si no hay foto)..."
                                    />
                                </div>

                                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
                                    <input
                                        type="file"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={(e) => setExpenseEvidence('https://via.placeholder.com/300')} // Mock upload
                                    />
                                    {expenseEvidence ? (
                                        <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
                                            <CheckCircle size={20} />
                                            Evidencia Cargada
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-slate-400">
                                            <Camera size={32} />
                                            <span className="text-sm font-medium">Subir Foto Boleta / Comprobante</span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleRegisterExpense}
                                    disabled={!expenseAmount || (!expenseEvidence && expenseDescription.length < 10)}
                                    className="w-full bg-red-500 hover:bg-red-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                                >
                                    <TrendingDown size={20} />
                                    Registrar Salida de Efectivo
                                </button>
                            </div>
                        )}

                        {/* C. CLOSING (RECONCILIATION) */}
                        {activeTab === 'CLOSING' && metrics && (
                            <div className="space-y-6">
                                {/* Waterfall */}
                                <div className="space-y-3 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <div className="flex justify-between items-center text-slate-600">
                                        <span>(+) Ventas Totales</span>
                                        <span className="font-medium">${metrics.totalSales.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-400 text-sm">
                                        <span>(-) Tarjetas / Transferencias</span>
                                        <span>-${(metrics.cardSales + metrics.transferSales).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-green-600 text-sm">
                                        <span>(+) Fondo Inicial</span>
                                        <span>+${metrics.initialFund.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-red-500 text-sm">
                                        <span>(-) Gastos / Salidas</span>
                                        <span>-${metrics.totalOutflows.toLocaleString()}</span>
                                    </div>
                                    <div className="h-px bg-slate-200 my-2"></div>
                                    <div className="flex justify-between items-center text-xl font-bold text-slate-800">
                                        <span>(=) DEBE HABER EN CAJA</span>
                                        <span>${metrics.expectedCash.toLocaleString()}</span>
                                    </div>
                                </div>

                                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                                    <label className="block text-sm font-bold text-blue-900 mb-2 text-center">DINERO CONTADO REAL (ARQUEO)</label>
                                    <div className="relative max-w-xs mx-auto">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 text-xl">$</span>
                                        <input
                                            type="number"
                                            value={closingAmount}
                                            onChange={(e) => setClosingAmount(e.target.value)}
                                            className="w-full pl-8 pr-4 py-4 text-3xl font-bold text-blue-900 bg-white border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-400 outline-none text-center"
                                            placeholder="0"
                                        />
                                    </div>

                                    {closingAmount && (
                                        <div className={`mt-4 text-center font-bold p-3 rounded-lg ${parseInt(closingAmount) - metrics.expectedCash === 0 ? 'bg-green-100 text-green-700' :
                                                parseInt(closingAmount) - metrics.expectedCash > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {parseInt(closingAmount) - metrics.expectedCash === 0 ? 'Cuadratura Perfecta ✨' :
                                                parseInt(closingAmount) - metrics.expectedCash > 0 ? `Sobrante: +$${(parseInt(closingAmount) - metrics.expectedCash).toLocaleString()}` :
                                                    `Faltante: -$${Math.abs(parseInt(closingAmount) - metrics.expectedCash).toLocaleString()}`}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleCloseShift}
                                    disabled={!closingAmount}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                                >
                                    <Lock size={20} />
                                    Cerrar Turno y Generar Reporte
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default CashManagementModal;
