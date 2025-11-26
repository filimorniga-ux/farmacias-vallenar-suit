import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Search, Filter, Plus, ArrowRightLeft, Package, AlertTriangle, Snowflake, Lock, Pill, Trash2, Edit } from 'lucide-react';
import StockEntryModal from '../components/inventory/StockEntryModal';
import StockTransferModal from '../components/inventory/StockTransferModal';
import { hasPermission } from '../../domain/security/roles';

const InventoryPage: React.FC = () => {
    const { inventory, user } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'MEDS' | 'RETAIL' | 'CONTROLLED'>('MEDS');
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

    // Permissions
    const canManageInventory = hasPermission(user, 'MANAGE_INVENTORY');
    const canDelete = user?.role === 'MANAGER' || user?.role === 'ADMIN';

    // Smart Filters
    const [filters, setFilters] = useState({
        coldChain: false,
        expiring: false,
        critical: false
    });

    const filteredInventory = useMemo(() => {
        return inventory.filter(item => {
            // 1. Text Search
            const matchesSearch =
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.sku.includes(searchTerm) ||
                item.dci.toLowerCase().includes(searchTerm.toLowerCase());

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

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            {/* Header */}
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        <Package className="text-cyan-600" /> Maestro de Inventario
                    </h1>
                    <p className="text-slate-500 mt-1">WMS & Control de Stock</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsTransferModalOpen(true)}
                        className="px-6 py-3 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition flex items-center gap-2"
                    >
                        <ArrowRightLeft size={18} /> Transferir
                    </button>
                    {canManageInventory && (
                        <button
                            onClick={() => setIsEntryModalOpen(true)}
                            className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg shadow-cyan-200 flex items-center gap-2"
                        >
                            <Plus size={18} /> Ingreso / Alta
                        </button>
                    )}
                </div>
            </header>

            {/* Tabs & Filters */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                <div className="border-b border-slate-100 flex">
                    <button
                        onClick={() => setActiveTab('MEDS')}
                        className={`flex-1 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'MEDS' ? 'border-cyan-500 text-cyan-700 bg-cyan-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        💊 MEDICAMENTOS
                    </button>
                    <button
                        onClick={() => setActiveTab('RETAIL')}
                        className={`flex-1 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'RETAIL' ? 'border-pink-500 text-pink-700 bg-pink-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        🛍️ RETAIL
                    </button>
                    <button
                        onClick={() => setActiveTab('CONTROLLED')}
                        className={`flex-1 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'CONTROLLED' ? 'border-purple-500 text-purple-700 bg-purple-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
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

            {/* Data Grid */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                        <tr>
                            <th className="p-4">Producto</th>
                            <th className="p-4">Condición</th>
                            <th className="p-4">Ubicación</th>
                            <th className="p-4">Vencimiento</th>
                            <th className="p-4 text-right">Stock</th>
                            <th className="p-4 text-right">Precio</th>
                            <th className="p-4 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredInventory.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition group">
                                <td className="p-4">
                                    <div className="font-bold text-slate-800">{item.name}</div>
                                    <div className="text-xs text-slate-500 font-mono">{item.sku} • {item.dci}</div>
                                </td>
                                <td className="p-4">
                                    <div className="flex gap-1">
                                        {item.is_bioequivalent && <span title="Bioequivalente" className="p-1 bg-yellow-100 text-yellow-700 rounded"><Pill size={14} /></span>}
                                        {['R', 'RR', 'RCH'].includes(item.condition) && <span title="Receta Retenida" className="p-1 bg-purple-100 text-purple-700 rounded"><Lock size={14} /></span>}
                                    </div>
                                </td>
                                <td className="p-4 text-slate-600">
                                    <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold">{item.location_id}</span>
                                </td>
                                <td className="p-4">
                                    <span className={`${(item.expiry_date - Date.now()) < (1000 * 60 * 60 * 24 * 30 * 3) ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                                        {new Date(item.expiry_date).toLocaleDateString()}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <span className={`px-2 py-1 rounded text-xs font-bold border ${getStockStatus(item)}`}>
                                        {item.stock_actual} un.
                                    </span>
                                </td>
                                <td className="p-4 text-right font-mono font-bold text-slate-700">
                                    ${item.price.toLocaleString()}
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center justify-center gap-2">
                                        {canManageInventory && (
                                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <Edit size={16} />
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredInventory.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                        <Package size={48} className="mx-auto mb-4 opacity-50" />
                        <p>No se encontraron productos con los filtros actuales.</p>
                    </div>
                )}
            </div>

            {/* Modals */}
            <StockEntryModal isOpen={isEntryModalOpen} onClose={() => setIsEntryModalOpen(false)} />
            <StockTransferModal isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} />
        </div>
    );
};

export default InventoryPage;
