import React, { useState, useMemo, useEffect } from 'react';
import { InventoryList } from '../components/inventory/InventoryList';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import {
    Filter, Download, Upload, AlertTriangle, Search, Plus, FileSpreadsheet,
    ChevronDown, ChevronUp, MoreHorizontal, History, RefreshCcw, Package, ScanBarcode, ArrowRightLeft, Edit, Trash2, Zap, Sparkles
} from 'lucide-react';
import { MobileScanner } from '../../components/shared/MobileScanner';
import StockEntryModal from '../components/inventory/StockEntryModal';
import StockTransferModal from '../components/inventory/StockTransferModal';
import InventoryEditModal from '../components/inventory/InventoryEditModal';
import BulkImportModal from '../components/inventory/BulkImportModal';
import InventoryExportModal from '../components/inventory/InventoryExportModal';
import QuickStockModal from '../components/inventory/QuickStockModal';
import ProductDeleteConfirm from '../components/inventory/ProductDeleteConfirm';
import { InventoryCostEditor } from '../components/inventory/InventoryCostEditor';
import { hasPermission } from '../../domain/security/roles';
import MobileActionScroll from '../components/ui/MobileActionScroll';
import { toast } from 'sonner';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import InventorySkeleton from '../components/skeletons/InventorySkeleton';

import { useInventoryQuery } from '../hooks/useInventoryQuery';

const InventoryPage: React.FC = () => {
    // 1. Usar nuevo Hook de Query (Reemplaza inventory y fetchInventory del store global)
    const { currentLocationId, setCurrentLocation, user, setInventory } = usePharmaStore();
    const { data: inventoryData, isLoading, refetch } = useInventoryQuery(currentLocationId);

    // Sincronizar con Zustand para compatibilidad con Modales Legacy
    useEffect(() => {
        if (inventoryData) {
            setInventory(inventoryData);
        }
    }, [inventoryData, setInventory]);

    // Adaptador para mantener compatibilidad con codigo existente que espera 'inventory'
    const inventory = inventoryData || [];

    const { locations } = useLocationStore();
    const activeLocation = locations.find(l => l.id === currentLocationId);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'MEDS' | 'RETAIL' | 'CONTROLLED'>('MEDS');
    const [isGrouped, setIsGrouped] = useState(true); // Default to Grouped
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isQuickStockModalOpen, setIsQuickStockModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [deletingItem, setDeletingItem] = useState<any>(null);



    // Nuclear Delete State
    const [isNuclearModalOpen, setIsNuclearModalOpen] = useState(false);
    const [nuclearConfirmation, setNuclearConfirmation] = useState('');
    const [adminPin, setAdminPin] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Permissions
    const canManageInventory = hasPermission(user, 'MANAGE_INVENTORY');
    const canDelete = user?.role === 'MANAGER' || user?.role === 'ADMIN';
    const canQuickAdjust = user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'GERENTE_GENERAL';

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

    const handleScan = (code: string) => {
        setSearchTerm(code);
        if (navigator.vibrate) navigator.vibrate(200);
        const audio = new Audio('/beep.mp3');
        audio.play().catch(() => { });
        toast.success('Producto encontrado', { duration: 1000, icon: <ScanBarcode size={16} /> });
        setIsScannerOpen(false);
    };

    // Keyboard wedge scanner integration (USB/Bluetooth barcode guns)
    useBarcodeScanner({
        onScan: handleScan,
        minLength: 3
    });

    const filteredInventory = useMemo(() => {
        if (!inventory) return [];

        // 1. Filter Logic
        const filtered = inventory.filter(item => {
            // Text Search
            const term = searchTerm.toLowerCase();
            const matchesSearch =
                (item.name || '').toLowerCase().includes(term) ||
                (item.sku || '').toLowerCase().includes(term) ||
                (item.dci || '').toLowerCase().includes(term);

            if (!matchesSearch) return false;

            // Tab Filter
            if (activeTab === 'MEDS' && item.category !== 'MEDICAMENTO') return false;
            if (activeTab === 'RETAIL' && item.category === 'MEDICAMENTO') return false;
            if (activeTab === 'CONTROLLED' && !['R', 'RR', 'RCH'].includes(item.condition)) return false;

            // Smart Filters
            if (filters.expiring) {
                const monthsUntilExpiry = (item.expiry_date - Date.now()) / (1000 * 60 * 60 * 24 * 30);
                if (monthsUntilExpiry > 6) return false;
            }

            if (filters.critical) {
                if (item.stock_actual > item.stock_min) return false;
            }

            return true;
        });

        // 2. Grouping Logic
        if (isGrouped) {
            const groupedMap = new Map<string, any>();

            filtered.forEach(item => {
                const key = item.sku || item.name; // Prefer SKU
                if (!groupedMap.has(key)) {
                    // Clone to avoid mutating original
                    groupedMap.set(key, { ...item, _count: 1 });
                } else {
                    const existing = groupedMap.get(key);
                    existing.stock_actual += (item as any).quantity_real || item.stock_actual; // Sum quantity_real
                    existing._count += 1;
                    // Keep earliest expiry? Or show range? For now keep first.
                }
            });

            return Array.from(groupedMap.values());
        }

        return filtered;
    }, [inventory, searchTerm, activeTab, filters, isGrouped]);

    const getStockStatus = (item: any) => {
        if (item.stock_actual <= 0) return 'bg-red-100 text-red-700 border-red-200';
        if (item.stock_actual <= item.stock_min) return 'bg-amber-100 text-amber-700 border-amber-200';
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    };






    // ...

    if (isLoading) {
        return <InventorySkeleton />;
    }


    // --- Nuclear Option ---
    const handleNuclearDelete = async () => {
        if (!activeLocation) return;
        if (nuclearConfirmation.toUpperCase() !== 'BORRAR') {
            toast.error('Escribe "BORRAR" para confirmar.');
            return;
        }

        setIsDeleting(true);
        try {
            const { clearLocationInventorySecure } = await import('../../actions/inventory-v2');
            const result = await clearLocationInventorySecure({
                locationId: activeLocation.id,
                userId: user?.id || '',
                adminPin: adminPin,
                confirmationCode: nuclearConfirmation.toUpperCase()
            });

            if (result.success) {
                toast.success(`Inventario eliminado: ${result.deletedCount} registros`);
                setIsNuclearModalOpen(false);
                setNuclearConfirmation('');
                setAdminPin('');
                // Refresh
                window.location.reload();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error('Error crítico al eliminar.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
            <div className="p-6 pb-0 shrink-0">
                {/* Header */}
                <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                            <Package className="text-cyan-600" /> Maestro de Inventario
                        </h1>
                        <div className="flex items-center gap-3 mt-2">
                            <p className="text-slate-500 font-medium">
                                WMS & Control de Stock
                            </p>

                            {/* Product Count Badge */}
                            <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full shadow-md">
                                <Package size={14} className="text-white" />
                                <span className="text-xs font-bold text-white">
                                    {filteredInventory.length} artículo{filteredInventory.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Location Selector */}
                            <div className="relative group z-20">
                                <button className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-indigo-300 transition-colors">
                                    <span className="text-sm font-bold text-indigo-700">
                                        {activeLocation ? activeLocation.name : 'Seleccionar Sucursal'}
                                    </span>
                                    <ChevronDown size={14} className="text-indigo-400 group-hover:rotate-180 transition-transform" />
                                </button>

                                {/* Dropdown (Wrapper with padding bridge) */}
                                <div className="absolute top-full left-0 pt-2 w-64 hidden group-hover:block z-50 animate-in fade-in slide-in-from-top-2">
                                    <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-2">
                                        <div className="text-xs font-bold text-slate-400 uppercase px-2 py-1 mb-1">Cambiar Sucursal</div>
                                        {locations.map(loc => (
                                            <button
                                                key={loc.id}
                                                onClick={() => setCurrentLocation(loc.id, loc.default_warehouse_id || '', '')}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${currentLocationId === loc.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                            >
                                                {loc.name}
                                                {currentLocationId === loc.id && <span className="w-2 h-2 rounded-full bg-indigo-500"></span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
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
                                    onClick={() => setIsExportModalOpen(true)}
                                    className="px-6 py-3 bg-white text-indigo-700 font-bold rounded-full border border-indigo-200 hover:bg-indigo-50 transition flex items-center gap-2 whitespace-nowrap"
                                >
                                    <FileSpreadsheet size={18} /> Exportar Kardex
                                </button>
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
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none select-text"
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

                    {/* Danger Zone */}
                    {(user?.role === 'ADMIN' || user?.role === 'MANAGER') && (
                        <button
                            onClick={() => setIsNuclearModalOpen(true)}
                            className="ml-auto px-4 py-2 rounded-lg text-xs font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-800 transition flex items-center gap-2"
                        >
                            <Trash2 size={14} /> Vaciar Inventario
                        </button>
                    )}
                </div>
            </div>

            {/* Data Grid (Desktop) & Cards (Mobile) */}
            <InventoryList
                items={filteredInventory}
                isMobile={isMobile}
                user={user}
                onEdit={(item) => { setEditingItem(item); setIsEditModalOpen(true); }}
                onDelete={setDeletingItem}
                onQuickAdjust={(item) => { setEditingItem(item); setIsQuickStockModalOpen(true); }}
                canManageInventory={canManageInventory}
                canDelete={canDelete}
                canQuickAdjust={canQuickAdjust}
            />

            {/* Mobile Scanner FAB */}
            <div className="md:hidden fixed bottom-24 right-4 z-40">
                <button
                    onClick={() => setIsScannerOpen(true)}
                    className="bg-cyan-600 text-white p-4 rounded-full shadow-lg shadow-cyan-200 hover:bg-cyan-700 transition-colors"
                >
                    <ScanBarcode size={24} />
                </button>
            </div>

            {/* Mobile Scanner Overlay */}
            {
                isScannerOpen && (
                    <MobileScanner
                        onScan={handleScan}
                        onClose={() => setIsScannerOpen(false)}
                    />
                )
            }


            {/* Modals */}
            <StockEntryModal isOpen={isEntryModalOpen} onClose={() => setIsEntryModalOpen(false)} />
            <StockTransferModal isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} />
            <InventoryEditModal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditingItem(null); }} product={editingItem} />
            <BulkImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />

            <InventoryExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />

            <QuickStockModal isOpen={isQuickStockModalOpen} onClose={() => { setIsQuickStockModalOpen(false); setEditingItem(null); }} product={editingItem} />

            {/* Nuclear Delete Modal */}
            {
                isNuclearModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border-2 border-red-100 animate-in zoom-in-95">
                            <div className="flex flex-col items-center text-center gap-4">
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2">
                                    <AlertTriangle className="text-red-600" size={32} />
                                </div>

                                <h2 className="text-2xl font-bold text-slate-900">¿Vaciar Inventario?</h2>

                                <p className="text-slate-600">
                                    Estás a punto de eliminar <span className="font-bold text-red-600">TODO el stock</span> de la sucursal:
                                    <br />
                                    <span className="text-lg font-black text-slate-800 mt-1 block">{activeLocation?.name || 'Esta Sucursal'}</span>
                                </p>

                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 font-medium w-full text-left">
                                    <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={14} /> Advertencia:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-1 opacity-90">
                                        <li>Esta acción es irreversible.</li>
                                        <li>No afectará a otras sucursales.</li>
                                        <li>Los productos seguirán existiendo en el maestro.</li>
                                    </ul>
                                </div>

                                <div className="w-full mt-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-left">
                                        Escribe "BORRAR" para confirmar:
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full p-3 border-2 border-red-200 rounded-xl focus:border-red-500 focus:outline-none font-bold text-center uppercase"
                                        placeholder="BORRAR"
                                        value={nuclearConfirmation}
                                        onChange={(e) => setNuclearConfirmation(e.target.value)}
                                    />
                                </div>

                                <div className="w-full mt-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-left">
                                        PIN de Administrador:
                                    </label>
                                    <input
                                        type="password"
                                        className="w-full p-3 border-2 border-red-200 rounded-xl focus:border-red-500 focus:outline-none font-bold text-center"
                                        placeholder="****"
                                        maxLength={6}
                                        value={adminPin}
                                        onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ''))}
                                    />
                                </div>

                                <div className="flex gap-3 w-full mt-4">
                                    <button
                                        onClick={() => setIsNuclearModalOpen(false)}
                                        className="flex-1 py-3 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleNuclearDelete}
                                        disabled={nuclearConfirmation.toUpperCase() !== 'BORRAR' || adminPin.length < 4 || isDeleting}
                                        className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-200"
                                    >
                                        {isDeleting ? 'Eliminando...' : 'Sí, Vaciar Todo'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Product Delete Confirmation Modal */}
            {deletingItem && (
                <ProductDeleteConfirm
                    product={deletingItem}
                    onClose={() => setDeletingItem(null)}
                    onConfirm={() => {
                        setDeletingItem(null);
                        refetch();
                    }}
                />
            )}
        </div>
    );
};

export default InventoryPage;
