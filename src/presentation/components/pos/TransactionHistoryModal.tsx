import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../../../presentation/store/useStore';
import { X, Search, Calendar, Printer, Eye, Lock, FileText, Download, User, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PrinterService } from '../../../domain/services/PrinterService';
import { SaleTransaction } from '../../../domain/types';
import ReturnsModal from './ReturnsModal';

interface TransactionHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const TransactionHistoryModal: React.FC<TransactionHistoryModalProps> = ({ isOpen, onClose }) => {
    const { salesHistory, employees, printerConfig } = usePharmaStore();
    const [adminPin, setAdminPin] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

    // Detail View
    const [selectedSale, setSelectedSale] = useState<SaleTransaction | null>(null);
    const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);

    const handleLogin = () => {
        const admin = employees.find(e => (e.role === 'ADMIN' || e.role === 'MANAGER') && e.access_pin === adminPin);
        if (admin) {
            setIsAuthenticated(true);
            toast.success('Acceso autorizado');
        } else {
            toast.error('PIN inválido');
            setAdminPin('');
        }
    };

    const filteredSales = useMemo(() => {
        const start = new Date(startDate).setHours(0, 0, 0, 0);
        const end = new Date(endDate).setHours(23, 59, 59, 999);

        return salesHistory.filter(sale => {
            const matchesDate = sale.timestamp >= start && sale.timestamp <= end;
            const matchesSearch =
                sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (sale.customer?.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (sale.dte_folio || '').includes(searchTerm);

            return matchesDate && matchesSearch;
        }).sort((a, b) => b.timestamp - a.timestamp);
    }, [salesHistory, searchTerm, startDate, endDate]);

    const handleReprint = (sale: SaleTransaction) => {
        PrinterService.printTicket(sale, printerConfig);
        toast.success('Reimprimiendo ticket...');
    };

    if (!isOpen) return null;

    if (!isAuthenticated) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 mb-4">
                        <Lock size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Acceso Restringido</h2>
                    <p className="text-slate-500 mb-6">Ingrese PIN de Administrador para ver el historial.</p>

                    <input
                        type="password"
                        value={adminPin}
                        onChange={(e) => setAdminPin(e.target.value)}
                        className="w-full text-center text-2xl tracking-[0.5em] p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-mono mb-6"
                        placeholder="••••"
                        maxLength={4}
                        autoFocus
                    />

                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Cancelar</button>
                        <button onClick={handleLogin} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors">Entrar</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-slate-900 p-6 flex justify-between items-center shrink-0">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <FileText className="text-cyan-400" /> Historial de Transacciones
                    </h2>
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
                            placeholder="Buscar por ID, Cliente o Folio..."
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

                    <div className="bg-cyan-100 text-cyan-800 px-4 py-2 rounded-xl font-bold text-sm">
                        Total: {filteredSales.length} ventas
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* List */}
                    <div className={`${selectedSale ? 'w-1/2 border-r border-slate-200' : 'w-full'} overflow-y-auto p-4 transition-all duration-300`}>
                        <div className="space-y-3">
                            {filteredSales.map(sale => (
                                <div
                                    key={sale.id}
                                    onClick={() => setSelectedSale(sale)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${selectedSale?.id === sale.id ? 'bg-cyan-50 border-cyan-300 ring-1 ring-cyan-300' : 'bg-white border-slate-100 hover:border-cyan-200'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <span className="text-xs font-bold text-slate-400 block mb-1">{new Date(sale.timestamp).toLocaleString()}</span>
                                            <h3 className="font-bold text-slate-800 text-sm">{sale.id}</h3>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${sale.dte_status === 'CONFIRMED_DTE' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {sale.dte_status === 'CONFIRMED_DTE' ? `BOL: ${sale.dte_folio}` : 'VOUCHER'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <User size={14} />
                                            <span>{sale.customer?.fullName || 'Cliente Anónimo'}</span>
                                        </div>
                                        <span className="text-lg font-extrabold text-emerald-600">${sale.total.toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                            {filteredSales.length === 0 && (
                                <div className="text-center py-12 text-slate-400">
                                    <Search size={48} className="mx-auto mb-4 opacity-20" />
                                    <p>No se encontraron ventas</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Detail View */}
                    {selectedSale && (
                        <div className="w-1/2 flex flex-col bg-slate-50 h-full overflow-hidden animate-in slide-in-from-right duration-300">
                            <div className="p-6 overflow-y-auto flex-1">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">Detalle de Venta</h2>
                                        <p className="text-sm text-slate-500">{selectedSale.id}</p>
                                    </div>
                                    <button onClick={() => setSelectedSale(null)} className="md:hidden text-slate-400"><X /></button>
                                </div>

                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <p className="text-slate-400 mb-1">Fecha</p>
                                            <p className="font-bold text-slate-800">{new Date(selectedSale.timestamp).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400 mb-1">Método Pago</p>
                                            <p className="font-bold text-slate-800">{selectedSale.payment_method}</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400 mb-1">Vendedor</p>
                                            <p className="font-bold text-slate-800">{employees.find(e => e.id === selectedSale.seller_id)?.name || selectedSale.seller_id}</p>
                                        </div>
                                        <div>
                                            <p className="text-slate-400 mb-1">Documento</p>
                                            <p className="font-bold text-slate-800">{selectedSale.dte_folio || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>

                                <h3 className="font-bold text-slate-700 mb-3">Productos</h3>
                                <div className="space-y-2 mb-6">
                                    {selectedSale.items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100">
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                                                <p className="text-xs text-slate-500">{item.quantity} x ${item.price.toLocaleString()}</p>
                                            </div>
                                            <p className="font-bold text-slate-800">${(item.price * item.quantity).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex justify-between items-center p-4 bg-slate-900 text-white rounded-xl mb-6">
                                    <span className="font-medium">Total Pagado</span>
                                    <span className="text-2xl font-bold text-emerald-400">${selectedSale.total.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="p-4 bg-white border-t border-slate-200 flex gap-3 shrink-0">
                                <button
                                    onClick={() => handleReprint(selectedSale)}
                                    className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Printer size={20} /> Reimprimir Ticket
                                </button>
                                <button
                                    onClick={() => setIsReturnsModalOpen(true)}
                                    className="flex-1 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                >
                                    <RotateCcw size={20} /> Devolución
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {selectedSale && (
                <ReturnsModal
                    isOpen={isReturnsModalOpen}
                    onClose={() => setIsReturnsModalOpen(false)}
                    sale={selectedSale}
                />
            )}
        </div>
    );
};

export default TransactionHistoryModal;
