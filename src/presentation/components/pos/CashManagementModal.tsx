import React, { useState, useEffect } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, Camera, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Lock, ChevronDown, ChevronUp, Download, ShieldCheck, RefreshCw } from 'lucide-react';
import { CashMovementReason } from '../../../domain/types';
import { SupervisorOverrideModal } from '../security/SupervisorOverrideModal';
import { toast } from 'sonner';
import { generateCashReportSecure } from '../../../actions/cash-export-v2';
// V2: Métricas seguras
import { getShiftMetricsSecure, ShiftMetricsDetailed } from '../../../actions/cash-management-v2';
import { TransactionListModal } from './TransactionListModal';
// Treasury V2 - Operaciones seguras con bcrypt PIN, RBAC, y auditoría
import { createCashMovementSecure } from '../../../actions/treasury-v2';
// Retry utility for SERIALIZABLE transaction conflicts
import { withServerActionRetry } from '../../../lib/retry';

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
            // V2: getShiftMetricsSecure
            getShiftMetricsSecure(currentShift.terminal_id).then((res) => {
                if (res.success && res.data) {
                    console.log('📊 [CashManagement] Server Metrics loaded:', res.data);
                    setServerMetrics(res.data as any); // Cast para compatibilidad con campos legacy
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

            // V2: Firma simplificada, RBAC automático via headers
            const result = await generateCashReportSecure({
                startDate: new Date(start).toISOString(),
                endDate: new Date(end).toISOString(),
                locationId: user?.assigned_location_id,
                terminalId: currentShift.terminal_id,
            });

            if (result.success && result.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename || `cierre_caja_${currentShift.id}.xlsx`;
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

    // State for secure V2 operations
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPinInput, setShowPinInput] = useState(false);
    const [authPin, setAuthPin] = useState('');
    // Retry state for concurrency conflicts
    const [retryAttempt, setRetryAttempt] = useState(0);
    const [isRetrying, setIsRetrying] = useState(false);

    // Amount threshold for PIN requirement (from treasury-v2)
    const WITHDRAWAL_THRESHOLD = 100000;

    const handleRegisterMovement = async () => {
        const numAmount = parseInt(amount);
        if (isNaN(numAmount) || numAmount <= 0) return;
        if (!evidence && description.length < 5) return;

        // Check if we need PIN for large withdrawals
        const requiresPin = movementType === 'OUT' && numAmount > WITHDRAWAL_THRESHOLD;
        if (requiresPin && !authPin) {
            setShowPinInput(true);
            toast.info(`Retiros > $${WITHDRAWAL_THRESHOLD.toLocaleString()} requieren PIN de gerente`);
            return;
        }

        setIsSubmitting(true);
        setRetryAttempt(0);
        setIsRetrying(false);

        try {
            // Use treasury-v2 secure function if we have session data
            if (currentShift?.terminal_id && currentShift?.id) {
                const treasuryType = movementType === 'OUT'
                    ? (reason === 'WITHDRAWAL' ? 'WITHDRAWAL' : 'EXPENSE')
                    : 'EXTRA_INCOME';

                // Use retry wrapper for SERIALIZABLE transaction conflicts
                const result = await withServerActionRetry(
                    () => createCashMovementSecure({
                        terminalId: currentShift.terminal_id!,
                        sessionId: currentShift.id,
                        userId: user?.id || 'SYSTEM',
                        type: treasuryType,
                        amount: numAmount,
                        reason: `${reason}: ${description}`,
                        authorizationPin: authPin || undefined
                    }),
                    {
                        maxAttempts: 3,
                        baseDelay: 300,
                        onRetry: (attempt, error) => {
                            setRetryAttempt(attempt);
                            setIsRetrying(true);
                            console.log(`[CashManagement] Retry ${attempt + 1}/3:`, error);
                            toast.info(
                                <div className="flex items-center gap-2">
                                    <RefreshCw size={14} className="animate-spin" />
                                    Reintentando... ({attempt + 1}/3)
                                </div>,
                                { duration: 1500 }
                            );
                        }
                    }
                );

                setIsRetrying(false);

                if (!result.success) {
                    toast.error(result.error || 'Error en operación segura');
                    setIsSubmitting(false);
                    return;
                }

                // Show success with retry info if applicable
                const retryInfo = (result as any)._retryInfo;
                if (retryInfo && retryInfo.attempts > 1) {
                    toast.success(
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-emerald-500" />
                            Movimiento registrado después de {retryInfo.attempts} intentos
                        </div>
                    );
                } else {
                    toast.success(
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-emerald-500" />
                            Movimiento registrado (v2 Seguro)
                        </div>
                    );
                }
            } else {
                // Fallback to legacy for non-terminal contexts
                registerCashMovement({
                    type: movementType,
                    amount: numAmount,
                    reason: reason,
                    description: description,
                    evidence_url: evidence || undefined,
                    is_cash: true
                });
                toast.success(`Movimiento de ${movementType === 'IN' ? 'INGRESO' : 'SALIDA'} registrado`);
            }

            // Reset state
            setAmount('');
            setDescription('');
            setEvidence(null);
            setAuthPin('');
            setShowPinInput(false);
            onClose();

        } catch (error) {
            console.error('Error en movimiento de caja:', error);
            toast.error('Error procesando movimiento');
        } finally {
            setIsSubmitting(false);
        }
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

                                    {/* PIN Input for large withdrawals */}
                                    {showPinInput && (
                                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4 animate-in slide-in-from-top-2">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Lock size={18} className="text-amber-600" />
                                                <span className="font-bold text-amber-800 text-sm">Autorización Requerida</span>
                                            </div>
                                            <p className="text-xs text-amber-700 mb-3">
                                                Retiros mayores a ${WITHDRAWAL_THRESHOLD.toLocaleString()} requieren PIN de gerente
                                            </p>
                                            <input
                                                type="password"
                                                maxLength={4}
                                                value={authPin}
                                                onChange={(e) => setAuthPin(e.target.value)}
                                                placeholder="PIN de Gerente"
                                                className="w-full p-3 text-center text-xl tracking-[0.5em] font-mono bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                                                autoFocus
                                            />
                                        </div>
                                    )}

                                    <button
                                        onClick={handleRegisterMovement}
                                        disabled={!amount || (!evidence && description.length < 5) || isSubmitting}
                                        className={`w-full text-white py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${movementType === 'IN' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                {isRetrying ? (
                                                    <RefreshCw size={20} className="animate-spin" />
                                                ) : (
                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                )}
                                                {isRetrying
                                                    ? `Reintentando... (${retryAttempt + 1}/3)`
                                                    : 'Procesando...'
                                                }
                                            </>
                                        ) : (
                                            <>
                                                {movementType === 'IN' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                                {movementType === 'IN' ? 'Registrar Ingreso' : 'Registrar Salida'}
                                                {currentShift?.terminal_id && <ShieldCheck size={14} className="ml-1 opacity-70" />}
                                            </>
                                        )}
                                    </button>

                                    {/* Security badge */}
                                    {currentShift?.terminal_id && (
                                        <p className="text-[10px] text-center text-slate-400 mt-2 flex items-center justify-center gap-1">
                                            <ShieldCheck size={10} /> Operación con auditoría v2
                                        </p>
                                    )}
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
                                                                {/* V2: Usar adjustments en vez de manual_movements */}
                                                                {(serverMetrics as any)?.adjustments?.filter((m: any) => m.type === 'EXTRA_INCOME').map((m: any, idx: number) => (
                                                                    <div key={idx} className="flex justify-between">
                                                                        <span>{m.type}</span>
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
                                                                {/* V2: Usar adjustments en vez de manual_movements */}
                                                                {(serverMetrics as any)?.adjustments?.filter((m: any) => ['WITHDRAWAL', 'EXPENSE'].includes(m.type)).map((m: any, idx: number) => (
                                                                    <div key={idx} className="flex justify-between">
                                                                        <span>{m.type}</span>
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
