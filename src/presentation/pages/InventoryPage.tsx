import React, { useState, useMemo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePharmaStore } from '../store/useStore';
import { Search, Filter, Plus, ArrowRightLeft, Package, AlertTriangle, Snowflake, Lock, Pill, Trash2, Edit, FileSpreadsheet } from 'lucide-react';
import StockEntryModal from '../components/inventory/StockEntryModal';
import StockTransferModal from '../components/inventory/StockTransferModal';
import InventoryEditModal from '../components/inventory/InventoryEditModal';
import BulkImportModal from '../components/inventory/BulkImportModal';
import { hasPermission } from '../../domain/security/roles';
import MobileActionScroll from '../components/ui/MobileActionScroll';

const InventoryPage: React.FC = () => {
    const { inventory, user } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'MEDS' | 'RETAIL' | 'CONTROLLED'>('MEDS');
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    // Permissions
    const canManageInventory = hasPermission(user, 'MANAGE_INVENTORY');
    const canDelete = user?.role === 'MANAGER' || user?.role === 'ADMIN';

    // Smart Filters
    const [filters, setFilters] = useState({
        coldChain: false,
        expiring: false,
        critical: false
    });

    // Mobile Detection
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const filteredInventory = useMemo(() => {
        if (!inventory) return [];
        return inventory.filter(item => {
            // 1. Text Search
            const term = searchTerm.toLowerCase();
            const matchesSearch =
                (item.name || '').toLowerCase().includes(term) ||
                (item.sku || '').toLowerCase().includes(term) ||
                (item.dci || '').toLowerCase().includes(term);

            if (!matchesSearch) return false;

            // 2. Tab Filter
            if (activeTab === 'MEDS' && item.category !== 'MEDICAMENTO') return false;
            if (activeTab === 'RETAIL' && item.category === 'MEDICAMENTO') return false;
            if (activeTab === 'CONTROLLED' && !['R', 'RR', 'RCH'].includes(item.condition)) return false;

            // 3. Smart Filters
            if (filters.expiring) {
                const monthsUntilExpiry = (item.expiry_date - Date.now()) / (1000 * 60 * 60 * 24 * 30);
                if (monthsUntilExpiry > 6) return false;
            }

            if (filters.critical) {
                if (item.stock_actual > item.stock_min) return false;
            }

            return true;
        });
    }, [inventory, searchTerm, activeTab, filters]);

    const getStockStatus = (item: any) => {
        if (item.stock_actual <= 0) return 'bg-red-100 text-red-700 border-red-200';
        if (item.stock_actual <= item.stock_min) return 'bg-amber-100 text-amber-700 border-amber-200';
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    };


    // Virtualization
    const parentRef = React.useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: filteredInventory.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => isMobile ? 220 : 60, // Dynamic height based on view
        overscan: 5,
    });

    if (!inventory) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
            <div className="p-6 pb-0 shrink-0">
                {/* Header */}
                <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                            <Package className="text-cyan-600" /> Maestro de Inventario
                        </h1>
                        <p className="text-slate-500 mt-1">WMS & Control de Stock</p>
                    </div>

                    <MobileActionScroll>
                        <button
                            onClick={() => setIsTransferModalOpen(true)}
                            className="px-6 py-3 bg-white text-slate-700 font-bold rounded-full border border-slate-200 hover:bg-slate-50 transition flex items-center gap-2 whitespace-nowrap"
                        >
                            <ArrowRightLeft size={18} /> Transferir
                        </button>
                        {canManageInventory && (
                            <>
                                <button
                                    onClick={() => setIsImportModalOpen(true)}
                                    className="px-6 py-3 bg-white text-green-700 font-bold rounded-full border border-green-200 hover:bg-green-50 transition flex items-center gap-2 whitespace-nowrap"
                                >
                                    <FileSpreadsheet size={18} /> Importar Excel
                                </button>
                                <button
                                    onClick={() => setIsEntryModalOpen(true)}
                                    className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-full hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 flex items-center gap-2 whitespace-nowrap"
                                >
                                    <Plus size={18} /> Nuevo Producto
                                </button>
                            </>
                        )}
                    </MobileActionScroll>
                </header>

                <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide border-b border-slate-200 mb-6 pb-1">
                    <button
                        onClick={() => setActiveTab('MEDS')}
                        className={`flex-none min-w-[45%] md:min-w-0 md:flex-1 snap-center py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap px-4 ${activeTab === 'MEDS' ? 'border-cyan-500 text-cyan-700 bg-cyan-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        💊 MEDICAMENTOS
                    </button>
                    <button
                        onClick={() => setActiveTab('RETAIL')}
                        className={`flex-none min-w-[45%] md:min-w-0 md:flex-1 snap-center py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap px-4 ${activeTab === 'RETAIL' ? 'border-pink-500 text-pink-700 bg-pink-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        🛍️ RETAIL
                    </button>
                    <button
                        onClick={() => setActiveTab('CONTROLLED')}
                        className={`flex-none min-w-[45%] md:min-w-0 md:flex-1 snap-center py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap px-4 ${activeTab === 'CONTROLLED' ? 'border-purple-500 text-purple-700 bg-purple-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        🔒 CONTROLADOS
                    </button>
                </div>

                <div className="p-4 flex gap-4 items-center bg-slate-50/50">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por SKU, Nombre, DCI..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setFilters(f => ({ ...f, expiring: !f.expiring }))}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition ${filters.expiring ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200'}`}
                        >
                            <AlertTriangle size={14} /> Por Vencer
                        </button>
                        <button
                            onClick={() => setFilters(f => ({ ...f, critical: !f.critical }))}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition ${filters.critical ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-slate-500 border-slate-200'}`}
                        >
                            <Filter size={14} /> Stock Crítico
                        </button>
                    </div>
                </div>
            </div>

            {/* Data Grid (Desktop) & Cards (Mobile) */}
            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto px-6 pb-20"
            >
                <div className="bg-transparent md:bg-white md:rounded-3xl md:shadow-sm md:border border-slate-200 overflow-hidden min-h-full relative">

                    {/* Unified Virtualizer Container */}
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {/* Header for Desktop Table */}
                        {!isMobile && (
                            <div className="sticky top-0 z-10 bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider shadow-sm flex border-b border-slate-200">
                                <div className="p-4 w-[30%]">Producto</div>
                                <div className="p-4 w-[20%]">Detalle</div>
                                <div className="p-4 w-[15%]">Atributos</div>
                                <div className="p-4 w-[15%]">Stock</div>
                                <div className="p-4 w-[10%] text-right">Precio</div>
                                <div className="p-4 w-[10%] text-center">Acciones</div>
                            </div>
                        )}

                        {rowVirtualizer.getVirtualItems().map(virtualRow => {
                            const item = filteredInventory[virtualRow.index];
                            const isLastItem = virtualRow.index === filteredInventory.length - 1;

                            return (
                                <div
                                    key={item.id}
                                    data-index={virtualRow.index}
                                    ref={rowVirtualizer.measureElement}
                                    className={`absolute top-0 left-0 w-full ${!isMobile ? 'hover:bg-slate-50 transition group border-b border-slate-100' : 'px-1 pb-4'}`}
                                    style={{
                                        transform: `translateY(${virtualRow.start + (!isMobile ? 48 : 0)}px)`, // Offset for header in desktop
                                    }}
                                >
                                    {isMobile ? (
                                        // MOBILE CARD VIEW (Safe Rendering)
                                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3 h-full">
                                            {/* Header */}
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-lg">{item.name || 'Sin Nombre'}</h3>
                                                    <p className="text-xs text-slate-500 font-mono">{item.sku || '---'}</p>
                                                    <p className="text-xs text-slate-400">{item.laboratory || 'Laboratorio N/A'}</p>
                                                </div>
                                                <div className="flex gap-1 flex-wrap justify-end max-w-[100px]">
                                                    {item.is_bioequivalent && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold">BIO</span>}
                                                    {item.storage_condition === 'REFRIGERADO' && <span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded-lg text-[10px] font-bold">FRIO</span>}
                                                    {['R', 'RR', 'RCH'].includes(item.condition) && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-[10px] font-bold">RET</span>}
                                                </div>
                                            </div>

                                            {/* Body */}
                                            <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-50">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Stock</p>
                                                    <p className={`text-2xl font-bold ${item.stock_actual <= (item.stock_min || 5) ? 'text-red-600' : 'text-slate-800'}`}>
                                                        {item.stock_actual || 0}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400">Min: {item.stock_min || 5}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Precio</p>
                                                    <p className="text-2xl font-bold text-slate-800">
                                                        ${(item.price_sell_box || item.price || 0).toLocaleString()}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400">
                                                        Unit: ${(item.price_sell_unit ? item.price_sell_unit : Math.round((item.price_sell_box || item.price || 0) / (item.units_per_box || item.unit_count || 1))).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Footer Actions */}
                                            <div className="flex gap-3 mt-1">
                                                {canManageInventory && (
                                                    <button
                                                        onClick={() => { setEditingItem(item); setIsEditModalOpen(true); }}
                                                        className="flex-1 h-12 bg-blue-50 text-blue-600 font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                                    >
                                                        <Edit size={20} /> Editar
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button className="h-12 w-12 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all">
                                                        <Trash2 size={20} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        // DESKTOP ROW VIEW
                                        <div className="flex items-center w-full">
                                            <div className="p-4 w-[30%]">
                                                <div className="font-bold text-slate-800 text-lg">{item.name || 'Sin Nombre'}</div>
                                                <div className="text-sm text-slate-500 font-bold">{item.dci || ''}</div>
                                                <div className="text-xs text-slate-400 font-mono mt-1">{item.sku || '---'}</div>
                                            </div>
                                            <div className="p-4 w-[20%]">
                                                <div className="text-sm font-bold text-slate-700">{item.laboratory || '---'}</div>
                                                <div className="text-xs text-slate-500 font-mono">{item.isp_register || 'SIN REGISTRO'}</div>
                                                <div className="text-xs text-slate-400 mt-1">{item.format || ''} x{item.units_per_box || item.unit_count || 1}</div>
                                            </div>
                                            <div className="p-4 w-[15%]">
                                                <div className="flex gap-1 flex-wrap">
                                                    {item.is_bioequivalent && <span title="Bioequivalente" className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200">BIO</span>}
                                                    {item.storage_condition === 'REFRIGERADO' && <span title="Cadena de Frío" className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded-lg text-xs font-bold border border-cyan-200">FRIO</span>}
                                                    {['R', 'RR', 'RCH'].includes(item.condition) && <span title="Receta Retenida" className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold border border-purple-200">RET</span>}
                                                </div>
                                            </div>
                                            <div className="p-4 w-[15%]">
                                                <div className="flex flex-col items-start">
                                                    <span className={`text-lg font-bold ${item.stock_actual <= (item.stock_min || 5) ? 'text-red-600' : 'text-slate-800'}`}>
                                                        {item.stock_actual} un.
                                                    </span>
                                                    <span className={`text-xs font-bold ${item.stock_actual <= (item.stock_min || 5) ? 'text-red-500' : 'text-slate-400'}`}>
                                                        Min: {item.stock_min || 5}
                                                    </span>
                                                    <span className={`text-xs mt-1 px-1.5 py-0.5 rounded ${new Date(item.expiry_date).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        Vence: {new Date(item.expiry_date).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-4 w-[10%] text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-slate-800 text-lg">${(item.price_sell_box || item.price || 0).toLocaleString()}</span>
                                                    <span className="text-xs font-bold text-slate-400">
                                                        (${item.price_sell_unit ? item.price_sell_unit.toLocaleString() : Math.round((item.price_sell_box || item.price || 0) / (item.units_per_box || item.unit_count || 1)).toLocaleString()} / un)
                                                    </span>
                                                    {(user?.role === 'MANAGER' || user?.role === 'ADMIN') && (
                                                        <span className="text-[10px] font-mono text-slate-300 mt-1">
                                                            Costo: ${(item.cost_net || item.cost_price || 0).toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="p-4 w-[10%]">
                                                <div className="flex items-center justify-center gap-2">
                                                    {canManageInventory && (
                                                        <button
                                                            onClick={() => { setEditingItem(item); setIsEditModalOpen(true); }}
                                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {filteredInventory.length === 0 && (
                        <div className="p-12 text-center text-slate-400">
                            <Package size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No se encontraron productos con los filtros actuales.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <StockEntryModal isOpen={isEntryModalOpen} onClose={() => setIsEntryModalOpen(false)} />
            <StockTransferModal isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} />
            <InventoryEditModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditingItem(null); }} product={editingItem} />
            <BulkImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />
        </div>
    );
};

export default InventoryPage;
