import React, { useState, useMemo, useEffect } from 'react';
import { usePharmaStore } from '../store/useStore';
import { AdvancedExportModal } from '../components/common/AdvancedExportModal';
import { generateCustomerReportSecure, generateCustomerHistoryReportSecure } from '../../actions/customer-export-v2';
import { getCustomerHistorySecure } from '../../actions/customers-v2';
import { Download, Search, User, MessageCircle, Star, Calendar, Plus, Edit, Trash2, History, X, Save, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { Customer, SaleTransaction } from '../../domain/types';
import { toast } from 'sonner';

const ClientsPage: React.FC = () => {
    const { customers, fetchCustomers, addCustomer, updateCustomer, deleteCustomer, salesHistory } = usePharmaStore();

    // Fetch customers from DB on mount
    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [viewingHistory, setViewingHistory] = useState<Customer | null>(null);
    const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

    // History State
    const [historyLoading, setHistoryLoading] = useState(false);
    const [fetchedHistory, setFetchedHistory] = useState<SaleTransaction[]>([]);

    useEffect(() => {
        if (viewingHistory) {
            setHistoryLoading(true);
            getCustomerHistorySecure(viewingHistory.id)
                .then(res => {
                    if (res.success && res.data) {
                        setFetchedHistory(res.data);
                    } else {
                        toast.error(res.error || 'No se pudo cargar el historial completo');
                    }
                })
                .catch((err) => toast.error(`Error de conexión: ${err.message}`))
                .finally(() => setHistoryLoading(false));
        } else {
            setFetchedHistory([]);
        }
    }, [viewingHistory]);

    // Export State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportType, setExportType] = useState<'SUMMARY' | 'HISTORY'>('SUMMARY');

    const exportItems = useMemo(() => customers.map(c => ({
        id: c.id,
        label: c.fullName,
        detail: c.rut
    })), [customers]);

    const handleExport = async (startDate: Date, endDate: Date, selectedIds?: string[]) => {
        setIsExporting(true);
        try {
            let result;
            const params = {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                customerIds: selectedIds || []
            };

            if (exportType === 'HISTORY') {
                result = await generateCustomerHistoryReportSecure(params);
            } else {
                result = await generateCustomerReportSecure(params);
            }

            if (result.success && result.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename || `Reporte_${exportType}_${startDate.toISOString().split('T')[0]}.xlsx`;
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

    const handleExportHistory = async () => {
        if (!viewingHistory) return;
        setIsExporting(true);
        try {
            const result = await generateCustomerHistoryReportSecure({
                customerIds: [viewingHistory.id]
            });

            if (result.success && result.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename || `Historial_${viewingHistory.fullName.replace(/\s+/g, '_')}.xlsx`;
                link.click();
                toast.success('Historial descargado exitosamente');
            } else {
                toast.error(result.error || 'Error al generar historial');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setIsExporting(false);
        }
    };

    // Form State
    const [formData, setFormData] = useState<Partial<Customer>>({
        rut: '',
        fullName: '',
        phone: '',
        email: '',
        tags: []
    });

    const filteredCustomers = useMemo(() => {
        return customers.filter(c =>
            (c.status !== 'BANNED') && (
                (c.fullName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (c.rut || '').includes(searchTerm) ||
                (c.phone && c.phone.includes(searchTerm))
            )
        );
    }, [customers, searchTerm]);

    const customerHistory = useMemo(() => {
        if (!viewingHistory) return [];
        return fetchedHistory; // Already sorted by backend
    }, [fetchedHistory, viewingHistory]);

    const openWhatsApp = (phone?: string) => {
        if (!phone) return;
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
    };

    const handleOpenAdd = () => {
        setFormData({ rut: '', fullName: '', phone: '', email: '', tags: [] });
        setIsAddModalOpen(true);
    };

    const handleOpenEdit = (customer: Customer) => {
        setEditingCustomer(customer);
        setFormData({
            rut: customer.rut,
            fullName: customer.fullName,
            phone: customer.phone,
            email: customer.email,
            tags: customer.tags || []
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.rut || !formData.fullName) {
            toast.error('RUT y Nombre son obligatorios');
            return;
        }

        if (editingCustomer) {
            updateCustomer(editingCustomer.id, formData);
            toast.success('Cliente actualizado');
            setEditingCustomer(null);
        } else {
            const result = await addCustomer(formData as Customer);
            if (result) {
                toast.success('Cliente creado exitosamente');
                setIsAddModalOpen(false);
                // Refresh list from DB to ensure consistency
                await fetchCustomers();
            }
            // Error toast is shown by addCustomer if it fails
        }
    };

    const handleDelete = () => {
        if (deletingCustomer) {
            deleteCustomer(deletingCustomer.id);
            toast.success('Cliente eliminado (Soft Delete)');
            setDeletingCustomer(null);
        }
    };

    const toggleTag = (tag: string) => {
        const currentTags = formData.tags || [];
        if (currentTags.includes(tag)) {
            setFormData({ ...formData, tags: currentTags.filter(t => t !== tag) });
        } else {
            setFormData({ ...formData, tags: [...currentTags, tag] });
        }
    };

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900">Directorio de Clientes</h1>
                    <p className="text-slate-500">CRM & Fidelización</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex gap-4">
                        <div className="text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase">Total Clientes</p>
                            <p className="text-2xl font-extrabold text-slate-900">{customers.length}</p>
                        </div>
                        <div className="w-px bg-slate-200" />
                        <div className="text-center">
                            <p className="text-xs font-bold text-slate-400 uppercase">Nuevos (Mes)</p>
                            <p className="text-2xl font-extrabold text-emerald-600">
                                {customers.filter(c => new Date(c.lastVisit).getMonth() === new Date().getMonth()).length}
                            </p>
                        </div>
                    </div>
                    <div className="flex bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <button
                            onClick={() => { setExportType('SUMMARY'); setIsExportModalOpen(true); }}
                            className="px-4 py-4 text-slate-700 font-bold hover:bg-slate-50 transition flex items-center gap-2 border-r border-slate-200"
                        >
                            <Download size={20} />
                            Resumen Clientes
                        </button>
                        <button
                            onClick={() => { setExportType('HISTORY'); setIsExportModalOpen(true); }}
                            className="px-4 py-4 text-slate-700 font-bold hover:bg-slate-50 transition flex items-center gap-2"
                        >
                            <History size={20} />
                            Historial Detallado
                        </button>
                    </div>
                    <button
                        onClick={handleOpenAdd}
                        className="px-6 py-4 bg-cyan-600 text-white font-bold rounded-2xl hover:bg-cyan-700 transition shadow-lg flex items-center gap-2"
                    >
                        <Plus size={20} /> Nuevo Cliente
                    </button>
                </div>
            </header>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <div className="relative max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por RUT, Nombre o Teléfono..."
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-sm">
                            <tr>
                                <th className="p-6">Cliente</th>
                                <th className="p-6">Contacto</th>
                                <th className="p-6">Puntos / LTV</th>
                                <th className="p-6">Etiquetas</th>
                                <th className="p-6">Última Visita</th>
                                <th className="p-6 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredCustomers.map(customer => (
                                <tr key={customer.id} className="hover:bg-slate-50 transition">
                                    <td className="p-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                                                {customer.fullName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800">{customer.fullName}</p>
                                                <p className="text-xs text-slate-500 font-mono">{customer.rut}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6 text-slate-600">
                                        <div className="flex flex-col">
                                            <span>{customer.phone || '-'}</span>
                                            <span className="text-xs text-slate-400">{customer.email}</span>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1 text-amber-600 font-bold">
                                                <Star size={16} fill="currentColor" />
                                                {customer.totalPoints} pts
                                            </div>
                                            <span className="text-xs text-slate-400 font-mono">
                                                LTV: ${customer.total_spent?.toLocaleString() || 0}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex flex-wrap gap-1">
                                            {customer.tags?.map(tag => (
                                                <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                                    {tag}
                                                </span>
                                            ))}
                                            {(!customer.tags || customer.tags.length === 0) && <span className="text-slate-400 text-xs">-</span>}
                                        </div>
                                    </td>
                                    <td className="p-6 text-slate-500 text-sm">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} />
                                            {new Date(customer.lastVisit).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="p-6 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setViewingHistory(customer)}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                title="Ver Historial"
                                            >
                                                <History size={20} />
                                            </button>
                                            <button
                                                onClick={() => handleOpenEdit(customer)}
                                                className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition"
                                                title="Editar"
                                            >
                                                <Edit size={20} />
                                            </button>
                                            {customer.phone && (
                                                <button
                                                    onClick={() => openWhatsApp(customer.phone)}
                                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                                    title="WhatsApp"
                                                >
                                                    <MessageCircle size={20} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setDeletingCustomer(customer)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {(isAddModalOpen || editingCustomer) && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h2>
                            <button onClick={() => { setIsAddModalOpen(false); setEditingCustomer(null); }} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">RUT *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-3 border border-slate-300 rounded-xl focus:border-cyan-500 focus:outline-none"
                                        value={formData.rut}
                                        onChange={e => setFormData({ ...formData, rut: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Completo *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-3 border border-slate-300 rounded-xl focus:border-cyan-500 focus:outline-none"
                                        value={formData.fullName}
                                        onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Teléfono</label>
                                    <input
                                        type="tel"
                                        className="w-full p-3 border border-slate-300 rounded-xl focus:border-cyan-500 focus:outline-none"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="+569..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        className="w-full p-3 border border-slate-300 rounded-xl focus:border-cyan-500 focus:outline-none"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Etiquetas</label>
                                <div className="flex gap-2 flex-wrap">
                                    {['VIP', 'CRONICO', 'TERCERA_EDAD', 'CONVENIO'].map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className={`px-3 py-1 rounded-full text-sm font-bold border transition ${formData.tags?.includes(tag)
                                                ? 'bg-purple-600 text-white border-purple-600'
                                                : 'bg-white text-slate-500 border-slate-200 hover:border-purple-300'
                                                }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setIsAddModalOpen(false); setEditingCustomer(null); }}
                                    className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition flex items-center gap-2"
                                >
                                    <Save size={18} /> Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {viewingHistory && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Historial de Compras</h2>
                                <p className="text-slate-500">{viewingHistory.fullName}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExportHistory}
                                    disabled={isExporting}
                                    className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    Exportar
                                </button>
                                <button onClick={() => setViewingHistory(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            {historyLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Loader2 size={48} className="animate-spin mb-4 text-cyan-500" />
                                    <p>Cargando historial...</p>
                                </div>
                            ) : customerHistory.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <History size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>No hay compras registradas</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {customerHistory.map(sale => (
                                        <div key={sale.id} className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <p className="font-bold text-slate-800">Compra #{sale.id.slice(-6)}</p>
                                                    <p className="text-xs text-slate-500">{new Date(sale.timestamp).toLocaleString()}</p>
                                                </div>
                                                <span className="font-mono font-bold text-lg text-slate-900">
                                                    ${sale.total.toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="space-y-1">
                                                {sale.items.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between text-sm text-slate-600">
                                                        <span>{item.quantity}x {item.name}</span>
                                                        <span>${(item.price * item.quantity).toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deletingCustomer && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle size={32} className="text-red-600" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">¿Eliminar Cliente?</h2>
                            <p className="text-slate-500 mt-2">
                                Se marcará a <strong>{deletingCustomer.fullName}</strong> como inactivo.
                                No se perderá el historial de ventas.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeletingCustomer(null)}
                                className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Export Modal */}
            <AdvancedExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExport}
                title={exportType === 'SUMMARY' ? "Exportar Resumen de Clientes" : "Exportar Historial de Compras"}
                items={exportItems}
                itemLabel="Clientes"
                isLoading={isExporting}
            />
        </div>
    );
};

export default ClientsPage;
