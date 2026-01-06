import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, UserPlus, Check, User } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { Customer } from '../../../domain/types';
import { toast } from 'sonner';

interface CustomerSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CustomerSelectModal: React.FC<CustomerSelectModalProps> = ({ isOpen, onClose }) => {
    const { customers, setCustomer, addCustomer } = usePharmaStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);

    // New Customer Form State
    const [newRut, setNewRut] = useState('');
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');

    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
            setSearchTerm('');
            setIsRegistering(false);
            setNewRut('');
            setNewName('');
            setNewPhone('');
        }
    }, [isOpen]);

    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return [];
        const term = searchTerm.toLowerCase();
        return customers.filter(c =>
            (c.fullName || '').toLowerCase().includes(term) ||
            (c.rut || '').toLowerCase().includes(term)
        ).slice(0, 5);
    }, [customers, searchTerm]);

    const handleSelect = (customer: Customer) => {
        setCustomer(customer);
        toast.success(`Cliente asignado: ${customer.fullName}`);
        onClose();
    };

    const handleQuickRegister = () => {
        if (!newRut || !newName) {
            toast.error('RUT y Nombre son obligatorios');
            return;
        }

        // Basic RUT validation could go here

        addCustomer({
            rut: newRut,
            fullName: newName,
            phone: newPhone,
            email: '',
            registrationSource: 'POS',
            status: 'ACTIVE',
            tags: [],
            total_spent: 0
        });

        toast.success('Cliente registrado y asignado');
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-20" onKeyDown={handleKeyDown}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <User className="text-cyan-600" size={20} />
                        Asignar Cliente
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4">
                    {!isRegistering ? (
                        <>
                            {/* Search Mode */}
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Buscar por RUT o Nombre..."
                                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none text-lg font-medium"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                {filteredCustomers.map(customer => (
                                    <button
                                        key={customer.id}
                                        onClick={() => handleSelect(customer)}
                                        className="w-full p-3 text-left hover:bg-cyan-50 border border-gray-100 rounded-xl transition flex justify-between items-center group"
                                    >
                                        <div>
                                            <div className="font-bold text-gray-800">{customer.fullName}</div>
                                            <div className="text-xs text-gray-500 font-mono">{customer.rut}</div>
                                        </div>
                                        <Check size={18} className="text-gray-300 group-hover:text-cyan-600" />
                                    </button>
                                ))}

                                {searchTerm && filteredCustomers.length === 0 && (
                                    <div className="text-center py-4">
                                        <p className="text-gray-400 text-sm mb-3">No se encontraron resultados</p>
                                        <button
                                            onClick={() => {
                                                setIsRegistering(true);
                                                setNewRut(searchTerm); // Pre-fill if it looks like a RUT?
                                            }}
                                            className="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm hover:bg-slate-700 transition flex items-center gap-2 mx-auto"
                                        >
                                            <UserPlus size={16} />
                                            Registrar Nuevo Cliente
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4 animate-in slide-in-from-right-4">
                            {/* Register Mode */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">RUT</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none font-mono"
                                    value={newRut}
                                    onChange={(e) => setNewRut(e.target.value)}
                                    placeholder="11.111.111-1"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Juan Pérez"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono (Opcional)</label>
                                <input
                                    type="tel"
                                    className="w-full p-3 border border-gray-200 rounded-xl focus:border-cyan-500 focus:outline-none"
                                    value={newPhone}
                                    onChange={(e) => setNewPhone(e.target.value)}
                                    placeholder="+569..."
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setIsRegistering(false)}
                                    className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleQuickRegister}
                                    className="flex-1 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition shadow-lg shadow-cyan-200"
                                >
                                    Guardar y Asignar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomerSelectModal;
