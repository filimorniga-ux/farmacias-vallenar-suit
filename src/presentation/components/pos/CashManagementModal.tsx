import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, Camera, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Lock, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { CashMovementReason } from '../../../domain/types';
import { SupervisorOverrideModal } from '../security/SupervisorOverrideModal';
import { toast } from 'sonner';
import { generateCashReport } from '../../../actions/cash-export';
import { getShiftMetrics as getServerShiftMetrics, ShiftMetricsDetailed } from '../../../actions/cash-management';
import { TransactionListModal } from './TransactionListModal';

interface CashManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'AUDIT' | 'CLOSE' | 'MOVEMENT';
}

const CashManagementModal: React.FC<CashManagementModalProps> = ({ isOpen, onClose, mode }) => {
    const { currentShift, closeShift, registerCashMovement, getShiftMetrics, user } = usePharmaStore();

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
    const [metrics, setMetrics] = useState<any>(null); // Local fallback
    const [serverMetrics, setServerMetrics] = useState<ShiftMetricsDetailed | null>(null);
    const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
    const [expandedSection, setExpandedSection] = useState<'SALES_BREAKDOWN' | 'MANUAL_IN' | 'MANUAL_OUT' | null>(null);
    const [selectedTransactions, setSelectedTransactions] = useState<{ title: string, list: any[] } | null>(null);

    // Helper to translate methods
    const getMethodLabel = (method: string) => {
        const labels: Record<string, string> = {
            'CASH': 'Efectivo',
            'DEBIT': 'Débito',
            'CREDIT': 'Crédito', // This is the new important one
            'TRANSFER': 'Transferencia',
            'CHECK': 'Cheque',
            'OTHER': 'Otro'
        };
        return labels[method] || method;
    };

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
    }, [isOpen, mode]);

    // Effect 2: Data Refresh (Hybrid: Local Instant + Server Verified)
    useEffect(() => {
        if (isOpen && currentShift?.status === 'ACTIVE') {
            // 1. Local Instant Feedback
            const localM = getShiftMetrics();
            setMetrics(localM);

            // 2. Server Authority (Fetch in background)
            if (!currentShift.terminal_id) {
                console.warn('⚠️ [CashManagement] Skipping metrics fetch: Missing terminal_id');
                return;
            }

            setIsLoadingMetrics(true);
            getServerShiftMetrics(currentShift.terminal_id).then(res => {
                if (res.success && res.data) {
                    console.log('📊 [CashManagement] Server Metrics loaded:', res.data);
                    setServerMetrics(res.data);
                } else {
                    toast.error('Error sincronizando métricas de servidor');
                }
                setIsLoadingMetrics(false);
            });
        }
    }, [isOpen, currentShift, getShiftMetrics]);

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
            const start = currentShift.start_time;
            const end = Date.now();

            const result = await generateCashReport({
                startDate: new Date(start).toISOString(),
                endDate: new Date(end).toISOString(),
                locationId: user?.assigned_location_id,
                terminalId: currentShift.terminal_id,
                requestingUserRole: user?.role || 'CASHIER',
                requestingUserLocationId: user?.assigned_location_id,
                shiftMetrics: serverMetrics || undefined // Pass the metrics here
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
                toast.error('Error generando reporte: ' + result.error);
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
        if (!evidence && description.length < 5) return;

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

    // Derived values using Master Formula
    const calculateAuditTotals = (m: any) => {
        if (!m) return {
            cashSection: { initial: 0, sales: 0, income: 0, expenses: 0, expectedTotal: 0 },
            digitalSection: { cards: 0, transfers: 0, totalDigital: 0 }
        };

        // 1. Breakdown
        const cashSalesGroup = (m.sales_breakdown || []).find((b: any) => b.method === 'CASH');
        const cardSalesGroup = (m.sales_breakdown || []).filter((b: any) => b.method === 'DEBIT' || b.method === 'CREDIT');
        const transferSalesGroup = (m.sales_breakdown || []).find((b: any) => b.method === 'TRANSFER');

        const cashSales = cashSalesGroup ? cashSalesGroup.total : 0;

        // Sum cards (Debit + Credit)
        const cardSales = cardSalesGroup.reduce((sum: number, b: any) => sum + b.total, 0);
        const transferSales = transferSalesGroup ? transferSalesGroup.total : 0;

        // 2. Cash Movements
        const initialBase = m.opening_amount || 0;
        const cashIn = m.manual_movements?.total_in || 0;
        const cashOut = m.manual_movements?.total_out || 0;

        // 3. MASTER FORMULA (Physical Cash Only)
        // Base + Sales (Cash) + In - Out
        const expectedCashInDrawer = initialBase + cashSales + cashIn - cashOut;

        return {
            cashSection: {
                initial: initialBase,
                sales: cashSales,
                income: cashIn,
                expenses: cashOut,
                expectedTotal: expectedCashInDrawer
            },
            digitalSection: {
                cards: cardSales,
                transfers: transferSales,
                totalDigital: cardSales + transferSales
            }
        };
    };

    const auditData = calculateAuditTotals(serverMetrics || metrics);

    return (
        <>
            <TransactionListModal
                isOpen={!!selectedTransactions}
                onClose={() => setSelectedTransactions(null)}
                title={selectedTransactions?.title || ''}
                transactions={selectedTransactions?.list || []}
            />

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
                                    {/* Waterfall & Master Formula Layout */}
                                    <div className="space-y-4">
                                        {!isAuditVisible && (
                                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-10">
                                                <Lock className="text-slate-400 mb-2" size={32} />
                                                <p className="text-slate-500 font-medium">Esperando Autorización de Supervisor...</p>
                                            </div>
                                        )}

                                        {(!serverMetrics && isLoadingMetrics && isAuditVisible) && (
                                            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                                <p className="animate-pulse">Sincronizando con servidor...</p>
                                            </div>
                                        )}

                                        {isAuditVisible && (!isLoadingMetrics || serverMetrics) && (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {/* LEFT: PHYSICAL CASH (The Truth) */}
                                                <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm relative overflow-hidden">
                                                    <div className="absolute top-0 right-0 p-2 opacity-10">
                                                        <DollarSign size={100} />
                                                    </div>
                                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 border-b pb-2">
                                                        💵 Efectivo Físico
                                                    </h3>

                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-center text-slate-600 text-sm">
                                                            <span>(+) Fondo Inicial</span>
                                                            <span className="font-mono font-bold">${auditData.cashSection.initial.toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-slate-800 font-bold text-sm">
                                                            <span>(+) Ventas Efectivo</span>
                                                            <span className="font-mono text-green-600">+${auditData.cashSection.sales.toLocaleString()}</span>
                                                        </div>
                                                        <div
                                                            className="flex justify-between items-center text-emerald-600 text-sm cursor-pointer hover:underline"
                                                            onClick={() => setExpandedSection(expandedSection === 'MANUAL_IN' ? null : 'MANUAL_IN')}
                                                        >
                                                            <span>(+) Ingresos Extras</span>
                                                            <span className="font-mono font-bold">+${auditData.cashSection.income.toLocaleString()}</span>
                                                        </div>
                                                        {expandedSection === 'MANUAL_IN' && (
                                                            <div className="pl-2 text-xs text-slate-400 border-l border-emerald-200">
                                                                {serverMetrics?.manual_movements.details.filter((m: any) => m.type === 'IN').map((m: any) => (
                                                                    <div key={m.id} className="flex justify-between">
                                                                        <span>{m.description}</span>
                                                                        <span>${m.amount}</span>
                                                                    </div>
                                                                ))}
                                                                {auditData.cashSection.income === 0 && <span>Sin movimientos</span>}
                                                            </div>
                                                        )}

                                                        <div
                                                            className="flex justify-between items-center text-red-500 text-sm cursor-pointer hover:underline"
                                                            onClick={() => setExpandedSection(expandedSection === 'MANUAL_OUT' ? null : 'MANUAL_OUT')}
                                                        >
                                                            <span>(-) Gastos / Retiros</span>
                                                            <span className="font-mono font-bold">-${auditData.cashSection.expenses.toLocaleString()}</span>
                                                        </div>
                                                        {expandedSection === 'MANUAL_OUT' && (
                                                            <div className="pl-2 text-xs text-slate-400 border-l border-red-200">
                                                                {serverMetrics?.manual_movements.details.filter((m: any) => m.type === 'OUT').map((m: any) => (
                                                                    <div key={m.id} className="flex justify-between">
                                                                        <span>{m.description}</span>
                                                                        <span>${m.amount}</span>
                                                                    </div>
                                                                ))}
                                                                {auditData.cashSection.expenses === 0 && <span>Sin movimientos</span>}
                                                            </div>
                                                        )}

                                                        <div className="h-px bg-slate-200 my-2"></div>

                                                        <div className="flex justify-between items-center bg-slate-800 text-white p-3 rounded-xl shadow-lg">
                                                            <span className="font-bold text-sm">ESPERADO EN CAJA</span>
                                                            <span className="font-mono text-xl font-black">${auditData.cashSection.expectedTotal.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* RIGHT: DIGITAL / BANK (Informational) */}
                                                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                                                    <h3 className="text-xs font-bold text-blue-800 uppercase tracking-widest mb-4 border-b border-blue-100 pb-2">
                                                        💳 Digital / Bancos
                                                    </h3>
                                                    <div className="space-y-3 opacity-80">
                                                        <div className="flex justify-between items-center text-blue-900 text-sm">
                                                            <span>Transbank (T. Débito/Crédito)</span>
                                                            <span className="font-mono font-bold">${auditData.digitalSection.cards.toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-blue-900 text-sm">
                                                            <span>Transferencias</span>
                                                            <span className="font-mono font-bold">${auditData.digitalSection.transfers.toLocaleString()}</span>
                                                        </div>
                                                        <div className="h-px bg-blue-200 my-2"></div>
                                                        <div className="flex justify-between items-center text-blue-900 font-bold text-sm">
                                                            <span>Total Digital</span>
                                                            <span className="font-mono">${auditData.digitalSection.totalDigital.toLocaleString()}</span>
                                                        </div>
                                                        <p className="text-[10px] text-blue-400 mt-2 text-center">
                                                            * Estos montos van directo a la cuenta bancaria.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
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
                                                        closeShift(amount, 'MANAGER_PIN');
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

                                    {/* Export Report Button */}
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
            </AnimatePresence>

            <SupervisorOverrideModal
                isOpen={isSupervisorModalOpen}
                onClose={() => {
                    setIsSupervisorModalOpen(false);
                    if (!isAuditVisible) onClose();
                }}
                onAuthorize={handleSupervisorAuthorize}
                actionDescription={mode === 'CLOSE' ? 'Autorizar CIERRE de turno' : 'Autorizar ARQUEO (Ver Totales)'}
            />
        </>
    );
};

export default CashManagementModal;
