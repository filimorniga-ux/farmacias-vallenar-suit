import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Search, Plus, Filter, Building2, Phone, Mail, CreditCard, Star, ChevronRight, Download, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import AddSupplierModal from '../components/suppliers/AddSupplierModal';
import { toast } from 'sonner';
import { AdvancedExportModal } from '../components/common/AdvancedExportModal';
import { generateSupplierReportSecure } from '../../actions/supplier-export-v2';
import { Supplier } from '../../domain/types';

export const SuppliersPage = () => {
    const { suppliers, addSupplier, updateSupplier } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

    // Export State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const exportItems = useMemo(() => suppliers.map(s => ({
        id: s.id,
        label: s.business_name,
        detail: s.rut
    })), [suppliers]);

    const handleExport = async (startDate: Date, endDate: Date, selectedIds?: string[]) => {
        setIsExporting(true);
        try {
            // V2: Nuevo formato de parámetros
            const result = await generateSupplierReportSecure({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                supplierIds: selectedIds
            });
            if (result.success && result.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename || `Reporte_Proveedores_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.xlsx`;
                link.click();
                toast.success('Reporte descargado exitosamente');
                setIsExportModalOpen(false);
            } else {
                toast.error(result.error || 'Error al generar reporte');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setIsExporting(false);
        }
    };

    const filteredSuppliers = suppliers.filter(supplier => {
        const matchesSearch =
            supplier.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            supplier.fantasy_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            supplier.rut.includes(searchTerm);

        const matchesCategory = categoryFilter === 'ALL' || supplier.categories.includes(categoryFilter as any);

        return matchesSearch && matchesCategory;
    });

    const handleSaveSupplier = async (supplierData: any) => {
        if (editingSupplier) {
            await updateSupplier(editingSupplier.id, supplierData);
            setEditingSupplier(null);
        } else {
            await addSupplier(supplierData);
        }
        setIsAddModalOpen(false);
    };

    const handleEditClick = (e: React.MouseEvent, supplier: Supplier) => {
        e.preventDefault(); // Prevent Link navigation
        setEditingSupplier(supplier);
        setIsAddModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingSupplier(null);
        setIsAddModalOpen(true);
    };

    return (
        <div className="p-2 md:p-6 pb-safe space-y-3 md:space-y-6 bg-slate-50 min-h-dvh">
            {/* Header */}
            <div className="flex justify-between items-center gap-2">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-2xl font-bold text-slate-800 truncate">Proveedores</h1>
                    <p className="text-slate-500 text-xs md:text-base hidden md:block">Gestión 360° de laboratorios y distribuidores</p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 p-2 md:px-4 md:py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-bold"
                        title="Exportar Excel"
                    >
                        <Download size={18} />
                        <span className="hidden md:inline">Exportar Excel</span>
                    </button>
                    <button
                        onClick={handleAddNew}
                        className="bg-blue-600 hover:bg-blue-700 text-white p-2 md:px-4 md:py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                        title="Nuevo Proveedor"
                    >
                        <Plus size={18} />
                        <span className="hidden md:inline">Nuevo Proveedor</span>
                    </button>
                </div>
            </div>

            {/* Add Supplier Modal */}
            <AddSupplierModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleSaveSupplier}
                supplierToEdit={editingSupplier}
            />

            {/* Filters */}
            <div className="bg-white p-2.5 md:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-2 md:gap-4 items-stretch md:items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, RUT..."
                        className="w-full pl-9 pr-4 py-1.5 md:py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-1.5 md:gap-2 w-full md:w-auto overflow-x-auto scrollbar-hide">
                    {['ALL', 'MEDICAMENTOS', 'INSUMOS', 'RETAIL'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className={`px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg text-[11px] md:text-sm font-medium whitespace-nowrap transition-colors ${categoryFilter === cat
                                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            {cat === 'ALL' ? 'Todos' : cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                {filteredSuppliers.map(supplier => (
                    <Link
                        to={`/suppliers/${supplier.id}`}
                        key={supplier.id}
                        className="group bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 overflow-hidden flex flex-col relative"
                    >
                        {/* Edit Button */}
                        <button
                            onClick={(e) => handleEditClick(e, supplier)}
                            className="absolute top-2 md:top-4 right-2 md:right-4 p-1.5 md:p-2 bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 rounded-full transition-colors z-10"
                            title="Editar Proveedor"
                        >
                            <Pencil size={14} />
                        </button>

                        <div className="p-3 md:p-5 flex-1">
                            <div className="flex justify-between items-start mb-2 md:mb-4">
                                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                                    <div className="w-9 h-9 md:w-12 md:h-12 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 shrink-0">
                                        {supplier.logo_url ? (
                                            <img src={supplier.logo_url} alt={supplier.fantasy_name} className="w-full h-full object-contain rounded-lg" />
                                        ) : (
                                            <Building2 size={20} />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors text-sm md:text-base truncate">{supplier.fantasy_name}</h3>
                                        <p className="text-[10px] md:text-xs text-slate-500 truncate">{supplier.business_name}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 bg-yellow-50 px-1.5 py-0.5 md:px-2 md:py-1 rounded text-yellow-700 text-[10px] md:text-xs font-bold shrink-0">
                                    <Star size={10} className="fill-yellow-500 text-yellow-500" />
                                    {supplier.rating}.0
                                </div>
                            </div>

                            <div className="space-y-1 md:space-y-2 text-xs md:text-sm text-slate-600">
                                <div className="flex items-center gap-1.5 md:gap-2">
                                    <CreditCard size={14} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{supplier.rut}</span>
                                </div>
                                <div className="flex items-center gap-1.5 md:gap-2">
                                    <Mail size={14} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{supplier.contact_email}</span>
                                </div>
                                <div className="flex flex-wrap gap-1 md:gap-2 mt-1.5 md:mt-3">
                                    {(supplier.categories || []).map(cat => (
                                        <span key={cat} className="px-1.5 md:px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] md:text-xs rounded-full border border-slate-200">
                                            {cat}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 px-3 md:px-5 py-2 md:py-3 border-t border-slate-100 flex justify-between items-center">
                            <div className="text-[10px] md:text-xs text-slate-500">
                                <span className="block font-medium text-slate-700">Condición Pago</span>
                                {supplier.payment_terms.replace('_', ' ')}
                            </div>
                            <div className="flex items-center gap-1 text-blue-600 text-xs md:text-sm font-medium">
                                Ver <ChevronRight size={14} />
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
            {/* Export Modal */}
            <AdvancedExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExport}
                title="Exportar Reporte de Proveedores"
                items={exportItems}
                itemLabel="Proveedores"
                isLoading={isExporting}
            />
        </div>
    );
};
