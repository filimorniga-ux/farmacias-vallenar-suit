import React, { useState } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Search, User, MessageCircle, Star, Calendar } from 'lucide-react';

const ClientsPage: React.FC = () => {
    const { customers } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredCustomers = customers.filter(c =>
        c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.rut.includes(searchTerm) ||
        (c.phone && c.phone.includes(searchTerm))
    );

    const openWhatsApp = (phone?: string) => {
        if (!phone) return;
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
    };

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900">Directorio de Clientes</h1>
                    <p className="text-slate-500">CRM & Fidelización</p>
                </div>
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
                                <th className="p-6">Puntos</th>
                                <th className="p-6">Origen</th>
                                <th className="p-6">Última Visita</th>
                                <th className="p-6">Acciones</th>
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
                                        {customer.phone || '-'}
                                    </td>
                                    <td className="p-6">
                                        <div className="flex items-center gap-1 text-amber-600 font-bold">
                                            <Star size={16} fill="currentColor" />
                                            {customer.totalPoints}
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${customer.registrationSource === 'KIOSK' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                                                customer.registrationSource === 'POS' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                                    'bg-slate-100 text-slate-600 border-slate-200'
                                            }`}>
                                            {customer.registrationSource}
                                        </span>
                                    </td>
                                    <td className="p-6 text-slate-500 text-sm">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} />
                                            {new Date(customer.lastVisit).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        {customer.phone && (
                                            <button
                                                onClick={() => openWhatsApp(customer.phone)}
                                                className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition"
                                                title="Abrir WhatsApp"
                                            >
                                                <MessageCircle size={20} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ClientsPage;
