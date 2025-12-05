import React, { useState, useMemo } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Search, Plus, Filter, Building2, Phone, Mail, CreditCard, Star, ChevronRight, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import AddSupplierModal from '../components/suppliers/AddSupplierModal';
import { toast } from 'sonner';
import { AdvancedExportModal } from '../components/common/AdvancedExportModal';
import { generateSupplierReport } from '../../actions/supplier-export';

export const SuppliersPage = () => {
    const { suppliers, addSupplier } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // Export State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const exportItems = useMemo(() => suppliers.map(s => ({
        id: s.id,
        label: s.business_name, // Or fantasy_name? User usually searches fantasy name.
        detail: s.rut
    })), [suppliers]);

    const handleExport = async (startDate: Date, endDate: Date, selectedIds?: string[]) => {
        setIsExporting(true);
        try {
            const result = await generateSupplierReport(startDate, endDate, selectedIds);
            if (result.success && result.base64) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.base64}`;
                link.download = `Reporte_Proveedores_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.xlsx`;
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

    const handleSaveSupplier = (supplierData: any) => {
        addSupplier(supplierData);
        toast.success(`✅ Proveedor ${supplierData.fantasy_name} registrado exitosamente`);
    };

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Directorio de Proveedores</h1>
                    <p className="text-slate-500">Gestión 360° de laboratorios y distribuidores</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-bold"
                    >
                        <Download size={20} />
                        Exportar Excel
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <Plus size={20} />
                        Nuevo Proveedor
                    </button>
                </div>
            </div>

            {/* Add Supplier Modal */}
            <AddSupplierModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleSaveSupplier}
            />

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, RUT o fantasía..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
                    {['ALL', 'MEDICAMENTOS', 'INSUMOS', 'RETAIL'].map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${categoryFilter === cat
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSuppliers.map(supplier => (
                    <Link
                        to={`/suppliers/${supplier.id}`}
                        key={supplier.id}
                        className="group bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all duration-200 overflow-hidden flex flex-col"
                    >
                        <div className="p-5 flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                                        {supplier.logo_url ? (
                                            <img src={supplier.logo_url} alt={supplier.fantasy_name} className="w-full h-full object-contain rounded-lg" />
                                        ) : (
                                            <Building2 size={24} />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{supplier.fantasy_name}</h3>
                                        <p className="text-xs text-slate-500">{supplier.business_name}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded text-yellow-700 text-xs font-bold">
                                    <Star size={12} className="fill-yellow-500 text-yellow-500" />
                                    {supplier.rating}.0
                                </div>
                            </div>

                            <div className="space-y-2 text-sm text-slate-600">
                                <div className="flex items-center gap-2">
                                    <CreditCard size={16} className="text-slate-400" />
                                    <span>{supplier.rut}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Mail size={16} className="text-slate-400" />
                                    <span className="truncate">{supplier.contact_email}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {supplier.categories.map(cat => (
                                        <span key={cat} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full border border-slate-200">
                                            {cat}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-between items-center">
                            <div className="text-xs text-slate-500">
                                <span className="block font-medium text-slate-700">Condición Pago</span>
                                {supplier.payment_terms.replace('_', ' ')}
                            </div>
                            <div className="flex items-center gap-1 text-blue-600 text-sm font-medium">
                                Ver Perfil <ChevronRight size={16} />
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
