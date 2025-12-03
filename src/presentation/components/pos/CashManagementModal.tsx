import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, Camera, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { CashMovementReason } from '../../../domain/types';
import { SupervisorOverrideModal } from '../security/SupervisorOverrideModal';
import { toast } from 'sonner';

interface CashManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'AUDIT' | 'CLOSE' | 'MOVEMENT';
}

const CashManagementModal: React.FC<CashManagementModalProps> = ({ isOpen, onClose, mode }) => {
    const { currentShift, closeShift, registerCashMovement, getShiftMetrics } = usePharmaStore();

    // Security State
    const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
    const [isAuditVisible, setIsAuditVisible] = useState(false);

    // Expense/Income State
    const [movementType, setMovementType] = useState<'IN' | 'OUT'>('OUT');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState<CashMovementReason>('SUPPLIES');
    const [description, setDescription] = useState('');
    const [evidence, setEvidence] = useState<string | null>(null);

    // Closing State
    const [closingAmount, setClosingAmount] = useState('');
    const [metrics, setMetrics] = useState<any>(null);
    const [expandedSection, setExpandedSection] = useState<'TRANSFER' | 'CARD' | null>(null);

    useEffect(() => {
        if (isOpen && currentShift?.status === 'ACTIVE') {
            setMetrics(getShiftMetrics());
            // Reset states
            setIsAuditVisible(false);
            setClosingAmount('');
            setAmount('');
            setMovementType('OUT');
            setReason('SUPPLIES');
            setDescription('');

            // Auto-trigger supervisor modal for sensitive actions
            if (mode === 'AUDIT' || mode === 'CLOSE') {
                setIsSupervisorModalOpen(true);
            }
        }
    }, [isOpen, currentShift, mode]);

    // ... (keep existing useEffect for interval)

    const handleSupervisorAuthorize = (authorizedBy: string) => {
        if (mode === 'CLOSE') {
            const finalAmount = parseInt(closingAmount);
            closeShift(finalAmount, authorizedBy);
            onClose();
        } else if (mode === 'AUDIT') {
            setIsAuditVisible(true);
        }
        setIsSupervisorModalOpen(false);
    };

    const handleRegisterMovement = () => {
        const numAmount = parseInt(amount);
        if (isNaN(numAmount) || numAmount <= 0) return;
        if (!evidence && description.length < 5) return; // Reduced length requirement slightly

        registerCashMovement({
            type: movementType,
            amount: numAmount,
            reason: reason,
            description: description,
            evidence_url: evidence || undefined,
            is_cash: true
        });

        setAmount('');
        setDescription('');
        setEvidence(null);
        toast.success(`Movimiento de ${movementType === 'IN' ? 'INGRESO' : 'SALIDA'} registrado`);
        onClose();
    };

    if (!isOpen) return null;

    const getTitle = () => {
        switch (mode) {
            case 'AUDIT': return 'Arqueo de Caja';
            case 'CLOSE': return 'Cierre de Turno';
            case 'MOVEMENT': return 'Movimiento de Caja';
        }
    };

    return (
        <>
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
                                    {getTitle()}
                                </h2>
                                <p className="text-sm text-slate-500">
                                    {currentShift?.status === 'ACTIVE' ? `Turno #${currentShift.id.slice(-6)}` : 'Caja Cerrada'}
                                </p>
                            </div>
                            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto flex-1">

                            {/* MOVEMENT MODE */}
                            {mode === 'MOVEMENT' && (
                                <div className="space-y-6">
                                    {/* Toggle Switch */}
                                    <div className="flex bg-slate-100 p-1 rounded-xl">
                                        <button
                                            onClick={() => { setMovementType('OUT'); setReason('SUPPLIES'); }}
                                            className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${movementType === 'OUT' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <TrendingDown size={18} />
                                            REGISTRAR SALIDA
                                        </button>
                                        <button
                                            onClick={() => { setMovementType('IN'); setReason('CHANGE'); }}
                                            className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${movementType === 'IN' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <TrendingUp size={18} />
                                            REGISTRAR INGRESO
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Monto</label>
                                            <div className="relative">
                                                <span className={`absolute left-4 top-1/2 -translate-y-1/2 ${movementType === 'IN' ? 'text-green-500' : 'text-red-500'}`}>$</span>
                                                <input
                                                    type="number"
                                                    value={amount}
                                                    onChange={(e) => setAmount(e.target.value)}
                                                    className={`w-full pl-8 pr-4 py-3 text-lg font-bold text-slate-800 bg-slate-50 border rounded-xl outline-none focus:ring-2 ${movementType === 'IN' ? 'focus:ring-green-500 border-green-200' : 'focus:ring-red-500 border-red-200'}`}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Motivo</label>
                                            <select
                                                value={reason}
                                                onChange={(e) => setReason(e.target.value as CashMovementReason)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            >
                                                {movementType === 'OUT' ? (
                                                    <>
                                                        <option value="SUPPLIES">Insumos / Gastos Menores</option>
                                                        <option value="SERVICES">Pago Servicios</option>
                                                        <option value="WITHDRAWAL">Retiro de Utilidades</option>
                                                        <option value="OTHER">Otro</option>
                                                    </>
                                                ) : (
                                                    <>
                                                        <option value="CHANGE">Sencillo / Cambio</option>
                                                        <option value="OWNER_CONTRIBUTION">Aporte Dueño</option>
                                                        <option value="OTHER">Otro</option>
                                                    </>
                                                )}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                                            placeholder={movementType === 'IN' ? "Ej: Aporte de sencillo para caja..." : "Ej: Compra de artículos de limpieza..."}
                                        />
                                    </div>

                                    <button
                                        onClick={handleRegisterMovement}
                                        disabled={!amount || (!evidence && description.length < 5)}
                                        className={`w-full text-white py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${movementType === 'IN' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                                    >
                                        {movementType === 'IN' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                        {movementType === 'IN' ? 'Registrar Ingreso' : 'Registrar Salida'}
                                    </button>
                                </div>
                            )}

                            {/* AUDIT & CLOSE MODES */}
                            {(mode === 'AUDIT' || mode === 'CLOSE') && metrics && (
                                <div className="space-y-6">
                                    {/* Waterfall */}
                                    <div className="space-y-3 bg-slate-50 p-6 rounded-2xl border border-slate-100 relative overflow-hidden">
                                        {!isAuditVisible && (
                                            <div className="absolute inset-0 bg-slate-100/80 backdrop-blur-sm flex items-center justify-center z-10">
                                                <div className="text-center">
                                                    <Lock className="mx-auto text-slate-400 mb-2" size={32} />
                                                    <p className="text-slate-500 font-medium">Esperando Autorización de Supervisor...</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center text-slate-600">
                                            <span>(+) Ventas Totales</span>
                                            <span className="font-medium">${metrics.totalSales.toLocaleString()}</span>
                                        </div>

                                        {/* Simplified Metrics Display */}
                                        <div className="flex justify-between items-center text-slate-500 text-sm">
                                            <span>(-) Tarjetas ({metrics.cardCount})</span>
                                            <span>-${metrics.cardSales.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-500 text-sm">
                                            <span>(-) Transferencias ({metrics.transferCount})</span>
                                            <span>-${metrics.transferSales.toLocaleString()}</span>
                                        </div>

                                        <div className="h-px bg-slate-200 my-2"></div>

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

                                    {mode === 'CLOSE' && isAuditVisible && (
                                        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                                            <label className="block text-sm font-bold text-blue-900 mb-2 text-center">EFECTIVO REAL (CONTADO)</label>
                                            <div className="relative max-w-xs mx-auto mb-4">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 text-xl">$</span>
                                                <input
                                                    type="number"
                                                    value={closingAmount}
                                                    onChange={(e) => setClosingAmount(e.target.value)}
                                                    className="w-full pl-8 pr-4 py-4 text-3xl font-bold text-blue-900 bg-white border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-200 outline-none text-center"
                                                    placeholder="0"
                                                    autoFocus
                                                />
                                            </div>

                                            <button
                                                onClick={() => {
                                                    const amount = parseInt(closingAmount);
                                                    if (!isNaN(amount)) {
                                                        closeShift(amount, 'MANAGER_PIN'); // In real flow, this would be the manager who authorized opening the modal
                                                        onClose();
                                                        toast.success('Turno cerrado correctamente');
                                                    }
                                                }}
                                                disabled={!closingAmount}
                                                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold shadow-lg transition-all"
                                            >
                                                Confirmar Cierre
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>

            <SupervisorOverrideModal
                isOpen={isSupervisorModalOpen}
                onClose={() => {
                    setIsSupervisorModalOpen(false);
                    if (!isAuditVisible) onClose(); // Close main modal if auth cancelled
                }}
                onAuthorize={handleSupervisorAuthorize}
                actionDescription={mode === 'CLOSE' ? 'Autorizar CIERRE de turno' : 'Autorizar ARQUEO (Ver Totales)'}
            />
        </>
    );
};

export default CashManagementModal;
