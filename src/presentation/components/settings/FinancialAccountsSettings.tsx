import React, { useState, useEffect } from 'react';
import {
    getFinancialAccountsSecure,
    createFinancialAccountSecure,
    updateFinancialAccountSecure,
    toggleAccountStatusSecure,
} from '../../../actions/financial-accounts-v2';
import { getOrganizationStructureSecure } from '../../../actions/network-v2';
import { Plus, Edit2, Archive, CheckCircle, Wallet, Building, CircleDollarSign, Coins } from 'lucide-react';
import { toast } from 'sonner';

interface FinancialAccount {
    id: string;
    name: string;
    type: string;
    location_id: string | null;
    balance: number;
    is_active: boolean;
}

export const FinancialAccountsSettings: React.FC = () => {
    const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
    const [locations, setLocations] = useState<{ id: string, name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        type: 'BANK',
        location_id: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        const [accRes, locRes] = await Promise.all([
            getFinancialAccountsSecure(),
            getOrganizationStructureSecure()
        ]);

        if (accRes.success && accRes.data) {
            setAccounts(accRes.data as FinancialAccount[]);
        }
        if (locRes.success && locRes.data) {
            setLocations(locRes.data.locations.map((l: any) => ({ id: l.id, name: l.name })));
        }
        setIsLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const pin = prompt('Ingrese PIN de administrador:');
        if (!pin) return;

        let res;
        if (editingAccount) {
            res = await updateFinancialAccountSecure({
                accountId: editingAccount.id,
                name: formData.name,
                locationId: formData.location_id || null
            }, pin);
        } else {
            res = await createFinancialAccountSecure({
                name: formData.name,
                type: formData.type as any,
                locationId: formData.location_id || undefined,
                initialBalance: 0
            }, pin);
        }

        if (res.success) {
            toast.success(editingAccount ? 'Cuenta actualizada' : 'Cuenta creada');
            setIsModalOpen(false);
            setEditingAccount(null);
            setFormData({ name: '', type: 'BANK', location_id: '' });
            loadData();
        } else {
            toast.error(res.error || 'Error en la operación');
        }
    };

    const handleEdit = (acc: FinancialAccount) => {
        setEditingAccount(acc);
        setFormData({
            name: acc.name,
            type: acc.type,
            location_id: acc.location_id || ''
        });
        setIsModalOpen(true);
    };

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        const pin = prompt('Ingrese PIN de administrador:');
        if (!pin) return;

        const res = await toggleAccountStatusSecure(id, !currentStatus, pin);
        if (res.success) {
            toast.success(currentStatus ? 'Cuenta archivada' : 'Cuenta reactivada');
            loadData();
        } else {
            toast.error(res.error || 'Error al cambiar estado');
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'BANK': return <Building size={18} className="text-blue-500" />;
            case 'SAFE': return <Wallet size={18} className="text-emerald-500" />;
            case 'PETTY_CASH': return <Coins size={18} className="text-amber-500" />;
            case 'EQUITY': return <CircleDollarSign size={18} className="text-purple-500" />;
            default: return <Wallet size={18} />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'BANK': return 'Banco';
            case 'SAFE': return 'Caja Fuerte (Bóveda)';
            case 'PETTY_CASH': return 'Caja Chica';
            case 'EQUITY': return 'Patrimonio / Socios';
            default: return type;
        }
    };

    return (
        <div className="bg-white rounded-b-3xl shadow-sm border border-t-0 border-slate-200 p-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Cuentas Financieras</h2>
                    <p className="text-sm text-slate-500">Administra los destinos de fondos (Bancos, Cajas Chicas, etc).</p>
                </div>
                <button
                    onClick={() => {
                        setEditingAccount(null);
                        setFormData({ name: '', type: 'BANK', location_id: '' });
                        setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
                >
                    <Plus size={18} /> Nueva Cuenta
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-100 text-slate-500 text-sm">
                            <th className="py-3 px-2">Tipo</th>
                            <th className="py-3 px-2">Nombre</th>
                            <th className="py-3 px-2">Sucursal Asociada</th>
                            <th className="py-3 px-2">Saldo Actual</th>
                            <th className="py-3 px-2">Estado</th>
                            <th className="py-3 px-2 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={6} className="text-center py-8">Cargando...</td></tr>
                        ) : accounts.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-8 text-slate-400">No hay cuentas registradas.</td></tr>
                        ) : (
                            accounts.map(acc => (
                                <tr key={acc.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <td className="py-3 px-2">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            {getIcon(acc.type)}
                                            {getTypeLabel(acc.type)}
                                        </div>
                                    </td>
                                    <td className="py-3 px-2 font-bold text-slate-700">{acc.name}</td>
                                    <td className="py-3 px-2 text-sm text-slate-500">
                                        {locations.find(l => l.id === acc.location_id)?.name || '-'}
                                    </td>
                                    <td className="py-3 px-2 font-mono text-slate-700">
                                        ${Number(acc.balance).toLocaleString('es-CL')}
                                    </td>
                                    <td className="py-3 px-2">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${acc.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {acc.is_active ? 'Activo' : 'Archivado'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-2 text-right flex justify-end gap-2">
                                        <button
                                            onClick={() => handleEdit(acc)}
                                            className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                                            title="Editar"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleToggleStatus(acc.id, acc.is_active)}
                                            className={`p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 ${acc.is_active ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700'}`}
                                            title={acc.is_active ? 'Archivar' : 'Reactivar'}
                                        >
                                            {acc.is_active ? <Archive size={16} /> : <CheckCircle size={16} />}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">
                            {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta Financiera'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                    placeholder="Ej: Banco BCI Principal"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            {!editingAccount && (
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Tipo</label>
                                    <select
                                        className="w-full p-2 border border-slate-300 rounded-lg"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        <option value="BANK">Banco</option>
                                        <option value="PETTY_CASH">Caja Chica</option>
                                        <option value="EQUITY">Patrimonio / Socio</option>
                                        <option value="SAFE">Caja Fuerte (Bóveda)</option>
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Sucursal (Opcional)</label>
                                <select
                                    className="w-full p-2 border border-slate-300 rounded-lg"
                                    value={formData.location_id}
                                    onChange={e => setFormData({ ...formData, location_id: e.target.value })}
                                >
                                    <option value="">- Nivel General / Todas -</option>
                                    {locations.map(loc => (
                                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-400 mt-1">Si seleccionas una sucursal, esta cuenta será vista principalmente en ese contexto.</p>
                            </div>

                            <div className="flex gap-2 pt-4 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
