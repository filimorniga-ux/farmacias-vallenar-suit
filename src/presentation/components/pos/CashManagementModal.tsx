import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, Camera, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Lock, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { CashMovementReason } from '../../../domain/types';
import { SupervisorOverrideModal } from '../security/SupervisorOverrideModal';
import { toast } from 'sonner';
import { generateCashReport } from '../../../actions/cash-export';

interface CashManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'AUDIT' | 'CLOSE' | 'MOVEMENT';
}

const CashManagementModal: React.FC<CashManagementModalProps> = ({ isOpen, onClose, mode }) => {
    const { currentShift, closeShift, registerCashMovement, getShiftMetrics, salesHistory, cashMovements, expenses, user, employees, terminals } = usePharmaStore();

    // Security State
    const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
    const [isAuditVisible, setIsAuditVisible] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

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

    // Effect 1: Initialization & State Reset
    useEffect(() => {
        if (isOpen) {
            // Reset states only when modal opens or mode changes
            setIsAuditVisible(false);
            setClosingAmount('');
            setAmount('');
            setMovementType('OUT');
            setReason('SUPPLIES');
            setDescription('');

            // Auto-trigger supervisor modal for sensitive actions
            if ((mode === 'AUDIT' || mode === 'CLOSE') && currentShift?.status === 'ACTIVE') {
                setIsSupervisorModalOpen(true);
            }
        }
    }, [isOpen, mode]); // Removed currentShift from resetting dependencies

    // Effect 2: Data Refresh
    useEffect(() => {
        if (isOpen && currentShift?.status === 'ACTIVE') {
            const m = getShiftMetrics();
            console.log('📊 [CashManagement] Metrics loaded:', m);
            setMetrics(m);
        } else {
            // Optional: Handle inactive shift case if needed
        }
    }, [isOpen, currentShift, getShiftMetrics]); // Keep this responsive to data changes without resetting UI

    // ... (keep existing useEffect for interval)

    const handleSupervisorAuthorize = (authorizedBy: string) => {
        console.log('✅ [CashManagement] Supervisor Authorized:', authorizedBy, 'Mode:', mode);
        if (mode === 'CLOSE') {
            const finalAmount = parseInt(closingAmount);
            closeShift(finalAmount, authorizedBy);
            onClose();
        } else if (mode === 'AUDIT') {
            console.log('🔓 [CashManagement] Unlocking Audit View');
            setIsAuditVisible(true);
        }
        setIsSupervisorModalOpen(false);
    };

    const handleExport = async () => {
        if (!currentShift) return;
        setIsExporting(true);
        try {
            // Filter Data for Current Shift (Roughly)
            // Ideally we filter by shift_id if stored, but timestamp is good proxy for "Current Session" or just export ALL for now?
            // The prompt says "Turno/Periodo". We can filter by "Today" or just export what is in store if it's "Current Shift".
            // Implementation: Export ALL data currently in store as it represents the "Local Session".
            // Better: Filter by Start of Shift.
            const start = currentShift.start_time;
            const end = Date.now();

            // Resolve Names
            const currentTerminalName = terminals.find(t => t.id === currentShift.terminal_id)?.name || 'Caja Desconocida';

            const relevantSales = salesHistory
                .filter(s => s.timestamp >= start && s.timestamp <= end)
                .map(s => ({
                    ...s,
                    // If seller_id matches current user, use user.name, else lookup employee
                    seller_name: employees.find(e => e.id === s.seller_id)?.name || s.seller_id,
                    terminal_name: currentTerminalName // Sales in this session belong to this terminal
                }));

            const relevantMovements = cashMovements
                .filter(m => m.timestamp >= start && m.timestamp <= end)
                .map(m => ({
                    ...m,
                    user_name: employees.find(e => e.id === m.user_id)?.name || m.user_id,
                    terminal_name: currentTerminalName
                }));

            const relevantExpenses = expenses.filter(e => e.date >= start && e.date <= end);

            const result = await generateCashReport({
                sales: relevantSales,
                movements: relevantMovements,
                expenses: relevantExpenses,
                startDate: new Date(start).toISOString().split('T')[0],
                endDate: new Date(end).toISOString().split('T')[0],
                generatedBy: user?.name || 'Cajero'
            });

            if (result.success && result.fileData) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.fileData}`;
                link.download = result.fileName || `cierre_caja_${currentShift.id}.xlsx`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('Reporte de Caja descargado');
            } else {
                toast.error('Error generando reporte');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error exportando');
        } finally {
            setIsExporting(false);
        }
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
                            <div className="flex items-center gap-2">
                                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>
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
                            {(mode === 'AUDIT' || mode === 'CLOSE') && (
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

                                        {!metrics ? (
                                            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                                <p>Cargando métricas del turno...</p>
                                            </div>
                                        ) : (
                                            <>
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
                                            </>
                                        )}
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

                                    {/* Export Report Button - Visible when Audit is unlocked */}
                                    {isAuditVisible && (
                                        <button
                                            onClick={handleExport}
                                            disabled={isExporting}
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2"
                                        >
                                            <Download size={20} />
                                            {isExporting ? 'Generando Reporte...' : 'Exportar Excel de Caja'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence >

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
