import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import {
    ArrowLeft, Building2, Mail, Phone, Globe, MapPin,
    FileText, CreditCard, History, Package, AlertCircle, CheckCircle, Clock
} from 'lucide-react';

export const SupplierProfile = () => {
    const { id } = useParams();
    const { suppliers, purchaseOrders, supplierDocuments } = usePharmaStore();
    const [activeTab, setActiveTab] = useState<'PROFILE' | 'HISTORY' | 'ACCOUNT' | 'PRODUCTS'>('PROFILE');

    const supplier = suppliers.find(s => s.id === id);

    if (!supplier) {
        return (
            <div className="p-10 text-center">
                <h2 className="text-xl font-bold text-gray-800">Proveedor no encontrado</h2>
                <Link to="/suppliers" className="text-blue-600 hover:underline mt-2 block">Volver al directorio</Link>
            </div>
        );
    }

    // --- Mock Data Helpers ---
    const supplierOrders = purchaseOrders.filter(po => po.supplier_id === id);
    const supplierDocs = supplierDocuments.filter(d => d.supplier_id === id);

    // Calculate Debt
    const totalDebt = supplierDocs
        .filter(d => d.type === 'FACTURA' && d.status === 'PENDING')
        .reduce((sum, d) => sum + d.amount, 0);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header / Hero */}
            <div className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-6">
                    <Link to="/suppliers" className="inline-flex items-center text-slate-500 hover:text-slate-800 mb-4 transition-colors">
                        <ArrowLeft size={16} className="mr-1" /> Volver al Directorio
                    </Link>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200">
                                {supplier.logo_url ? (
                                    <img src={supplier.logo_url} alt={supplier.fantasy_name} className="w-full h-full object-contain rounded-xl" />
                                ) : (
                                    <Building2 size={32} className="text-slate-400" />
                                )}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">{supplier.fantasy_name}</h1>
                                <div className="flex items-center gap-2 text-slate-500 text-sm">
                                    <span>{supplier.business_name}</span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                    <span>{supplier.rut}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="text-right px-4 py-2 bg-red-50 border border-red-100 rounded-lg">
                                <p className="text-xs text-red-600 font-semibold uppercase">Deuda Actual</p>
                                <p className="text-xl font-bold text-red-700">${totalDebt.toLocaleString()}</p>
                            </div>
                            <div className="text-right px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                                <p className="text-xs text-blue-600 font-semibold uppercase">Lead Time</p>
                                <p className="text-xl font-bold text-blue-700">{supplier.lead_time_days} Días</p>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-6 mt-8 border-b border-slate-200">
                        {[
                            { id: 'PROFILE', label: 'Perfil & Contacto', icon: Building2 },
                            { id: 'HISTORY', label: 'Historial Pedidos', icon: History },
                            { id: 'ACCOUNT', label: 'Cuenta Corriente', icon: CreditCard },
                            { id: 'PRODUCTS', label: 'Productos', icon: Package },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`pb-3 px-2 flex items-center gap-2 font-medium text-sm transition-colors relative ${activeTab === tab.id
                                    ? 'text-blue-600'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <tab.icon size={18} />
                                {tab.label}
                                {activeTab === tab.id && (
                                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                {activeTab === 'PROFILE' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Main Info */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <Building2 size={20} className="text-blue-600" />
                                    Información Comercial
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Razón Social</label>
                                        <p className="text-slate-800 font-medium">{supplier.business_name}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">RUT</label>
                                        <p className="text-slate-800 font-medium">{supplier.rut}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Sitio Web</label>
                                        <a href={supplier.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                            {supplier.website || 'No registrado'} <Globe size={14} />
                                        </a>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Condición de Pago</label>
                                        <span className="inline-block px-2 py-1 bg-slate-100 rounded text-slate-700 text-sm font-medium">
                                            {supplier.payment_terms.replace('_', ' ')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <CreditCard size={20} className="text-blue-600" />
                                    Datos Bancarios
                                </h3>
                                {supplier.bank_account ? (
                                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-xs text-slate-500">Banco</p>
                                                <p className="font-medium text-slate-800">{supplier.bank_account.bank}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Tipo Cuenta</p>
                                                <p className="font-medium text-slate-800">{supplier.bank_account.account_type}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Número</p>
                                                <p className="font-mono font-medium text-slate-800">{supplier.bank_account.account_number}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Email Notificación</p>
                                                <p className="font-medium text-slate-800">{supplier.bank_account.email_notification}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-500 italic">No hay datos bancarios registrados.</div>
                                )}
                            </div>
                        </div>

                        {/* Contacts Sidebar */}
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="text-lg font-bold text-slate-800 mb-4">Contactos</h3>
                                <div className="space-y-4">
                                    {supplier.contacts.map((contact, idx) => (
                                        <div key={idx} className="pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                                            <div className="flex justify-between items-start">
                                                <p className="font-bold text-slate-800">{contact.name}</p>
                                                {contact.is_primary && (
                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">PRINCIPAL</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mb-2">{contact.role}</p>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Mail size={14} /> <a href={`mailto:${contact.email}`} className="hover:text-blue-600">{contact.email}</a>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                                    <Phone size={14} /> <span>{contact.phone}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {supplier.contacts.length === 0 && (
                                        <p className="text-slate-500 text-sm">No hay contactos registrados.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'HISTORY' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">ID Orden</th>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Estado</th>
                                    <th className="px-6 py-4 text-right">Monto</th>
                                    <th className="px-6 py-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {supplierOrders.length > 0 ? supplierOrders.map(po => (
                                    <tr key={po.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-900">{po.id}</td>
                                        <td className="px-6 py-4 text-slate-600">{new Date(po.created_at).toLocaleDateString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${po.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                po.status === 'SENT' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-slate-100 text-slate-700'
                                                }`}>
                                                {po.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-900">
                                            ${po.total_estimated.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button className="text-blue-600 hover:text-blue-800 font-medium text-xs">Ver Detalle</button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                            No hay órdenes de compra registradas.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'ACCOUNT' && (
                    <div className="space-y-6">
                        <div className="flex justify-end">
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium">
                                <PlusIcon /> Nueva Factura / NC
                            </button>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-8 text-center text-slate-500">
                                <FileText size={48} className="mx-auto mb-4 text-slate-300" />
                                <p>Módulo de Cuenta Corriente en construcción.</p>
                                <p className="text-sm mt-2">Aquí se mostrarán Facturas y Notas de Crédito.</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'PRODUCTS' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
                        <Package size={48} className="mx-auto mb-4 text-slate-300" />
                        <p>Catálogo de productos del proveedor.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);
