import React, { useEffect } from 'react';
import { useOutboxStore } from '../../../lib/store/outboxStore';
import { X, RefreshCw, Trash2, AlertTriangle, WifiOff, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SyncConflictsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SyncConflictsModal: React.FC<SyncConflictsModalProps> = ({ isOpen, onClose }) => {
    const { queue, updateOutboxItemStatus, removeFromOutbox } = useOutboxStore();

    // Filter for problematic items
    const conflictItems = queue.filter(
        (item) => item.status === 'ERROR' || item.status === 'CONFLICT'
    );

    // Auto-close if no conflicts remaining
    useEffect(() => {
        if (isOpen && conflictItems.length === 0) {
            onClose();
        }
    }, [conflictItems.length, isOpen, onClose]);

    const handleRetry = (id: string) => {
        // Set back to PENDING so the SyncManager picks it up again
        updateOutboxItemStatus(id, 'PENDING');
    };

    const handleDiscard = (id: string) => {
        if (window.confirm('¿Estás seguro de descartar este cambio? Esta acción no se puede deshacer.')) {
            removeFromOutbox(id);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="p-6 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Problemas de Sincronización</h2>
                            <p className="text-sm text-slate-500">
                                {conflictItems.length} {conflictItems.length === 1 ? 'operación requiere' : 'operaciones requieren'} tu atención
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-4">
                    {conflictItems.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <p>No hay conflictos pendientes.</p>
                        </div>
                    ) : (
                        <AnimatePresence mode="popLayout">
                            {conflictItems.map((item) => (
                                <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                    className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                                >
                                    <div className="p-4 flex flex-col sm:flex-row gap-4">
                                        {/* Status Indicator */}
                                        <div className={`p-3 rounded-lg flex items-center justify-center h-fit shrink-0 ${item.status === 'CONFLICT'
                                            ? 'bg-amber-100 text-amber-600'
                                            : 'bg-red-100 text-red-600'
                                            }`}>
                                            {item.status === 'CONFLICT' ? <AlertTriangle size={20} /> : <WifiOff size={20} />}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 space-y-2">
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-bold text-slate-800">
                                                    {getFriendlyTitle(item.type)}
                                                </h3>
                                                <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                                                    <Clock size={12} />
                                                    {new Date(item.createdAt).toLocaleString('es-CL', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>

                                            <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono text-xs">
                                                {item.lastError || 'Error desconocido de sincronización'}
                                            </div>

                                            {/* Payload Debug (Optional, maybe specific critical fields usually needed) */}
                                            <div className="text-xs text-slate-400 truncate">
                                                ID: {item.id.slice(0, 8)}... | Retries: {item.retryCount}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex sm:flex-col gap-2 justify-center border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-4">
                                            <button
                                                onClick={() => handleRetry(item.id)}
                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 rounded-lg text-sm font-bold transition"
                                                title="Reintentar envio"
                                            >
                                                <RefreshCw size={16} />
                                                <span className="sm:hidden">Reintentar</span>
                                            </button>
                                            <button
                                                onClick={() => handleDiscard(item.id)}
                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-lg text-sm font-bold transition"
                                                title="Descartar cambio permanentemente"
                                            >
                                                <Trash2 size={16} />
                                                <span className="sm:hidden">Descartar</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Footer / Context Bar */}
                                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex gap-4">
                                        <span>Operación: <strong>{item.type}</strong></span>
                                        {/* Could add specific payload details here if needed */}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition"
                    >
                        Cerrar
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

// Helper for friendly names
const getFriendlyTitle = (type: string) => {
    switch (type) {
        case 'CLIENT_CREATE': return 'Creación de Cliente';
        case 'CASH_MOVEMENT': return 'Movimiento de Caja';
        case 'STOCK_ADJUST': return 'Ajuste de Inventario';
        case 'SALE_CREATE': return 'Venta Offline';
        case 'PRODUCT_CREATE': return 'Creación de Producto';
        default: return type;
    }
};

export default SyncConflictsModal;
