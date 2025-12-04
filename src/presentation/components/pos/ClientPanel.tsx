import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { User, Search, UserPlus, X, Save } from 'lucide-react';
import { Customer } from '../../../domain/types';

const ClientPanel: React.FC = () => {
    const { currentCustomer, setCustomer, customers, addCustomer } = usePharmaStore();
    const [rutInput, setRutInput] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newClientName, setNewClientName] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');

    // Formateador de RUT Chileno
    const formatRut = (value: string) => {
        // Eliminar puntos y guión
        const clean = value.replace(/[^0-9kK]/g, '');
        if (clean.length <= 1) return clean;

        const body = clean.slice(0, -1);
        const dv = clean.slice(-1).toUpperCase();

        // Formato con puntos
        let formattedBody = '';
        for (let i = body.length - 1, j = 0; i >= 0; i--, j++) {
            formattedBody = body.charAt(i) + (j > 0 && j % 3 === 0 ? '.' : '') + formattedBody;
        }

        return `${formattedBody}-${dv}`;
    };

    const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setRutInput(formatRut(e.target.value));
    };

    const handleSearch = () => {
        if (!rutInput) return;
        setIsSearching(true);

        // Búsqueda Real en Store
        const found = customers.find(c => c.rut === rutInput);

        if (found) {
            setCustomer(found);
        } else {
            setCustomer(null);
            // Si no existe, sugerir crear
        }
        setIsSearching(false);
    };

    const handleCreateClient = () => {
        if (!newClientName) return;

        const newCustomer = addCustomer({
            rut: rutInput,
            fullName: newClientName,
            phone: newClientPhone,
            email: '',
            registrationSource: 'POS',
            status: 'ACTIVE',
            tags: [],
            total_spent: 0
        });

        setCustomer(newCustomer);
        setIsCreateModalOpen(false);
        setNewClientName('');
        setNewClientPhone('');
    };

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 mb-4">
            <h3 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                <User size={16} /> CLIENTE (CRM)
            </h3>

            {!currentCustomer ? (
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="RUT (12.345.678-K)"
                            className="w-full pl-3 pr-10 py-2 border-2 border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none font-mono text-sm"
                            value={rutInput}
                            onChange={handleRutChange}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <button
                            onClick={handleSearch}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-600"
                        >
                            <Search size={18} />
                        </button>
                    </div>
                    {rutInput.length > 8 && !isSearching && !customers.find(c => c.rut === rutInput) && (
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-cyan-100 text-cyan-700 p-2 rounded-xl hover:bg-cyan-200 transition"
                            title="Crear Cliente Rápido"
                        >
                            <UserPlus size={20} />
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 relative">
                    <button
                        onClick={() => { setCustomer(null); setRutInput(''); }}
                        className="absolute top-2 right-2 text-emerald-400 hover:text-emerald-700"
                    >
                        <X size={16} />
                    </button>

                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 font-bold">
                            {currentCustomer.fullName.charAt(0)}
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800 text-sm">{currentCustomer.fullName}</h4>
                            <p className="text-xs text-slate-500 font-mono">{currentCustomer.rut}</p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                            ★ {currentCustomer.totalPoints} pts
                        </span>
                        {currentCustomer.health_tags.map(tag => (
                            <span key={tag} className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold border border-red-200">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick Create Form (Inline) */}
            {isCreateModalOpen ? (
                <div className="mt-4 p-4 bg-cyan-50 rounded-xl border border-cyan-100 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-cyan-800 text-sm">Alta Rápida de Cliente</h4>
                        <button onClick={() => setIsCreateModalOpen(false)}><X size={16} className="text-cyan-400 hover:text-cyan-700" /></button>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-[10px] font-bold text-cyan-600 uppercase mb-1">RUT</label>
                            <input type="text" value={rutInput} disabled className="w-full p-2 bg-white rounded-lg border border-cyan-200 text-slate-500 font-mono text-xs" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-cyan-600 uppercase mb-1">Nombre Completo *</label>
                            <input
                                type="text"
                                autoFocus
                                className="w-full p-2 border-2 border-cyan-200 rounded-lg focus:border-cyan-500 focus:outline-none text-sm"
                                placeholder="Ej: Juan Pérez"
                                value={newClientName}
                                onChange={(e) => setNewClientName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-cyan-600 uppercase mb-1">WhatsApp (Opcional)</label>
                            <input
                                type="tel"
                                placeholder="+569..."
                                className="w-full p-2 border-2 border-cyan-200 rounded-lg focus:border-cyan-500 focus:outline-none text-sm"
                                value={newClientPhone}
                                onChange={(e) => setNewClientPhone(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={handleCreateClient}
                            disabled={!newClientName}
                            className="w-full py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-sm"
                        >
                            <Save size={14} /> Guardar y Asignar
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ClientPanel;
