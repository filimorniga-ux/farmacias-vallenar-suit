import React, { useState, useEffect, useCallback } from 'react';
import { usePharmaStore } from '../../../presentation/store/useStore';
import { useLocationStore } from '../../../presentation/store/useLocationStore';
import { useSettingsStore } from '../../../presentation/store/useSettingsStore';
import { X, Search, Calendar, Printer, Lock, FileText, Download, User, RotateCcw, Loader2, RefreshCw, AlertCircle, TrendingUp, TrendingDown, DollarSign, Pencil } from 'lucide-react';
import { exportSalesHistorySecure } from '../../../actions/pos-export-v2';
import { CashMovementView, getCashMovementHistory, exportCashMovementHistory } from '../../../actions/cash-management-v2'; // Unified Endpoint
import { getSaleDetailsSecure } from '../../../actions/sales-v2'; // NEW: Details
import { validateSupervisorPin } from '../../../actions/auth-v2';
import { toast } from 'sonner';
import { printSaleTicket } from '../../utils/print-utils';
import ReturnsModal from './ReturnsModal';
import EditSaleModal from './EditSaleModal';
import { getChileDate, formatChileDate, formatFriendlyId } from '@/lib/utils';
import {
    getSaleItemQuantity,
    getSaleItemTotal,
    getSaleItemUnitPrice,
    getTransactionTitle
} from './transaction-history-utils';

interface TransactionHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    locationId?: string;
    initialPaymentMethod?: string;
    sessionId?: string; // NEW: For Data Isolation (Arqueo Parcial)
}

const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = (props) => {
    const { isOpen, onClose, locationId, initialPaymentMethod, sessionId } = props;
    // Stores
    const { employees, user, currentLocationId: pharmaLocationId, currentShift } = usePharmaStore();
    const { currentLocation: storeLocation } = useLocationStore();
    const activeLocationId = locationId || storeLocation?.id || pharmaLocationId;
    const { hardware } = useSettingsStore();

    // Local State
    const [adminPin, setAdminPin] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isValidatingPin, setIsValidatingPin] = useState(false);

    // Data State
    const [transactions, setTransactions] = useState<CashMovementView[]>([]); // Typed
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('ALL'); // Consolidated filter (Payment Method OR Transaction Type)
    const [startDate, setStartDate] = useState(() => {
        const d = getChileDate();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [endDate, setEndDate] = useState(() => {
        const d = getChileDate();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // Detail View
    const [selectedItem, setSelectedItem] = useState<CashMovementView | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false); // NEW
    const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // 1. Authenticate with PIN
    const handleLogin = async () => {
        if (!adminPin) return;

        setIsValidatingPin(true);
        try {
            const result = await validateSupervisorPin(adminPin);

            if (result.success) {
                setIsAuthenticated(true);
                toast.success(`Acceso autorizado: ${result.authorizedBy?.name || 'Supervisor'}`);
            } else {
                toast.error(result.error || 'PIN inválido');
                setAdminPin('');
            }
        } catch (err) {
            toast.error('Error de validación');
            console.error(err);
        } finally {
            setIsValidatingPin(false);
        }
    };

    // 2. Fetch Unified History
    const fetchHistory = useCallback(async () => {
        console.log('🔍 [Frontend] fetchHistory triggered. Auth:', isAuthenticated, 'Loc:', activeLocationId);

        if (!isAuthenticated || !activeLocationId) return;

        setIsLoading(true);
        setError(null);

        try {
            // Determine params based on filterType
            // filterType can be: 'ALL', 'CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'EXTRA_INCOME', 'EXPENSE', 'WITHDRAWAL'

            // If filterType is a MOVEMENT type, we pass it as 'paymentMethod' (abusing the param slightly or handling in backend)
            // Implementation detail: getCashMovementHistory uses `paymentMethod` param.
            // If usage requires distinct separation, we rely on `getCashMovementHistory` logic.
            // Based on earlier analysis, `getCashMovementHistory` filters sales by payment_method, but hides movements if payment_method != CASH.
            // We need to ensure we can fetch JUST movements if requested.
            // The unified endpoint might need tweak if "EXPENSE" isn't a payment method.
            // Let's assume for now we pass it and backend handles or ignores if not matching Sale methods.
            // Actually, looking at `getCashMovementHistory`:
            // It has `paymentMethod` and hides movements if `paymentMethod` is not 'CASH'.
            // It does NOT seem to have a `type` filter explicitly exposed in schema?
            // Wait, schema has `paymentMethod`.
            // If I want to show "Expenses", I probably need to fetch ALL and filter locally OR update backend.
            // Let's try passing 'ALL' to backend and filtering locally if needed, OR relies on Search Term?
            // Actually, if I pass 'CASH', I get Cash Sales + Movements.
            // If I pass 'DEBIT', I get Debit Sales.
            // Users want to filter specifically "INGRESOS" (Extra Income) or "SALIDAS" (Expense).
            // I might need to filter client-side if the backend doesn't support strict type filtering yet.
            // Let's pass 'ALL' if it's a movement type to get everything, then filter in frontend? 
            // Better: Let's assume standard fetching and client-side filter for now to guarantee functionality without backend risks.


            // Ensure we cover the full day in local time
            // We construct the dates to be explicitly 00:00:00 to 23:59:59 in the local environment
            // This prevents the backend from receiving a UTC-midnight-started date that might cut off evening transactions in negative timezones (like Chile -3/-4)
            // Manual parse to fix timezone UTC issue
            const [sY, sM, sD] = startDate.split('-').map(Number);
            const start = new Date(sY, sM - 1, sD, 0, 0, 0, 0);

            const [eY, eM, eD] = endDate.split('-').map(Number);
            const end = new Date(eY, eM - 1, eD, 23, 59, 59, 999);

            const result = await getCashMovementHistory({
                terminalId: undefined,
                sessionId: isOpen && activeLocationId ? props.sessionId : undefined, // USE PROP if present
                locationId: activeLocationId,
                startDate: start,
                endDate: end,
                paymentMethod: filterType === 'ALL' ? undefined : filterType,
                term: searchTerm.trim() || undefined,
                page: 1,
                pageSize: 100
            });

            if (result.success && result.data) {
                setTransactions(result.data.movements);
            } else {
                setError(result.error || 'Error al cargar historial');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated, activeLocationId, startDate, endDate, searchTerm, filterType, currentShift?.id]);

    // Trigger fetch on auth or filter changes
    useEffect(() => {
        if (isOpen && isAuthenticated) {
            const timeoutId = setTimeout(() => {
                fetchHistory();
            }, 500);
            return () => clearTimeout(timeoutId);
        }
    }, [isOpen, isAuthenticated, fetchHistory]);

    // Reset state on close
    useEffect(() => {
        if (isOpen) {
            setAdminPin('');
            setTransactions([]);
            setSelectedItem(null);
            setFilterType(initialPaymentMethod || 'ALL');
        } else {
            setIsAuthenticated(false);
            setAdminPin('');
            setTransactions([]);
            setSelectedItem(null);
            setFilterType('ALL');
        }
    }, [isOpen, initialPaymentMethod]);

    const handleReprint = (item: any) => {
        if (item.type === 'SALE') {

            // Note: The printSaleTicket logic uses item.dte_folio. If it's internal, it might be null.
            // TicketBoleta handles null folio by showing 'INT-...' if we pass it, OR we data patch here.
            // But printSaleTicket takes `SaleTransaction`.
            // Let's modify the item before passing if needed?
            // Actually, item IS `SaleTransaction` (roughly).
            // Let's ensure dte_folio has a fallback if dte_type is not fiscal.
            const saleToPrint = {
                ...item,
                timestamp: new Date(item.timestamp).getTime(),
                dte_folio: item.dte_folio || (item.id ? `INT-${item.id.slice(0, 6).toUpperCase()}` : undefined)
            };
            printSaleTicket(saleToPrint as any, storeLocation?.config, hardware, {
                cashierName: item.seller_name || item.user_name || 'Vendedor',
                branchName: storeLocation?.name || 'Sucursal'
            });
            toast.success('Reimprimiendo ticket...');
        } else {
            toast.info('Reimpresión de movimientos de caja no disponible');
        }
    };

    const handleExport = async () => {
        setIsExporting(true);
        toast.info('Generando Excel con formato...');

        try {
            // Manual parse to fix timezone UTC issue
            const [sY, sM, sD] = startDate.split('-').map(Number);
            const start = new Date(sY, sM - 1, sD, 0, 0, 0, 0);

            const [eY, eM, eD] = endDate.split('-').map(Number);
            const end = new Date(eY, eM - 1, eD, 23, 59, 59, 999);

            const result = await exportCashMovementHistory({
                terminalId: undefined,
                sessionId: undefined,
                startDate: start,
                endDate: end,
                paymentMethod: filterType === 'ALL' ? undefined : filterType,
                term: searchTerm.trim() || undefined,
            });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Error obteniendo datos');
            }

            const data = result.data;

            if (data.length === 0) {
                toast.info('No hay datos para exportar');
                setIsExporting(false);
                return;
            }

            // --- 1. CALCULATE TOTALS ---
            const totals: Record<string, number> = {
                'CASH': 0, 'DEBIT': 0, 'CREDIT': 0, 'TRANSFER': 0, 'CHECK': 0, 'OTHER': 0,
                'EXTRA_INCOME': 0, 'EXPENSE': 0
            };

            data.forEach(item => {
                const amount = Number(item.amount) || 0;
                if (item.type === 'SALE') {
                    const method = item.payment_method || 'OTHER';
                    totals[method] = (totals[method] || 0) + amount;
                } else if (item.type === 'REFUND') {
                    const method = item.payment_method || 'OTHER';
                    totals[method] = (totals[method] || 0) + amount;
                } else if (item.type === 'EXTRA_INCOME') {
                    totals['EXTRA_INCOME'] += amount;
                } else if (['EXPENSE', 'WITHDRAWAL'].includes(item.type)) {
                    totals['EXPENSE'] += amount;
                }
            });

            const totalSales = totals['CASH'] + totals['DEBIT'] + totals['CREDIT'] + totals['TRANSFER'] + totals['CHECK'] + totals['OTHER'];

            // --- 2. GENERATE FILES WITH EXCELJS ---
            const ExcelJS = (await import('exceljs')).default;
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Farmacias Vallenar Suit';
            workbook.created = new Date();

            // SHEET 1: RESUMEN
            const wsSummary = workbook.addWorksheet('Resumen');

            // Header Style
            const headerStyle = {
                font: { bold: true, color: { argb: 'FFFFFFFF' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0052CC' } },
                alignment: { horizontal: 'center', vertical: 'middle' }
            } as any;

            // Columns
            wsSummary.columns = [
                { header: 'Concepto', key: 'concept', width: 35 },
                { header: 'Monto', key: 'amount', width: 20, style: { numFmt: '"$"#,##0' } }
            ];

            // Apply Header Style
            wsSummary.getRow(1).eachCell((cell) => {
                cell.style = headerStyle;
            });

            // Data
            const summaryData = [
                { concept: 'RESUMEN DEL PERIODO', amount: null },
                { concept: `${startDate} al ${endDate}`, amount: null },
                { concept: '', amount: null },
                { concept: 'VENTAS POR MEDIO PAGO', amount: null },
                { concept: 'Efectivo', amount: totals['CASH'] },
                { concept: 'Débito', amount: totals['DEBIT'] },
                { concept: 'Crédito', amount: totals['CREDIT'] },
                { concept: 'Transferencia', amount: totals['TRANSFER'] },
                { concept: 'Cheque', amount: totals['CHECK'] },
                { concept: 'Otro', amount: totals['OTHER'] },
                { concept: 'TOTAL VENTAS', amount: totalSales },
                { concept: '', amount: null },
                { concept: 'MOVIMIENTOS DE CAJA', amount: null },
                { concept: 'Ingresos Extras (+)', amount: totals['EXTRA_INCOME'] },
                { concept: 'Gastos / Retiros (-)', amount: totals['EXPENSE'] },
                { concept: 'FLUJO NETO (Ing - Gas)', amount: totals['EXTRA_INCOME'] - totals['EXPENSE'] },
            ];

            summaryData.forEach(row => wsSummary.addRow(row));

            // SHEET 2: DETALLE
            const wsDetail = workbook.addWorksheet('Detalle Historial');

            wsDetail.columns = [
                { header: 'Fecha', key: 'date', width: 12 },
                { header: 'Hora', key: 'time', width: 10 },
                { header: 'Tipo', key: 'type', width: 15 },
                { header: 'Descripción / Items', key: 'desc', width: 60, style: { alignment: { wrapText: true, vertical: 'top' } } }, // WRAP TEXT ENABLED
                { header: 'Usuario', key: 'user', width: 20 },
                { header: 'Cliente', key: 'client', width: 25 },
                { header: 'Documento', key: 'doc', width: 15 },
                { header: 'Total Origen', key: 'total', width: 15, style: { numFmt: '"$"#,##0', alignment: { vertical: 'top' } } },
                { header: 'Efectivo', key: 'cash', width: 15, style: { numFmt: '"$"#,##0', alignment: { vertical: 'top' } } },
                { header: 'Débito', key: 'debit', width: 15, style: { numFmt: '"$"#,##0', alignment: { vertical: 'top' } } },
                { header: 'Crédito', key: 'credit', width: 15, style: { numFmt: '"$"#,##0', alignment: { vertical: 'top' } } },
                { header: 'Transferencia', key: 'transfer', width: 15, style: { numFmt: '"$"#,##0', alignment: { vertical: 'top' } } },
                { header: 'Ingreso (+)', key: 'income', width: 15, style: { numFmt: '"$"#,##0', alignment: { vertical: 'top' } } },
                { header: 'Salida (-)', key: 'expense', width: 15, style: { numFmt: '"$"#,##0', alignment: { vertical: 'top' } } },
            ];

            // Apply Header Style to Detail Sheet
            wsDetail.getRow(1).eachCell((cell) => {
                cell.style = headerStyle;
            });

            // Map Data
            data.forEach(item => {
                const isSale = item.type === 'SALE';
                const isRefund = item.type === 'REFUND';
                const method = item.payment_method || 'OTHER';
                const amount = Number(item.amount) || 0;

                wsDetail.addRow({
                    date: formatChileDate(item.timestamp, { hour: undefined, minute: undefined }),
                    time: formatChileDate(item.timestamp, { day: undefined, month: undefined, year: undefined }),
                    type: isSale ? 'VENTA' : (isRefund ? 'DEVOLUCIÓN' : (item.type === 'EXTRA_INCOME' ? 'INGRESO' : 'GASTO/RETIRO')),
                    desc: item.reason, // Contains \n from backend
                    user: item.user_name || 'Sistema',
                    client: item.customer_name || (isSale || isRefund ? 'Anónimo' : '-'),
                    doc: item.dte_folio || '-',
                    total: amount,
                    cash: ((isSale || isRefund) && method === 'CASH') ? amount : 0,
                    debit: ((isSale || isRefund) && method === 'DEBIT') ? amount : 0,
                    credit: ((isSale || isRefund) && method === 'CREDIT') ? amount : 0,
                    transfer: ((isSale || isRefund) && method === 'TRANSFER') ? amount : 0,
                    income: item.type === 'EXTRA_INCOME' ? amount : 0,
                    expense: ['EXPENSE', 'WITHDRAWAL'].includes(item.type) ? amount : 0
                });
            });

            // Generate Blob and Download
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            // Helper to trigger download
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `Historial_Ventas_${startDate}_${endDate}.xlsx`;
            anchor.click();
            window.URL.revokeObjectURL(url);

            toast.success('Historial descargado con éxito');

        } catch (error: any) {
            console.error(error);
            toast.error('Error al exportar: ' + error.message);
        } finally {
            setIsExporting(false);
        }
    };

    // Helper to get Icon and Color based on type
    const getTypeConfig = (item: any) => {
        const status = String(item.status || '').toUpperCase();

        if (item.type === 'SALE') {
            if (status === 'FULLY_REFUNDED') {
                return {
                    icon: <RotateCcw size={16} />,
                    color: 'text-rose-600',
                    bg: 'bg-rose-50',
                    label: 'DEVOLUCIÓN',
                    amountColor: 'text-rose-700'
                };
            }

            if (status === 'PARTIALLY_REFUNDED') {
                return {
                    icon: <RotateCcw size={16} />,
                    color: 'text-amber-700',
                    bg: 'bg-amber-50',
                    label: 'DEV. PARCIAL',
                    amountColor: 'text-amber-700'
                };
            }

            return {
                icon: <FileText size={16} />,
                color: 'text-blue-600',
                bg: 'bg-blue-50',
                label: 'VENTA',
                amountColor: 'text-blue-700'
            };
        } else if (item.type === 'REFUND') {
            return {
                icon: <RotateCcw size={16} />,
                color: 'text-rose-600',
                bg: 'bg-rose-50',
                label: 'DEVOLUCIÓN',
                amountColor: 'text-rose-700'
            };
        } else if (item.type === 'EXTRA_INCOME') {
            return {
                icon: <TrendingUp size={16} />,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
                label: 'INGRESO',
                amountColor: 'text-emerald-700'
            };
        } else if (['EXPENSE', 'WITHDRAWAL'].includes(item.type)) {
            return {
                icon: <TrendingDown size={16} />,
                color: 'text-rose-600',
                bg: 'bg-rose-50',
                label: 'GASTO',
                amountColor: 'text-rose-700'
            };
        } else if (['OPENING', 'APERTURA'].includes(item.type)) {
            return {
                icon: <TrendingUp size={16} />,
                color: 'text-cyan-700',
                bg: 'bg-cyan-50',
                label: 'APERTURA',
                amountColor: 'text-cyan-700'
            };
        } else if (['CLOSING', 'CIERRE'].includes(item.type)) {
            return {
                icon: <TrendingDown size={16} />,
                color: 'text-amber-700',
                bg: 'bg-amber-50',
                label: 'CIERRE',
                amountColor: 'text-amber-700'
            };
        } else {
            return {
                icon: <DollarSign size={16} />,
                color: 'text-slate-600',
                bg: 'bg-slate-50',
                label: item.type,
                amountColor: 'text-slate-700'
            };
        }
    };

    if (!isOpen) return null;

    // LOGIN SCREEN (Unchanged)
    if (!isAuthenticated) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center animate-in zoom-in-95 duration-200">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 mb-4">
                        <Lock size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Acceso Restringido</h2>
                    <p className="text-slate-500 mb-6">Ingrese PIN de Supervisor/Admin para ver el historial.</p>

                    <input
                        type="password"
                        value={adminPin}
                        onChange={(e) => setAdminPin(e.target.value)}
                        className="w-full text-center text-2xl tracking-[0.5em] p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-mono mb-6"
                        placeholder="••••"
                        maxLength={8}
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        disabled={isValidatingPin}
                    />

                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={handleLogin}
                            disabled={isValidatingPin || adminPin.length < 4}
                            className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex justify-center items-center gap-2"
                        >
                            {isValidatingPin ? <Loader2 className="animate-spin" size={20} /> : 'Entrar'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // MAIN SCREEN
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-slate-900 p-6 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <FileText className="text-cyan-400" /> Historial de Transacciones
                        </h2>
                        <p className="text-slate-400 text-sm mt-1 flex items-center gap-2">
                            <Lock size={12} /> Acceso Seguro • {storeLocation?.name || 'Sucursal'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={28} />
                    </button>
                </div>

                {/* Filters */}
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-4 items-center shrink-0">
                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex-1 min-w-[200px]">
                        <Search className="text-slate-400 ml-2" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="w-full outline-none text-slate-700 font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                        <Calendar className="text-slate-400 ml-2" size={20} />
                        <input
                            type="date"
                            className="outline-none text-slate-700 font-medium bg-transparent"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="text-slate-400">-</span>
                        <input
                            type="date"
                            className="outline-none text-slate-700 font-medium bg-transparent"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="outline-none text-slate-700 font-medium bg-transparent cursor-pointer"
                        >
                            <option value="ALL">Todo</option>
                            <option value="CASH">Ventas Efectivo</option>
                            <option value="DEBIT">Ventas Débito</option>
                            <option value="CREDIT">Ventas Crédito</option>
                            <option value="TRANSFER">Ventas Transf.</option>
                            <option className="font-bold text-emerald-600" value="EXTRA_INCOME">➕ Ingresos Extras</option>
                            <option className="font-bold text-red-600" value="EXPENSE">➖ Gastos / Retiros</option>
                        </select>
                    </div>

                    <button
                        onClick={() => fetchHistory()}
                        className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors"
                        title="Recargar"
                    >
                        <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm ml-auto"
                    >
                        {isExporting ? 'Exportando...' : <><Download size={18} /> Excel</>}
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* LIST */}
                    <div className={`${selectedItem ? 'w-1/2 border-r border-slate-200 hidden md:block' : 'w-full'} overflow-y-auto p-4 transition-all duration-300`}>
                        {isLoading && transactions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                                <Loader2 className="animate-spin mb-4" size={48} />
                                <p>Cargando registros...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-64 text-red-500">
                                <AlertCircle size={48} className="mb-4" />
                                <p className="font-bold">{error}</p>
                            </div>
                        ) : transactions.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <Search size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No se encontraron registros</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {transactions.map(item => {
                                    const conf = getTypeConfig(item);
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={async () => {
                                                if (item.type === 'SALE') {
                                                    setIsLoadingDetails(true);
                                                    setSelectedItem(item); // Optimistic / Placeholder
                                                    try {
                                                        const details = await getSaleDetailsSecure(item.id);
                                                        if (details) {
                                                            setSelectedItem((prev: any) => prev?.id === item.id ? { ...prev, ...details } : prev);
                                                        } else {
                                                            toast.error('No se pudieron cargar los detalles');
                                                        }
                                                    } catch (e) {
                                                        console.error(e);
                                                    } finally {
                                                        setIsLoadingDetails(false);
                                                    }
                                                } else {
                                                    setSelectedItem(item);
                                                }
                                            }}
                                            className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${selectedItem?.id === item.id ? 'bg-slate-50 border-slate-300 ring-1 ring-slate-300' : 'bg-white border-slate-100 hover:border-slate-200'}`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <span className="text-xs font-bold text-slate-400 block mb-1">
                                                        {formatChileDate(item.timestamp, { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    <h3 className="font-bold text-slate-800 text-sm truncate max-w-[200px]">
                                                        {getTransactionTitle(item, formatFriendlyId(item.timestamp))}
                                                    </h3>
                                                </div>
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${conf.color} ${conf.bg}`}>
                                                    {conf.label}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                                        <User size={14} />
                                                        <span className="truncate max-w-[140px]">{item.user_name || 'Sistema'}</span>
                                                    </div>
                                                    {item.reason && item.type !== 'SALE' && (
                                                        <div className="text-xs text-slate-500 italic truncate max-w-[200px]">
                                                            "{item.reason.replace(/^(EXPENSE|EXTRA_INCOME|WITHDRAWAL): /, '')}"
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <span className={`text-lg font-extrabold block ${conf.amountColor}`}>
                                                        ${Number(item.amount).toLocaleString()}
                                                    </span>
                                                    {item.payment_method && item.payment_method !== 'CASH' && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                                                            {item.payment_method}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* DETAIL VIEW */}
                    {selectedItem && (
                        <div className={`w-full md:w-1/2 flex flex-col bg-slate-50 h-full overflow-hidden absolute md:relative inset-0 md:inset-auto z-10 animate-in slide-in-from-right duration-300`}>
                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">
                                            Detalle de {selectedItem.type === 'SALE' ? 'Venta' : selectedItem.type === 'REFUND' ? 'Devolución' : 'Caja'}
                                        </h2>
                                        <p className="text-sm text-slate-500 break-all">{formatFriendlyId(selectedItem.timestamp)}</p>
                                    </div>
                                    <button onClick={() => setSelectedItem(null)} className="md:hidden text-slate-400"><X /></button>
                                </div>

                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <p className="text-slate-400 mb-1">Fecha y Hora</p>
                                            <p className="font-bold text-slate-800">{formatChileDate(selectedItem.timestamp)}</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400 mb-1">Usuario</p>
                                            <p className="font-bold text-slate-800">{selectedItem.user_name || selectedItem.seller_name || 'N/A'}</p>
                                        </div>

                                        {/* NEW: Customer Info */}
                                        <div className="col-span-2 bg-slate-50 p-3 rounded border border-slate-100 mb-2">
                                            <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider font-bold">Cliente</p>
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{selectedItem.customer_name || 'Cliente Anónimo'}</p>
                                                    {selectedItem.customer_rut && <p className="text-xs text-slate-500">{selectedItem.customer_rut}</p>}
                                                </div>
                                                {selectedItem.queueTicket ? (
                                                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-bold border border-indigo-200">
                                                        🎟️ Totem: {selectedItem.queueTicket.number}
                                                    </span>
                                                ) : selectedItem.customer_rut ? (
                                                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold border border-emerald-200">
                                                        👤 Base de Datos
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs font-bold">
                                                        👻 Anónimo
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {selectedItem.type === 'SALE' || selectedItem.type === 'REFUND' ? (
                                            <>
                                                <div>
                                                    <p className="text-slate-400 mb-1">Método Pago</p>
                                                    <p className="font-bold text-slate-800">{selectedItem.payment_method}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-400 mb-1">{selectedItem.type === 'REFUND' ? 'Ticket Devolución' : 'Documento'}</p>
                                                    <p className="font-bold text-slate-800">{selectedItem.dte_folio || 'Voucher'}</p>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="col-span-2">
                                                <p className="text-slate-400 mb-1">Motivo / Descripción</p>
                                                <p className="font-bold text-slate-800">{selectedItem.reason}</p>
                                            </div>
                                        )}

                                        {selectedItem.authorized_by_name && (
                                            <div className="col-span-2 bg-amber-50 p-2 rounded border border-amber-100">
                                                <p className="text-amber-800 text-xs font-bold">Autorizado por: {selectedItem.authorized_by_name}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {selectedItem.type === 'SALE' && selectedItem.items && (
                                    <>
                                        <h3 className="font-bold text-slate-700 mb-3">Productos</h3>
                                        <div className="space-y-2 mb-6">
                                            {selectedItem.items.map((item: any, idx: number) => (
                                                <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100">
                                                    <div>
                                                        <p className="font-bold text-slate-800 text-sm">{item.name || 'Desconocido'}</p>
                                                        <p className="text-xs text-slate-500">
                                                            {getSaleItemQuantity(item)} x ${getSaleItemUnitPrice(item).toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <p className="font-bold text-slate-800">${getSaleItemTotal(item).toLocaleString()}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {selectedItem.type === 'SALE' && isLoadingDetails && !selectedItem.items && (
                                    <div className="py-8 text-center text-slate-400 flex flex-col items-center">
                                        <Loader2 className="animate-spin mb-2" />
                                        <p className="text-xs">Cargando productos...</p>
                                    </div>
                                )}

                                <div className="flex justify-between items-center p-4 bg-slate-900 text-white rounded-xl mb-6">
                                    <span className="font-medium">Total</span>
                                    <span className={`text-2xl font-bold ${
                                        selectedItem.type === 'EXPENSE' || selectedItem.type === 'WITHDRAWAL' || selectedItem.type === 'REFUND'
                                            ? 'text-rose-400'
                                            : 'text-emerald-400'
                                    }`}>
                                        ${Number(selectedItem.amount).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {selectedItem.type === 'SALE' && (
                                <div className="p-4 bg-white border-t border-slate-200 flex gap-3 shrink-0 flex-wrap">
                                    <button
                                        onClick={() => handleReprint(selectedItem)}
                                        disabled={selectedItem.status === 'VOIDED'}
                                        className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Printer size={20} /> Reimprimir
                                    </button>
                                    <button
                                        onClick={() => setIsEditModalOpen(true)}
                                        disabled={
                                            selectedItem.status === 'VOIDED' ||
                                            selectedItem.status === 'FULLY_REFUNDED' ||
                                            selectedItem.status === 'PARTIALLY_REFUNDED'
                                        }
                                        className="flex-1 py-3 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-800 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Pencil size={20} /> Editar
                                    </button>
                                    <button
                                        onClick={() => setIsReturnsModalOpen(true)}
                                        disabled={
                                            selectedItem.status === 'VOIDED' ||
                                            selectedItem.status === 'FULLY_REFUNDED' ||
                                            !Array.isArray(selectedItem.items) ||
                                            selectedItem.items.length === 0
                                        }
                                        className="flex-1 py-3 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <RotateCcw size={20} /> Devolución
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {
                selectedItem && selectedItem.type === 'SALE' && (
                    <ReturnsModal
                        isOpen={isReturnsModalOpen}
                        onClose={() => setIsReturnsModalOpen(false)}
                        sale={selectedItem}
                        userId={user?.id || ''}
                        onRefundComplete={() => {
                            setIsReturnsModalOpen(false);
                            setSelectedItem(null);
                            fetchHistory();
                        }}
                    />
                )
            }

            {selectedItem && selectedItem.type === 'SALE' && (
                <EditSaleModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    sale={selectedItem}
                    locationId={activeLocationId || ''}
                    userId={user?.id || ''}
                    onEditComplete={() => {
                        setIsEditModalOpen(false);
                        setSelectedItem(null);
                        fetchHistory();
                    }}
                />
            )}
        </div>
    );
};

export default TransactionHistoryModal;
