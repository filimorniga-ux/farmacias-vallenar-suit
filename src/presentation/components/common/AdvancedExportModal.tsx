import React, { useState, useMemo } from 'react';
import { X, Download, Calendar, Search, CheckSquare, Square, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export interface ExportItem {
    id: string;
    label: string; // Name/Title
    detail: string; // RUT/ID
}

interface AdvancedExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (startDate: Date, endDate: Date, selectedIds?: string[]) => Promise<void>;
    title: string;
    items: ExportItem[]; // List of items to select from
    itemLabel?: string; // e.g. "Clientes" or "Proveedores"
    isLoading?: boolean;
}

export const AdvancedExportModal: React.FC<AdvancedExportModalProps> = ({
    isOpen,
    onClose,
    onExport,
    title,
    items,
    itemLabel = 'Items',
    isLoading = false
}) => {
    // Dates
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(formatDate(firstDay));
    const [endDate, setEndDate] = useState(formatDate(today));

    // Selection
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Filtering
    const filteredItems = useMemo(() => {
        if (!search) return items;
        const lower = search.toLowerCase();
        return items.filter(i =>
            i.label.toLowerCase().includes(lower) ||
            i.detail.toLowerCase().includes(lower)
        );
    }, [items, search]);

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAllFiltered = () => {
        const next = new Set(selectedIds);
        const allSelected = filteredItems.every(i => next.has(i.id));

        filteredItems.forEach(i => {
            if (allSelected) next.delete(i.id);
            else next.add(i.id);
        });
        setSelectedIds(next);
    };

    const handleExport = async () => {
        if (!startDate || !endDate) {
            toast.error('Debes seleccionar ambas fechas');
            return;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        start.setHours(0, 0, 0, 0);

        if (start > end) {
            toast.error('Fecha inicio mayor a fin');
            return;
        }

        // Optimize: If selectedIds is empty, pass undefined (implies all)
        // OR pass empty array? The logic: "0 selected means ALL" is user friendly.
        // Let's stick with: If 0 selected -> ALL. If >0 selected -> Specific.
        const idsToExport = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;

        await onExport(start, end, idsToExport);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <Download size={20} />
                                <span className="font-bold">{title}</span>
                            </div>
                            <button onClick={onClose} disabled={isLoading} className="text-slate-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col p-6">
                            {/* Date Range */}
                            <div className="grid grid-cols-2 gap-4 mb-6 shrink-0">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desde</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hasta</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="border-t border-slate-100 my-2"></div>

                            {/* Selection Config */}
                            <div className="flex flex-col flex-1 min-h-0">
                                <div className="flex justify-between items-center mb-3 shrink-0">
                                    <h3 className="font-bold text-slate-700">Seleccionar {itemLabel}</h3>
                                    <span className="text-xs text-slate-500">
                                        {selectedIds.size === 0 ? 'Se exportarán TODOS' : `${selectedIds.size} seleccionados`}
                                    </span>
                                </div>

                                <div className="relative mb-3 shrink-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder={`Buscar ${itemLabel}...`}
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 text-sm"
                                    />
                                </div>

                                <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl mb-4">
                                    <div
                                        onClick={toggleSelectAllFiltered}
                                        className="p-3 border-b border-slate-100 flex items-center gap-3 cursor-pointer hover:bg-slate-50 bg-slate-50 sticky top-0 z-10"
                                    >
                                        <div className="text-slate-400">
                                            {filteredItems.every(i => selectedIds.has(i.id)) && filteredItems.length > 0 ? (
                                                <CheckSquare size={18} className="text-blue-600" />
                                            ) : (
                                                <Square size={18} />
                                            )}
                                        </div>
                                        <span className="font-bold text-xs text-slate-500 uppercase">
                                            {selectedIds.size === 0 ? 'Seleccionar Específicos' : 'Seleccionar Todo (Filtrado)'}
                                        </span>
                                    </div>

                                    {filteredItems.map(item => {
                                        const isSelected = selectedIds.has(item.id);
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => toggleSelect(item.id)}
                                                className={`p-3 border-b border-slate-50 flex items-center gap-3 cursor-pointer transition ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                            >
                                                <div className={isSelected ? 'text-blue-600' : 'text-slate-300'}>
                                                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                                                        {item.label}
                                                    </p>
                                                    <p className="text-xs text-slate-400 font-mono">
                                                        {item.detail}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {filteredItems.length === 0 && (
                                        <div className="p-8 text-center text-slate-400 text-sm">
                                            No se encontraron resultados
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="flex gap-3 shrink-0">
                                <button
                                    onClick={onClose}
                                    disabled={isLoading}
                                    className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleExport}
                                    disabled={isLoading}
                                    className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white font-bold rounded-xl hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Procesando...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={20} />
                                            {selectedIds.size === 0 ? 'Exportar TODO' : `Exportar (${selectedIds.size})`}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
