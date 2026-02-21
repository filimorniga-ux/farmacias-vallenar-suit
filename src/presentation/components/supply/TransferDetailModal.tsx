import React from 'react';
import { X, FileDown, ArrowRight, Package, Calendar, User, Info, MapPin, Hash } from 'lucide-react';

interface TransferDetail {
    sku: string;
    product_name: string;
    quantity: number;
    from_location_name: string;
    to_location_name: string;
}

interface TransferDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    transferId: string;
    executedAt: string;
    executedBy: string;
    reason: string;
    items: TransferDetail[];
    onExport: () => void;
    isExporting?: boolean;
}

const TransferDetailModal: React.FC<TransferDetailModalProps> = ({
    isOpen,
    onClose,
    transferId,
    executedAt,
    executedBy,
    reason,
    items,
    onExport,
    isExporting = false
}) => {
    if (!isOpen) return null;

    // Group items by Source -> Destination for a better visual summary
    const groupedItems = items.reduce((acc, item) => {
        const key = `${item.from_location_name} → ${item.to_location_name}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {} as Record<string, TransferDetail[]>);

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
                {/* Header Section */}
                <div className="bg-slate-900 p-6 text-white relative">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/20">
                                <Package size={28} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black tracking-tight">Detalle de Traspaso</h2>
                                <div className="flex items-center gap-2 text-slate-400 text-xs mt-1">
                                    <Hash size={12} />
                                    <span className="font-mono uppercase">{transferId}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Meta Info Pills */}
                    <div className="flex flex-wrap gap-3 mt-6">
                        <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                            <Calendar size={14} className="text-emerald-400" />
                            <span className="text-xs font-bold">{executedAt}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                            <User size={14} className="text-emerald-400" />
                            <span className="text-xs font-bold">{executedBy}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                            <Info size={14} className="text-emerald-400" />
                            <span className="text-xs font-bold italic">{reason}</span>
                        </div>
                    </div>
                </div>

                {/* Body - Product List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                    {Object.entries(groupedItems).map(([route, routeItems]) => (
                        <div key={route} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="bg-slate-100/50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm font-black text-slate-700">
                                    <MapPin size={16} className="text-emerald-600" />
                                    {route}
                                </div>
                                <span className="bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500">
                                    {routeItems.length} SKUs
                                </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {routeItems.map((item, idx) => (
                                    <div key={`${item.sku}-${idx}`} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-900 truncate">{item.product_name}</div>
                                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{item.sku}</div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            <div className="text-right">
                                                <div className="text-sm font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100">
                                                    {item.quantity} unidades
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer / Actions */}
                <div className="p-6 bg-white border-t border-slate-100 flex items-center justify-between">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                    >
                        Cerrar Ventana
                    </button>
                    <button
                        onClick={onExport}
                        disabled={isExporting}
                        className="flex items-center gap-3 px-8 py-3 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
                    >
                        {isExporting ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <FileDown size={20} className="text-emerald-400" />
                        )}
                        {isExporting ? 'Generando Excel...' : 'Exportar Excel Corporativo'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TransferDetailModal;
