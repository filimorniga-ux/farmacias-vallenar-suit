import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, User, Hash, DollarSign } from 'lucide-react';

interface Transaction {
    id: string;
    amount: number;
    timestamp: number;
    date: string;
    user_name?: string;
}

interface TransactionListModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    transactions: Transaction[];
}

export const TransactionListModal: React.FC<TransactionListModalProps> = ({ isOpen, onClose, title, transactions }) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-800">{title}</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        {transactions.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                No hay transacciones registradas.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {transactions.map((tx) => (
                                    <div key={tx.id} className="p-3 bg-white border border-slate-100 rounded-xl hover:border-blue-200 transition-colors shadow-sm">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                                                <Hash size={12} />
                                                <span>{tx.id.slice(0, 8)}...</span>
                                            </div>
                                            <span className="font-bold text-slate-800 text-lg">
                                                ${tx.amount.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                            <div className="flex items-center gap-1">
                                                <Clock size={12} />
                                                <span>{new Date(tx.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <User size={12} />
                                                <span>{tx.user_name || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
                        <div className="text-xs text-slate-500 uppercase font-bold">Total</div>
                        <div className="text-xl font-bold text-slate-800">
                            ${transactions.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
